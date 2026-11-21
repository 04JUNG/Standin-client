import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function validateStagingUpdate(manifest, version) {
  if (manifest.version !== version) throw new Error('Staging updater version mismatch');
  const prefix = `https://github.com/04JUNG/Standin-client/releases/download/v${version}-staging/`;
  for (const target of ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64']) {
    const row = manifest.platforms?.[target] ?? manifest.platforms?.[`${target}-nsis`];
    if (!row || typeof row.signature !== 'string' || !row.signature.trim() ||
        typeof row.url !== 'string' || !row.url.startsWith(prefix))
      throw new Error(`Missing isolated signed staging updater artifact: ${target}`);
    const file = row.url.slice(prefix.length);
    if (!file || /[/?#]/.test(file) || decodeURIComponent(file).includes('..'))
      throw new Error(`Invalid staging updater artifact path: ${target}`);
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateStagingUpdate(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.argv[3]);
  console.log('Signed staging-only updater entries validated');
}
