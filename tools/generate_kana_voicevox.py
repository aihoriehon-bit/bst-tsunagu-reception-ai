"""Experimental mora bank; intelligibility is limited. Per-name audition opt-in only.

--regenerate --context reproduces the latest onset-preserving trial.
No names are sent to an external service. Local VOICEVOX only.
"""
import array
import copy
import io
import json
from pathlib import Path
import urllib.parse
import urllib.request
import wave
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'wide-desk-preview/audio/kana'
ARCHIVE = ROOT / '春日部つむぎ音声まとめ/名前用かな音声'
BASE = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ'
COMPOUNDS = 'きゃ きゅ きょ ぎゃ ぎゅ ぎょ しゃ しゅ しょ じゃ じゅ じょ ちゃ ちゅ ちょ にゃ にゅ にょ ひゃ ひゅ ひょ びゃ びゅ びょ ぴゃ ぴゅ ぴょ みゃ みゅ みょ りゃ りゅ りょ いぇ うぃ うぇ うぉ きぇ ぎぇ しぇ じぇ ちぇ にぇ ひぇ びぇ ぴぇ みぇ りぇ てぃ でぃ とぅ どぅ てゅ でゅ つぁ つぃ つぇ つぉ ふぁ ふぃ ふぇ ふぉ ふゅ ふゃ ふょ ゔぁ ゔぃ ゔぇ ゔぉ ゔゅ くぁ くぃ くぇ くぉ ぐぁ'.split()

def request(path, body=None):
    req = urllib.request.Request('http://127.0.0.1:50021' + path, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()

def kana(text):
    return ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in text)

def write_wav(path, frames):
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(24000); wav.writeframes(frames)

def main():
    speaker = next(s for s in json.loads(request('/speakers')) if s['name'] == '春日部つむぎ')
    style = next(s['id'] for s in speaker['styles'] if s['name'] == 'ノーマル')
    template = json.loads(request('/audio_query?' + urllib.parse.urlencode({'speaker': style, 'text': 'あ'}), b''))
    template.update(speedScale=1.0, outputSamplingRate=24000, outputStereo=False, prePhonemeLength=0.08, postPhonemeLength=0.12, intonationScale=1.0)
    OUT.mkdir(parents=True, exist_ok=True); ARCHIVE.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 3, 'speaker': 'VOICEVOX:春日部つむぎ', 'style': style, 'sampleRate': 24000, 'entries': {}}
    combined = bytearray()
    for token in [*BASE, *COMPOUNDS, 'さん']:
        text = kana(token) + "'"
        phrases = json.loads(request('/accent_phrases?' + urllib.parse.urlencode({'speaker': style, 'text': text, 'is_kana': 'true'}), b''))
        if len(phrases) != 1 or len(phrases[0]['moras']) != (2 if token == 'さん' else 1):
            print('Unsupported compound (not included):', token, flush=True)
            continue
        vowel = phrases[0]['moras'][-1]['vowel'].lower()
        query = copy.deepcopy(template); query['accent_phrases'] = phrases; query['kana'] = text
        context = '--context' in sys.argv and token != 'さん'
        if context:
            # Append a vowel to avoid isolated-syllable glottal endings.
            context_text = kana(token) + "'ア"
            phrases = json.loads(request('/accent_phrases?' + urllib.parse.urlencode({'speaker': style, 'text': context_text, 'is_kana': 'true'}), b''))
            assert len(phrases[0]['moras']) == 2, token
            for mora in phrases[0]['moras']:
                mora['vowel'] = mora['vowel'].lower() if mora['vowel'] != 'N' else 'N'
                mora['vowel_length'] = max(.18, mora['vowel_length'])
                if mora['consonant_length'] is not None:
                    mora['consonant_length'] = max(.04, min(.10, mora['consonant_length']))
            query['accent_phrases'] = phrases; query['kana'] = context_text
        saved = ARCHIVE / (token + '.wav')
        reuse = saved.exists() and '--regenerate' not in sys.argv
        audio = saved.read_bytes() if reuse else request('/synthesis?speaker=' + str(style), json.dumps(query).encode())
        with wave.open(io.BytesIO(audio)) as wav:
            assert wav.getnchannels() == 1 and wav.getsampwidth() == 2 and wav.getframerate() == 24000
            frames = wav.readframes(wav.getnframes())
        samples = array.array('h', frames); peak = max(abs(x) for x in samples)
        assert 100 < peak < 32767 and len(samples) > 2000, token
        if not reuse and context:
            # VOICEVOX rounds each phoneme to the 256-sample decoder hop.
            def count(seconds): return round(seconds * 24000 / 256) * 256
            first = phrases[0]['moras'][0]
            end = count(query['prePhonemeLength']) + count(first['vowel_length']) + count(first['consonant_length'] or 0)
            samples = samples[:end]
            audible = [i for i, x in enumerate(samples) if abs(x) > 12]
            samples = samples[max(0, audible[0] - 160):]
            frames = samples.tobytes()
        elif not reuse:
            # Keep quiet consonants and the nasal tail; trim only synthesis padding.
            audible = [i for i, x in enumerate(samples) if abs(x) > 12]
            samples = samples[max(0, audible[0] - 160):min(len(samples), audible[-1] + 241)]
            frames = samples.tobytes()
        manifest['entries'][token] = {'start': len(combined) // 2, 'frames': len(samples), 'vowel': vowel, 'kana': text, 'peak': peak}
        combined.extend(frames)
        write_wav(ARCHIVE / (token + '.wav'), frames)
        print(token, round(len(samples) / 24000, 3), flush=True)
    write_wav(OUT / 'bank.wav', combined)
    (OUT / 'bank.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('Generated', len(manifest['entries']), 'units;', len(combined), 'PCM bytes', flush=True)

if __name__ == '__main__':
    main()
