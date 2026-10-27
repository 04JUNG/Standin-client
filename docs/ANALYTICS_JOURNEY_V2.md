# Journey analytics v2 (not deployed)

Backend counterpart: https://github.com/04JUNG/Standin-app-server/pull/134 . Merge/deploy the BFF capability and allowlist before rolling out this client. Neither deployment is performed by this change.

## Contract

The client probes authenticated `GET /v1/events/capabilities` for `{journeyVersion:2}`. An explicit 404 or non-v2 response disables new names, retaining legacy analytics. Unknown/network/5xx state queues consented events without sending unknown names, uses a 5-second probe timeout, and retries on the 30-second flush/online cadence. Never block product actions on telemetry.

Common metadata: `telemetryVersion:2`, random per-webview `sessionId`, build-derived `appVersion`, `surface:app|bar`, server `jobId` when known. Preserve event IDs and consent IDs across retries. Never send image URLs, original file names, native paths or search text in new events.

Reused: `input_confirmed`, `results_viewed`, `candidate_selected`, `selection_confirmed`, `analysis_failed`, `export_completed`, `export_failed`, `capture_failed`.

Added: `input_started`, `input_cancelled`, `input_failed`, `review_viewed`, `preparation_started`, `preparation_ready`, `preparation_failed`, `export_requested`, `export_cancelled`, `thumbnail_failed`.

- Input starts/cancels/failures cover capture and file picker/drop validation. Pending random attempt IDs share app-origin storage across webviews, scoped to the same consent and expiring in 30 minutes. Input confirmation includes `inputAttemptId` and random draft `inputId`; live result includes the matching `inputId`.
- `results_viewed` comes only from actual candidate page consumers, not the shared hook's progress/review consumers. It records candidate/person counts. Existing server-job routes (including semantic search and history) are marked `entryPoint:existing_job`; this field does not distinguish history from new semantic search.
- Thumbnail failures cover query failures and actual image decode/load errors, deduplicated locally per candidate/image identity. Image identities/URLs stay local.
- Review entry and preparation are shared by both surfaces. Preparation readiness means file prerequisites are ready; it is independent of optional image rendering. Changed candidate/body/hand bindings start a new preparation attempt. Generic preparation rejection currently uses `PREPARATION_UNAVAILABLE`.
- Export button, actual save attempt and alternate-folder picker use `trigger` to distinguish observed explicit clicks from `save_attempt` fallback. Related outcomes share `attemptId` and elapsed time. Folder cancellation, scene confirmation cancellation and cancelled preparation are recorded separately from errors.
- `export_completed` is emitted after the save service resolves. Only Tauri writes carry `nativeDiskWrite:true`; browser/mock download initiation must not count as a verified native save. Keep attributing success to the captured job even if navigation changed during writing.
- Consent bootstrap/network uncertainty suspends collection and transmission without deleting consent-scoped pending events. A verified different consent drops unrelated events; explicit withdrawal clears pending events and inputs immediately.

## Interpretation and limits

Missing events are not proof of abandonment: quality consent, unsupported older clients, app termination and offline delivery must be accounted for. A result screen event confirms a rendered page, not that every card was seen or the image was satisfactory. Saved files do not prove successful use in drawing software. Optional body/hand adjustments are not mandatory funnel steps; their preparation cycles are observed but explicit adjustment actions are not added in this patch. Semantic search's pre-job typing/submission and clipboard input-start instrumentation are not added here. OS file-dialog cancel reporting depends on the WebView emitting the standard cancel event; no focus-loss heuristic claims cancellation.

## Local verification

TypeScript and relevant React/queue/native-save fixture tests run locally. Tests use NODE_OPTIONS=--no-experimental-webstorage with the host Node runtime to avoid its experimental localStorage conflicting with jsdom. No production config, data, permissions, app binary or deployment is changed. No real native app E2E was run.
