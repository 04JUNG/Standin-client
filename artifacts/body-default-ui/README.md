# Default-body UI fixture

This is an opt-in Chrome/Playwright check of the **current product components**: body customization catalog/editor, fullscreen candidate body choice and floating-bar body choice. It intercepts every API request. It does not contact a real BFF, create a real analysis or save a pose file.

Start Vite with `VITE_USE_MOCK_API=false VITE_API_BASE_URL=http://127.0.0.1:1448 npm run dev -- --host 127.0.0.1 --port 1448 --strictPort`.

Run:

```sh
NODE_PATH=<QA node_modules with playwright> \
BODY_UI_CATALOG=<local layout catalog.json> \
BODY_UI_MODEL_MANIFEST=<model session model-manifest.json> \
BODY_UI_OUT=<private screenshot directory> \
node artifacts/body-default-ui/check.cjs
```

The layout catalog uses the four role-bearing new/default and **current editor previous** assets from the model manifest. A local fixture may attach the model session's genuine neutral T-pose PNGs via `neutralPreview.path`, their actual byte SHA and matching character SHA. Never attach the old model's image/runtime to a new ID. Never publish local absolute paths, original models, runtimes or binary assets in this repository.

Checks: initial last_used policy remains selected; personal card remains; default male starts a new card; female tab starts female default; explicit previous-base and personal-card editing preserve the old model; picking old base propagates from app to floating bar; picking new base writes its distinct ID; no preferences PUTs; no page errors; floating document has no horizontal overflow. Screenshots wait for transition animations to finish.

2026-11-04 local result: 8 screenshots, page errors 0, 720×560 floating bar / 1280×900 fullscreen. Actual new/old model neutral PNGs were used. Sampled runtime is deliberately omitted in this layout fixture, so the product shows the existing image fallback and its explanatory text. Slider runtime behavior, model ratios, independent FBX import and exact final export are separate tests. This fixture is **not evidence of a real conversion or final file download**, even though its neutral PNGs are genuine model renders.
