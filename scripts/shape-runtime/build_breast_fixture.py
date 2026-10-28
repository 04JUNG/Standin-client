"""Small breast-only regression fixture from the real controller (run in Blender).

Uses fixed anatomical samples; whole-mesh/fold/muscle validation remains the
separate build_runtime.py --dump / evaluate.full.test.ts workflow.
"""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import anatomy
import build_runtime as build

ap = argparse.ArgumentParser()
ap.add_argument('--blend', required=True)
ap.add_argument('--controller', required=True)
ap.add_argument('--out', required=True)
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:])
sb, mesh = build.load_bpy(args.blend, args.controller)
assert sb.VERSION == 'standin-female-body-0.3.4.breast6'
s = sb.source()
co = s['co']
samples = [[.079, -.110, 1.272], [.09, -.08, 1.235], [.06, -.06, 1.36],
           [.02, -.09, 1.27], [.14, -.04, 1.30], [.06, -.07, 1.18]]
seeds = samples + [[-x, y, z] for x, y, z in samples]
subset = np.unique([int(np.linalg.norm(co - p, axis=1).argmin()) for p in seeds])
baked = build.bake_female(sb, mesh)
anatomy.bake_anatomy(sb, mesh, baked)
source = {'blendSha256': hashlib.sha256(Path(args.blend).read_bytes()).hexdigest(),
          'controllerSha256': hashlib.sha256(Path(args.controller).read_bytes()).hexdigest()}
out = Path(args.out)
temp = out.with_suffix('.ssr')
raw = build.write(temp, sb, mesh, baked, subset=subset, source=source)
temp.unlink()
cases = {}
for size in np.arange(-4, 9) / 4:
    c = {**sb.defaults(mesh), 'breast_size': float(size)}
    truth = sb.compute(c)[0][subset]
    cases[str(size)] = {'controls': c, 'positions': truth.reshape(-1).tolist()}
out.write_text(json.dumps({'ssrGzip': base64.b64encode(gzip.compress(raw)).decode(),
    'cases': cases, 'source': source, 'vertexIndices': subset.tolist()}, separators=(',', ':')) + '\n')
print('BREAST_FIXTURE_READY', len(subset), len(cases), out.stat().st_size)
