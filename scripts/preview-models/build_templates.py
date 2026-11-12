"""Bake approved neutral models for the existing local reference skinner.

Blender --background --python build_templates.py -- --authoring-root PATH
  --reference-template PATH --out PATH
No model files are modified. Rig weights and finger chains come from the same
approved authoring meshes as FBX export; the existing 56k preview LOD is reused.
"""
import argparse, ast, base64, gzip, hashlib, json, pathlib, re, sys, zlib
import bpy
import numpy as np
from mathutils import Matrix

args=argparse.ArgumentParser()
args.add_argument('--authoring-root',type=pathlib.Path,required=True)
args.add_argument('--reference-template',type=pathlib.Path,required=True)
args.add_argument('--out',type=pathlib.Path,required=True)
a=args.parse_args(sys.argv[sys.argv.index('--')+1:])
reference=json.loads(a.reference_template.read_text())
profiles=reference['profiles']
mapping=profiles['mixamo']
roles=list(mapping)
digits=['thumb','index','middle','ring','pinky']
a.out.mkdir(parents=True,exist_ok=True)
manifest={}

def xyz(v): return [round(float(v[0]),7),round(float(v[2]),7),round(float(-v[1]),7)]
def digest(data): return hashlib.sha256(data).hexdigest()

def expression(text):
    """Compile pinned Blender arithmetic to a small data tree, never JS eval."""
    def visit(n):
        if isinstance(n,ast.Constant) and isinstance(n.value,(int,float)): return n.value
        if isinstance(n,ast.Name): return n.id
        if isinstance(n,ast.UnaryOp) and isinstance(n.op,ast.USub): return ['neg',visit(n.operand)]
        if isinstance(n,ast.BinOp):
            op={ast.Add:'+',ast.Sub:'-',ast.Mult:'*',ast.Div:'/',ast.Pow:'pow'}.get(type(n.op))
            if op:return [op,visit(n.left),visit(n.right)]
        if isinstance(n,ast.Compare) and len(n.ops)==1 and isinstance(n.ops[0],ast.GtE):return ['gte',visit(n.left),visit(n.comparators[0])]
        if isinstance(n,ast.IfExp):return ['if',visit(n.test),visit(n.body),visit(n.orelse)]
        if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in ('min','max','abs','sin','cos','asin','atan2'):
            return [n.func.id,*[visit(x) for x in n.args]]
        raise ValueError('unsupported corrective expression: '+text)
    return visit(ast.parse(text,mode='eval').body)

for gender,character in [('female','female-base-v0-4-0'),('male','male-base-v0-8-0')]:
    directory=a.authoring_root/gender
    build=json.loads((directory/'build.json').read_text())
    blend=directory/'model.blend'
    if digest(blend.read_bytes()) != build['blend_sha256']:
        raise ValueError('authoring source changed: '+gender)
    bpy.ops.wm.open_mainfile(filepath=str(blend),load_ui=False,use_scripts=False)
    arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    mesh=next(o for o in bpy.context.scene.objects if o.get('standin_preview_lod'))
    dense=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
    name_to_index={name:i for i,name in enumerate(mapping.values())}
    joints=[]
    for role in roles:
        bone=arm.data.bones[mapping[role]]
        parent=bone.parent
        while parent and parent.name not in name_to_index: parent=parent.parent
        joints.append(dict(role=role,parent=name_to_index[parent.name] if parent else -1,
            head=xyz(arm.matrix_world@bone.head_local),tail=xyz(arm.matrix_world@bone.tail_local)))
    fingers=[]
    for side,label in [('L','Left'),('R','Right')]:
        for digit in digits:
            for segment in range(1,4):
                name=f'mixamorig:{label}Hand{digit.title()}{segment}'
                bone=arm.data.bones[name]
                index=len(joints)+len(fingers)
                name_to_index[name]=index
                fingers.append(dict(role=f'{digit}{segment}.{side}',parent=name_to_index[bone.parent.name],
                    head=xyz(arm.matrix_world@bone.head_local),tail=xyz(arm.matrix_world@bone.tail_local)))
    vertices=len(mesh.data.vertices)
    positions=np.array([xyz(mesh.matrix_world@v.co) for v in mesh.data.vertices])
    normals=[n for v in mesh.data.vertices for n in xyz(v.normal)]
    mesh.data.calc_loop_triangles()
    faces=[int(i) for t in mesh.data.loop_triangles for i in t.vertices]
    group={g.index:g.name for g in mesh.vertex_groups}
    base_ids=[]; base_weights=[]; finger_weights=[]
    for vertex in mesh.data.vertices:
        weights={}
        for assignment in vertex.groups:
            name=group[assignment.group]
            if name not in name_to_index: continue
            i=name_to_index[name]
            weights[i]=weights.get(i,0)+assignment.weight
        pairs=sorted(weights.items(),key=lambda p:-p[1])[:8]
        total=sum(w for _,w in pairs)
        if total <= 0: raise ValueError('unweighted vertex')
        pairs=[(i,round(w/total,7)) for i,w in pairs]
        if any(i>=len(joints) for i,w in pairs):
            finger_weights.append([vertex.index,pairs])
        collapsed={}
        for i,w in pairs:
            while i>=len(joints): i=fingers[i-len(joints)]['parent']
            collapsed[i]=collapsed.get(i,0)+w
        base=list(collapsed.items())
        base_ids.extend([i for i,w in base]+[0]*(8-len(base)))
        base_weights.extend([round(min(1.0,w),7) for i,w in base]+[0]*(8-len(base)))
    template=dict(version='default-body-template-v1',scope='full',character_id=character,
        character_sha256=build['source_fbx_sha256'],pose_method='reference-skinning-v1',
        preview_only=True,coordinates='Y-up',influences=8,joints=joints,profiles=profiles,
        meshes=[dict(positions=positions.reshape(-1).tolist(),normals=normals,
            skinIndices=base_ids,skinWeights=base_weights,triangles=faces)])
    base_digest=digest(json.dumps(template,separators=(',',':')).encode())
    coord=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
    def quat(b):
        q=(coord@arm.matrix_world@b.matrix_local).to_quaternion()
        return [q.x,q.y,q.z,q.w]
    def variables(fc):
        out={}
        for v in fc.driver.variables:
            t=v.targets[0]
            if v.type=='TRANSFORMS':out[v.name]=['q',name_to_index[t.bone_target],['ROT_X','ROT_Y','ROT_Z','ROT_W'].index(t.transform_type)]
            else:
                match=re.fullmatch(r'pose.bones\["(.+)"\].rotation_quaternion\[(\d)\]',t.data_path)
                if match:out[v.name]=['q',name_to_index[match[1]],(int(match[2])+3)%4]
                else:out[v.name]=['property',json.loads(t.data_path)[0]]
        return out
    drivers=[];lifts=[]
    for fc in arm.animation_data.drivers:
        match=re.fullmatch(r'pose.bones\["(.+)"\].(rotation_quaternion|location)',fc.data_path)
        rule=dict(expression=expression(fc.driver.expression),variables=variables(fc))
        if not match: rule['target']=['property',json.loads(fc.data_path)[0]]
        elif match[2]=='rotation_quaternion':rule['target']=['q',name_to_index[match[1]],(fc.array_index+3)%4]
        else:
            side='Left' if 'Left' in match[1] else 'Right'
            helper=arm.data.bones[match[1]]
            vec=(coord@arm.matrix_world@helper.matrix_local).to_3x3().col[fc.array_index]
            lifts.append(dict(joint=name_to_index['mixamorig:'+side+'Arm'],direction=list(vec),**rule));continue
        drivers.append(rule)
    raw_projection=zlib.decompress(base64.b64decode(mesh['projection']))
    projection_ids=np.frombuffer(raw_projection[:vertices*12],dtype='<i4').reshape(vertices,3)
    projection_w=np.frombuffer(raw_projection[vertices*12:],dtype='<f4').reshape(vertices,3)
    def coords(data):
        p=np.empty(len(data)*3);data.foreach_get('co',p);return p.reshape(-1,3)
    basis=coords(dense.data.shape_keys.key_blocks['Basis'].data)
    shapes=[]
    for fc in dense.data.shape_keys.animation_data.drivers:
        name=re.fullmatch(r'key_blocks\["(.+)"\].value',fc.data_path)[1]
        if not name.startswith('PSD_'):continue
        delta=coords(dense.data.shape_keys.key_blocks[name].data)-basis
        projected=np.einsum('ni,nij->nj',projection_w,delta[projection_ids])
        ids=np.flatnonzero(np.linalg.norm(projected,axis=1)>1e-7)
        shapes.append(dict(name=name,expression=expression(fc.driver.expression),variables=variables(fc),
            offsets=[[int(i),*xyz(projected[i])] for i in ids]))
    corrections=dict(restRotations=[quat(arm.data.bones[mapping[r]]) for r in roles],drivers=drivers,lifts=lifts,shapes=shapes)
    payload=dict(template=template,skin=dict(baseSha=base_digest,joints=fingers,weights=[finger_weights]),corrections=corrections)
    raw=json.dumps(payload,separators=(',',':')).encode()
    packed=gzip.compress(raw,compresslevel=9,mtime=0)
    (a.out/f'{gender}.json.gz').write_bytes(packed)
    manifest[gender]=dict(characterId=character,characterSha256=build['source_fbx_sha256'],
        blendSha256=build['blend_sha256'],jsonSha256=digest(raw),gzipSha256=digest(packed),
        gzipBytes=len(packed),jsonBytes=len(raw),vertices=vertices,triangles=len(faces)//3,
        bodyJoints=len(joints),fingerJoints=len(fingers),fingerVertices=len(finger_weights))
    print('APPROVED_PREVIEW',gender,json.dumps(manifest[gender]),flush=True)
(a.out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
