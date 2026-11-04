# Interactive pose preview client — inactive draft

Date: 2026-11-04 KST. Base develop: `5fe483e936e2a2ac22e9df9242a5a193504e4241`.
This PR is an implementation foundation and UI review sample. The complete design is **not complete**, and this is **not rollout/UI approval**.

## Implemented boundaries

- `VITE_INTERACTIVE_POSE_PREVIEW` defaults to false. A versioned server capability is also required. No BFF flag, installation consent, model registry or skin/outline/personal-body settings are enabled.
- Capture/upload Top-5 opts into `interactive-preview-v1` only when negotiated. Missing/invalid assets show a retryable unavailable state; no implicit poster/front-camera fallback and no converter/PNG request. Semantic result lists and history/dashboard lists remain static. Existing rough, hand and body reference cards remain.
- A shared event-driven WebGL renderer draws visible viewports with scissor rectangles. No per-card WebGL context or continuous render loop. Resize/scroll/input/state changes schedule a coalesced draw. Modal and card share observation state; main/bar reuse the same component. Exact projection/view matrices include search crop/center/scale; no yaw rounding or mesh-fit reconstruction. Baked semantics and row/column layout are explicit.
- Visible assets enter a two-download/one-parse queue, starting with DOM-ranked Top-1. Static bytes are bounded and SHA256 checked before the unchanged `posed-mesh-v1` validator; source/character/revision/scope are required. Immutable geometry/material cache is bounded (8 entries / 24 MiB); instance observation is separate. Context loss has retry UI and teardown releases renderer/GPU resources. Packet loading also uses bounded queues. Decode currently runs on the main thread; worker decode and real low-end budgets remain unverified.
- Drag rotates without selecting. Selection has an explicit button. Cards leave the vertical wheel for page scroll. Expanded view supports rotation, zoom, shift/right-drag pan, reset to the search view, keyboard arrows/R/+/- and Escape/focus trapping. Touch on small cards retains page pan; keyboard/expanded controls provide rotation. Observation never changes an operation, pose, save direction or FBX revision.
- New interactive rig validation is separate from the unchanged static GLB validator. It bounds row-major rest/pose/inverse-bind matrices, parents, all weights, topology and split normal indices. Full-influence surface evaluation preserves split normals and does not approximate a hand solver.
- The exact Converter shared hand-table consumer is vendored byte-for-byte with provenance. Loaded, exact, precompiled combinations can be selected synchronously; HTTP preparation alone is debounced 250 ms. Unavailable combinations keep the authoritative pose. No approved real atlas/transport has been published, so local-hands capability is not activated for any rig/shape/personal FBX/CS3C.
- One session controller per installation/job/person survives app↔bar remounts, immediately revokes old-ready, serializes creates, uses mutation idempotency, recovers durable head revisions, polls at 1 s, rejects late state/sequence/hash responses and attempts cancellation. Preview/model failure is independent of a current verified file. Current file bytes are checked against operation receipt, headers, length and SHA256, with a second latest-selection check before native writes. No background preparation calls native save or export-completed.
- Refining retains the previous doll on the negotiated path. Server computation is retained; no VLM call, client inference, safety gate or authoritative-coordinate invention is added. Packet arrival can replace the display while file work continues. The frozen solver's intermediate FBX dependency remains server-side.
- Representative capture is canvas-only, asynchronous, one confirmed representative per state; observation/camera/renderer/image hashes accompany the BFF `client-frame` upload. Draft/stale/clipped/hidden-modal frames are refused. Failure never changes download readiness. The server treats this as auxiliary UI provenance; authoritative history is archived independently. Rough/app/OS capture is not added. The full camera-frame bridge remains absent, so actual production capture has not been exercised.

## Contract pins and deliberate gaps

- Converter implementation: `04JUNG/Standin-server@3fa41e71fc51b4aa696a2855c858dc5a73d36265`; draft `solved-pose-state-v1`, `interactive-pose-model-v1`, `interactive-hand-variants-v1`, `interactive-fbx-receipt-v1`. Shared JS SHA256 is recorded in `interactive/shared/PROVENANCE.txt`. Floats are decoded from the original typed-f64be canonical bytes, whose SHA256 is checked rather than recomputed with JS number formatting.
- BFF: draft PR [153](https://github.com/04JUNG/Standin-app-server/pull/153), implementation `7dcfcfda16b7825b35122e0ddab2418b593154a0`, contract pin `cbb5dfa50d29ccbec7e5bf7db3b295719450bafe`. Prepare/head/poll/model/export/file/cancel/client-frame use its actual HTTP paths and compact export receipt. No SSE is claimed.
- Client Top-5 asset/capability/camera schema in `interactive/contract.ts` is a **proposal awaiting BFF asset coverage and exact search camera mapping**, not an endpoint the current BFF advertises. Static shape/camera binding is fail-closed. Converter packets require a versioned `target/referenceAspect/projectionIncludesCenterScaleCrop` frame bridge before rendering; no metadata is fabricated.
- Converter publishes only a local boundary, no HTTP worker adapter. Strict approved-asset split-normal correspondence currently fails. There is no actual approved hand atlas, verified full library/scope coverage or end-to-end real-file/client integration. The runtime must remain inactive.
- Camera display does not certify CSP camera transfer. No native Tauri/CSP, Windows or actual low-end GPU performance acceptance is claimed. Initial/intermediate FBX dependency is not removed by this client work.

## Validation and reproduction

`npm ci --ignore-scripts`, `npm run typecheck`, `npm run lint`, `npm run build`.
The host has Node 26.5.0. Its experimental localStorage conflicts with existing jsdom/Zustand tests; run the existing test suite with `NODE_OPTIONS=--no-experimental-webstorage npm test`. No application/test storage policy was changed to hide that environment issue.

The regular suite covers legacy posters/refine/review/save as well as exact camera coordinates (eight directions plus continuous yaw, ortho/perspective/crop), static model rejection, bounded queues, typed canonical packet identity/weights, debounce/latest-wins/late create, in-flight stale file rejection, idempotent uncertain POST retry, receipt/hash/header validation and stale/failed auxiliary capture. Generated fixtures are procedural triangles, not real FBX certification.

Opt-in cross-repo test uses the actual published BFF Hono routes, PGlite SQL operation store/queue and actual client HTTP adapter:

```sh
STANDIN_BFF_WORKTREE=/path/to/built/Standin-app-server \
NODE_OPTIONS=--no-experimental-webstorage npm test -- scripts/interactive-bff-wire.test.mjs
```

It exercises head → prepare → solve tick → authoritative packet → export tick → receipt → byte download → cancellation. The worker is controlled synthetic data; PGlite omits PostgreSQL advisory locks. This proves protocol wiring only, not production PostgreSQL/replica behavior, inference/Blender, real FBX or native save.

## Product sample and performance record

Run `npm run dev -- --host 127.0.0.1 --port 1436`, open `/samples/interactive.html`. It renders the actual latest `PoseViewerPage`, `BarCandidatesPage` and candidate/viewer components. The mannequin and rough are procedural fixtures. Sample fetches are isolated; no production/inference/telemetry/native storage call is made. The sample is not part of the production HTML entry/build.

Verified in desktop Chrome: all five models render; enlarged viewer layering; keyboard rotation and zoom; explicit selection after a drag leaves selection unchanged; app↔bar selection/observation retention. Final app/bar comparison captures were collected through browser-only control after native control was blocked by the Mac lock. One fixture resource snapshot showed 1 context / 5 views / 5 geometries / 0 textures and 1,727,940 cached asset bytes. Lock-delayed frame timings are excluded. A fresh isolated fixture batch measured effect→first render callback 85.5 ms / all-five callbacks 130.1 ms; warm app→bar measured 24.9 / 25.9 ms with all five cache hits and no fetch/parse. This is n=1, includes an artificial 35 ms fixture-fetch delay, excludes search/network/server, and measures render submission rather than GPU presentation. Final responsive/native/GPU acceptance and user UI approval remain pending. No sample numbers are presented as real device/server p50/p95.

Local diagnostic hooks record cold/warm download, parse, first-frame, render, packet, file-ready, hand and context/error durations plus renderer/cache counters. They carry no original/source/name/path/query/owner identifiers and add no telemetry consent. `hand-frame` currently measures the queued animation-frame boundary; actual GPU presentation still needs instrumentation. No 100 ms/33 ms target is claimed achieved. Required cold/warm JSON→first frame/all visible Top-5, real hand-to-presentation, refine packet, verified file, GPU/memory/error measurements against the legacy poster path remain an activation gate.

## Remaining acceptance gates

1. Freeze a real Converter HTTP adapter and verify current source/shape/hand/runtime lineage, strict real-asset normals and final FBX correspondence, cancellation/restart and independent reimport.
2. Supply exact search matrices/framing plus approved full library/scope inventory; bind BFF capability/asset metadata and packet frame to it. Supply owner-authorized verified hand tables before registering any local capability.
3. Exercise actual app/native save, multi-person/reselection/refine-hand races, expiry/deletion/permissions/context loss, server/private history storage and CSP on supported OS/device combinations.
4. Record real cold/warm/render/GPU/solve/file metrics and complete the user's product UI review before Ready/activation/deployment.
