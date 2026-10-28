# Standalone outline review

The viewer uses the same module and React slider as the client. Model/texture snapshots are intentionally outside Git.

1. Copy the skin review assets into an output directory's `assets/`: male/female `.glb`, `-standing.glb`, `-bent.glb`, `-seated.glb`, `-broader.glb`, and `-gray-guide.png`, `-flesh.png`, `-flesh-guide.png`, `-muscle.png`. Preserve source metadata and SHA256 manifest. The rig GLBs are for deformation checks; pose GLBs are Blender-evaluated surfaces.
2. Run `OUTLINE_PREVIEW_OUTPUT=/absolute/output/directory node_modules/.bin/vite build --config tools/outline-preview/vite.config.ts` from the worktree. Build retains the copied assets. No production server/API is needed.
3. Serve that directory with `python3 -m http.server 1432 --bind 127.0.0.1` and open `http://127.0.0.1:1432`. ES modules require HTTP rather than file protocol. This command publishes only on localhost.

Optional dev mode: `OUTLINE_PREVIEW_ASSETS=/absolute/public-root node_modules/.bin/vite --config tools/outline-preview/vite.config.ts`. That root must contain `assets/`.

Preview-only QA hooks: `window.outlinePreview.viewer` exposes `setChoice`, `setWidth`, `capture`, `compare`, `identity`, `diagnostics`, and `probeExportBoundary`. `probeExportBoundary()` tests GLB surface serialization before/after the screen pass; it does not export or validate FBX.

Checks:

```sh
npm run typecheck
npm run lint
node --no-experimental-webstorage node_modules/vitest/vitest.mjs run
npm run build
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2020 --module ESNext --moduleResolution bundler --jsx react-jsx --types node --allowSyntheticDefaultImports tools/outline-preview/main.tsx tools/outline-preview/vite.config.ts
```

See `docs/OUTLINE_THICKNESS_PREVIEW.md` for verified scope, actual screenshots, settings ownership, model provenance, and the FBX/CSP boundary.
