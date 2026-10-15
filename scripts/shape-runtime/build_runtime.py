#!/usr/bin/env python3
"""Build `standin-shape-runtime.v1` (.ssr) from a Standin Body Studio .blend — no Blender needed.

    python3 scripts/shape-runtime/build_runtime.py \
        --blend standin-body-0.6.7.blend --controller standin_body.py --out shape-runtime-0.6.7.ssr \
        [--fixture src/features/body-selection/shapeRuntime/__fixtures__/mini-0.6.7.json]

1. Reads the mesh, shape keys and custom properties straight from the .blend (blendread.py).
   A zstd-compressed .blend is decompressed with the `zstd` CLI first.
2. Checks them against the model's own `asset_lock` (basis, body keys, topology, rig hashes).
3. Imports the controller (`standin_body.py`) with bpy stubbed out and decomposes its neutral
   `compute()` into linear fields: body(c) = basis + Σ coef_i(c)·F_i (+ fat-connection band
   G_i = L36(F_i) − F_i). The app evaluates coefficients, sums and `warp()`
   (src/features/body-selection/shapeRuntime/evaluate.ts).
4. Verifies the decomposition against the controller on presets, every slider min/max and random
   combinations (fold_guard off — the app does not run it; reported separately), then writes.

Requires numpy. Exits non-zero if any check fails.
"""
import argparse, base64, hashlib, importlib.util, json, os, struct, subprocess, sys, tempfile, types
from unittest import mock
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from blendread import Blend  # noqa: E402

FORMAT = "standin-shape-runtime.v1"
EPS = 1e-6  # m; sparse field entries below 1 µm on every axis are dropped
TOL_MM = 0.05


# ------------------------------------------------------------------ read .blend
def raw_blend(path):
    with open(path, "rb") as f:
        head = f.read(4)
    if head != b"\x28\xb5\x2f\xfd":  # not zstd-compressed
        return path
    out = tempfile.NamedTemporaryFile(suffix=".blend", delete=False).name
    try:
        import zstandard  # optional
        with open(path, "rb") as f, open(out, "wb") as g:
            g.write(zstandard.ZstdDecompressor().stream_reader(f).read())
        return out
    except ImportError:
        pass
    try:
        subprocess.run(["zstd", "-d", "-f", "-q", path, "-o", out], check=True)
    except FileNotFoundError:
        raise SystemExit("compressed .blend: install `zstd` (or pip zstandard), or pass `zstd -d` output")
    return out


def read_blend(path):
    B = Blend(raw_blend(path))

    def cstr(addr):
        b = B.block(addr)
        return B.d[b["off"]:b["off"] + b["len"]].split(b"\0")[0].decode()

    me = [b for b in B.blocks if b["code"] == "ME"]
    if len(me) != 1:
        raise SystemExit("expected exactly one mesh")
    o = me[0]["off"]
    st = o + B.field_off("Mesh", "attribute_storage")
    ab = B.block(B.get(st, "AttributeStorage", "dna_attributes"))
    attrs = {}
    for i in range(B.get(st, "AttributeStorage", "dna_attributes_num")):
        name = cstr(B.get(ab["off"], "Attribute", "name", i))
        db = B.block(B.get(ab["off"], "Attribute", "data", i))
        attrs[name] = B.get(db["off"], "AttributeArray", "data")
    corner = B.array(attrs[".corner_vert"], "<i4")
    offsets = B.array(B.get(o, "Mesh", "poly_offset_indices"), "<i4")
    if not (np.diff(offsets) == 3).all():
        raise SystemExit("mesh is not all triangles")
    edges = B.array(attrs[".edge_verts"], "<i4", (-1, 2))
    key = [b for b in B.blocks if b["code"] == "KE"][0]
    keys = {}
    for kb in B.listbase(key["off"] + B.field_off("Key", "block"), "KeyBlock"):
        keys[B.get(kb["off"], "KeyBlock", "name")] = B.array(B.get(kb["off"], "KeyBlock", "data"), "<f4", (-1, 3))

    def props(idoff):
        p = B.get(idoff, "ID", "properties")
        out = {}
        if not p:
            return out
        g = B.block(p)
        for c in B.listbase(g["off"] + B.field_off("IDProperty", "data") + B.field_off("IDPropertyData", "group"), "IDProperty"):
            t = B.get(c["off"], "IDProperty", "type")
            nm = B.get(c["off"], "IDProperty", "name")
            dpos = c["off"] + B.field_off("IDProperty", "data")
            val = dpos + B.field_off("IDPropertyData", "val")
            if t == 0:
                out[nm] = cstr(B.get(dpos, "IDPropertyData", "pointer"))
            elif t == 1:
                out[nm] = B.get(dpos, "IDPropertyData", "val")
            elif t == 2:
                out[nm] = struct.unpack_from("<f", B.d, val)[0]
            elif t == 8:
                out[nm] = struct.unpack_from("<d", B.d, val)[0]
            else:
                out[nm] = 1  # groups/arrays: only presence matters here
        return out

    obs = {B.get(b["off"], "ID", "name")[2:]: b for b in B.blocks if b["code"] == "OB"}
    mesh_props = arm_props = None
    for b in obs.values():
        pr = props(b["off"])
        if "standin_studio_mesh" in pr:
            mesh_props = pr
        if "standin_studio_arm" in pr:
            arm_props = pr
    if mesh_props is None or arm_props is None:
        raise SystemExit("Standin mesh/armature not found")
    return dict(faces=corner.reshape(-1, 3), edges=edges, keys=keys, mesh=mesh_props, arm=arm_props)


# ------------------------------------------------------------------ controller without Blender
def load_controller(path, data):
    for name in ["bpy", "bpy.props", "bpy.app", "bpy.app.handlers", "mathutils", "mathutils.bvhtree"]:
        sys.modules[name] = mock.MagicMock()
    sys.modules["bpy"].types = types.SimpleNamespace(
        PropertyGroup=type("PG", (), {}), Operator=type("Op", (), {}), Panel=type("Pn", (), {}),
        Scene=mock.MagicMock(), Object=mock.MagicMock())
    sys.modules["bpy.app.handlers"].persistent = lambda f: f
    spec = importlib.util.spec_from_file_location("standin_body", path)
    sb = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sb)

    class Fake(dict):
        def as_pointer(self):
            return 1

    m, a = Fake(data["mesh"]), Fake(data["arm"])
    sb.objects = lambda scene=None: (m, a)
    co = data["keys"]["Basis"].astype(np.float64)
    ds = {k: v.astype(np.float64) - co for k, v in data["keys"].items() if k.startswith("BODY_")}
    faces = data["faces"].astype(np.int32)
    edges = data["edges"].astype(np.int32)
    lock = json.loads(m["asset_lock"])
    checks = {
        "basis": hashlib.sha256(co.astype("<f4").tobytes()).hexdigest() == lock["basis_sha256"],
        "body keys": hashlib.sha256(b"".join(n.encode() + ds[n].astype("<f4").tobytes() for n in sorted(ds))).hexdigest() == lock["body_deltas_sha256"],
        "topology": sb.digest(faces.tolist()) == lock["topology_sha256"],
        "rig": sb.digest(json.loads(a["frozen_rest"])) == lock["rig_sha256"],
    }
    if not all(checks.values()):
        raise SystemExit("asset_lock mismatch: " + json.dumps(checks))
    # Same as standin_body.source(): fat smoothing over the mesh edge order.
    dst = np.concatenate((edges[:, 0], edges[:, 1]))
    src = np.concatenate((edges[:, 1], edges[:, 0]))
    degree = np.maximum(np.bincount(dst, minlength=len(co)), 1)
    fat_smooth = {}
    for name in ("BODY_Fat_Torso", "BODY_Fat_Legs"):
        d = ds[name].copy()
        for _ in range(24):
            avg = np.column_stack([np.bincount(dst, weights=d[src, k], minlength=len(co)) / degree for k in range(3)])
            d += .5 * (avg - d)
        fat_smooth[name] = d
    sb.CACHE[1] = {"co": co, "deltas": ds, "fat_smooth": fat_smooth, "edges_raw": edges, "faces": faces,
                   "rest": json.loads(a["frozen_rest"]), "names": [], "W": None}
    return sb, m


# ------------------------------------------------------------------ bake
def bake(sb, m):
    S = sb.smooth
    s = sb.CACHE[1]
    co = s["co"]
    lm = json.loads(m["landmarks"])
    z = co[:, 2]
    K = sb.crotch_keep(s, m)
    T = sb.elbow_taper(s)
    masks = sb.region_masks(s, m)
    J = 1 - S(lm["chin"] - .075, lm["chin"] - .005, z)
    D = s["deltas"]
    F = {}
    for name in D:
        if name not in ("BODY_Fat_Torso", "BODY_Definition"):
            F["D:" + name] = D[name]
    for name in ("BODY_Fat_Torso", "BODY_Fat_Legs"):
        E = K[:, None] * (sb.volume_kept_smooth(s, name) - D[name])
        if name == "BODY_Fat_Torso":
            F["DJ:" + name] = D[name] * J[:, None]
            F["EJ:" + name] = E * J[:, None]
        else:
            F["E:" + name] = E
    F["DT:BODY_Fat_Arms"] = D["BODY_Fat_Arms"] * T[:, None]
    for r in sb.REGIONS:
        name = "BODY_Muscle_" + r
        F["SM:" + name] = sb.soft_muscle_offset(s, name)
        if name in masks:
            F["DM:" + name] = D[name] * masks[name][:, None]
            F["SMM:" + name] = F["SM:" + name] * masks[name][:, None]
    F["DEF"] = sb.definition_delta(s) * sb.DEF_MAX
    F["R"] = sb.anatomy_relief(s, m)
    x, y, _ = co.T
    ax = np.abs(x)
    rear = S(-.04, .07, y)
    fmask = S(.68, .81, z) * (1 - S(1.09, 1.20, z)) * S(.025, .095, ax) * (.45 + .55 * rear)
    idx = np.nonzero(fmask > 0)[0]
    C = .35 * (sb.laplacian_smooth(s, co, 12) - co)
    C[:, 1] -= .006 * np.exp(-((z - .88) / .065) ** 2) * rear
    G = {k: (sb.laplacian_smooth(s, f, 36) - f)[idx] for k, f in F.items()}
    return dict(co=co, F=F, G=G, idx=idx, C=C, fmask=fmask, keep=S(1.18, 1.30, z), masks=masks, faces=s["faces"])


def coefs(sb, baked, c, weights):
    S = sb.smooth
    a = {}
    add = lambda k, v: a.__setitem__(k, a.get(k, 0.) + v)
    soft = .7 * S(.3, 1.5, max(0., c["physique"]))
    for name, w in weights.items():
        if name in ("BODY_Fat_Torso", "BODY_Fat_Legs"):
            b = .5 * S(1., 1.7, w) + .3 * S(.7, 1.7, w)
            if name == "BODY_Fat_Torso":
                add("DJ:" + name, w); add("EJ:" + name, w * b); add("R", -.85 * S(.3, 1.5, w))
            else:
                add("D:" + name, w); add("E:" + name, w * b)
        elif name == "BODY_Fat_Arms":
            add("D:" + name, w); add("DT:" + name, w * sb.FAT_ARM_EXTRA * S(.6, 1.7, w))
        elif name.startswith("BODY_Muscle_"):
            e = sb.EXCESS_START
            if name in baked["masks"] and w > e:
                add("D:" + name, e); add("SM:" + name, e * soft)
                add("DM:" + name, w - e); add("SMM:" + name, (w - e) * soft)
            else:
                add("D:" + name, w); add("SM:" + name, w * soft)
        elif name == "BODY_Definition":
            add("DEF", w)
        else:
            add("D:" + name, w)
    return a


def evaluate(sb, m, baked, c):
    S = sb.smooth
    co, F, G, idx = baked["co"], baked["F"], baked["G"], baked["idx"]
    weights = sb.mappings(c)
    legacy = dict(weights)
    for r in ("Torso", "Arms", "Legs"):
        legacy["BODY_Fat_" + r] = float(np.clip(max(0., c["physique"]) + c["fat_" + r.lower()], 0, 1.7))
    A, Bc = coefs(sb, baked, c, weights), coefs(sb, baked, c, legacy)
    body = co + sum(v * F[k] for k, v in A.items())
    prior = co + sum(v * F[k] for k, v in Bc.items())
    strength = float(S(.55, 1.65, max(0., c["physique"] + .5 * (c["fat_torso"] + c["fat_legs"]))))
    if strength:
        off = .85 * sum(v * G[k] for k, v in A.items()) + baked["C"][idx]
        off /= np.maximum(1., np.linalg.norm(off, axis=1) / .012)[:, None]
        body[idx] += strength * baked["fmask"][idx][:, None] * off
    body += (prior - body) * baked["keep"][:, None]
    body = prior + (body - prior) * (1 - float(S(1., 2., c["muscle"])))
    return sb.warp(body, c, m)


# ------------------------------------------------------------------ female 0.2.x
# Female compute is a plain weighted sum of the authored BODY keys, then its own warp().
FEMALE_RULES = ("standin-female-body-0.2.2",)
MALE_RULES = ("standin-body-0.6.7",)


def bake_female(sb, m):
    s = sb.CACHE[1]
    co = s["co"]
    F = {"D:" + k: d for k, d in s["deltas"].items()}
    empty = np.zeros(0, int)
    return dict(co=co, F=F, G={k: np.zeros((0, 3)) for k in F}, idx=empty, C=np.zeros_like(co),
                fmask=np.zeros(len(co)), keep=np.zeros(len(co)), masks={}, faces=s["faces"])


def evaluate_female(sb, m, baked, c):
    body = baked["co"] + sum(w * baked["F"]["D:" + k] for k, w in sb.mappings(c).items() if w)
    return sb.warp(body, c, m)


def constants_of(sb):
    if sb.VERSION in FEMALE_RULES:
        return dict(gains=sb.GAINS)
    return dict(gains=sb.GAINS, volumeExtra=sb.VOLUME_EXTRA, defMax=sb.DEF_MAX, excessStart=sb.EXCESS_START, fatArmExtra=sb.FAT_ARM_EXTRA)


# ------------------------------------------------------------------ write
def write(path, sb, m, baked, subset=None):
    co, F, G, idx, C = baked["co"], dict(baked["F"]), dict(baked["G"]), baked["idx"], baked["C"]
    faces = baked["faces"]
    band_const = C[idx]
    if subset is not None:  # fixture: every field is per-vertex, so a subset evaluates exactly
        remap = -np.ones(len(co), int)
        remap[subset] = np.arange(len(subset))
        inband = np.isin(idx, subset)
        G = {k: g[inband] for k, g in G.items()}
        band_const = band_const[inband]
        idx = remap[idx[inband]]
        F = {k: f[subset] for k, f in F.items()}
        co = co[subset]
        faces = np.zeros((0, 3), int)
    blobs, arrays = [], []

    def add(name, a, dtype):
        a = np.ascontiguousarray(a, dtype=dtype)
        pad = (-sum(len(b) for b in blobs)) % 4
        if pad:
            blobs.append(b"\0" * pad)
        arrays.append(dict(name=name, dtype=np.dtype(dtype).name, offset=sum(len(b) for b in blobs), length=int(a.size)))
        blobs.append(a.tobytes())

    add("basis", co, "<f4")
    add("faces", faces, "<u2")
    add("band", idx, "<u2")
    add("bandConst", band_const, "<f4")
    fields = []
    for k, f in F.items():
        sel = np.nonzero(np.abs(f).max(1) > EPS)[0]
        scale = float(np.abs(f[sel]).max() / 32767) if len(sel) else 1.
        add("F.idx:" + k, sel, "<u2")
        add("F.val:" + k, np.round(f[sel] / scale), "<i2")
        gs = (float(np.abs(G[k]).max() / 32767) if G[k].size else 0.) or 1.
        add("G.val:" + k, np.round(G[k] / gs), "<i2")
        fields.append(dict(name=k, scale=scale, bandScale=gs, count=int(len(sel))))
    header = dict(
        format=FORMAT, rules=sb.VERSION, asset=m["asset_identity"],
        vertexCount=int(len(co)), faceCount=int(len(faces)), bandCount=int(len(idx)),
        landmarks=json.loads(m["landmarks"]), baseHeads=float(m["base_heads"]),
        controls={k: dict(min=lo, max=hi, default=(float(m["base_heads"]) if k == "heads" else d)) for k, (lo, hi, d, _) in sb.FIELDS.items()},
        aliases={"height": "height_cm"},
        presets={k: v[1] for k, v in sb.PRESETS.items()},
        constants=constants_of(sb),
        fields=fields, arrays=arrays)
    hj = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode()
    hpad = (-(8 + len(hj))) % 4
    data = b"SSR1" + struct.pack("<I", len(hj) + hpad) + hj + b" " * hpad + b"".join(blobs)
    with open(path, "wb") as f:
        f.write(data)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--controller", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fixture")
    ap.add_argument("--random", type=int, default=20)
    args = ap.parse_args()
    data = read_blend(args.blend)
    sb, m = load_controller(args.controller, data)
    female = sb.VERSION in FEMALE_RULES
    if sb.VERSION not in MALE_RULES + FEMALE_RULES:
        raise SystemExit("unsupported controller rules " + sb.VERSION + " — extend build_runtime.py and evaluate.ts first")
    baked = bake_female(sb, m) if female else bake(sb, m)
    run = (lambda c: evaluate_female(sb, m, baked, c)) if female else (lambda c: evaluate(sb, m, baked, c))
    values = lambda over: {**sb.defaults(m), **over}
    rng = np.random.default_rng(1)
    cases = {"preset:" + p: values(v[1]) for p, v in sb.PRESETS.items()}
    for k, (lo, hi, _, _) in sb.FIELDS.items():
        cases[k + ":min"] = values({k: lo})
        cases[k + ":max"] = values({k: hi})
    for i in range(args.random):
        cases["rand%d" % i] = values({k: float(rng.uniform(lo, hi)) for k, (lo, hi, _, _) in sb.FIELDS.items()})
    original_fold = sb.fold_guard
    worst, folds, refs = 0., [], {}
    for name, c in cases.items():
        sb.fold_guard = lambda s_, base, body, **kw: body
        ref, _, _ = sb.compute(c)
        refs[name] = ref
        sb.fold_guard = original_fold
        full, _, _ = sb.compute(c)
        fr = sb.CACHE[1].get("fold_report", {})
        if fr.get("flipped_faces"):
            folds.append((name, fr["flipped_faces"], float(np.linalg.norm(full - ref, axis=1).max() * 1000)))
        worst = max(worst, float(np.abs(run(c) - ref).max() * 1000))
    data_bytes = write(args.out, sb, m, baked)
    print(json.dumps(dict(out=args.out, bytes=len(data_bytes), sha256=hashlib.sha256(data_bytes).hexdigest(),
                          rules=sb.VERSION, asset=m["asset_identity"], cases=len(cases),
                          decomposition_max_mm=worst, fold_guard_cases=folds), ensure_ascii=False))
    if worst > TOL_MM:
        raise SystemExit("decomposition does not match the controller")
    if args.fixture:
        sel = np.unique(np.concatenate([rng.choice(len(baked["co"]), 160, replace=False),
                                        rng.choice(baked["idx"], min(60, len(baked["idx"])), replace=False).astype(int),
                                        [int(np.argmax(baked["co"][:, 2])), int(np.argmin(baked["co"][:, 2]))]]))
        mini = tempfile.NamedTemporaryFile(suffix=".ssr", delete=False).name
        write(mini, sb, m, baked, subset=sel)
        extremes = ["height_cm:min", "heads:max", "physique:max", "muscle:max", "head_scale:min",
                    "leg_ratio:min", "arm_length:max", "fat_torso:max", "fat_gain:max",
                    "breast_size:max", "breast_size:min", "fat_distribution:min"]
        keep = [k for k in cases if k.startswith("preset:")] + ["rand0", "rand1", "rand2", "rand3"] + \
            [k for k in extremes if k in cases]
        fx = dict(ssr=base64.b64encode(open(mini, "rb").read()).decode(), vertices=sel.tolist(),
                  cases={k: dict(controls=cases[k], positions=[round(v, 6) for v in refs[k][sel].ravel().tolist()]) for k in keep})
        with open(args.fixture, "w") as f:
            json.dump(fx, f, separators=(",", ":"))
        print("fixture", args.fixture, len(sel), "vertices", len(keep), "cases")


if __name__ == "__main__":
    main()
