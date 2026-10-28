# Session replay client — implementation and verification

Base: `a5226ec1059322509cfcd779d9bf9a300db8dfbf` (`origin/develop`, fetched 2026-10-28).
Branch: `codex/session-replay-client-20261028`.
Worktree: `/Users/dowon/Documents/Codex/2026-10-28/session-replay-client-20261028/Standin-client-worktree`.
Strategy: [agreed scope](SESSION_REPLAY_CAPTURE_CSP_STRATEGY_2026-10-28.md).
BFF protocol: `session-replay.v1`; recorder `@rrweb/record@2.2.0`, player `rrweb-player@2.2.0`; all dependencies bundled locally.

## Behavior

- `VITE_REPLAY_ENABLED`, `VITE_CAPTURE_REPLAY_ENABLED`, `VITE_CSP_RESULT_CAPTURE_ENABLED` default true. `VITE_REPLAY_CONSENT_MODE` defaults `assumed`. Only development/staging accept assumed mode; an unclassified release build defaults to production for this gate. Explicit false clears pending replay uploads. OS permissions are unchanged.
- No new consent UI or fabricated consent record. Installation authentication remains required. Existing quality metrics retain their consent/capability checks. Replay observes the same event calls before those checks, without sending duplicate metrics. Explicit quality withdrawal/installation deletion stops collection immediately, clears pending payloads and calls authenticated `DELETE /v1/replays`. A failed server delete leaves both the localStorage stop marker and a separate IndexedDB control marker blocked (payload queue cleanup does not erase withdrawal); it does not silently resume.
- One native process UUID and epoch anchor connect existing analytics `sessionId` and replay `appSessionId`. App/bar/capture currently use a single Tauri WebView; each surface has a separate stream with per-stream zero-based sequence and a per-WebView instance UUID. A monotonic clock anchor supplements epoch timestamps. Explicit route subscription excludes authentication routes before their DOM is recorded.
- rrweb records clicks, scroll, layout and input changes. All inputs are masked except explicitly marked pose-search fields. Search changes/submissions, ordered candidate IDs/ranks/thumbnails, body-control values, body and hand selection versions, and existing job/attempt events are custom events. Source images are copied into immutable hash assets and their DOM references rewritten. Remote URLs, tokens, local paths, network bodies and auth screens are excluded. Unsupported/external/expired images become explicit asset gaps.
- WebGL is separate from DOM recording: final review and shape preview draw paths submit resized JPEG frames at no more than 2fps, with metadata and missing-frame events. Final review frames are also `final` comparison assets. It is not a 60fps video and does not reproduce model computation. Static DOM images use immutable asset copies.
- Capture reconstruction buffers sampled cursor/selection events, then uploads a black full-size background containing **only the final selected rectangle**, plus the actual rough crop. No unselected desktop pixel is persisted/uploaded. Negative monitor origins, native coordinate bounds, physical frame size and scale are included. Cancelled captures contain coordinates and `backgroundOmitted`, not desktop pixels. This privacy default means a cancelled capture cannot replay the full visual desktop. A safe synthetic viewport snapshot supplies replay controls; `recordMode=capture_overlay_reconstruction` identifies the method.
- Existing pointer/crop/navigation/ESC behavior stays on the original path. Replay copies run asynchronously and errors cannot fail the original capture/search/save.
- After actual FBX save, downloaded file bytes and selection binding are hashed. App and bar offer “적용 결과 보내기” and in-app `Mod+Alt+R`. The user explicitly chooses a CSP window; multiple windows are not auto-selected. Native code checks app identity again, permission, minimized/closed target, blank frame and size. There is no desktop fallback. Each result image links owned job, exact saved FBX SHA-256 and saved selection snapshot. `csp_result_captured` and optional user assessment remain separate; drag/save/activation never imply successful CSP import.
- IndexedDB queue: 12MiB, 24-hour TTL, 8 pending serialization batches, 60MiB/session, 4h/session. Raw chunk maximum 1MiB; normal flush every 5s / about 240k JSON characters. gzip/base64, SHA-256 and immutable per-stream sequence give idempotent retry. Upload retries periodically/online; 429 honors Retry-After. Permanent failures and queue/asset/backlog loss emit replay gaps. Credentials are added at send time and never persisted in the queue. Pagehide tries a final flush/finish; abrupt exit remains incomplete in BFF manifest and is not interpreted as abandonment.

## Real integration evidence

The actual BFF entrypoint ran with PGlite and private local object storage at `localhost:18081`, using `scripts/replay-local.ts` from the BFF worktree. No AWS/live settings, deployment or real-user content was used. Browser CORS was configured for the local client ports; collection responses were not mocked.

The actual React app/recorder followed home → search input → floating bar → production CaptureOverlayPage with an owned synthetic bitmap → pointer drag/crop → home. The local inference service was unavailable, and the normal analysis error remained usable. Session `bc81fb8a-16bd-4696-955e-dad682f3ebc9` stored 3 app chunks, 2 bar chunks, 3 capture chunks, restricted capture background and rough crop. Client upload accounting was 143,764 wire JSON bytes with zero gaps/no page errors; backend uncompressed event/assets total was 405,981 bytes. This is recorder/capture/BFF evidence, **not** successful real model inference or export.

The existing ops dashboard’s metrics tab loaded the real session list/manifest, opened app and bar rrweb players, and sought the capture scene. The restricted 1280×800 background and exact selection rectangle were visibly rendered. Latest BFF restart resolved an earlier stale dashboard/ESM bundle mismatch; final player check had no page errors. Missing final flush in the early test appeared as `upload_incomplete` for each stream, as required. These are real stored records, not an HTML-only preview. The later safe viewport snapshot addition supplies controls for reconstructed capture streams.

## Validation and limits

- 1,202 Vitest tests pass, one existing conditional skip (149 files pass, one skipped). `NODE_OPTIONS=--no-experimental-webstorage` is required with this machine’s Node 26 so jsdom owns localStorage. Added privacy, config, gzip integrity, durable queue cap/TTL, authenticated transport and failed-withdrawal tests.
- TypeScript/build pass. ESLint has zero errors and one existing BodyCandidates fast-refresh warning. macOS `cargo check --offline` and native debug build pass. The isolated Tauri app successfully displayed the installation guard in WKWebView using a separate identifier and keychain service; no existing installation was reused or modified. Native authenticated recording beyond that guard remains unverified.
- Chrome/macOS synthetic rotating WebGL sphere, 6s each: OFF 59.91fps / p95 frame 17.5ms / synthetic click-to-next-RAF p95 9.3ms / upload 0; ON 60.37fps / 17.6ms / 12.2ms / 122,860 wire JSON bytes (~1.23MB/min extrapolated). Synchronous frame-copy max 4.4ms ON, heap delta +297kB ON versus -746kB OFF. Heap/short extrapolations include GC and are not steady-state guarantees. This measures the production recorder/canvas adapter against the real BFF, not native WebView or a production human mesh.
- Windows build/native capture, mixed-DPI multi-monitor hardware, native OS permission rejection, actual CSP capture/import, and complete live inference→FBX save→CSP image are **not validated** in this environment. xcap window capture is used for both OS adapters; it is not a claim that ScreenCaptureKit/Windows.Graphics.Capture was separately implemented. CSP window capture may include its palettes/tabs; the current UX does not crop to a canvas region.
- Fonts use available system fallback; custom font files/CSS background URLs are omitted. Unsupported assets are gaps. Only review-model and shape-view WebGL draw paths are captured; other offscreen render helpers become visible immutable image assets through DOM where supported.
- Native crash can lose the last in-memory <5s buffer. IndexedDB uploads already persisted survive offline/restart. No reliable OS close handshake is claimed.
- Shared body/hand/export hook edits overlap the parallel personal-body work’s likely files. No cherry-pick or edits were made to its worktree. Original dirty client/server checkouts were untouched; only the required strategy MD was copied.

## Local run

```
npm ci
VITE_USE_MOCK_API=false VITE_USE_MOCK_POSE_API=false \
 VITE_API_BASE_URL=http://localhost:18081 VITE_APP_ENV=development npm run dev
```

Run the BFF’s documented local runner and normal installation registration. For native testing, keep a dedicated app identifier/keychain service and allow the local BFF origin in a temporary Tauri dev config. Do not reuse production installation credentials. Native capture requires normal OS screen-recording permission. Do not deploy these defaults into production with assumed mode.

Pending OS/model checks above must pass before this Draft PR is considered release-ready. No merge, release or deployment was performed.
