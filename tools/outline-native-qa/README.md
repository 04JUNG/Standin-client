# Local Tauri UI/native evidence harness

Not a product route or live BFF success simulation. Imports actual approved local FBXs, evaluates a display-only immutable surface with a diagnostic normal material, and mounts the production shared renderer, per-person control, AppShell/BarShell/WindowModeSync and exportTauri. Nonzero preview settings alone cannot write a file. The optional recorded BFF v2 input described below can write its exact verified bytes; this harness does not initiate live BFF export. Current v2 actual CSP import evidence is in docs/OUTLINE_FBX_CSP.md. Zero writes exact source bytes through the production native adapter.

Set `OUTLINE_NATIVE_ASSETS` to a directory containing approved `male.fbx` / `female.fbx`, and `VITE_OUTLINE_QA_OUTPUT` to a new existing output directory. Run Vite with this config (localhost port 1448). Use an isolated Tauri config/identifier/keychain service and target; its window URL is `http://127.0.0.1:1448/tools/outline-native-qa/`. Never reuse a user's app identifier or source document. No assets, credentials or build products belong in Git.

The control is deliberately mounted for UI inspection even though production capability is unavailable. This is not proof of a server capability, operation receipt, final outlined FBX or CSP persistence. See `docs/OUTLINE_FBX_CSP.md` for actual results and limitations.

Optional `live.fbx` is a previously verified actual BFF/Converter zero result. The third button labels it recorded; it is never called a live UI/BFF operation. Route fallback stays within this QA entry across HMR/reload.

Optional `outlined.fbx` plus `outlined.receipt.json` (the actual normalized BFF outline receipt, including original proof) enable the explicitly recorded v2 result button. The current production receipt parser checks accepted representation/target and the harness hashes the file before calling the production native adapter. Changing the displayed width refuses the recorded file. This is a recorded actual BFF result → native write, not a single live app/BFF transaction or a fabricated server certificate. Never commit the private FBX/token/source files.
