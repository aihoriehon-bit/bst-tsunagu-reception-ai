"""Generate whole name + honorific recordings locally, with explicit reading validation."""
import array
import io
import json
import re
import shutil
import urllib.parse
import wave
from pathlib import Path
from generate_comparison_voicevox import request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'wide-desk-preview/audio/names'

def pronunciation_key(text):
    text = ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in text)
    # VOICEVOX/OpenJTalk uses phonetic オオ / エエ for orthographic おう / えい.
    text = re.sub('([おこごそぞとどのほぼぽもよょろを])う', r'\1お', text)
    text = re.sub('([えけげせぜてでねへべぺめれ])い', r'\1え', text)
    return text.replace('づ', 'ず').replace('ぢ', 'じ')

def main():
    entries = {}
    for line in (ROOT / 'tools/name-voice-readings.tsv').read_text().splitlines():
        reading, aliases = line.split('\t')
        assert re.fullmatch('[ぁ-ゖー]+', reading)
        entries.setdefault(reading, set()).update(aliases.split('|'))
    speaker = next(s for s in json.loads(request('/speakers')) if s['name'] == '春日部つむぎ')
    style = next(s for s in speaker['styles'] if s['name'] == 'ノーマル')['id']
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for i, (reading, names) in enumerate(entries.items()):
        stem = 'n-' + '-'.join(f'{ord(c):x}' for c in reading)
        path, metadata = OUT / (stem + '.wav'), OUT / (stem + '.json')
        method = 'whole-kanji-v4-accent' if reading == 'たかし' else 'whole-kanji-v3-clear-consonant' if reading == 'わだ' else 'whole-kanji-v2'
        cached = json.loads(metadata.read_text()) if metadata.exists() else {}
        if path.exists() and cached.get('method') == method:
            record = cached
        else:
            text = sorted(names)[0] + 'さん。'
            query = json.loads(request('/audio_query?' + urllib.parse.urlencode({'speaker': style, 'text': text}), b''))
            # Verify mora text, not kanji interpretation, before synthesizing.
            mora = ''.join(m['text'] for phrase in query['accent_phrases'] for m in phrase['moras'])
            hiragana = ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in mora)
            if pronunciation_key(hiragana) != pronunciation_key(reading + 'さん'):
                text = reading + 'さん。'
                query = json.loads(request('/audio_query?' + urllib.parse.urlencode({'speaker': style, 'text': text}), b''))
                mora = ''.join(m['text'] for phrase in query['accent_phrases'] for m in phrase['moras'])
                if pronunciation_key(mora) != pronunciation_key(reading + 'さん'):
                    raise ValueError(f'Reading mismatch: {reading}: {mora}')
            if len(query['accent_phrases']) > 1:
                phrases = query['accent_phrases']
                merged = {**phrases[0], 'moras': [m for p in phrases for m in p['moras']], 'pause_mora': None, 'is_interrogative': False}
                query['accent_phrases'] = json.loads(request('/mora_data?speaker=' + str(style), json.dumps([merged]).encode()))
            if reading == 'たかし':
                query['accent_phrases'][0]['accent'] = 2
                query['accent_phrases'] = json.loads(request('/mora_data?speaker=' + str(style), json.dumps(query['accent_phrases']).encode()))
            query.update(speedScale=0.95, prePhonemeLength=0.08, postPhonemeLength=0.12, outputSamplingRate=24000, outputStereo=False)
            if reading in ('わだ', 'たかし'):
                consonant = 'w' if reading == 'わだ' else 'k'
                for phrase in query['accent_phrases']:
                    for m in phrase['moras']:
                        if m.get('consonant') == consonant:
                            m['consonant_length'] = max(m['consonant_length'], .07 if reading == 'たかし' else .1)
                query['speedScale'] = .9
            audio = request('/synthesis?speaker=' + str(style), json.dumps(query).encode())
            with wave.open(io.BytesIO(audio)) as wav:
                assert wav.getsampwidth() == 2 and wav.getnchannels() == 1
                seconds = wav.getnframes() / wav.getframerate()
                samples = array.array('h', wav.readframes(wav.getnframes()))
            peak = max(abs(x) for x in samples)
            assert .4 < seconds < 6 and 100 < peak < 32767
            path.write_bytes(audio)
            record = dict(reading=reading, audio='./audio/names/' + path.name, kana=query['kana'], moras=mora, seconds=seconds, peak=peak, speaker='VOICEVOX:春日部つむぎ', style=style, method=method, text=text)
            metadata.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
        records.append({**record, 'names': sorted(names)})
        print(i + 1, len(entries), reading, record['kana'], flush=True)
    manifest = {'revision': '20260910-1', 'credit': 'VOICEVOX:春日部つむぎ', 'entries': records}
    (OUT / 'catalog.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    # Static import: name selection and form availability need no network round trip.
    compact = [{k: r[k] for k in ('reading', 'audio', 'names')} for r in records]
    (ROOT / 'wide-desk-preview/name-library-data.mjs').write_text('export const NAME_RECORDINGS = ' + json.dumps(compact, ensure_ascii=False) + ';\n')
    collection = ROOT / '春日部つむぎ音声まとめ/名前全体の音声_20260910'
    collection.mkdir(parents=True, exist_ok=True)
    for record in records:
        shutil.copy2(ROOT / 'wide-desk-preview' / record['audio'], collection / (record['reading'] + 'さん.wav'))
    (collection / '名前と読みの一覧.tsv').write_text('読みがな\t表記\n' + '\n'.join(r['reading'] + '\t' + '・'.join(r['names']) for r in records) + '\n')
    print('COMPLETE', len(records), sum(p.stat().st_size for p in OUT.glob('*.wav')), flush=True)

if __name__ == '__main__':
    main()
