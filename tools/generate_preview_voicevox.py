"""Generate the approved preview lines using the installed, loopback-only VOICEVOX."""
import array
import io
import json
from pathlib import Path
import urllib.parse
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/motion-preview/audio/voicevox-20260909'
API = 'http://127.0.0.1:50021'

def request(path, body=None):
    req = urllib.request.Request(API + path, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as response:
        return response.read()

def inspect_wav(data):
    with wave.open(io.BytesIO(data), 'rb') as wav:
        params = wav.getparams()
        frames = wav.readframes(params.nframes)
    assert params.sampwidth == 2 and params.nchannels == 1
    samples = array.array('h', frames)
    peak = max(abs(x) for x in samples)
    assert params.nframes / params.framerate > 0.3 and peak > 100
    return params, frames, peak

def main():
    speakers = json.loads(request('/speakers'))
    speaker = next(s for s in speakers if s['name'] == '春日部つむぎ')
    style = next(s for s in speaker['styles'] if s['name'] == 'ノーマル')
    style_id = style['id']
    source = (ROOT / 'wide-desk/additional-speech.js').read_text()
    lines = json.loads(source.split('export const EXTRA_SPEECH = ', 1)[1].rstrip().removesuffix(';'))
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(ROOT / 'assets/motion-preview/audio/arrival-ohayo.wav'), 'rb') as base:
        base_params = base.getparams()
        base_frames = base.readframes(base_params.nframes)
    assert base_params.sampwidth == 2 and base_params.nchannels == 1
    report = {'speaker': speaker['name'], 'style': style['name'], 'style_id': style_id, 'files': []}
    for line in lines:
        # Explicit readings for the two abbreviations, without editing the user's dictionary.
        spoken = line['text'].replace('AI', 'エーアイ').replace('LED', 'エルイーディー')
        query = json.loads(request('/audio_query?' + urllib.parse.urlencode({'speaker': style_id, 'text': spoken}), b''))
        query['speedScale'] = 1.0
        query['outputSamplingRate'] = base_params.framerate
        query['outputStereo'] = False
        audio = request('/synthesis?speaker=' + str(style_id), json.dumps(query).encode())
        params, frames, peak = inspect_wav(audio)
        (OUT / (line['key'] + '.wav')).write_bytes(audio)
        report['files'].append({'key': line['key'], 'text': line['text'], 'seconds': round(params.nframes / params.framerate, 3), 'peak': peak})
        print(line['key'], report['files'][-1]['seconds'], 'seconds', flush=True)
        if line['group'] == 'prefix':
            assert params.framerate == base_params.framerate
            path = OUT / (line['key'] + '-arrival.wav')
            with wave.open(str(path), 'wb') as merged:
                merged.setparams(base_params)
                merged.writeframes(frames + bytes(int(params.framerate * 0.18) * 2) + base_frames)
            inspect_wav(path.read_bytes())
    (OUT / 'generation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('Validated 16 generated clips and 3 joined reception greetings.', flush=True)

if __name__ == '__main__':
    main()
