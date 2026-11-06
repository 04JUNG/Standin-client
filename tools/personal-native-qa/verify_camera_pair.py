"""Independent FBX reimport audit of an app-saved source/yaw35 pair.
Reports scalar errors only; no raw model data is written. Geometry quality and CSP
acceptance are outside this audit. Run with Blender --background --python ... --.
"""
import hashlib, json, sys
from pathlib import Path
import bpy
from mathutils import Matrix

def inspect(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(path))
    bpy.context.view_layer.update()
    arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    if len(arms)!=1: raise ValueError('Expected exactly one armature')
    hips=[b for b in arms[0].pose.bones if 'hips' in b.name.lower()]
    if len(hips)!=1: raise ValueError('Ambiguous hips pivot')
    pivot=arms[0].matrix_world @ hips[0].head
    points={}
    deps=bpy.context.evaluated_depsgraph_get()
    for obj in sorted(bpy.context.scene.objects,key=lambda o:o.name):
        if obj.type!='MESH': continue
        evaluated=obj.evaluated_get(deps)
        mesh=evaluated.to_mesh()
        try: points[obj.name]=[evaluated.matrix_world @ v.co for v in mesh.vertices]
        finally: evaluated.to_mesh_clear()
    return points,pivot

args=sys.argv[sys.argv.index('--')+1:]
a,b,out=map(Path,args)
left,pivot=inspect(a)
right,right_pivot=inspect(b)
if set(left)!=set(right) or any(len(left[k])!=len(right[k]) for k in left): raise ValueError('Changed topology')
basis=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
rotation=basis @ Matrix(((0.8191520442889918,0,0.573576436351046),(0,1,0),(-0.573576436351046,0,0.8191520442889918))) @ basis.transposed()
error=max((pivot+rotation@(p-pivot)-q).length for key in left for p,q in zip(left[key],right[key]))
result={'sourceSha256':hashlib.sha256(a.read_bytes()).hexdigest(),'yaw35Sha256':hashlib.sha256(b.read_bytes()).hexdigest(),'meshCount':len(left),'vertices':sum(map(len,left.values())),'maxRequestedRigidRotationErrorM':error,'hipsPivotErrorM':(pivot-right_pivot).length,'thresholdM':0.00002,'pass':error<0.00002 and (pivot-right_pivot).length<0.00002,'scope':'independent reimport camera rigid rotation; not deformation quality or CSP acceptance'}
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
if not result['pass']: raise SystemExit(1)
