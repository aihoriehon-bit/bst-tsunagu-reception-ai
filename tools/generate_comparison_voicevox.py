"""Generate preview-only whole phrases using the installed VOICEVOX engine."""
import array
import io
import json
from pathlib import Path
import sys
import urllib.parse
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'wide-desk-preview/audio'

def request(path, body=None):
    req = urllib.request.Request('http://127.0.0.1:50021' + path, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as response:
        return response.read()

def main():
    speaker = next(s for s in json.loads(request('/speakers')) if s['name'] == '春日部つむぎ')
    style = next(s for s in speaker['styles'] if s['name'] == 'ノーマル')['id']
    lines = json.loads((ROOT / 'wide-desk-preview/dialogue-lines.json').read_text())
    keys = sys.argv[1:] or list(lines)
    OUT.mkdir(exist_ok=True)
    report_path = OUT / 'generation.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    for key in keys:
        text = lines[key]
        spoken = text.replace('AI', 'エーアイ')
        query = json.loads(request('/audio_query?' + urllib.parse.urlencode({'speaker': style, 'text': spoken}), b''))
        query.update(speedScale=1.0, outputSamplingRate=24000, outputStereo=False)
        audio = request('/synthesis?speaker=' + str(style), json.dumps(query).encode())
        with wave.open(io.BytesIO(audio)) as wav:
            assert wav.getsampwidth() == 2 and wav.getnchannels() == 1
            seconds = wav.getnframes() / wav.getframerate()
            peak = max(abs(x) for x in array.array('h', wav.readframes(wav.getnframes())))
        assert seconds > .3 and 100 < peak < 32767
        (OUT / (key + '.wav')).write_bytes(audio)
        report[key] = dict(text=text, spoken=spoken, kana=query['kana'], seconds=seconds, peak=peak, speaker='VOICEVOX:春日部つむぎ', style=style)
        print(key, query['kana'], round(seconds, 2), flush=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    main()
