# Replay release settings

Desktop release builds classify replay with `VITE_APP_ENV` from the selected release environment.
Staging defaults to replay enabled with `assumed` authorization. Production defaults to replay
disabled with `explicit` authorization. Repository variables `STAGING_REPLAY_ENABLED` and
`PRODUCTION_REPLAY_ENABLED` override the respective build defaults (`true` / `false`).
These settings are independent; merging staging changes does not activate production replay.

After merging to main, enable production by setting repository variable
`PRODUCTION_REPLAY_ENABLED=true`, then build a production release. On the BFF deployment,
set infrastructure context `productionReplayEnabled=true`; the infrastructure sets
`REPLAY_ENVIRONMENT=production`, `REPLAY_CONSENT_MODE=explicit`, and the private production
replay bucket. Keep the server and client authorization modes consistent. Production replay
requires the existing explicit quality consent receipt; installations without consent do not record.

For staging, the corresponding server context is `stagingReplayEnabled=true`, with
`REPLAY_ENVIRONMENT=staging` and `REPLAY_CONSENT_MODE=assumed`. Changes to build variables
apply to new desktop builds. Existing binaries retain their build-time replay configuration.
