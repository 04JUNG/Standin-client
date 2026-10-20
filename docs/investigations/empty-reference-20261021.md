# Empty reference report (2026-10-21)

Baseline: client b99708a, BFF d961df8. No app or GUI execution.

Confirmed display defect: ActivePersonCard / OtherPersonRow and bar title treated an existing posePresentation object with zero normal candidates as a reference. PresentationContent rendered zero-count groups and omitted search/check failure notices. BFF mapPosePresentation fails closed to an empty error presentation on invalid or unsupported contracts; this is a second possible source of zero groups, distinct from inference returning no candidates.

The supplied screenshots have no job ID, request ID, input hash, or timestamp that proves a stored job identity. Read-only search of saved /private/tmp/standin*202610* JSON artifacts found no attributable five-person job with this candidate pattern. No crop-based identity inference was used. The actual reason for persons 2 and 4 remains unproven.

Required evidence: owned BFF job ID and input digest, person-index mapping, original inference pose_presentation (search_status/search_reason, generation_status/generation_reason, issues and candidate groups), and corresponding stored BFF result. Compare the raw groups with mapped groups: empty raw groups indicate upstream outcome; nonempty raw groups plus BFF contract rejection indicate mapping rejection. A new analysis cannot establish the historical cause.

Change: use actual presentation group counts for reference labels in both surfaces; zero groups show a short empty-state explanation; fixed copy distinguishes empty search, search/check failure and contract rejection, while generation rejection/failure/timeout remains visible. No raw diagnostic strings are rendered. BFF adds stable contract rejection reasons while retaining error status, diagnostic issues, empty private assets and all existing validation.
