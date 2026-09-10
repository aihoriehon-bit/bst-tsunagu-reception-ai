"""Verify the local or deployed comparison page and every published name MP3."""
import argparse
import hashlib
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'wide-desk-preview'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base_url', help='URL ending in /wide-desk-preview/')
    parser.add_argument('--version', required=True)
    parser.add_argument('--workers', type=int, default=16)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    catalog = json.loads((PUBLIC / 'audio/name-bank/catalog.json').read_text())
    records = [(e['audio'].removeprefix('./'), e['sha256']) for e in catalog['entries']]
    for relative in ['index.html', 'app.js', 'preview.css', 'visitor-recognition.js',
                     'name-voice.js', 'name-library.mjs', 'name-library-data.mjs',
                     'name-confirmation.mjs', 'name-bank-sources.html',
                     'audio/name-bank/catalog.json', 'audio/name-bank/surname-5000.tsv',
                     'audio/name-bank/given-5000.tsv', 'audio/name-bank/MIT-LICENSE.txt']:
        records.append((relative, hashlib.sha256((PUBLIC / relative).read_bytes()).hexdigest()))

    def verify(item):
        relative, expected = item
        assert not relative.startswith('/') and '..' not in Path(relative).parts
        url = urllib.parse.urljoin(args.base_url.rstrip('/') + '/', relative)
        url += '?' + urllib.parse.urlencode({'v': args.version})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=45) as response:
                    actual = hashlib.sha256(response.read()).hexdigest()
                if actual != expected:
                    raise ValueError('Content hash does not match the checked local file')
                return relative
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)

    started = time.monotonic()
    passed, errors = [], []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        tasks = {pool.submit(verify, item): item[0] for item in records}
        for result in as_completed(tasks):
            try:
                passed.append(result.result())
            except Exception as error:
                errors.append({'file': tasks[result], 'error': str(error)})
            if (len(passed) + len(errors)) % 500 == 0:
                print(json.dumps({'passed': len(passed), 'errors': len(errors), 'total': len(records)}), flush=True)
    report = {'baseUrl': args.base_url, 'version': args.version, 'passed': len(passed),
              'expected': len(records), 'errors': errors, 'elapsed': round(time.monotonic() - started, 1)}
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False), flush=True)
    if errors:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
