"""Generate the two interactive hand skin overlays from the approved FBX.

Run pinned Blender in background with --python-exit-code 1 --python <this file>
-- <server checkout> <approved FBX> <pinned template directory> <output directory>.
The regular pose posters and their body templates remain unchanged.
"""
import gzip
import hashlib
import json
from pathlib import Path
import sys


def main():
    server, character, templates, out = map(Path, sys.argv[sys.argv.index("--") + 1:])
    sys.path.insert(0, str(server.resolve()))
    import bpy
    from converter import retarget as rt
    from converter.bone_map import PROFILES, resolve_profile
    from converter.framing import crop_meshes
    from converter.protocol import EXPECTED_BLENDER_BUILD_HASH
    from converter.reviewed_source_fingers import FINGERS, bone_names

    if bpy.app.build_hash.decode() != EXPECTED_BLENDER_BUILD_HASH:
        raise ValueError("unapproved Blender build")
    manifest = json.loads((server / "config/default_body_template.v1.json").read_text())
    if hashlib.sha256(character.read_bytes()).hexdigest() != manifest["character_sha256"]:
        raise ValueError("unapproved reference character")

    def vec(v):
        return [round(float(v.x), 6), round(float(v.z), 6), round(float(-v.y), 6)]

    out.mkdir(parents=True, exist_ok=True)
    for scope in ("full", "half"):
        raw = gzip.decompress((templates / (scope + ".json.gz")).read_bytes())
        sha = hashlib.sha256(raw).hexdigest()
        if sha != manifest["scopes"][scope]["json_sha256"]:
            raise ValueError("unapproved base template")
        base = json.loads(raw)
        rt.reset_scene()
        arm, meshes = rt.import_character(str(character.resolve()))
        mapping = PROFILES[resolve_profile([b.name for b in arm.data.bones])]
        ids = {mapping[j["role"]]: i for i, j in enumerate(base["joints"])}
        joints = []
        for side in ("left", "right"):
            _, names = bone_names(arm.data.bones.keys(), side)
            for finger in FINGERS:
                for joint in range(1, 4):
                    bone = arm.data.bones[names[finger, joint]]
                    parent = bone.parent
                    while parent and parent.name not in ids:
                        parent = parent.parent
                    if not parent:
                        raise ValueError("finger has no mapped parent")
                    ids[bone.name] = len(base["joints"]) + len(joints)
                    joints.append({
                        "role": f"{finger}{joint}.{side[0].upper()}",
                        "parent": ids[parent.name],
                        "head": vec(arm.matrix_world @ bone.head_local),
                        "tail": vec(arm.matrix_world @ bone.tail_local),
                    })
        crop_meshes(arm, meshes, scope)
        geometry = [m for m in meshes if m.name in bpy.data.objects]
        if len(geometry) != len(base["meshes"]):
            raise ValueError("base mesh mismatch")
        overlays = []
        for mesh, original in zip(geometry, base["meshes"]):
            data = mesh.data
            data.calc_loop_triangles()
            if ([i for t in data.loop_triangles for i in t.vertices] != original["triangles"]
                or [c for v in data.vertices for c in vec(mesh.matrix_world @ v.co)] != original["positions"]):
                raise ValueError("base mesh order mismatch")
            groupmap = {}
            for group in mesh.vertex_groups:
                bone = arm.data.bones.get(group.name)
                while bone and bone.name not in ids:
                    bone = bone.parent
                if bone:
                    groupmap[group.index] = ids[bone.name]
            rows = []
            for v in data.vertices:
                weights = {}
                for g in v.groups:
                    if g.group in groupmap:
                        i = groupmap[g.group]
                        weights[i] = weights.get(i, 0) + g.weight
                if not any(i >= len(base["joints"]) and w > 0 for i, w in weights.items()):
                    continue
                top = sorted(weights.items(), key=lambda it: -it[1])[:8]
                kept = sum(w for _, w in top)
                if 1 - kept / sum(weights.values()) > 0.001:
                    raise ValueError("finger skin loses excessive weights")
                rows.append([v.index, [[i, round(w / kept, 7)] for i, w in top if w > 0]])
            overlays.append(rows)
        payload = {"baseSha": sha, "joints": joints, "weights": overlays}
        path = out / (scope + ".json.gz")
        path.write_bytes(gzip.compress(json.dumps(payload, separators=(",", ":")).encode(), mtime=0))
        print(scope, len(joints), sum(map(len, overlays)), path.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
