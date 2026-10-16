#!/usr/bin/env python3
"""Build `standin-shape-runtime.v1` (.ssr) from a Standin Body Studio .blend.

    python3 scripts/shape-runtime/build_runtime.py \
        --blend standin-body-0.6.10.blend --controller standin_body.py --out shape-runtime-0.6.10.ssr \
        [--fixture src/features/body-selection/shapeRuntime/__fixtures__/mini-0.6.10.json]

1. With the `bpy` module importable (pip `bpy`, Python 3.11) the .blend is opened by Blender itself
   and the controller's own `source()` runs its asset_lock checks. Without bpy the mesh, shape keys
   and custom properties are read straight from the file (blendread.py; zstd .blend via the `zstd`
   CLI). Rules with muscle volume (`muscle_bulk`, 0.6.10) need bpy: they use the armature's
   mass weights.
2. Checks them against the model's own `asset_lock` (basis, body keys, topology, rig hashes).
3. Imports the controller (`standin_body.py`) with bpy stubbed out and decomposes its neutral
   `compute()` into linear fields: body(c) = basis + Σ coef_i(c)·F_i (+ fat-connection band
   G_i = L36(F_i) − F_i). The app evaluates coefficients, sums and `warp()`
   (src/features/body-selection/shapeRuntime/evaluate.ts).
4. Verifies the decomposition against the controller on presets, every slider min/max and random
   combinations with fold_guard off (the decomposition), and reports every case where fold_guard
   moves the mesh. 0.6.7/female: never (the app skips it); 0.6.10: muscle volume can fold, so the
   app ports fold_guard and the fixture holds the controller's real output.

Requires numpy. Exits non-zero if any check fails.
"""
import argparse, base64, gzip, hashlib, importlib.util, json, os, struct, subprocess, sys, tempfile, types
from unittest import mock
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from blendread import Blend  # noqa: E402
import anatomy  # noqa: E402

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


def load_bpy(blend, controller):
    import bpy  # noqa: F401 — the pip `bpy` module, not a stub
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(blend))
    spec = importlib.util.spec_from_file_location("standin_body", controller)
    sb = importlib.util.module_from_spec(spec)
    sys.modules["standin_body"] = sb
    spec.loader.exec_module(sb)
    m, _ = sb.objects()
    sb.source()  # the controller's own asset_lock checks (basis, keys, topology, rig, weights)
    return sb, m


def has_bpy():
    try:
        import bpy
        return hasattr(bpy, "ops") and hasattr(bpy.ops, "wm")
    except ImportError:
        return False


# ------------------------------------------------------------------ bake
def bake(sb, m):
    S = sb.smooth
    s = sb.source()
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
    extra = {}
    if BULK in sb.FIELDS:
        bake_bulk(sb, s, F, extra)
    G = {k: (sb.laplacian_smooth(s, f, 36) - f)[idx] for k, f in F.items()}
    return dict(co=co, F=F, G=G, idx=idx, C=C, fmask=fmask, keep=S(1.18, 1.30, z), masks=masks, faces=s["faces"],
                edges=s["edges_raw"], extra=extra)


# ------------------------------------------------------------------ muscle volume (0.6.10)
BULK = "muscle_bulk"
MUSCLE_PARTS = ("D", "SM", "DM", "SMM")
BULK_RATES = (("Arm", .22), ("ForeArm", .28), ("UpLeg", .12), ("Leg", .18))


def bake_bulk(sb, s, F, extra):
    """standin_body 0.6.10: compose_body's bulk branch, muscle_bulk_offset and refine_bulk_profile.

    * compose_body: body = original + P1·L8(body − original), where the difference is the muscle
      keys' extra weight → fields BK:<muscle part> = P1·L8(F).
    * muscle_bulk_offset: per vertex Σ k_b·(body − p_b) over 8 limb bones (p_b = nearest point on
      the bone axis in rest space); UpLeg keeps its own (k, p) for the inner-thigh test → MB.
    * refine_bulk_profile: result + (0, my, mz)·(result − result@bulk=0) → RB.
    """
    S = sb.smooth
    co = s["co"]
    x, y, z = co.T
    p1 = (1 - S(1.43, 1.49, z))[:, None]
    for r in sb.REGIONS:
        for part in MUSCLE_PARTS:
            key = part + ":BODY_Muscle_" + r
            if key in F:
                F["BK:" + key] = p1 * sb.laplacian_smooth(s, F[key], 8)
    W = s.get("mass_W")
    if W is None:
        raise SystemExit("muscle_bulk rules need the mass weights (open the .blend with bpy)")
    names = s["names"]
    K = np.zeros(len(co))
    Q = np.zeros((len(co), 3))
    up = {}
    for side in ("Left", "Right"):
        for short, rate in BULK_RATES:
            name = sb.P + side + short
            bone = s["rest"][name]
            h, t = np.asarray(bone["head"]), np.asarray(bone["tail"])
            axis = t - h
            u = ((co - h) @ axis) / (axis @ axis)
            p = h + np.clip(u, 0, 1)[:, None] * axis
            k = rate * S(-.04, .16, u) * (1 - S(.68, 1.02, u)) * W[:, names.index(name)]
            if short == "UpLeg":
                up[side] = (k, p)
            else:
                K += k
                Q += k[:, None] * p
    mb = np.column_stack([K, Q, up["Left"][0], up["Left"][1], up["Right"][0], up["Right"][1]])
    extra["MB"] = (np.nonzero(np.abs(mb[:, [0, 4, 8]]).max(1) > 0)[0], mb)
    thigh = S(.52, .65, z) * (1 - S(.87, .98, z))
    calf = S(.12, .23, z) * (1 - S(.43, .53, z))
    arm = W[:, [i for i, n in enumerate(names) if n.endswith(("LeftArm", "RightArm"))]].sum(1)
    fore = W[:, [i for i, n in enumerate(names) if n.endswith(("LeftForeArm", "RightForeArm"))]].sum(1)
    gain = (.28 * arm + .22 * fore) * S(.19, .25, np.abs(x)) * (1 - S(.63, .70, np.abs(x))) * (1 - S(1.46, 1.50, z))
    rb = np.column_stack([gain - .55 * (thigh + calf), gain])
    extra["RB"] = (np.nonzero(np.abs(rb).max(1) > 0)[0], rb)


def laplacian(edges, d, iterations):
    dst = np.concatenate((edges[:, 0], edges[:, 1]))
    src = np.concatenate((edges[:, 1], edges[:, 0]))
    degree = np.maximum(np.bincount(dst, minlength=len(d)), 1)
    d = d.copy()
    for _ in range(iterations):
        avg = np.column_stack([np.bincount(dst, weights=d[src, k], minlength=len(d)) / degree for k in range(3)])
        d += .5 * (avg - d)
    return d


def bulk_offset(baked, body, c):
    """standin_body.muscle_bulk_offset from the baked MB table (rest space, before warp)."""
    S = lambda a, b, v: np.clip((v - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((v - a) / (b - a), 0, 1))
    bulk = .75 * c[BULK] * (1 - .8 * float(S(.4, 1.7, max(0., c["physique"]))))
    if bulk == 0:
        return body
    co = baked["co"]
    x, y, z = co.T
    idx, mb = baked["extra"]["MB"]
    v = mb[idx]
    B = body[idx]
    off = np.zeros_like(body)
    o = v[:, :1] * B - v[:, 1:4]
    for k in (4, 8):
        d = (B - v[:, k + 1:k + 4]) * v[:, k:k + 1]
        inner = d[:, 0] * x[idx] < 0
        d[inner, 0] *= S(.018, .065, np.abs(x[idx][inner]))
        o += d
    off[idx] = o
    torso = S(1.02, 1.23, z) * (1 - S(1.43, 1.50, z)) * (1 - S(.14, .24, np.abs(x)))
    off[:, 0] += body[:, 0] * .13 * torso
    off[:, 1] += np.maximum(body[:, 1] - .025, 0) * .08 * torso
    off = laplacian(baked["edges"], off, 6)
    protect = (1 - S(1.43, 1.49, z)) * S(.12, .20, z)
    return body + bulk * off * protect[:, None]


def with_bulk(sb, baked, c, weights, weights0):
    """Coefficients of compose_body with muscle volume: muscle parts at the bulk-free weights,
    plus the extra weight on the smoothed BK: fields."""
    a = coefs(sb, baked, c, weights0)
    b = coefs(sb, baked, c, weights)
    for k in set(a) | set(b):
        if k.split(":", 1)[0] in MUSCLE_PARTS and "BODY_Muscle_" in k:
            d = b.get(k, 0.) - a.get(k, 0.)
            if d:
                a["BK:" + k] = d
    return a


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


def rest_body(sb, m, baked, c):
    S = sb.smooth
    co, F, G, idx = baked["co"], baked["F"], baked["G"], baked["idx"]
    bulk = c.get(BULK, 0.) > 0

    def weights_of(cc):
        w = sb.mappings(cc)
        legacy = dict(w)
        for r in ("Torso", "Arms", "Legs"):
            legacy["BODY_Fat_" + r] = float(np.clip(max(0., cc["physique"]) + cc["fat_" + r.lower()], 0, 1.7))
        return w, legacy

    weights, legacy = weights_of(c)
    if bulk:
        weights0, legacy0 = weights_of({**c, BULK: 0.})
        A, Bc = with_bulk(sb, baked, c, weights, weights0), with_bulk(sb, baked, c, legacy, legacy0)
    else:
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
    return bulk_offset(baked, body, c) if bulk else body


def evaluate(sb, m, baked, c):
    result = sb.warp(rest_body(sb, m, baked, c), c, m)
    if c.get(BULK, 0.) > 0:
        zero = sb.warp(rest_body(sb, m, baked, {**c, BULK: 0.}), c, m)
        idx, rb = baked["extra"]["RB"]
        result[idx, 1:] += (result[idx, 1:] - zero[idx, 1:]) * rb[idx]
    return result


# ------------------------------------------------------------------ female 0.2.x
# Female compute is a plain weighted sum of the authored BODY keys, then its own warp().
FEMALE_RULES = ("standin-female-body-0.2.2",) + anatomy.FEMALE_RULES
MALE_RULES = ("standin-body-0.6.7", "standin-body-0.6.10") + anatomy.MALE_RULES


def bake_female(sb, m):
    s = sb.source()
    co = s["co"]
    F = {"D:" + k: d for k, d in s["deltas"].items()}
    empty = np.zeros(0, int)
    return dict(co=co, F=F, G={k: np.zeros((0, 3)) for k in F}, idx=empty, C=np.zeros_like(co),
                fmask=np.zeros(len(co)), keep=np.zeros(len(co)), masks={}, faces=s["faces"], extra={})


def evaluate_female(sb, m, baked, c):
    body = baked["co"] + sum(w * baked["F"]["D:" + k] for k, w in sb.mappings(c).items() if w)
    return sb.warp(body, c, m)


def constants_of(sb):
    extra = anatomy.constants(sb) if sb.VERSION in anatomy.RULES else {}
    if sb.VERSION in FEMALE_RULES:
        return dict(gains=sb.GAINS, **extra)
    return dict(gains=sb.GAINS, volumeExtra=sb.VOLUME_EXTRA, defMax=sb.DEF_MAX, excessStart=sb.EXCESS_START,
                fatArmExtra=sb.FAT_ARM_EXTRA, **extra)


# ------------------------------------------------------------------ write
def write(path, sb, m, baked, subset=None):
    co, F, G, idx, C = baked["co"], dict(baked["F"]), dict(baked["G"]), baked["idx"], baked["C"]
    faces = baked["faces"]
    band_const = C[idx]
    extra = {k: (i, v[i]) for k, (i, v) in baked["extra"].items()}
    if subset is not None:  # fixture: fields are per-vertex, so a subset evaluates exactly
        remap = -np.ones(len(co), int)
        remap[subset] = np.arange(len(subset))
        inband = np.isin(idx, subset)
        G = {k: g[inband] for k, g in G.items()}
        band_const = band_const[inband]
        idx = remap[idx[inband]]
        F = {k: f[subset] for k, f in F.items()}
        co = co[subset]
        # Muscle volume smooths over mesh edges: keep the faces inside the subset (the fixture
        # subset is closed under the smoothing neighbourhood of the checked vertices).
        faces = remap[faces[np.all(remap[faces] >= 0, axis=1)]] if extra else np.zeros((0, 3), int)
        extra = {k: (remap[i[np.isin(i, subset)]], v[np.isin(i, subset)]) for k, (i, v) in extra.items()}
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
    for k, (i, v) in extra.items():
        add(k + ".idx", i, "<u2")
        add(k + ".val", v, "<f4")
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


LAYERED_RINGS = 10


def layered_subset(sb, baked, rng, cases, refs, folds):
    """Fixture for the anatomy rules: a few check vertices with their 18-ring neighbourhoods.

    The layers smooth over the mesh (muscle volume 6 rings, heavy-fat blend 8) and fold_guard
    relaxes zones, so the subset only reproduces the full mesh at the check vertices for cases
    whose total smoothing depth fits and where fold_guard moved nothing. Female muscle > 2
    (28 + 16 rings) is checked on the full mesh only (--dump, evaluate.full.test.ts).
    """
    co = baked["co"]
    x, z = co[:, 0], co[:, 2]
    pick = lambda m: rng.choice(np.nonzero(m)[0], 1)
    seeds = np.unique(np.concatenate([
        pick((np.abs(x) > .3) & (z > 1.2)),                 # arm
        pick((np.abs(x) < .06) & (z > .6) & (z < .8)),      # inner thigh / groin
        pick((z > .15) & (z < .4)),                         # calf
        pick((z > .95) & (z < 1.1) & (np.abs(x) > .1)),     # hip / waist side
        pick(z > z.max() - .15)]))                          # head
    edges = baked["edges"] if "edges" in baked else sb.source()["edges_raw"]
    ring = np.zeros(len(co), bool)
    ring[seeds] = True
    for _ in range(LAYERED_RINGS):
        ring[edges[ring[edges[:, 0]], 1]] = True
        ring[edges[ring[edges[:, 1]], 0]] = True
    sel = np.nonzero(ring)[0]
    folded = {f[0] for f in folds}
    keep = {k for k, c in cases.items() if k not in folded and c.get("muscle", 0.) <= 2.}
    return sel, np.searchsorted(sel, seeds), keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--controller", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fixture")
    ap.add_argument("--random", type=int, default=20)
    ap.add_argument("--dump", help="write the controller output of every case (.npz) for the full-mesh app check")
    args = ap.parse_args()
    if has_bpy():
        sb, m = load_bpy(args.blend, args.controller)
    else:
        sb, m = load_controller(args.controller, read_blend(args.blend))
    female = sb.VERSION in FEMALE_RULES
    if sb.VERSION not in MALE_RULES + FEMALE_RULES:
        raise SystemExit("unsupported controller rules " + sb.VERSION + " — extend build_runtime.py and evaluate.ts first")
    layered = sb.VERSION in anatomy.RULES
    if layered and not has_bpy():
        raise SystemExit(sb.VERSION + " needs bpy: the anatomy layer reads skin weights and bone rest data")
    baked = bake_female(sb, m) if female else bake(sb, m)
    if layered:
        anatomy.bake_anatomy(sb, m, baked)
        run = lambda c: anatomy.evaluate(sb, m, baked, c, lambda cc: rest_body(sb, m, baked, cc))
    else:
        run = (lambda c: evaluate_female(sb, m, baked, c)) if female else (lambda c: evaluate(sb, m, baked, c))
    values = lambda over: {**sb.defaults(m), **over}
    rng = np.random.default_rng(1)
    cases = {"preset:" + p: values(v[1]) for p, v in sb.PRESETS.items()}
    for k, (lo, hi, _, _) in sb.FIELDS.items():
        cases[k + ":min"] = values({k: lo})
        cases[k + ":max"] = values({k: hi})
    for i in range(args.random):
        cases["rand%d" % i] = values({k: float(rng.uniform(lo, hi)) for k, (lo, hi, _, _) in sb.FIELDS.items()})
    if BULK in sb.FIELDS:  # muscle volume against fat, height and proportions
        for i, over in enumerate([{"physique": 1.7}, {"physique": .6, "muscle": 1.}, {"physique": -1., "muscle": 0.},
                                  {"height_cm": 160., "heads": 5.5}, {"height_cm": 195., "heads": 8.7, "leg_length": 1.}]):
            cases["bulk%d" % i] = values({BULK: 1., **over})
    original_fold = sb.fold_guard
    worst, folds, refs = 0., [], {}
    for name, c in cases.items():
        sb.fold_guard = lambda s_, base, body, **kw: body
        ref, _, _ = sb.compute(c)
        sb.fold_guard = original_fold
        full, _, _ = sb.compute(c)
        refs[name] = full  # the fixture holds the controller's real output (fold_guard on)
        moved = float(np.linalg.norm(full - ref, axis=1).max() * 1000)
        if moved > 1e-6:  # fold_guard repaired flipped faces in this case
            folds.append((name, round(moved, 3), round(c.get(BULK, 0.), 3)))  # (case, max shift mm, muscle_bulk)
        # Layered rules: the app ports fold_guard and every smoothing, so compare with it on.
        worst = max(worst, float(np.abs(run(c) - (full if layered else ref)).max() * 1000))
    if args.dump:
        np.savez_compressed(args.dump, names=np.array(list(cases)), controls=json.dumps(cases),
                            positions=np.stack([refs[k] for k in cases]).astype("<f8"))
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
        check = None
        if layered:
            sel, check, keep_cases = layered_subset(sb, baked, rng, cases, refs, folds)
        elif baked["extra"]:
            # Muscle volume smooths 6 rings over the mesh: check a few vertices per region and
            # ship their 6-ring neighbourhoods so the subset evaluates exactly at those vertices.
            idx_mb = baked["extra"]["MB"][0]
            co = baked["co"]
            seeds = np.unique(np.concatenate([
                rng.choice(idx_mb[np.abs(co[idx_mb, 0]) > .3], 1),                      # arm
                rng.choice(idx_mb[(co[idx_mb, 2] > .6) & (np.abs(co[idx_mb, 0]) < .06)], 1),  # inner thigh
                rng.choice(idx_mb[co[idx_mb, 2] < .45], 1),                             # calf
                rng.choice(baked["idx"], 1).astype(int)]))                              # fat band
            edges = baked["edges"]
            ring = np.zeros(len(baked["co"]), bool)
            ring[seeds] = True
            for _ in range(6):
                ring[edges[ring[edges[:, 0]], 1]] = True
                ring[edges[ring[edges[:, 1]], 0]] = True
            sel = np.nonzero(ring)[0]
            check = np.searchsorted(sel, seeds)
        mini = tempfile.NamedTemporaryFile(suffix=".ssr", delete=False).name
        write(mini, sb, m, baked, subset=sel)
        extremes = ["height_cm:min", "heads:max", "physique:max", "muscle:max", "head_scale:min",
                    "leg_ratio:min", "arm_length:max", "fat_torso:max", "fat_gain:max",
                    "breast_size:max", "breast_size:min", "fat_distribution:min",
                    "muscle_bulk:max", "bulk0", "bulk1", "bulk3"]
        keep = [k for k in cases if k.startswith("preset:")] + ["rand0", "rand1", "rand2", "rand3"] + \
            [k for k in extremes if k in cases]
        if layered:
            keep = [k for k in keep if k in keep_cases]
        pick = sel if check is None else sel[check]
        raw = open(mini, "rb").read()
        packed = dict(ssrGzip=base64.b64encode(gzip.compress(raw, mtime=0)).decode()) if check is not None else \
            dict(ssr=base64.b64encode(raw).decode())
        fx = dict(**packed, vertices=pick.tolist(),
                  cases={k: dict(controls=cases[k], positions=[round(v, 6) for v in refs[k][pick].ravel().tolist()]) for k in keep})
        if check is not None:
            fx["check"] = check.tolist()
        with open(args.fixture, "w") as f:
            json.dump(fx, f, separators=(",", ":"))
        print("fixture", args.fixture, len(sel), "vertices", len(keep), "cases")


if __name__ == "__main__":
    main()
