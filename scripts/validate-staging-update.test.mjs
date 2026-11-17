import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStagingUpdate } from './validate-staging-update.mjs';

const version = '0.2.4-staging.1';
const fixture = () => ({version, platforms:Object.fromEntries(['windows-x86_64','darwin-aarch64','darwin-x86_64'].map(p=>[p,{signature:'signed',url:`https://github.com/04JUNG/Standin-client/releases/download/v${version}-staging/app.tar.gz`}]))});
test('staging updates require every signed platform and the versioned staging release', () => {
  assert.equal(validateStagingUpdate(fixture(), version).version, version);
  for (const mutate of [m=>delete m.platforms['darwin-aarch64'], m=>m.platforms['darwin-x86_64'].signature='',m=>m.platforms['windows-x86_64'].url='https://github.com/04JUNG/Standin-client/releases/latest/download/app.exe',m=>m.platforms['darwin-x86_64'].url+= '/../../escape',m=>m.version='2.10.6']) {
    const m=fixture();mutate(m);assert.throws(()=>validateStagingUpdate(m,version));
  }
});
test('staging app identity and feed stay separate from production', () => {
  const staging=JSON.parse(readFileSync('src-tauri/tauri.staging.conf.json','utf8'));
  const production=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
  assert.equal(staging.identifier,'app.standin.desktop.staging');
  assert.deepEqual(staging.plugins.updater.endpoints,['https://github.com/04JUNG/Standin-client/releases/download/staging-updates/latest.json']);
  assert.ok(production.plugins.updater.endpoints[0].includes('/releases/latest/'));
  assert.equal(staging.bundle.createUpdaterArtifacts,true);
  assert.equal(staging.bundle.macOS?.signingIdentity,undefined);
});
