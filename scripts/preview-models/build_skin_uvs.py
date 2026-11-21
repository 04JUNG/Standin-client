"""Blender-only UVs on the exact bundled preview LOD; never resample or change geometry.
See scripts/preview-models/README.md for the authoring and packaging commands.
"""
import argparse, sys
import bpy, json, gzip, numpy as np
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--client-root',type=Path,required=True);parser.add_argument('--out',type=Path,required=True)
a=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);client=a.client_root;out=a.out;out.mkdir(parents=True,exist_ok=True)
for gender in ['male','female']:
 data=json.loads(gzip.decompress((client/f'src/features/pose-viewer/preview/humanReference/approvedAssets/{gender}.json.gz').read_bytes()));t=data['template'];m=t['meshes'][0]
 p=np.array(m['positions']).reshape(-1,3);p=p[:,[0,2,1]];p[:,1]*=-1;tris=np.array(m['triangles']).reshape(-1,3)
 bpy.ops.wm.read_factory_settings(use_empty=True);mesh=bpy.data.meshes.new('Preview');mesh.from_pydata(p.tolist(),[],tris.tolist());mesh.update();o=bpy.data.objects.new('Preview',mesh);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.004);bpy.ops.object.mode_set(mode='OBJECT');uv=np.array([[list(mesh.uv_layers.active.data[i].uv) for i in poly.loop_indices] for poly in mesh.polygons]);assert len(mesh.polygons)==len(tris)
 np.savez_compressed(out/f'{gender}-surface.npz',positions=p,triangles=tris,uv=uv)
 source={'characterId':t['character_id'],'bone_heads':{t['profiles']['mixamo'][j['role']]:[j['head'][0],-j['head'][2],j['head'][1]] for j in t['joints']}}
 (out/f'{gender}-source.json').write_text(json.dumps(source));(out/f'{gender}-uv.json').write_text(json.dumps({'templateSha256':__import__('hashlib').sha256(gzip.decompress((client/f'src/features/pose-viewer/preview/humanReference/approvedAssets/{gender}.json.gz').read_bytes())).hexdigest(),'uv':np.round(uv.reshape(-1),7).tolist()},separators=(',',':')))
 print('PREVIEW_UV',gender,len(tris),flush=True)
