"""Deterministic ASR spot checks; not a claim of human review of all recordings."""
import argparse
import hashlib
import json
import random
import subprocess
import wave
from pathlib import Path
import mlx_whisper

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'qa/name-bank-10000'
p=argparse.ArgumentParser();p.add_argument('--count',type=int,default=240);p.add_argument('--available',action='store_true');p.add_argument('--ready-only',action='store_true');p.add_argument('--readings',nargs='+');args=p.parse_args()
selection=json.loads((WORK/'selection.json').read_text())['recordings']
def normalized(text): return ''.join(chr(ord(c)-0x60) if 'ァ'<=c<='ヶ' else c for c in text)
def file(e):return WORK/'generated'/('n-'+'-'.join(f'{ord(c):x}' for c in e['reading'])+'.mp3')
entries=[e for e in selection if file(e).exists()] if args.available else selection
if not args.ready_only: assert all(file(e).exists() for e in entries)
if args.readings:
    entries=[next(e for e in selection if e['reading']==reading) for reading in args.readings]
else:
    random.Random(20260910).shuffle(entries)
    entries=entries[:args.count]
out=WORK/('asr-singles' if args.readings else 'asr-early' if args.available else 'asr-final');out.mkdir(exist_ok=True)
cache=Path.home()/'.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo/snapshots'
model=next(d for d in cache.iterdir() if (d/'weights.safetensors').exists())
saved=out/'transcripts.json'
old={r['file']:r for r in json.loads(saved.read_text())} if saved.exists() else {}
report=[]
group_size=1 if args.readings else 8
for i in range(0,len(entries),group_size):
    group=entries[i:i+group_size];path=out/(f"{group[0]['reading']}.wav" if args.readings else f'batch-{i//8+1:03d}.wav')
    if args.ready_only and not all(file(e).exists() and file(e).with_suffix('.json').exists() for e in group): continue
    hashes=[hashlib.sha256(file(e).read_bytes()).hexdigest() for e in group]
    cached=old.get(path.name)
    if cached and cached.get('sha256')==hashes and cached['readings']==[e['reading'] for e in group]:
        cached['needsReview']=[e['reading'] for e in group if not any(normalized(n)+'さん' in normalized(cached['transcript']) for n in [e['reading'],*e['names']])]
        report.append(cached)
        saved.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'cached':path.name},ensure_ascii=False),flush=True)
        continue
    with wave.open(str(path),'wb') as w:
        w.setparams((1,2,24000,0,'NONE','not compressed'))
        for e in group:
            pcm=subprocess.check_output(['ffmpeg','-nostdin','-v','error','-i',str(file(e)),'-ac','1','-ar','24000','-f','s16le','-'])
            w.writeframes(pcm);w.writeframes(bytes(24000))
    result=mlx_whisper.transcribe(str(path),path_or_hf_repo=str(model),language='ja',temperature=0,condition_on_previous_text=False,verbose=None)
    text=result['text'].strip()
    flagged=[e['reading'] for e in group if not any(normalized(n)+'さん' in normalized(text) for n in [e['reading'],*e['names']])]
    row=dict(file=path.name,readings=[e['reading'] for e in group],sha256=hashes,transcript=text,needsReview=flagged)
    report.append(row);(out/'transcripts.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(row,ensure_ascii=False),flush=True)
