# Female breast candidate runtime

`standin-female-body-0.3.4.breast6` is an opt-in authoring candidate, not a change
to existing female 0.3.4 assets. The source branch is
`04JUNG/Standin-server:codex/female-breast-shape-20261028`.

The catalog supplies `breast_size` range `[-1,2]`, grid `.01`, default `0`.
Existing zero and positive sizes through +1 are exact. Above +1, the controller
uses a separate rounded target with upper- and lower-pole fullness; it does not extrapolate the old Large key.
Negative values intentionally use the improved compact small target.

The new evaluator shares the existing female anatomy, muscle, pelvis, warp and
fold implementation. It first evaluates the legacy reference (SmallReference
for negative values; old +1 for extension), then applies the local breast
residual. The optional precise output from the shared evaluator keeps this
composition in Float64 until the final Float32 output. Existing rule mappings
and default paths remain unchanged.

The matching runtime must be built from the same immutable blend/controller
hashes as the Converter registry and catalog `shapeSource`. `build_runtime.py`
keeps the real controller source/asset-lock checks and independently verifies
the new decomposition. No supported-rule alias or hash bypass is added.

## Validation

Use the bundled Node 24 runtime for the suite. Local Node 26's web-storage
behavior causes the same 141 unrelated failures on unchanged develop and this
branch; no export/store/replay test or application code was changed for that.

- 1,241 tests passed with Node 24; one optional full-mesh test skipped in the
  ordinary suite. Typecheck, lint (one existing warning) and build passed.
- Separate full-mesh check: 129 actual controller cases against the generated
  SSR1 runtime, including all control endpoints and 40 random combinations.
  Maximum observed component error: 0.0056 mm (existing contract: 0.05 mm).
- The small committed fixture contains 12 actual breast/root vertices over 13
  sizes, including reduction intermediates, +1 and the new +1..+2 segment.
  It is generated with `scripts/shape-runtime/build_breast_fixture.py` using
  Blender and records the exact source hashes. It is breast-only; full-mesh
  filtering and fold verification remain the separate 129-case check.

Build the full runtime using `scripts/shape-runtime/build_runtime.py --blend ...
--controller ... --out ... --dump ...` inside Blender, then run the existing
`evaluate.full.test.ts` with `SHAPE_RUNTIME_FULL=<ssr>:<dump-prefix>`.
The dump prefix's JSON lists names/controls and its binary contains float64
controller positions, as documented in the test.

The server's candidate delivery includes matching sources, 11 preset FBXs,
registry/catalog, actual minimum/extended FBX worker outputs, source hashes,
offline visual review and regression reports. Activate a reviewed matching
catalog/runtime/source bundle together. This PR does not activate assets,
change CSP/replay flows, publish models, or merge main. Actual CSP import and
artist visual approval remain pending.
