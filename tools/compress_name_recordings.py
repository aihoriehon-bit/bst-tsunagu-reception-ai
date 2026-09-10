"""Stage MP3 name recordings without changing the published catalog or WAV masters."""
import argparse
import array
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    entries = json.loads((ROOT / 'wide-desk-preview/audio/names/catalog.json').read_text())['entries']
    args.output.mkdir(parents=True, exist_ok=True)

    def encode(entry):
        source = ROOT / 'wide-desk-preview' / entry['audio']
        output = args.output / (entry['reading'] + 'さん.mp3')
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source),
                        '-map_metadata', '-1', '-ac', '1', '-ar', '24000', '-codec:a', 'libmp3lame',
                        '-b:a', '64k', str(output)], check=True)
        pcm = subprocess.check_output(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(output),
                                       '-f', 's16le', '-ac', '1', '-ar', '24000', '-'])
        samples = array.array('h', pcm)
        seconds = len(samples) / 24000
        peak = max(abs(n) for n in samples)
        assert abs(seconds - entry['seconds']) < .05, entry['reading']
        assert 100 < peak < 32767, entry['reading']
        return dict(reading=entry['reading'], file=output.name, bytes=output.stat().st_size,
                    seconds=seconds, peak=peak, sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),
                    mp3SHA256=hashlib.sha256(output.read_bytes()).hexdigest())

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(encode, entries))
    report = dict(credit='VOICEVOX:春日部つむぎ', format='MP3 mono 24000Hz 64kbps',
                  count=len(results), totalBytes=sum(r['bytes'] for r in results), entries=results)
    (args.output / '圧縮検査.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k:v for k,v in report.items() if k != 'entries'}, ensure_ascii=False))

if __name__ == '__main__':
    main()
