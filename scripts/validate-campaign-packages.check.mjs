import test from "node:test";
import assert from "node:assert/strict";
import { validateCampaignPackages } from "./validate-campaign-packages.mjs";
function fixture() {
  const names = ["Standin_0.2.8_x64-setup.exe", "Standin_0.2.8_universal.app.tar.gz"];
  for (const creative of ["meta-poster-a", "meta-hook-a"]) for (const suffix of ["x64-setup.exe", "x64-setup.exe.sig", "universal.dmg"]) names.push(`Standin_0.2.8_${creative}_${suffix}`);
  const assets = names.map((name, i) => ({ name, size: 100, url: `https://api.github.com/repos/04JUNG/Standin-client/releases/assets/${i}`, browser_download_url: `https://github.com/04JUNG/Standin-client/releases/download/v0.2.8/${name}` }));
  const platforms = Object.fromEntries(["windows-x86_64", "darwin-aarch64", "darwin-x86_64"].map((name, i) => [name, { url: assets[i ? 1 : 0].url, signature: "signed" }]));
  return { release: { tag_name: "v0.2.8", assets }, feed: { version: "0.2.8", platforms } };
}
test("requires both platforms for both creatives and keeps updates neutral", () => {
  const ok = fixture(); validateCampaignPackages(ok.release, ok.feed);
  const missing = fixture(); missing.release.assets.pop();
  assert.throws(() => validateCampaignPackages(missing.release, missing.feed), /Missing/);
  const wrong = fixture(); wrong.feed.platforms["windows-x86_64"].url = wrong.release.assets[2].url;
  assert.throws(() => validateCampaignPackages(wrong.release, wrong.feed), /neutral/);
});
