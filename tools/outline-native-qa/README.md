# Local Tauri UI/native evidence harness

Not a product route or live BFF success simulation. Imports actual approved local FBXs, evaluates a display-only immutable surface with a diagnostic normal material, and mounts the production shared renderer, per-person control, AppShell/BarShell/WindowModeSync and exportTauri. Nonzero file output is intentionally refused because no representation is accepted. Zero writes exact source bytes through the production native adapter.

Set `OUTLINE_NATIVE_ASSETS` to a directory containing approved `male.fbx` / `female.fbx`, and `VITE_OUTLINE_QA_OUTPUT` to a new existing output directory. Run Vite with this config (localhost port 1448). Use an isolated Tauri config/identifier/keychain service and target; its window URL is `http://127.0.0.1:1448/tools/outline-native-qa/`. Never reuse a user's app identifier or source document. No assets, credentials or build products belong in Git.

The control is deliberately mounted for UI inspection even though production capability is unavailable. This is not proof of a server capability, operation receipt, final outlined FBX or CSP persistence. See `docs/OUTLINE_FBX_CSP.md` for actual results and limitations.

Optional `live.fbx` is a previously verified actual BFF/Converter zero result. The third button labels it recorded; it is never called a live UI/BFF operation. Route fallback stays within this QA entry across HMR/reload.
