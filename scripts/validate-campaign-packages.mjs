import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateCampaignPackages(release, feed) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name ?? "");
  if (!match || feed.version !== match[1] || !Array.isArray(release.assets)) throw Error("Invalid release version");
  const version = match[1];
  const asset = name => {
    const matches = release.assets.filter(a => a.name === name && a.size > 0);
    if (matches.length !== 1) throw Error(`Missing or duplicate signed package: ${name}`);
    return matches[0];
  };
  for (const creative of ["meta-poster-a", "meta-hook-a"]) {
    asset(`Standin_${version}_${creative}_x64-setup.exe`);
    asset(`Standin_${version}_${creative}_x64-setup.exe.sig`);
    asset(`Standin_${version}_${creative}_universal.dmg`);
  }
  for (const [platform, name] of [
    ["windows-x86_64", `Standin_${version}_x64-setup.exe`],
    ["darwin-aarch64", `Standin_${version}_universal.app.tar.gz`],
    ["darwin-x86_64", `Standin_${version}_universal.app.tar.gz`],
  ]) {
    const neutral = asset(name);
    const entry = feed.platforms?.[platform];
    if (!entry?.signature || ![neutral.url, neutral.browser_download_url].includes(entry.url))
      throw Error(`Updater must use the neutral signed package: ${platform}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = file => JSON.parse(readFileSync(file, "utf8"));
  validateCampaignPackages(read(process.argv[2]), read(process.argv[3]));
  console.log("Both creative packages and neutral updater feed validated.");
}
