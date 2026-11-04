# Fullscreen selection: persistent large preview (2026-11-04)

Status: Draft UI review. No deployment, merge, production/staging calls or paid inference.

## Dependencies and ownership

- Worktree `work/client`, branch `codex/selection-large-preview-20261104` starts at client PR #173 (`6fd099e8b48ed1df9e1e98558ff3199d8cc74710`). Latest fetched develop is `5fe483e936e2a2ac22e9df9242a5a193504e4241`.
- Reuses that PR's shared event-driven renderer, bounded static asset cache, canonical packet decoder, exact camera and orbit state. It introduces no new pose solver, local body warp or permissive GLB decoder.
- Requires BFF `codex/selection-preview-packet-20261104`, based on BFF #154 (`29e2a4559f964ec70b02fd83228f3a53ea63c085`), and existing Converter #167. The BFF addition is necessary: #154's export operations require confirmation and the older shaped-body route deliberately provides PNG rather than a rotatable GLB.
- `outline/BodyOutlineRenderer.ts`, `outlineSettings.ts` and their renderer test are reused from client #162 (`b0b1d8ca05de990ec56cc9afdd0e03763e817efc`). This does not copy or merge that PR's older review renderer. No changes to server #144's local skin source.
- Original dirty repositories and other worktrees are preserved. No reset/stash/switch. Body defaults come from the existing server catalog/spec; this change declares no new male/female height or head proportion.

## Product behavior

The fullscreen image/capture and semantic selection pages have an independently scrolling selection column and one persistent large preview column. Existing pose/body mode switches, card image proportions, body preset proportions, explicit pose selection and final confirm/save routes are retained. Semantic paging/list components are not modified. At narrower widths cards wrap with square pose images; body presets keep their existing horizontal scroll. The floating bar does not adopt this split layout.

The first candidate may be inspected without selecting it. The viewer has full yaw and near-pole vertical orbit, wheel/button zoom, Shift/right drag pan, keyboard arrows/+/- and the existing search-camera reset (R). Display observation never enters body selection, confirmation or export identity. Wheel zoom consumes scrolling only over a large viewport.

Only the viewed candidate is sent to the new preview endpoint. A matching existing static asset can appear immediately. Pending body/pose preparation keeps the prior geometry visible and explicitly labels it as the **previous preview**, then swaps in the latest validated result. Aborted/older results cannot replace a newer selection. Failures are retryable without selecting or saving anything.

Basic and flesh tint (#FADFCA) plus 0–2 CSS-pixel silhouette outline update only renderer settings/material uniforms. Per-view owned materials protect shared cache entries and other cards. Offline poster lighting/source hashes are unchanged. These display settings are not written into FBX. Guide/muscle surface assets from the separate skin authoring session are not fabricated or published by this change; this PR supports the two base tints only.

## Protocol and lifecycle

New capability `selectionPreview: true` is read only when the existing client `VITE_INTERACTIVE_POSE_PREVIEW` opt-in is enabled. Server capability requires the existing private interactive feature flag and transport. Defaults remain off. Without either the negotiated read-only capability or a supported static asset, the existing selection layout and neutral body preview remain in place; no empty large pane is shown.

`POST /v1/analysis/jobs/{jobId}/people/{personIndex}/selection-preview`

Request: `{candidateId, bodyRevision}`. Response: `{schemaVersion:"standin.selection-preview.v1", previewOnly:true, bodyRevision, packet}`. The packet is the unchanged `solved-pose-state-v1` canonical protocol; require `post-frozen-file-canonical-snapshot-v2`. Client validates canonical SHA, operation/person/candidate, source, body SHA, shape SHA, output scope and revision before preparing a surface. No confirmation, export request, file receipt or history upload is made.

Owner/job/person changes remount the pane and dispose the former canonical surface. Each fullscreen preview owns at most its current prepared surface plus an incoming replacement. Losing responses, superseded surfaces and unmounted components release their resources. Static CPU cache retains its existing bounded policy. All visible views share one WebGL renderer/context; the large pane uses normal layer 0, so it does not suppress the cards. Expanded modals retain the existing layer behavior. Outline passes use stencil and scissor on the shared context, only for the pane that requests an outline; their materials are disposed when views leave.

## Verification

- Client full suite: **1,294 passed / 3 optional artifact skips**. New tests cover response races, abort/disposal, previous-preview labelling, appearance without reloading, canonical corruption/body/candidate/revision fences, and material isolation. Existing selection/save/person/app/bar regressions pass.
- BFF full suite: **1,005 passed / 2 optional skips**, including preview resolver/HTTP/cleanup/race/permission tests. Typecheck/build pass.
- Client typecheck/lint/build pass (existing BodyCandidates Fast Refresh and large chunk/dynamic-import warnings). Dedicated strict check also covers `samples/selection.tsx`.
- Actual shared local Converter solve + new BFF validation: approved male/full packet, 9,430,240 response bytes, zero export calls and two cleanup calls. Two consecutive runs **6,506 / 4,122 ms**, injected owned-selection resolver. This is real solve evidence, not a production database, complete HTTP/native save or fleet latency claim. Cold body preparation is not instantaneous; unchanged FBX dependencies remain.
- Browser: actual product components with real Top5 static models; CSS **1280×800** and **960×640**, horizontal overflow 0, preview bottom precedes footer top, footer stays within viewport. Basic/flesh, outline 2, keyboard/mouse orbit, and disabled confirmation before selection observed. Actual recorded female baseline/fat/muscle packets are used in the body sample. The latter replays three prior canonical states; continuous body solving/search/save are not connected in that sample.
- Unlocked-browser follow-up: actual fat/muscle mesh thumbnails and large body switching verified; pose/body view toggles retain the large pane. Orbit/zoom/reset leave confirmation disabled until explicit pose selection. CSS **960×480** has zero horizontal overflow, preview bottom 385px before footer top 397px, footer bottom 456px within 480px. The floating bar has no large pane. Top5 screen unmount releases WebGL contexts/views/geometries/textures to **0**; bounded CPU cache retains five entries (21,006,228 bytes) with **0 active references**. Body sample browser error log is empty. No native Tauri/Windows/CSP or production PostgreSQL claim.

Local samples: `/samples/real.html` (real Top5) and `/samples/selection.html` (three recorded body states). Private licensed model/packet/profile data stays under ignored `samples/.local-real/`; it is not committed. The sample generates actual mesh thumbnails sequentially with one transient shared viewport, not a viewer per card. UI acceptance is still pending; keep PR Draft.

## Screen-relative orbit correction

Real search camera projections have a negative horizontal scale. The shared camera now accounts for that sign when applying observation yaw and horizontal pan, so rightward drag and arrow controls stay screen-relative. Canonical view/projection matrices, the exact initial/reset frame and export identity are unchanged. A regression first failed on the mirrored projection; it now passes for eight camera directions, both projection types, ordinary/mirrored horizontal scales, orbit and pan. Actual Top5 rightward/leftward drag and reset were exercised, confirmation stayed disabled and browser error logs were empty. Full suite: **1,294 passed / 3 optional skips**, using the documented `NODE_OPTIONS=--no-experimental-webstorage` on this host Node runtime; typecheck and lint pass (existing warning only).

## Integration conflicts

Likely shared files: PoseViewerPage (semantic paging session should preserve the split wrapper), InteractivePose/renderer (Top5/expanded-view session should preserve optional `appearance` and `renderLayer`), PosePresentationPanel (optional `persistentPreview` hides the duplicate neutral live pane only in fullscreen), and BodyCandidates (optional `hideLivePreview`, default false). No semantic paging implementation or Top5 magnifier placement is added or removed here.
