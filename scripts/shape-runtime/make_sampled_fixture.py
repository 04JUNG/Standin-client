"""Shrink an SSR2 runtime into a small test fixture for `shapeRuntime/sampled.test.ts`.

    python make_sampled_fixture.py --runtime runtime.ssr --presets BASE,BULK --basis 48 --vertices 150 \
        --out src/features/body-selection/shapeRuntime/__fixtures__/mini-sampled.json

Keeps a few preset models (so model blending is exercised), the coefficient rows they use,
the first K basis vectors, a random vertex subset (no faces). Golden positions are computed
from the mini file itself with check_sampled_runtime.make_evaluator — the same rule the
builder and the independent check use — so the test proves the app evaluates exactly what
was measured against the controller.
"""
import argparse, base64, gzip, json, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from build_sampled_runtime import write_ssr2  # noqa: E402
from check_sampled_runtime import make_evaluator, read_ssr2  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runtime', required=True)
    ap.add_argument('--presets', required=True)
    ap.add_argument('--basis', type=int, default=48)
    ap.add_argument('--vertices', type=int, default=150)
    ap.add_argument('--out', required=True)
    ap.add_argument('--seed', type=int, default=7)
    args = ap.parse_args()
    header, arrays = read_ssr2(args.runtime)
    full_k, nv = header['basisCount'], header['vertexCount']
    K = min(args.basis, full_k)
    names = args.presets.split(',')
    rows, models = [], {}
    for name in names:
        model = header['models'][name]
        used = [model['base']] + [a['offset'] + i for a in model['axes'] for i in range(len(a['knots']))]
        used += [p['offset'] + i for p in model['pairs'] for i in range(len(p['ga']) * len(p['gb']))]
        remap = {}
        for r in used:
            remap[r] = len(rows)
            rows.append(r)
        models[name] = {'base': remap[model['base']],
                        'axes': [{**a, 'offset': remap[a['offset']]} for a in model['axes']],
                        'pairs': [{**p, 'offset': remap[p['offset']]} for p in model['pairs']]}
    coef = arrays['coef'].reshape(header['coefCount'], full_k)[rows, :K]
    rng = np.random.default_rng(args.seed)
    pick = np.sort(rng.choice(nv, args.vertices, replace=False))
    basis = arrays['basis'].reshape(full_k, nv, 3)[:K, pick, :]
    mean = arrays['mean'].reshape(nv, 3)[pick]
    mini = {k: v for k, v in header.items() if k != 'arrays'}
    mini.update({'vertexCount': len(pick), 'faceCount': 0, 'basisCount': K, 'coefCount': len(rows), 'quality': {},
                 'presets': {n: header['presets'][n] for n in names}, 'models': models})
    tmp = Path(args.out).with_suffix('.ssr')
    write_ssr2(tmp, mini, [('faces', 'uint16', np.zeros(0, np.uint16)),
                           ('mean', 'float32', np.ascontiguousarray(mean).reshape(-1)),
                           ('basisScale', 'float32', np.ascontiguousarray(arrays['basisScale'][:K])),
                           ('coef', 'float32', np.ascontiguousarray(coef).reshape(-1)),
                           ('basis', 'int16', np.ascontiguousarray(basis).reshape(-1))])
    mini_header, mini_arrays = read_ssr2(tmp)
    evaluate = make_evaluator(mini_header, mini_arrays, K)
    lo = {k: v['min'] for k, v in header['controls'].items()}
    hi = {k: v['max'] for k, v in header['controls'].items()}
    keys = list(header['controls'])
    cases = {}
    for name in names:
        base = header['presets'][name]
        cases[f'{name}-exact'] = (name, dict(base))
        pair = header['models'][name]['pairs'][0] if header['models'][name]['pairs'] else None
        if pair:
            cases[f'{name}-pair-corner'] = (name, {**base, pair['a']: hi[pair['a']], pair['b']: lo[pair['b']]})
    a, b = (header['presets'][n] for n in names[:2])
    cases['between-presets'] = (names[0], {k: (a[k] + b[k]) / 2 for k in keys})
    for n in range(2):
        c = dict(header['presets'][names[0]])
        for k in rng.choice(keys, 8, replace=False):
            c[k] = float(np.round(rng.uniform(lo[k], hi[k]), 3))
        cases[f'random-{n}'] = (names[0], c)
    out = {'ssrGzip': base64.b64encode(gzip.compress(tmp.read_bytes(), 9, mtime=0)).decode(),
           'cases': {label: {'preset': preset, 'controls': c, 'positions': evaluate(preset, c).reshape(-1).round(7).tolist()}
                     for label, (preset, c) in cases.items()}}
    Path(args.out).write_text(json.dumps(out, separators=(',', ':')))
    tmp.unlink()
    print('FIXTURE', args.out, Path(args.out).stat().st_size)


if __name__ == '__main__':
    main()
