"""Review all whole-name recordings in short batches using the locally cached ASR model."""
import json
import argparse
import wave
from pathlib import Path
import mlx_whisper

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'qa/name-library-20260910'
OUT.mkdir(parents=True, exist_ok=True)
cache = Path.home() / '.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo/snapshots'
model = next(p for p in cache.iterdir() if (p / 'weights.safetensors').exists())
entries = json.loads((ROOT / 'wide-desk-preview/audio/names/catalog.json').read_text())['entries']
parser = argparse.ArgumentParser()
parser.add_argument('--readings', nargs='*')
args = parser.parse_args()
if args.readings:
    entries = [e for e in entries if e['reading'] in args.readings]
group_size = 1 if args.readings else 12
report = []
for start in range(0, len(entries), group_size):
    group = entries[start:start + group_size]
    file = OUT / (f'single-{group[0]["reading"]}.wav' if args.readings else f'batch-{start // 12 + 1:02d}.wav')
    with wave.open(str(file), 'wb') as output:
        output.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
        for entry in group:
            with wave.open(str(ROOT / 'wide-desk-preview' / entry['audio']), 'rb') as audio:
                output.writeframes(audio.readframes(audio.getnframes()))
            output.writeframes(bytes(24000))
    result = mlx_whisper.transcribe(str(file), path_or_hf_repo=str(model), language='ja', temperature=0, condition_on_previous_text=False, verbose=None)
    text = result['text'].strip()
    # Diagnostic only: ASR can miss a name or write a different, homophonic kanji.
    flagged = [e['reading'] for e in group if not any(n in text for n in [e['reading'], *e['names']])]
    report.append({'file': file.name, 'expected': [e['reading'] + 'さん' for e in group], 'transcript': text, 'needsReview': flagged})
    print(file.name, text, 'CHECK:', ','.join(flagged), flush=True)
    (OUT / ('transcripts-singles.json' if args.readings else 'transcripts.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
