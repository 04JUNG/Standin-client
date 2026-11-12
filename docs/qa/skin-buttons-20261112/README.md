# Candidate-stage appearance settings

- Base: default/flesh. Lines: none/guide/muscle. The base remains selected while switching or toggling lines. The composed strict ID includes `flesh-muscle`.
- Desktop large candidate preview reads the same `skinByPerson` and `outlineByPerson` as final review/save.
- Floating controls appear only while **체형 더보기** is expanded. Closing it retains selection. The compact row uses existing width, wraps only if narrow, and does not change the 560px candidate window cap.
- App/bar final review, including expanded 3D, has no skin/outline editing. Hands remain available. Candidate appearance changes do not prepare FBXs.
- Final bar cards are capped at 192px, with rotation/enlargement still available.

Validation:1573 client tests passed,5 opt-in skips; typecheck/build and changed product ESLint passed. The browser uses actual production components and local sample data, not live staging or a native installer. Tested on macOS; Windows/native packaging not tested in this follow-up.

`selection.jpg` shows the existing large preview and the floating candidate component.
The floating body-selection preview itself retains its existing neutral image/runtime;
its appearance is not recolored by these controls. Selection persists to final review/save.
Server evidence covers fresh FBX export/reimport on both base and adjusted male/female bodies.
