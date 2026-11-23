# Female 0.4.0 breast7 runtime

The user's 2026-11-23 follow-up authorizes a code-only main promotion of these
validated changes. Earlier review-only/main-unmerged statements describe the
initial validation snapshot. Asset activation, desktop release and updater feed
changes remain separate; unrelated develop changes are excluded.

This is a separate source-bound port of the original breast7 candidate onto the
current 105,430-vertex, 54-bone female 0.4.0 model. It preserves the current body,
hands, proportions, rig and weights. It does not activate a catalog or replace an
old character, runtime, card or saved selection.

The pure port is `standin-female-body-0.4.0.breast7.2`. The final pose-guard
candidate is `standin-female-body-0.4.0.breast7.4`. The intermediate `.3` candidate
failed the extra .01 posed contact path and is not registered here. None of these
names refers to the separate 94,901-vertex lightweight female v4 work.

The new neutral evaluator uses the same measured anatomy and local breast
residual equations as the original breast7. Its fields, weights, normals, limb
masks, landmarks and frozen rig data are baked from the actual current source.
Both new rules have explicit entry points and require their own source identity.
No old-rule alias or hash/approval bypass is used.

The range is −1 through +2 with a .01 grid. The new Small contracts the footprint;
Extended is the original authored rounded target. Zero through the old +1 is
exact. The current Small is retained as SmallReference while inherited
fat/muscle processing runs, then the locally warped breast residual is composed
with the same fold guard. The `.4` controller additionally withdraws only a very
small local residual when it creates a new posed contact. This pose correction
does not change neutral keys or the neutral preview equations.

## Full-resolution fields

SSR1 uses its self-describing array metadata with two explicit extensions:

- `indexDtype: "uint32"` for a full-resolution rule runtime. Required face, band
  and sparse-field indices must use this type; large meshes with u16 indices are
  rejected. The rule vertex cap is 200,000. SSR2 retains its 65,535-vertex cap.
- `valueDtype: "float32"` on a displacement field. Earlier fields retain their
  default int16 representation. Nonfinite float displacement values are rejected.

Edges use the actual vertex count to form unique adjacency keys. A 16-bit stride
would alias distinct edges once the model exceeded 65,535 vertices. The new test
includes that collision and an index above 65,535.

Integer displacement quantization changed a fold branch in one extreme test.
Preserving float32 fields fixes it without changing the controller or relaxing
the existing 0.05mm contract. The full runtime is 20,020,176 bytes, below the
existing 32MiB download limit. It contains all 11 presets and exact source hashes.
An older client may reject the new array types; review and activate the matching
client, source, runtime and catalog together.

## Reproduction and checks

`build_runtime.py --blend ... --controller ... --out ... --dump ... --random 40`
runs inside pinned Blender with auto-execution disabled. It keeps the real
controller's source/asset-lock checks. `check_full_runtime.ts` independently
uses the actual client parser and evaluator on the dumped full mesh. The final
candidate's 129 cases have maximum component error 0.000060mm against the
unchanged 0.05mm threshold. The generated mini fixture covers 12 real breast/root
vertices over 13 sizes and records both source hashes; it does not replace the
full-mesh check.

The ordinary Node 24 suite passes 1,710 tests (six existing/optional skips).
Typecheck, lint and build are checked separately. Host Node 26 web-storage
failures are not used as a reason to alter application storage or export flows.

`scripts/female040-review.ts` imports the real `mountShapeBody` and evaluator.
Bundle it with esbuild and `@` mapped to `src`, supplying a local test
`import.meta.env`. The server companion `scripts/female_breast/serve040.py`
provides the pinned catalog/runtime and runs the source-validated fixed-FBX
writer with independent reload verification. Its HTTP downloads are genuine
generated FBXs. Controls are locked while exporting; changing the selection
invalidates the previous download link. This isolated localhost review app
does not use production Tauri identifiers, installation tokens or keychain data.

The server's `FEMALE_BREAST_040_VALIDATION.json` and the dedicated permanent
artifact folder record final asset pins, default-FBX downloads, actual CSP
imports, saved/reopened `.clip` files and comparison frames. This is distinct
from installed Tauri → production BFF end-to-end validation. New skin/UV pins
are generated only after exact topology/weight checks; legacy CSP certification
is not copied onto new character hashes.

Future lightweight v4 work must use new source/asset/runtime identities and
repeat its own acceptance checks. This change does not approve or modify the
runtime or pins owned by PR244/208/95/234.
