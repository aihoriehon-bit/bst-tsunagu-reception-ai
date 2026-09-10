"""Local ASR check of the actual JS-joined sample WAVs, no name hints."""
import json
from pathlib import Path
import mlx_whisper

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'qa/full-name-audio'
cache = Path.home() / '.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo/snapshots'
model = next(d for d in cache.iterdir() if (d / 'weights.safetensors').exists())
results = []
for file in sorted(folder.glob('*.wav')):
    result = mlx_whisper.transcribe(str(file), path_or_hf_repo=str(model), language='ja', temperature=0, condition_on_previous_text=False, verbose=None)
    row = {'expectedReading': file.stem, 'transcript': result['text'].strip()}
    results.append(row); print(json.dumps(row, ensure_ascii=False), flush=True)
(folder / 'asr.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
