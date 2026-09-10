"""Select 5,000 readings per category, synthesize resumably, then stage MP3s.

This is a reproducible coverage selection, NOT a national popularity ranking.
Source dictionaries and license notices must accompany the published selection.
"""
import argparse
import array
import csv
import gzip
import hashlib
import io
import json
import re
import shutil
import subprocess
import time
import threading
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from generate_name_library import pronunciation_key

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'qa/name-bank-10000'
SOURCES = WORK / 'sources'
PUBLIC = ROOT / 'wide-desk-preview'
REVISION = '20260910-bank10000-1'
PORTS = [50021]
CORRECTIONS = {'ふせ': '20260910-fuse-clear-initial'}

def request(path, body=None):
    match = re.search(r'_(\d+)$', threading.current_thread().name)
    port = PORTS[int(match[1]) % len(PORTS)] if match else PORTS[0]
    req = urllib.request.Request(f'http://127.0.0.1:{port}'+path, data=body, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=180) as response: return response.read()

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)

def normalize(reading):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in reading.strip())

def valid(reading):
    return bool(re.fullmatch('[ぁ-ゖー]{2,7}', reading)) and not re.match('[ぁぃぅぇぉゃゅょっー]', reading)

def select():
    pools = {'surname': {}, 'given': {}}
    def add(category, reading, names, priority, reason):
        reading = normalize(reading)
        if not valid(reading): return
        names = [n for n in names if re.fullmatch('[一-鿿々〆ヶぁ-ゖァ-ヺー]+', n)]
        item = pools[category].setdefault(reading, dict(reading=reading, names=set(), priority=priority, reason=reason))
        item['names'].update(names)
        if priority < item['priority']: item.update(priority=priority, reason=reason)

    legacy = json.loads((PUBLIC / 'audio/names/catalog.json').read_text())['entries']
    # The curated legacy file separates surnames from given names at えみた.
    category = 'surname'
    for row in csv.reader((ROOT / 'tools/name-voice-readings.tsv').open(), delimiter='\t'):
        if row[0] == 'えみた': category = 'given'
        add(category, row[0], row[1].split('|'), -1, 'existing-recording')
    for rank, row in enumerate(csv.reader((SOURCES / 'last_name_org.csv').open())):
        add('surname', row[2], [row[0]], 100 + rank, 'surname-source-estimated-count-order')
    for gender in ['man', 'woman']:
        for kind in ['opti', 'org']:
            for row in csv.reader((SOURCES / f'first_name_{gender}_{kind}.csv').open()):
                add('given', row[0], row[2:], 10 if kind == 'opti' else 10000, 'source-common-subset' if kind == 'opti' else 'given-name-dictionary')
    # Entities in the trusted XML DTD expand name types to descriptive labels.
    with gzip.open(SOURCES / 'JMnedict.xml.gz', 'rb') as stream:
        for _, entry in ET.iterparse(stream, events=('end',)):
            if entry.tag != 'entry': continue
            types = ' '.join(x.text or '' for x in entry.findall('trans/name_type')).lower()
            categories = []
            if 'surname' in types: categories.append('surname')
            if 'given name' in types: categories.append('given')
            names = [x.text for x in entry.findall('k_ele/keb') if x.text]
            for r in entry.findall('r_ele'):
                reading = r.findtext('reb', '')
                restricted = [x.text for x in r.findall('re_restr')]
                for cat in categories: add(cat, reading, restricted or names or [reading], 20000, 'JMnedict-category')
            entry.clear()
    selected = {}
    for cat, pool in pools.items():
        # Aliases count is only a tie-breaker for coverage, never population rank.
        candidates = sorted(pool.values(), key=lambda r: (r['priority'], -len(r['names']), len(r['reading']), r['reading']))
        assert len(candidates) >= 5000, (cat, len(candidates))
        selected[cat] = [{**r, 'names': sorted(r['names'])} for r in candidates[:5000]]
    combined = {}
    for cat, rows in selected.items():
        for row in rows:
            item = combined.setdefault(row['reading'], dict(reading=row['reading'], names=set(), categories=[]))
            item['names'].update(row['names']); item['categories'].append(cat)
    for item in combined.values(): item['names'] = sorted(item['names'])
    assert all(e['reading'] in combined for e in legacy)
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCES.iterdir() if p.is_file()}
    result = dict(revision=REVISION, selection='Common readings first; not a national ranking',
                  sourceHashes=hashes, categories=selected, recordings=list(combined.values()))
    write_json(WORK / 'selection.json', result)
    for cat, rows in selected.items():
        with (WORK / f'{cat}-5000.tsv').open('w') as f:
            writer = csv.writer(f, delimiter='\t', lineterminator='\n'); writer.writerow(['reading','names','selectionBasis'])
            writer.writerows((r['reading'], '|'.join(r['names']), r['reason']) for r in rows)
    print(json.dumps({cat:len(rows) for cat,rows in selected.items()}), 'unique audio',len(combined), flush=True)

def stem(reading): return 'n-' + '-'.join(f'{ord(c):x}' for c in reading)

def generate(limit=None, workers=2, readings=None):
    entries = json.loads((WORK / 'selection.json').read_text())['recordings']
    if readings:
        wanted = set(readings)
        entries = [e for e in entries if e['reading'] in wanted]
        assert {e['reading'] for e in entries} == wanted
    if limit: entries = entries[:limit]
    output = WORK / 'generated'; output.mkdir(exist_ok=True)
    legacy = {r['reading']:r for r in json.loads((PUBLIC / 'audio/names/catalog.json').read_text())['entries']}
    speaker = next(s for s in json.loads(request('/speakers')) if s['name']=='春日部つむぎ')
    style = next(s['id'] for s in speaker['styles'] if s['name']=='ノーマル')

    def one(entry):
        reading = entry['reading']; base = stem(reading)
        mp3, metadata = output / (base + '.mp3'), output / (base + '.json')
        if mp3.exists() and metadata.exists():
            old = json.loads(metadata.read_text())
            if old.get('revision') == REVISION and old.get('correction') == CORRECTIONS.get(reading) and old['sha256'] == hashlib.sha256(mp3.read_bytes()).hexdigest(): return old
            if reading in CORRECTIONS:
                backup = WORK / 'before-pronunciation-adjustment'; backup.mkdir(exist_ok=True)
                for original in [mp3, metadata]:
                    if not (backup / original.name).exists(): shutil.copy2(original, backup / original.name)
        if reading in legacy:
            old = legacy[reading]
            wav = (PUBLIC / old['audio']).read_bytes()
            moras = old['moras']; method = 'existing-whole-recording'; kana = old['kana']
        else:
            # Explicit reading prevents guessing an uncommon kanji pronunciation.
            query = json.loads(request('/audio_query?' + urllib.parse.urlencode({'speaker':style,'text':reading+'さん。'}), b''))
            moras = ''.join(m['text'] for p in query['accent_phrases'] for m in p['moras'])
            if pronunciation_key(moras) != pronunciation_key(reading+'さん'):
                # Explicit kana syntax, one phrase; never synthesize a mismatched query.
                kana_input = ''.join(chr(ord(c)+0x60) if 'ぁ'<=c<='ゖ' else c for c in reading+'さん') + "'"
                phrases = json.loads(request('/accent_phrases?' + urllib.parse.urlencode({'speaker':style,'text':kana_input,'is_kana':'true'}), b''))
                query['accent_phrases'] = phrases
                moras = ''.join(m['text'] for p in phrases for m in p['moras'])
            assert pronunciation_key(moras)==pronunciation_key(reading+'さん'), (reading,moras)
            if len(query['accent_phrases']) > 1:
                phrases = query['accent_phrases']
                merged = {**phrases[0], 'moras':[m for p in phrases for m in p['moras']], 'pause_mora':None, 'is_interrogative':False}
                query['accent_phrases'] = json.loads(request('/mora_data?speaker='+str(style), json.dumps([merged]).encode()))
            query.update(speedScale=.95, prePhonemeLength=.08, postPhonemeLength=.12, outputSamplingRate=24000, outputStereo=False)
            if reading == 'ふせ':
                first = query['accent_phrases'][0]['moras'][0]
                assert first['text'] == 'フ' and first['consonant'] == 'f'
                # Preserve normal devoicing but make the initial fricative clearer.
                first['consonant_length'] = .15
                query.update(speedScale=.9, prePhonemeLength=.15, postPhonemeLength=.2)
            wav = request('/synthesis?speaker='+str(style),json.dumps(query).encode())
            kana = query.get('kana'); method = 'whole-explicit-reading'
        import wave
        with wave.open(io.BytesIO(wav)) as w:
            assert w.getnchannels()==1 and w.getsampwidth()==2 and w.getframerate()==24000
            seconds = w.getnframes()/24000
            samples = array.array('h', w.readframes(w.getnframes()))
            assert .35 < seconds < 8 and 100 < max(abs(n) for n in samples) < 32767
        # Write seekable output to preserve an accurate encoder-delay header.
        temp = output / (base+'.partial.mp3')
        subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i','pipe:0','-map_metadata','-1','-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','64k',str(temp)], input=wav,check=True)
        decoded = subprocess.check_output(['ffmpeg','-nostdin','-v','error','-i',str(temp),'-ac','1','-ar','24000','-f','s16le','pipe:1'])
        samples = array.array('h',decoded); peak=max(abs(n) for n in samples)
        assert abs(len(samples)/24000-seconds)<.05 and 100<peak<32767, reading
        temp.replace(mp3)
        result = dict(revision=REVISION, reading=reading, moras=moras, kana=kana, method=method,
                      correction=CORRECTIONS.get(reading),
                      seconds=seconds, peak=peak, bytes=mp3.stat().st_size, sha256=hashlib.sha256(mp3.read_bytes()).hexdigest(),
                      speaker='VOICEVOX:春日部つむぎ', style=style)
        write_json(metadata,result)
        return result

    started=time.time(); completed=0; failures=[]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        tasks={pool.submit(one,e):e for e in entries}
        for future in as_completed(tasks):
            entry=tasks[future]
            try: future.result(); completed+=1
            except Exception as error:
                failures.append(dict(reading=entry['reading'],error=str(error)))
                print('FAILED',entry['reading'],str(error),flush=True)
            if (completed+len(failures))%50==0:
                status=dict(completed=completed,total=len(entries),failures=len(failures),elapsed=round(time.time()-started,1))
                write_json(WORK/'progress.json',status); print(json.dumps(status),flush=True)
    write_json(WORK/'failures.json',failures)
    print('DONE',completed,'FAILURES',len(failures),flush=True)
    if failures: raise SystemExit(1)

def stage():
    selection=json.loads((WORK/'selection.json').read_text())
    target=PUBLIC/'audio/name-bank'
    records=[]
    # Validate the complete set before changing any published lookup table.
    for entry in selection['recordings']:
        base=stem(entry['reading']); path=WORK/'generated'/(base+'.mp3')
        record=json.loads((WORK/'generated'/(base+'.json')).read_text())
        assert record['revision']==REVISION and record['reading']==entry['reading']
        assert record.get('correction')==CORRECTIONS.get(entry['reading'])
        assert record['sha256']==hashlib.sha256(path.read_bytes()).hexdigest()
        assert pronunciation_key(record['moras'])==pronunciation_key(entry['reading']+'さん')
        records.append({**entry,**record,'audio':'./audio/name-bank/'+path.name})
    assert len(records)==len({r['reading'] for r in records})
    assert all(len(rows)==5000 for rows in selection['categories'].values())
    target.mkdir(parents=True,exist_ok=True)
    collection=ROOT/'春日部つむぎ音声まとめ/名前と名字各5000_MP3_20260910'
    collection.mkdir(parents=True,exist_ok=True)
    for record in records:
        path=WORK/'generated'/(stem(record['reading'])+'.mp3')
        shutil.copy2(path,target/path.name)
        shutil.copy2(path,collection/(record['reading']+'さん.mp3'))
    catalog=dict(revision=REVISION,credit='VOICEVOX:春日部つむぎ',selection=selection['selection'],
                 categories={k:[r['reading'] for r in rows] for k,rows in selection['categories'].items()},
                 sourceHashes=selection['sourceHashes'],entries=records)
    write_json(target/'catalog.json',catalog)
    data=[{k:r[k] for k in ('reading','audio','names','categories')} for r in records]
    (PUBLIC/'name-library-data.mjs').write_text('export const NAME_RECORDINGS = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
    for cat in ['surname','given']:
        shutil.copy2(WORK/(cat+'-5000.tsv'),target/(cat+'-5000.tsv'))
        shutil.copy2(WORK/(cat+'-5000.tsv'),collection/(('名字' if cat=='surname' else '名前')+'5000一覧.tsv'))
    shutil.copy2(SOURCES/'MIT-LICENSE.txt',target/'MIT-LICENSE.txt')
    shutil.copy2(SOURCES/'MIT-LICENSE.txt',collection/'MIT-LICENSE.txt')
    credits=(PUBLIC/'name-bank-sources.html').read_text().replace('href="./audio/name-bank/MIT-LICENSE.txt"','href="./MIT-LICENSE.txt"').replace('href="./audio/name-bank/surname-5000.tsv"','href="./名字5000一覧.tsv"').replace('href="./audio/name-bank/given-5000.tsv"','href="./名前5000一覧.tsv"').replace('href="./"','href="https://aihoriehon-bit.github.io/bst-tsunagu-reception-ai/wide-desk-preview/"')
    (collection/'出典と利用条件.html').write_text(credits)
    report=dict(recordings=len(records),surname=5000,given=5000,totalBytes=sum(r['bytes'] for r in records),revision=REVISION)
    write_json(WORK/'completed.json',report); write_json(collection/'検査結果.json',report)
    print(json.dumps(report),flush=True)

if __name__ == '__main__':
    p=argparse.ArgumentParser(); p.add_argument('command',choices=['select','generate','stage']); p.add_argument('--limit',type=int); p.add_argument('--workers',type=int,default=2); p.add_argument('--ports',nargs='+',type=int,default=[50021]); p.add_argument('--readings',nargs='+')
    args=p.parse_args()
    PORTS=args.ports
    if args.command=='select': select()
    elif args.command=='generate': generate(args.limit,args.workers,args.readings)
    else: stage()
