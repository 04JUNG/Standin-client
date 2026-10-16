"""Anatomy-layer rules (male 0.7.1, female 0.3.3) for build_runtime.py.

The 0.7 / 0.3 controllers wrap the earlier neutral `compute()` in extra layers. Each layer reads
the global `warp` and `compute`, so every call below goes through the newest definitions:

  warp     = parent warp + C1 (PCHIP) blend of the leg/torso segment remap
             (only when leg_length, leg_ratio or torso_length is non-zero).
  male     = anatomy(parent 0.6.10 compute)
  female   = pelvis(muscle_refine(anatomy(parent 0.2.2 compute)))

  anatomy: offset = Σ w·(anatomy_delta(key) − key) [+ female forearm support above muscle 2]
           result += cap12mm(warp(basis + offset) − warp(basis)) → fold_guard
           heavy fat: blend the composed displacement toward its 8× Laplacian → fold_guard
           (female: a final fold_guard against warp(basis)).
  muscle_refine (female, muscle > 2): trims the extra limb thickness above muscle 2 along each
           limb bone axis and smooths the elbow sleeve → fold_guard.
  pelvis (female, muscle > 1.25): pulls the lateral hip surface in → fold_guard.

Everything that depends only on the rest mesh is baked here (fields AD:<key>, FA and per-vertex
tables); the app computes the rest (src/features/body-selection/shapeRuntime/anatomy.ts).
"""
import json
import numpy as np

MALE_RULES = ("standin-body-0.7.1",)
FEMALE_RULES = ("standin-female-body-0.3.3",)
RULES = MALE_RULES + FEMALE_RULES
PROTECT = ("Head", "Neck", "Hand", "Foot", "Toe")
LIMBS = (("Arm", .48), ("ForeArm", .44), ("UpLeg", .40))  # muscle_refine_limb_fields order per side
EPS = 1e-6


def dense(a):
    a = np.asarray(a, dtype=np.float64)
    return np.arange(len(a)), a.reshape(len(a), -1)


def bake_anatomy(sb, m, baked):
    """Adds the anatomy fields/tables to a baked parent (male bake() or female bake_female())."""
    s = sb.source()
    S = sb.smooth
    co = s["co"]
    F, G, extra = baked["F"], baked["G"], baked["extra"]
    nband = len(baked["idx"])
    female = sb.VERSION in FEMALE_RULES
    for name, d in s["deltas"].items():
        ad = sb.anatomy_delta(s, name) - d
        if np.abs(ad).max() > EPS:
            F["AD:" + name] = ad
            G["AD:" + name] = np.zeros((nband, 3))
    names, W = s["names"], s["W"]
    protect = W[:, [i for i, n in enumerate(names) if any(k in n for k in PROTECT)]].sum(1)
    extra["VN"] = dense(sb.vertex_normals(s))
    extra["PM"] = dense((1 - S(.02, .35, protect)) * S(.09, .17, co[:, 2]))
    if not female:
        return
    P = sb.P
    # Forearm support above muscle 2 (linear in gain = (muscle − 2) / 2).
    fa = np.zeros_like(co)
    for side in ("Left", "Right"):
        n = P + side + "ForeArm"
        h, t = [np.array(s["rest"][n][k]) for k in ("head", "tail")]
        axis = t - h
        u = (co - h) @ axis / (axis @ axis)
        radial = co - (h + np.clip(u, 0, 1)[:, None] * axis)
        taper = S(.08, .25, u) * (1 - S(.68, .94, u))
        fa += radial * (.055 * taper * W[:, names.index(n)])[:, None]
    F["FA"] = fa
    G["FA"] = np.zeros((nband, 3))
    # muscle_refine_limb_fields: masks in Left/Right × (Arm, ForeArm, UpLeg) order.
    fields = sb.muscle_refine_limb_fields(s, {}, m)
    expect = [(P + side + short, amount) for side in ("Left", "Right") for short, amount in LIMBS]
    if [(n, a) for n, a, _ in fields] != expect:
        raise SystemExit("muscle_refine_limb_fields changed: " + repr([(n, a) for n, a, _ in fields]))
    extra["MR"] = dense(np.column_stack([mask for _, _, mask in fields]))
    pin = protect > .02
    extra["PIN"] = (np.nonzero(pin)[0], np.ones((len(co), 1)))  # values indexed by vertex, like MB/RB
    own = [W[:, names.index(P + side + "Arm")] + W[:, names.index(P + side + "ForeArm")] for side in ("Left", "Right")]
    extra["EO"] = dense(np.column_stack([S(.2, .8, o) for o in own]))
    extra["PV"] = dense(sb.pelvis_refine_mask(s))


def constants(sb):
    s = sb.source()
    out = {}
    if sb.VERSION in FEMALE_RULES:
        bones = {}
        for side in ("Left", "Right"):
            for short in ("Arm", "ForeArm", "UpLeg"):
                n = sb.P + side + short
                for k in ("head", "tail"):
                    for i, v in enumerate(s["rest"][n][k]):
                        bones["%s%s.%s%d" % (side, short, k[0], i)] = float(v)
        out["bones"] = bones
    return out


# ------------------------------------------------------------------ reference evaluation
def fold(sb, s, base, body, female, **kw):
    if female:
        kw.pop("normal_reference", None)
    return sb.fold_guard(s, base, body, **kw)


def anatomy_layer(sb, m, s, c, out, weights, reference, AD, FA):
    S = sb.smooth
    female = sb.VERSION in FEMALE_RULES
    co = s["co"]
    offset = np.zeros_like(co)
    for name, w in weights.items():
        if abs(w) > 1e-12 and name in AD:
            offset += w * AD[name]
    if female and c["muscle"] > 2:
        offset += (c["muscle"] - 2) / 2 * FA
    if np.max(abs(offset)) < 1e-12:
        return out
    delta = sb.warp(co + offset, c, m) - sb.warp(co, c, m)
    norm = np.linalg.norm(delta, axis=1)
    delta *= np.minimum(1, .012 / np.maximum(norm, 1e-15))[:, None]
    cand = fold(sb, s, out, out + delta, female, max_iterations=30, max_rings=6, normal_reference=reference)
    fat = max(0., c["physique"]) + .4 * c.get("fat_gain", 0.)
    if fat > .6:
        disp = cand - reference
        sm = sb.laplacian_smooth(s, disp, 8)
        vn = sb.vertex_normals(s)
        den = float(np.einsum("ij,ij->", sm, vn))
        num = float(np.einsum("ij,ij->", disp, vn))
        if abs(den) > 1e-8 and num * den > 0:
            sm *= np.clip(num / den, .95, 1.05)
        protect = s["W"][:, [i for i, n in enumerate(s["names"]) if any(k in n for k in PROTECT)]].sum(1)
        mask = (1 - S(.02, .35, protect)) * S(.09, .17, co[:, 2])
        amount = .42 * float(S(.6, 1.7, fat))
        ext = (sm - disp) * (amount * mask)[:, None]
        n = np.linalg.norm(ext, axis=1)
        ext *= np.minimum(1, .003 / np.maximum(n, 1e-15))[:, None]
        cand = fold(sb, s, cand, cand + ext, female, max_iterations=30, max_rings=6, normal_reference=reference)
    if female:
        cand = sb.fold_guard(s, reference, cand, max_iterations=30, max_rings=6)
    return cand


def evaluate(sb, m, baked, c, rest_body):
    """The app's computation, in numpy, on the baked data (+ the controller's warp/fold_guard)."""
    s = sb.source()
    co = baked["co"]
    F, extra = baked["F"], baked["extra"]
    AD = {k[3:]: v for k, v in F.items() if k.startswith("AD:")}
    female = sb.VERSION in FEMALE_RULES

    def anatomy(c):
        reference = sb.warp(co, c, m)
        weights = sb.mappings(c)
        if female:
            body = co + sum(w * F["D:" + k] for k, w in weights.items() if w)
            out = sb.fold_guard(s, reference, sb.warp(body, c, m), max_iterations=20, max_rings=3)
        else:
            bulk = c.get("muscle_bulk", 0.) > 0
            guard = anatomy({**c, "muscle_bulk": 0.})[0] if bulk else reference
            out = sb.fold_guard(s, guard, sb.warp(rest_body(c), c, m), max_rings=6, normal_reference=reference)
            if bulk:
                idx, rb = extra["RB"]
                out[idx, 1:] += (out[idx, 1:] - guard[idx, 1:]) * rb[idx]
                out = sb.fold_guard(s, guard, out, max_rings=6, normal_reference=reference)
        return anatomy_layer(sb, m, s, c, out, weights, reference, AD, F.get("FA")), reference

    out, reference = anatomy(c)
    if not female:
        return out
    S = sb.smooth
    h175 = c["height_cm"] / 175
    pin = np.zeros(len(co), bool)
    pin[extra["PIN"][0]] = True
    if c["muscle"] > 2. + 1e-10:
        high = out
        low = anatomy({**c, "muscle": 2.})[0]
        added = high - low
        smooth_added = sb.laplacian_smooth(s, added, 28)
        move = np.zeros_like(high)
        support = np.zeros(len(high))
        masks = extra["MR"][1]
        k = 0
        for side in ("Left", "Right"):
            for short, amount in LIMBS:
                n = sb.P + side + short
                ht = np.array([s["rest"][n]["head"], s["rest"][n]["tail"]])
                ends = sb.warp(ht, c, m)
                axis = ends[1] - ends[0]
                axis /= max(np.linalg.norm(axis), 1e-12)
                radial = added - (added @ axis)[:, None] * axis
                sradial = smooth_added - (smooth_added @ axis)[:, None] * axis
                corr = -amount * radial + .65 * (1 - amount) * (sradial - radial)
                move += corr * masks[:, k:k + 1]
                support += masks[:, k]
                k += 1
        move /= np.maximum(support, 1)[:, None]
        move[pin] = 0
        size = np.linalg.norm(move, axis=1)
        move *= np.minimum(1, .022 * h175 / np.maximum(size, 1e-12))[:, None]
        cand = high + move
        gain = (c["muscle"] - 2.) / 2.
        elbow = np.zeros(len(high))
        eo = extra["EO"][1]
        for j, side in enumerate(("Left", "Right")):
            center = sb.warp([s["rest"][sb.P + side + "ForeArm"]["head"]], c, m)[0]
            elbow = np.maximum(elbow, np.exp(-(np.linalg.norm(reference - center, axis=1) / (.075 * h175)) ** 4) * eo[:, j])
        sleeve = (sb.laplacian_smooth(s, cand, 16) - cand) * (.50 * gain * elbow)[:, None]
        sleeve[pin] = 0
        size = np.linalg.norm(sleeve, axis=1)
        sleeve *= np.minimum(1, .003 * h175 / np.maximum(size, 1e-12))[:, None]
        out = sb.fold_guard(s, reference, cand + sleeve, max_iterations=30, max_rings=6)
    act = float(S(1.25, 2., c["muscle"]))
    if act >= 1e-12:
        gain = float(np.clip((c["muscle"] - 2) / 2, 0, 1))
        amount = (.004 + .008 * gain) * act * h175
        shift = np.zeros_like(out)
        shift[:, 0] = -np.sign(co[:, 0]) * amount * extra["PV"][1][:, 0]
        out = sb.fold_guard(s, reference, out + shift, max_iterations=30, max_rings=6)
    return out
