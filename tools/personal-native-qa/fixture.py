#!/usr/bin/env python3
"""Loopback-only, in-memory ownership fixture. No inference, production BFF, SQL or cloud.
The only private input is a pre-authorized recorded final BVH; it is served only to its
fixture installation. Personal model bytes/paths are never accepted by HTTP.
"""
import argparse, base64, hashlib, json, secrets, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bvh', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    pose = args.bvh.read_bytes()
    digest = hashlib.sha256(pose).hexdigest()
    if digest != args.sha256 or not pose.lstrip().startswith(b'HIERARCHY'):
        raise SystemExit('Recorded BVH hash/format mismatch')
    args.work.mkdir(parents=True, exist_ok=True)
    owner, token = 'local-qa-' + secrets.token_hex(8), secrets.token_urlsafe(32)
    config = args.work / 'fixture-private.json'
    config.touch(mode=0o600, exist_ok=False)
    config.write_text(json.dumps({'owner': owner, 'token': token}))
    job = 'job_personal_connection_v10_local_fixture'
    selected = 'recorded-source'
    rotation = [[0.8191520442889918, 0, 0.573576436351046], [0, 1, 0], [-0.573576436351046, 0, 0.8191520442889918]]
    quality = {'version': '2026-10-19', 'personalData': False, 'contentLicense': False, 'consentId': None, 'grantedAt': None}
    prefs = {'version': 'body-preferences.v1', 'scope': 'installation', 'mode': 'last_used', 'cards': [], 'lastUsed': None, 'shapeEditable': [], 'revision': 0}
    body = {'schemaVersion': 'body-selection.v1', 'personIndex': 0, 'intent': 'inherit', 'manualCharacterId': None, 'recommendation': {'status': 'disabled', 'body': None, 'reasonCodes': ['local_fixture']}, 'resolvedBody': None, 'resolvedSource': None, 'resolutionStatus': 'needs_selection', 'selectionRevision': 0}
    log_lock = threading.Lock()
    now = '2026-11-06T06:00:00Z'
    def record(**fields):
        with log_lock, (args.work/'requests.jsonl').open('a') as out:
            out.write(json.dumps({'time': time.time(), **fields})+'\n')
    def candidate(id, rank, camera):
        return {'id': id, 'poseId': 'recorded-pose', 'rank': rank, 'view': 'front', 'tags': ['recorded-local-fixture'], 'matchLevel': 'similar', 'source': 'library', 'sourceBvhSha256': digest, 'lookupAllowed': True, 'releaseAllowed': True, 'refineAllowed': False, 'bvhAvailable': True, 'camera': {'version': 'candidate-camera-v2', 'rotation': camera, 'source_bvh_sha256': digest}}
    result = {'jobId': job, 'notes': ['LOCAL FIXTURE: authorized recorded BVH; no live analysis or production authentication'], 'capabilities': {'fbxExport': True, 'bodyPreviews': True, 'refine': False, 'handSelection': False, 'sceneExport': False, 'characterSelection': False, 'outputScopeCropping': True, 'interactivePreview': {'schemaVersion': 'interactive-preview-capability-v1', 'top5': True, 'operations': True}}, 'candidatesByPerson': [{'personIndex': 0, 'box': None, 'tags': {}, 'confidence': 'high', 'skeletonState': 'valid', 'skeletonSource': 'full_image', 'coverageClass': 'full', 'fallbackMode': 'none', 'refineAllowed': False, 'candidates': [candidate('recorded-source', 1, [[1,0,0],[0,1,0],[0,0,1]]), candidate('recorded-yaw35', 2, rotation)]}]}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def send(self, code, value, mime='application/json'):
            data = value if isinstance(value, bytes) else json.dumps(value).encode()
            self.send_response(code)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type,X-Installation-Id,X-Device-Token,X-App-Version')
            self.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
            self.end_headers()
            self.wfile.write(data)
        def do_OPTIONS(self): self.send(200, {})
        def do_GET(self): self.handle_request()
        def do_POST(self): self.handle_request()
        def do_PUT(self): self.handle_request()
        def handle_request(self):
            nonlocal selected
            parsed = urlparse(self.path)
            path, q = parsed.path, parse_qs(parsed.query)
            raw = self.rfile.read(min(int(self.headers.get('Content-Length', 0)), 65537))
            private_leak = any(term in raw.lower() for term in [b'localmodelid', b'sourcepath', b'contentbase64', b'cs3c', b'decoder'])
            owned = self.headers.get('X-Installation-Id') == owner and secrets.compare_digest(self.headers.get('X-Device-Token', ''), token)
            record(method=self.command, path=path, queryKeys=sorted(q), owned=owned, privateLeak=private_leak, bodyBytes=len(raw))
            if private_leak or len(raw)>65536: return self.send(400, {'error': {'code': 'PRIVATE_INPUT_REJECTED'}})
            if self.command=='POST' and path=='/v1/installations':
                return self.send(200, {'installationId': owner, 'deviceToken': token, 'qualityConsent': quality})
            if not owned: return self.send(403, {'error': {'code': 'FORBIDDEN'}})
            if path=='/v1/installations/current/quality-consent': return self.send(200, quality)
            if path=='/v1/installations/current/body-preferences': return self.send(200, prefs)
            if path=='/v1/models': return self.send(200, {'characters': [], 'defaultCharacterId': ''})
            if path=='/v1/events/capabilities': return self.send(200, {'journeyVersion': 0, 'featureUsageVersion': 0})
            if path=='/v1/semantic-search/capabilities': return self.send(200, {'available': False})
            if path=='/v1/analysis/jobs':
                if self.command!='GET': return self.send(403, {'error': {'code': 'INFERENCE_DISABLED'}})
                return self.send(200, {'items': [{'jobId': job, 'status': 'completed', 'createdAt': now, 'completedAt': now, 'errorCode': None, 'source': 'file', 'personCount': 1, 'selectionCount': 1, 'hasSelection': True, 'thumbnailUrl': None, 'inputAvailable': False}], 'nextCursor': None})
            if path==f'/v1/analysis/jobs/{job}': return self.send(200, {'jobId': job, 'status': 'completed', 'createdAt': now, 'updatedAt': now, 'error': None})
            if path==f'/v1/analysis/jobs/{job}/result': return self.send(200, result)
            if path==f'/v1/analysis/jobs/{job}/selections':
                if self.command=='POST':
                    data=json.loads(raw or '{}')
                    for item in data.get('selections', []):
                        if item.get('personIndex')==0 and item.get('candidateId') in ['recorded-source','recorded-yaw35']: selected=item['candidateId']
                return self.send(200, {'selections': [{'personIndex': 0, 'candidateId': selected, 'rank': 1, 'confirmedAt': now}]})
            if path==f'/v1/analysis/jobs/{job}/people/0/body-selection': return self.send(200, body)
            if path==f'/v1/analysis/jobs/{job}/people/0/body-options': return self.send(200, {'catalogRevision':'fixture-0', 'characters': []})
            if path=='/v1/pose-candidates/recorded-pose/export':
                if q != {'jobId':[job], 'personIndex':['0'], 'candidateId':[selected], 'format':['bvh']}:
                    return self.send(409, {'error': {'code':'INVALID_SELECTION'}})
                record(event='final-bvh', selected=selected, sha256=digest, bytes=len(pose))
                return self.send(200, pose, 'application/octet-stream')
            return self.send(404, {'error': {'code':'LOCAL_FIXTURE_ROUTE_UNAVAILABLE'}})
    (args.work/'fixture-provenance.json').write_text(json.dumps({'kind':'loopback minimal HTTP fixture, not production BFF/Hono/SQL', 'recordedBvh':str(args.bvh),'bvhSha256':digest,'jobId':job,'cameraYaw35':rotation,'inferenceEnabled':False,'privateModelUploadEnabled':False}, indent=2)+'\n')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Loopback fixture ready: localhost:{args.port}; no inference or production auth', flush=True)
    server.serve_forever()
if __name__=='__main__': main()
