# Local reference preview skins

The selection-stage buttons use the same per-person `skinByPerson` and `outlineByPerson`
that final review and FBX save consume. Final review and its enlarged dialog expose no
skin/outline controls. Candidate settings do not prepare FBXs.

The base color (default/flesh) and optional line layer (guide/muscle) are independent.
Guide and muscle exclude each other. Pressing an active line returns to the selected
base. `flesh-muscle` is an additional strict wire ID; old IDs retain their meaning.

The lightweight preview models have their own UV atlas. No final-export UVs are copied
to a different topology. Meshes, vertex indices, weights, finger chains and correctives
stay unchanged; only corner UVs are appended. Crops interpolate UV corners and use a
plain cap. The client checks both model and texture hashes before rendering.

Rebuild after `build_templates.py` using Blender and Python with NumPy/Pillow:

```bash
Blender --background --python scripts/preview-models/build_skin_uvs.py -- --client-root "$CLIENT" --out "$PREVIEW_SKINS"
python "$SERVER/scripts/skin_fbx/generate_textures.py" --assets "$PREVIEW_SKINS" --id male --resolution 2048
python "$SERVER/scripts/skin_fbx/generate_textures.py" --assets "$PREVIEW_SKINS" --id female --resolution 2048
python "$SERVER/scripts/skin_fbx/compose_flesh_muscle.py" --assets "$PREVIEW_SKINS"
python scripts/preview-models/package_preview_skins.py --client-root "$CLIENT" --assets "$PREVIEW_SKINS"
```

The generator uses the same newly authored guide/muscle paths and style as export.
The PNGs are preview-only derivatives; no source model or CSP textures were extracted.

Validation: client tests include line switching, toggling off, cross-view state,
read-only final screens, source geometry ownership, crop closure and posed shoulder
correspondence. Browser visual QA uses production UI components and local pose samples;
it is not evidence of a deployed staging service or native installer.
