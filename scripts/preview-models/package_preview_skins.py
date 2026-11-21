"""Pin preview-only UVs and newly authored textures to their exact bundled models."""
import argparse, gzip, hashlib, json, shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--client-root',type=Path,required=True);a=p.parse_args()
root=a.client_root/'src/features/pose-viewer/preview/humanReference/approvedAssets';manifest=json.loads((root/'manifest.json').read_text());pins={};sha=lambda b:hashlib.sha256(b).hexdigest()
for gender in ['male','female']:
 path=root/f'{gender}.json.gz';raw=gzip.decompress(path.read_bytes());data=json.loads(raw);uv=json.loads((a.assets/f'{gender}-uv.json').read_text());assert uv['templateSha256']==sha(raw)
 mesh=data['template']['meshes'][0];assert len(uv['uv'])==len(mesh['triangles'])*2
 mesh['uv']=uv['uv'];data['skin']['baseSha']=sha(json.dumps(data['template'],separators=(',',':')).encode())
 raw=json.dumps(data,separators=(',',':')).encode();packed=gzip.compress(raw,mtime=0);path.write_bytes(packed)
 manifest[gender].update(jsonSha256=sha(raw),gzipSha256=sha(packed),jsonBytes=len(raw),gzipBytes=len(packed))
 pins[gender]={}
 for skin in ['gray-guide','flesh','flesh-guide','muscle','flesh-muscle']:
  src=a.assets/f'{gender}-{skin}.png';dst=root/src.name;shutil.copyfile(src,dst);b=dst.read_bytes();pins[gender][skin]={'bytes':len(b),'sha256':sha(b)}
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(root/'skinTextures.json').write_text(json.dumps(pins,indent=2)+'\n')
