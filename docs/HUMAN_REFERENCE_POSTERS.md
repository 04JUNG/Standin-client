# Default human reference fallback

## Basic close-up plan (local, 2026-10-21)

`basic-closeup-preview-v1` connects a successful basic-model plan without any
pose candidates to the same verified anatomically cropped templates. It renders
the original neutral rest mesh directly; it does not alter the pinned library
poster renderer or rebake library PNGs. No BVH, inferred neck tilt, selected body,
generation or Converter invocation is added. The app and floating bar share the
panel, including explicit loading/error/retry and preview-only neutral captions.

For a local real-mesh check, run the paired BFF `tools/basic-closeup-fixture.mjs`
with `BASIC_CLOSEUP_TEMPLATE_DIR` pointing to an approved local template snapshot.
Then run `VITE_API_BASE_URL=http://127.0.0.1:1427 npx vite --config
tools/basic-closeup/vite.config.ts` and open `/tools/basic-closeup/`. The fixture
uses the actual BFF mapping/template proxy and actual client loader/panel/WebGL,
but synthetic job metadata. No user image is resent. Native app save/export and
remote deployment are outside this preview-only change.
Reverified on main: 1,061 tests passed / one existing skipped, TypeScript check,
changed-source lint and production web build passed. Chrome decoded all three
384×384 images (shoulder/head/compact shoulder); visual review confirmed the
approved cropped neutral mesh rather than a skeleton or full-body substitute.

A skeleton is not a completed human preview. Static default-human PNGs remain first choice. If a poster is absent or explicitly pose-only, the loader verifies the exact owned BVH and uses a shared approved human mesh template. Inline/generated candidates derive the same source-bound reference route even when they have no library poster. Normal, near/geometric/composition, actual-mirror and generated cards share this path. Direct BVH save-review consumers also upgrade a valid pose-only response.

This is `reference-skinning-v1`: actual approved default human geometry, eight original skin influences, neutral anatomy and source frame-zero rotations/rest alignment. It is approximate pose reference, **not** the frozen final Converter solver, selected body/hands/search camera, or export approval. The UI caption must say **기본 체형 · 근사 포즈 참고** when `PosePoster.method === "reference-skinning-v1"`. Two caption-only patches for the separately owned common components are provided to the integration owner. Existing match/refine/export/actual-mesh flags remain untouched.

Five anatomical mesh crops are built offline. Source SHA, PNG SHA, scope, template/character and method provenance are verified before use. Invalid provenance/authentication/source changes fail closed rather than falling through to another body or expensive conversion. A missing/unusable human template or unsupported rig is an explicit unavailable preview; the loader does not claim success with a skeleton. Template fetches are shared by scope; body/shape changes do not invalidate default images. One bounded local WebGL queue renders references; selected-body Converter detail stays explicit and separate. Native HTTP gzip decoding avoids adding a DecompressionStream requirement to desktop webviews.

The exact renderer source/style manifest is tested in `preview/humanReference/rendererManifest.test.ts`. The paired server's renderer and template pins must match for a new bake. The offline loopback baker (`scripts/bakeHumanPosters.mjs`, `tools/human-posters`) accepts only registered source hashes/scopes and pinned templates, writes no cloud data, resumes verified PNGs, and cannot mark partial coverage complete. See the server's `docs/HUMAN_REFERENCE_POSTERS.md` for commands and asset manifests.

Local preparation verified 29,155 staging images (5,831 exact source BVHs) and a separate 29,045 production-local images (5,809 sources), all five scopes and source/mirror/template/PNG hashes. Both source DBs are unchanged. Full packages are prepared locally; no upload/restart/deploy occurred. A new client alone cannot establish deployed coverage: apply the matching inference template/poster reader, BFF native-gzip/template/source/CORS routes and prepared **staging** asset snapshot together, then verify with the installed-app owner. Production assets must not be replaced by the staging DB.

Verification includes all source compatibility, source tampering, method/body/scope rejection, shared template single fetch, bone-direction/segment-length contracts and native HTTP boundaries. Actual-human browser fixtures checked original/mirror/generated/CMU poses across five scopes, and all five common display paths with complete/naturalWidth/decode evidence. Body change kept 5 poster / 2 owned-source / 2 shared-template requests and 0 Converter calls. Local fixture decode timings are not deployed-network, final-export or display-presentation timings. No native app operation was performed.
