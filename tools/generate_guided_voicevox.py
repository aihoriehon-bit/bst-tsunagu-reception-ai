"""Generate comparison-only numbered guides with the locally installed engine."""
import json
import subprocess
import sys
from pathlib import Path

import generate_feedback_voicevox as generator

ROOT = Path(__file__).resolve().parents[1]

def main():
    script = "import {GUIDED_TEXTS} from './wide-desk-feedback/guided-dialogue.mjs'; process.stdout.write(JSON.stringify(GUIDED_TEXTS));"
    lines = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))
    speaker = next(s for s in json.loads(generator.request('/speakers')) if s['name'] == '春日部つむぎ')
    style = next(s for s in speaker['styles'] if s['name'] == 'ノーマル')['id']
    out = ROOT / 'wide-desk-feedback/guided-audio'
    out.mkdir(exist_ok=True)
    report = {}
    for key, text in lines.items():
        if sys.argv[1:] and key not in sys.argv[1:]:
            continue
        spoken = generator.spoken_text(text).replace('弊社', 'へいしゃ').replace('納品', 'のうひん').replace('宛先', 'あてさき').replace('お届け物', 'おとどけもの').replace('1番', 'いちばん').replace('2番', 'にばん').replace('3番', 'さんばん').replace('4番', 'よんばん')
        query = json.loads(generator.request('/audio_query?' + generator.urllib.parse.urlencode({'speaker': style, 'text': spoken}), b''))
        query.update(speedScale=1.05, outputSamplingRate=24000, outputStereo=False)
        audio = generator.request('/synthesis?speaker=' + str(style), json.dumps(query).encode())
        with generator.wave.open(generator.io.BytesIO(audio)) as wav:
            seconds = wav.getnframes()/wav.getframerate()
            peak = max(abs(x) for x in generator.array.array('h', wav.readframes(wav.getnframes())))
        assert seconds > .3 and 100 < peak < 32767
        (out/(key+'.wav')).write_bytes(audio)
        report[key] = dict(text=text, spoken=spoken, kana=query['kana'], seconds=seconds, peak=peak, speaker='VOICEVOX:春日部つむぎ', style=style)
        print(key, query['kana'], round(seconds,2), flush=True)
    previous = json.loads((out/'generation.json').read_text()) if (out/'generation.json').exists() else {}
    previous.update(report)
    (out/'generation.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2)+'\n')

if __name__ == '__main__':
    main()
