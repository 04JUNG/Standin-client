/** Product component UI fixture. Requires local, operator-reviewed catalog; never calls a real API.
 * Run with NODE_PATH=<playwright modules> BODY_UI_CATALOG=<catalog.json> BODY_UI_OUT=<output> node .../check.cjs
 * Neutral PNGs are genuine catalog assets; policy/API responses are fixtures, NOT an export proof.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = process.env.BODY_UI_ORIGIN || 'http://127.0.0.1:1448';
const out = process.env.BODY_UI_OUT || '/tmp/standin-body-default-ui';
const catalog = JSON.parse(fs.readFileSync(process.env.BODY_UI_CATALOG, 'utf8'));
const modelManifest = process.env.BODY_UI_MODEL_MANIFEST ? JSON.parse(fs.readFileSync(process.env.BODY_UI_MODEL_MANIFEST,'utf8')) : null;
fs.mkdirSync(out, { recursive: true });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const ref = a => Object.fromEntries(['bodyId','bodyVersion','assetSha256','rigVersion','measurementVersion','characterId'].map(k => [k, a[k]]));
const editorPrevious = modelManifest ? new Set(Object.values(modelManifest.models).map(m => m.currentEditorPreviousCharacterId)) : null;
const assets = catalog.assets.filter(a => a.role === 'default' || (a.role === 'previous_default' && (!editorPrevious || editorPrevious.has(a.characterId))));
const newMale = assets.find(a => a.gender === 'male' && a.role === 'default');
const newFemale = assets.find(a => a.gender === 'female' && a.role === 'default');
const oldMale = assets.find(a => a.gender === 'male' && a.role === 'previous_default');
const oldFemale = assets.find(a => a.gender === 'female' && a.role === 'previous_default');
assert.ok(newMale && newFemale && oldMale && oldFemale);
assert.equal(catalog.defaultCharacterId, newMale.characterId);
const options = assets.map(a => ({
  characterId: a.characterId, displayName: a.displayName, gender: a.gender, role: a.role, order: a.order,
  bodyRef: ref(a), selectable: true, reasonCodes: [], shape: a.shape,
  ...(a.neutralPreview ? { neutralPreview: {
    ...a.neutralPreview, url: `/v1/models/${a.characterId}/body-preview/${a.neutralPreview.sha256}`,
  } } : {}),
  // This layout fixture uses exact neutral PNGs. Numeric runtime editing is tested separately.
}));
const modelCatalog = { origin: 'server', defaultCharacterId: newMale.characterId, characters: assets.map(a => ({
  characterId: a.characterId, displayName: a.displayName, gender: a.gender,
  role: a.role, order: a.order, bodyRef: ref(a), availability: 'available', source: 'builtin',
  isDefault: a.characterId === newMale.characterId, rigProfile: a.rigVersion, revision: a.bodyVersion,
  previewUrl: null, description: null,
})) };
let preferences = { version: 'body-preferences.v1', scope: 'installation', mode: 'last_used', revision: 3,
  cards: [{ cardId: 'personal_A', name: '주인공 A', characterId: oldMale.characterId,
    controls: Object.fromEntries(oldMale.shape.controls.map(c => [c.key,c.default])), createdAt: '', updatedAt: '' }],
  lastUsed: null,
  shapeEditable: options.filter(a => a.shape),
};
let selected = { schemaVersion:'body-selection.v1', personIndex:0, intent:'inherit', manualCharacterId:null,
  shape:null, recommendation:{ status:'disabled', body:null, reasonCodes:[] }, resolvedBody:ref(newMale),
  resolvedSource:'catalog_default_fallback', resolutionStatus:'ready', selectionRevision:0,
};
const calls = [], errors = [];
(async () => {
  const browser = await chromium.launch({ executablePath:process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
  const page = await browser.newPage({ viewport:{width:1280,height:900} });
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === root && !url.pathname.startsWith('/v1/')) return route.continue();
    calls.push({method:req.method(),path:url.pathname,body:req.method()==='PUT' ? req.postDataJSON() : undefined});
    const json = (v,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
    if (url.pathname === '/v1/models') return json(modelCatalog);
    if (url.pathname.endsWith('/body-preferences')) {
      if (req.method() === 'PUT') preferences = {...preferences, mode:req.postDataJSON().mode, revision:preferences.revision+1};
      return json(preferences);
    }
    if (url.pathname.endsWith('/body-options')) return json({catalogRevision:catalog.version,characters:options});
    if (url.pathname.endsWith('/body-selection')) {
      if (req.method() === 'PUT') {
        const v = req.postDataJSON(); assert.equal(v.expectedRevision, selected.selectionRevision);
        const a = assets.find(a => a.characterId === v.characterId);
        selected = {...selected,intent:v.intent,manualCharacterId:v.characterId,shape:null,resolvedBody:ref(a),resolvedSource:'manual',selectionRevision:selected.selectionRevision+1};
        preferences = {...preferences,lastUsed:{characterId:a.characterId,controls:null,usedAt:'fixture'}};
      }
      return json(selected);
    }
    const png = assets.find(a => a.neutralPreview && url.pathname === `/v1/models/${a.characterId}/body-preview/${a.neutralPreview.sha256}`);
    if (png) {
      const bytes = fs.readFileSync(png.neutralPreview.path);
      assert.equal(hash(bytes),png.neutralPreview.sha256);
      assert.equal(png.neutralPreview.characterSha256,png.assetSha256);
      return route.fulfill({status:200,contentType:'image/png',body:bytes});
    }
    if (url.pathname.endsWith('/body-previews')) return json({error:{code:'PREVIEW_NOT_READY'}},503);
    if (url.pathname.endsWith('/quality-consent')) return json({personalData:false,contentLicense:false,revision:0});
    if (url.pathname.endsWith('/selections')) return json({selections:[]});
    return json({});
  });
  await page.addInitScript(() => {
    localStorage.setItem('standin.installation.credentials',JSON.stringify({installationId:'layout-fixture',deviceToken:'fixture-only',consentVersion:'2026-08-02'}));
    localStorage.setItem('standin.bodyCustom.expert','0');
  });
  await page.goto(root+'/bar/actions');
  await page.evaluate(async () => {
    const {useInstallationStore} = await import('/src/features/installation/installationStore.ts');
    useInstallationStore.setState({status:'registered',credentials:{installationId:'layout-fixture',deviceToken:'fixture-only',consentVersion:'2026-08-02'}});
  });
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({path:path.join(out,name)}); };
  const navigate = async url => page.evaluate(async url => { const {router}=await import('/src/app/router.tsx'); await router.navigate(url); },url);
  await navigate('/app/models');
  await page.getByRole('button',{name:/주인공 A 이름 변경/}).waitFor();
  assert.equal(await page.getByRole('radio',{name:/마지막으로 쓴 체형/}).isChecked(),true);
  await page.getByRole('heading',{name:'기본 모델',exact:true}).scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'남성',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(newMale.displayName)}).scrollIntoViewIfNeeded();
  await shot('01-body-custom-catalog.png');
  await page.getByRole('button',{name:'여성',exact:true}).click();
  await shot('01b-female-catalog.png');
  await page.getByRole('button',{name:'새 체형 만들기',exact:true}).click();
  await page.getByRole('radiogroup',{name:'시작 체형'}).waitFor();
  assert.ok(await page.getByRole('radio',{name:new RegExp(newMale.displayName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).isChecked());
  await shot('02-new-male-editor.png');
  await page.getByRole('button',{name:'여성',exact:true}).click();
  await page.waitForFunction(id => document.querySelector('[role="radiogroup"][aria-label="시작 체형"] [aria-checked="true"]')?.textContent.includes(id),newFemale.displayName);
  await shot('03-new-female-editor.png');
  // Explicit old base and an existing personal card must keep the old identity.
  await navigate('/app/models/custom?base='+oldFemale.characterId);
  await page.getByRole('radiogroup',{name:'시작 체형'}).waitFor();
  // Router reuses the editor; leave/re-enter to exercise fresh initialization.
  await navigate('/app/models'); await page.getByRole('button',{name:'새 체형 만들기',exact:true}).waitFor();
  await navigate('/app/models/custom?base='+oldFemale.characterId);
  await page.waitForFunction(name => document.querySelector('[role="radiogroup"][aria-label="시작 체형"] [aria-checked="true"]')?.textContent.includes(name),oldFemale.displayName);
  await shot('04-previous-female-editor.png');
  await navigate('/app/models'); await page.getByRole('button',{name:'주인공 A 편집',exact:true}).click();
  await page.waitForFunction(name => document.querySelector('[role="radiogroup"][aria-label="시작 체형"] [aria-checked="true"]')?.textContent.includes(name),oldMale.displayName);
  await page.evaluate(async () => {
    const {poseService}=await import('/src/features/pose-viewer/api/pose.service.ts');
    const analysis = {jobId:'job_layout_fixture',capabilities:{bodyPreviews:true,bodyPreviewAssets:true,refine:false,fbxExport:true,characterSelection:true},
      people:[{index:0,confidence:'high',skeletonState:'valid',skeletonSource:'full_image',coverageClass:'full',fallbackMode:'none',refineAllowed:false,refinableLimbs:[],
        candidates:[1,2,3,4,5].map(n=>({id:'pose-'+n,poseId:'pose-'+n,rank:n,title:'포즈 후보 '+n,tags:[],matchLevel:'high',thumbnailUrl:'',previewImages:[],bvhAvailable:true,bvhUrl:'/v1/pose-candidates/pose-'+n+'/export?jobId=job_layout_fixture&personIndex=0&candidateId=pose-'+n}))}]};
    poseService.analyze=async()=>analysis;
    const {usePoseSelectionStore}=await import('/src/features/pose-viewer/store/poseSelectionStore.ts');
    usePoseSelectionStore.getState().startJob('layout-fixture',null);
    const {useUploadStore}=await import('/src/features/upload/store/uploadStore.ts');
    useUploadStore.getState().setDraft({file:new File(['fixture'],'fixture.png',{type:'image/png'}),source:'file',width:400,height:600,previewUrl:''},'app');
    const {router}=await import('/src/app/router.tsx'); await router.navigate('/app/jobs/layout-fixture');
  });
  await page.getByRole('button',{name:'체형 더보기',exact:true}).click();
  await page.getByRole('radio',{name:new RegExp(newMale.displayName)}).waitFor();
  await page.getByRole('button',{name:/이 포즈 사용하기/}).last().scrollIntoViewIfNeeded();
  await shot('05-fullscreen-body-choice.png');
  const oldRadio = page.getByRole('radio',{name:new RegExp(oldMale.displayName)});
  await oldRadio.click();
  await page.waitForFunction(() => document.querySelector('[role="radiogroup"][aria-label="내 체형과 체형 프리셋"] [aria-checked="true"]')?.textContent.includes('주인공 A'));
  assert.equal(selected.resolvedBody.characterId,oldMale.characterId);
  assert.equal(preferences.lastUsed.characterId,oldMale.characterId);
  await page.setViewportSize({width:720,height:560});
  await navigate('/bar/candidates');
  await page.getByRole('radio',{name:'내 체형 주인공 A',exact:true}).waitFor();
  assert.equal(await page.getByRole('radio',{name:'내 체형 주인공 A',exact:true}).isChecked(),true);
  await shot('06-floating-previous-choice.png');
  await page.getByRole('radio',{name:new RegExp(newMale.displayName)}).click();
  await page.waitForFunction(name => document.querySelector('[role="radiogroup"][aria-label="내 체형과 체형 프리셋"] [aria-checked="true"]')?.textContent.includes(name),newMale.displayName);
  await shot('07-floating-new-default.png');
  const overflow = await page.evaluate(() => ({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth, height:window.innerHeight,scrollHeight:document.documentElement.scrollHeight}));
  assert.ok(overflow.scrollWidth<=overflow.width+1);
  assert.equal(calls.filter(c=>c.method==='PUT'&&c.path.endsWith('/body-preferences')).length,0);
  assert.equal(errors.length,0,errors.join('\n'));
  fs.writeFileSync(path.join(out,'ui-result.json'),JSON.stringify({catalogRevision:catalog.version,catalogSha256:hash(fs.readFileSync(process.env.BODY_UI_CATALOG)),assets:assets.map(a=>({characterId:a.characterId,assetSha256:a.assetSha256,neutralSha:a.neutralPreview?.sha256})),selected,calls,errors,overflow,evidence:'product components + API fixtures + exact catalog neutral PNGs; no real job conversion/download',screenshots:fs.readdirSync(out).filter(f=>f.endsWith('.png'))},null,2));
  await browser.close();
  console.log('UI fixture passed: '+out);
})().catch(e=>{console.error(e);process.exit(1)});
