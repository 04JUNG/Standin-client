# Personal model local HTTP → native app QA

`fixture.py` is a loopback-only, in-memory ownership fixture for the ordinary product app. It serves a pre-authorized, SHA-pinned recorded final BVH and a two-candidate result (source orientation / yaw35). It refuses inference and private model HTTP inputs. Installation credentials are generated per run in a private local file. Model import, apply and disk save use the real Tauri commands; no native command is replaced.

Run with `--bvh /private/authorized/recorded.bvh --sha256 <exact-sha> --work /private/new-qa-folder`. The folder must be new. Build an isolated debug app with the normal pinned v10 wrapper, `VITE_USE_MOCK_API=false`, `VITE_USE_MOCK_POSE_API=false`, `VITE_INTERACTIVE_POSE_PREVIEW=true`, and `VITE_API_BASE_URL=http://localhost:8000`. Disable updater endpoints only in its separate QA overlay. Leave product defaults unchanged.

Register only previously permitted local FBX/CS3C in **체형 커스텀 → 내 데포르메**, use **작업 기록** to open the clearly recorded fixture result, select a personal card, confirm the applied model in review, and save into a new QA folder. Source/camera changes must revoke old readiness. App↔bar uses normal product routes. Hash source, BVH, runtime, app binary and exact saved files separately.

This checks local real HTTP delivery and native model/save integration. The fixture does **not** validate production authentication, live analysis/refine, Hono/SQL/S3, geometry quality, CSP or another OS. The log records route names, ownership booleans and final-BVH hashes; it omits credentials, personal names/IDs, model contents and request bodies. Raw model/decoder/build/output files must never be committed.

For the same isolated app registration after a fixture restart, `--reuse-credentials` reuses only that run’s existing generated credential file. It is never a production identity. The fixture advertises `selectionPreview` so the latest persistent large pane can be checked with the actual local library.

`verify_camera_pair.py` independently reimports app-saved identity/yaw35 FBXs, checks matching topology and the rigid transform about Hips, and writes only scalar errors/hashes. It does not certify deformation or CSP.
