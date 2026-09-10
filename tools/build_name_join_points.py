"""Reconstruct validated phoneme boundaries; never guess an MP3 end trim.

Uses the same local VOICEVOX core/settings as build_large_name_bank.py.
Timing formula: VOICEVOX engine 0.21.1 tts_pipeline/tts_engine.py
(_count_frame_per_unit, _to_frame), 24 kHz / 256, ties-to-even.
No waveform synthesis, existing recordings remain unchanged.
"""
import argparse
import json
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from build_large_name_bank import request, stem, pronunciation_key, write_json

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'wide-desk-preview'
WORK = ROOT / 'qa/name-bank-10000'

def boundary(entry, legacy):
    reading = entry['reading']
    meta = json.loads((WORK / 'generated' / (stem(reading) + '.json')).read_text())
    old = legacy.get(reading)
    text = old['text'] if old else reading + 'さん。'
    query = json.loads(request('/audio_query?' + urllib.parse.urlencode({'speaker': 8, 'text': text}), b''))
    moras = ''.join(m['text'] for p in query['accent_phrases'] for m in p['moras'])
    if pronunciation_key(moras) != pronunciation_key(reading + 'さん'):
        assert not old, (reading, 'legacy reading changed')
        kana = ''.join(chr(ord(c)+0x60) if 'ぁ' <= c <= 'ゖ' else c for c in reading + 'さん') + "'"
        query['accent_phrases'] = json.loads(request('/accent_phrases?' + urllib.parse.urlencode({'speaker': 8, 'text': kana, 'is_kana': 'true'}), b''))
    if len(query['accent_phrases']) > 1:
        phrases = query['accent_phrases']
        merged = {**phrases[0], 'moras': [m for p in phrases for m in p['moras']], 'pause_mora': None, 'is_interrogative': False}
        query['accent_phrases'] = json.loads(request('/mora_data?speaker=8', json.dumps([merged]).encode()))
    if old and reading == 'たかし':
        query['accent_phrases'][0]['accent'] = 2
        query['accent_phrases'] = json.loads(request('/mora_data?speaker=8', json.dumps(query['accent_phrases']).encode()))
    speed, pre, post = .95, .08, .12
    moras = [m for p in query['accent_phrases'] for m in p['moras']]
    assert ''.join(m['text'] for m in moras) == meta['moras'], (reading, 'moras differ')
    assert [m['text'] for m in moras[-2:]] == ['サ', 'ン']
    if old and reading in ('わだ', 'たかし'):
        for m in moras:
            if m.get('consonant') == ('w' if reading == 'わだ' else 'k'):
                m['consonant_length'] = max(m['consonant_length'], .1 if reading == 'わだ' else .07)
        speed = .9
    if not old and reading == 'ふせ':
        moras[0]['consonant_length'] = .15
        speed, pre, post = .9, .15, .2
    frames = lambda seconds: round(seconds / speed * 93.75)
    lengths = [frames(m['vowel_length']) + frames(m.get('consonant_length') or 0) for m in moras]
    total = (frames(pre) + sum(lengths) + frames(post)) * 256
    # Some single phrases can contain a trailing pause; don't silently omit it.
    assert all(not p.get('pause_mora') for p in query['accent_phrases'])
    assert abs(total - meta['seconds'] * 24000) < 1, (reading, total, meta['seconds'] * 24000)
    start = frames(pre) * 256
    end = (frames(pre) + sum(lengths[:-2])) * 256
    assert start < end < total
    return reading, [start, end, total]

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--limit', type=int); args = parser.parse_args()
    catalog = json.loads((PUBLIC / 'audio/name-bank/catalog.json').read_text())
    legacy = {r['reading']: r for r in json.loads((PUBLIC / 'audio/names/catalog.json').read_text())['entries']}
    entries = catalog['entries']
    if args.limit: entries = entries[:args.limit]
    result, errors = {}, []
    def one(entry):
        try: return boundary(entry, legacy), None
        except Exception as error: return None, {'reading': entry['reading'], 'error': str(error)}
    with ThreadPoolExecutor(max_workers=2) as pool:
        for index, (row, error) in enumerate(pool.map(one, entries), 1):
            if row: result[row[0]] = row[1]
            if error: errors.append(error)
            if index % 500 == 0: print(index, 'validated', len(result), 'errors', len(errors), flush=True)
    write_json(WORK / 'join-points-errors.json', errors)
    write_json(WORK / 'join-points.json', result)
    if errors:
        raise SystemExit(f'No public manifest written: {len(errors)} unverified boundaries')
    if not args.limit:
        (PUBLIC / 'name-join-data.mjs').write_text('export const NAME_JOIN_POINTS = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('DONE', len(result), 'errors', errors[:10], flush=True)

if __name__ == '__main__': main()
