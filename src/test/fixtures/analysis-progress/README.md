# Cross-repository contract fixtures

Copied from the isolated BFF implementation `codex/pose-analysis-progress-v1` on 2026-11-06.

- `pipeline-v1.json`: production inference milestones captured with OFFLINE mock inputs/models, passed through the production BFF public sanitizer. Combined/description, one/two people, and mixed pose/description routes. No production request or extra provider/render invocation.
- `contract-cases-v1.json`: synthetic future refine outcome packets. These verify client compatibility; they do not claim that current `/analyze` executes automatic refinement.

- `focus-v1.json`: additional 39 production-sanitized OFFLINE snapshots. They cover actual multi-person focus before search completion, same-slot observations/routes and final person binding.
- `scene-v1.json`: 39 production-sanitized OFFLINE snapshots of cut-level shot/view/personCount, including explicit zero, missing or invalid source observations and cut/person separation. These are not live service analyses.

The production client parser accepts all 117 snapshots. Preserve the source distinction when using these for regression tests. DEV motion fixtures/assets are separate in `src/dev`.
