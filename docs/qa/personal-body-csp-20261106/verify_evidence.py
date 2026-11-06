#!/usr/bin/env python3
"""Audit local immutable CSP inputs. Does not launch apps or certify CSP acceptance.

python3 verify_evidence.py --artifact-root /path/to/personal-deforme-followup-20261105
Evidence contains observations; this script only rechecks their input hashes.
No model bytes, decoder data, user paths or raw crash logs are emitted.
"""
import argparse
import hashlib
import json
from pathlib import Path


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact-root', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, default=Path(__file__).with_name('evidence.json'))
    parser.add_argument('--runtime-manifest', type=Path, help='Override manifest path for a later app-output stage')
    args = parser.parse_args()
    evidence = json.loads(args.evidence.read_text())
    root = args.artifact_root.resolve()
    failures = []
    for case in evidence['cases']:
        path = (root / case['file']).resolve()
        if not path.is_relative_to(root):
            failures.append({'id': case['id'], 'reason': 'path outside artifact root'})
            continue
        try:
            match = digest(path) == case['sha256'] and path.stat().st_size == case['bytes']
        except OSError:
            match = False
        if not match:
            failures.append({'id': case['id'], 'reason': 'missing or changed input'})
    runtime = args.runtime_manifest or root / 'converter/runtime-v10/runtime-manifest.json'
    try:
        runtime_matches = digest(runtime) == evidence['runtime']['manifestSha256']
    except OSError:
        runtime_matches = False
    if not runtime_matches:
        failures.append({'id': 'runtime-manifest', 'reason': 'pin mismatch'})
    print(json.dumps({'checkedInputs': len(evidence['cases']), 'failures': failures,
                      'scope': 'hash audit only; CSP results remain native observations'}))
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
