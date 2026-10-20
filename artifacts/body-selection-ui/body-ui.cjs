const {chromium}=require('playwright');
const fs=require('fs'), crypto=require('crypto'), assert=require('assert/strict');
fs.mkdirSync('/tmp/body-ux-check',{recursive:true});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const body=id=>({bodyId:id,bodyVersion:'1',assetSha256:hash(id),rigVersion:'1',measurementVersion:'1',characterId:id});
const selected=[0,1].map(i=>({schemaVersion:'body-selection.v1',personIndex:i,intent:'inherit',manualCharacterId:null,recommendation:{status:'available',body:body('body-1'),reasonCodes:[]},resolvedBody:body('body-1'),resolvedSource:'auto_recommendation',resolutionStatus:'ready',selectionRevision:0}));
let preferences={version:'body-preferences.v1',scope:'installation',mode:'auto',defaultCharacterId:null,revision:0};
let png, analysisCalls=0;const calls=[],errors=[],downloads=[];
const prefix=i=>'/v1/analysis/jobs/job_fixture/people/'+i;
function manifest(i) {
 const s=selected[i],renderKey=hash(JSON.stringify(s));return {
 schemaVersion:'body-previews.v1',jobId:'job_fixture',personIndex:i,selectionRevision:s.selectionRevision,
 resolvedBody:s.resolvedBody,renderKey,outputScope:'full',status:'renderable',
 runtime:{previewRevision:hash('preview'),modelRevision:hash('model')},
 candidates:[1,2,3,4,5].map(n=>{
 const candidateId='pose-'+n,root=prefix(i)+'/body-previews/'+renderKey+'/'+candidateId;
 return {candidateId,poseId:candidateId,rank:n,sourceBvhSha256:hash(candidateId),
 thumbnailUrl:root+'/png',previewModel:{url:root+'/glb',rotation:[[1,0,0],[0,1,0],[0,0,1]],sourceSha:hash(candidateId),characterId:s.resolvedBody.characterId,characterSha256:s.resolvedBody.assetSha256,modelRevision:hash('model'),previewRevision:hash('preview')}};
 })};
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:720,height:460}});
 page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(15000);
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());}); page.on('requestfailed',r=>console.log('FAILED',r.url(),r.failure()));
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
 await page.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(u.origin==='http://127.0.0.1:1428' && !u.pathname.startsWith('/v1/'))return route.continue();
 calls.push({path:u.pathname,method:req.method(),query:u.search});
 const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
 if(u.pathname.endsWith('/body-preferences')) {
  if(req.method()==='PUT') {const v=req.postDataJSON();preferences={...preferences,mode:v.mode,defaultCharacterId:v.defaultCharacterId,revision:preferences.revision+1};}
  return json(preferences);
 }
 const m=u.pathname.match(/\/people\/(\d+)\/(body-selection|body-options|body-previews)(.*)$/);
 if(m) {
 const i=Number(m[1]);
 if(m[2]==='body-selection') {
  if(req.method()==='PUT') {const v=req.postDataJSON();assert.equal(v.expectedRevision,selected[i].selectionRevision);selected[i]={...selected[i],intent:v.intent,manualCharacterId:v.characterId??null,resolvedBody:body(v.characterId??'body-1'),resolvedSource:v.intent==='manual'?'manual':'auto_recommendation',selectionRevision:selected[i].selectionRevision+1};}
  return json(selected[i]);
 }
 if(m[2]==='body-options')return json({catalogRevision:'fixture',characters:Array.from({length:9},(_,n)=>({characterId:'body-'+(n+1),bodyRef:body('body-'+(n+1)),displayName:'검증 체형 '+(n+1),selectable:true,reasonCodes:[],neutralPreview:{url:'/v1/models/body-'+(n+1)+'/body-preview/'+hash(png),sha256:hash(png),characterSha256:body('body-'+(n+1)).assetSha256,pose:'attention',framing:'body-comparison.v1'}}))});
 const mf=manifest(i);
 if(!m[3])return json(mf);
 if(u.search) throw new Error('new body URL must not receive query parameters');
 if(m[3].endsWith('/glb'))return json({error:{code:'PREVIEW_NOT_READY',message:'fixture PNG fallback'}},503);
 const candidate=mf.candidates.find(c=>c.thumbnailUrl===u.pathname);
 if(!candidate)return json({error:{code:'BODY_PREVIEW_STALE',message:'stale'}},409);
 if(mf.resolvedBody.characterId==='body-2')await new Promise(r=>setTimeout(r,200));
 return route.fulfill({status:200,contentType:'image/png',body:png,headers:{'Access-Control-Expose-Headers':'*',
 'X-Standin-Body-Render-Key':mf.renderKey,'X-Standin-Body-Revision':String(mf.selectionRevision),
 'X-Standin-Character-SHA256':mf.resolvedBody.assetSha256,'X-Standin-Source-BVH-SHA256':candidate.sourceBvhSha256,
 'X-Standin-Preview-Revision':mf.runtime.previewRevision,'X-Standin-Model-Revision':mf.runtime.modelRevision,'X-Standin-Artifact-SHA256':hash(png)}});
 }
 if(u.pathname.includes('/body-preview/'))return route.fulfill({status:200,contentType:'image/png',body:png});
 if(u.pathname.endsWith('/framed')){
 const i=Number(u.searchParams.get('personIndex')),s=selected[i],bytes=Buffer.from('FBX-fixture-'+s.resolvedBody.characterId),key=hash(JSON.stringify([s,u.searchParams.get('candidateId')]));
 if(u.searchParams.get('bodySelectionRevision')!==String(s.selectionRevision))return json({error:{code:'BODY_PREVIEW_STALE',message:'stale'}},409);
 const headers={'Access-Control-Expose-Headers':'*','X-Standin-Review-Key':key,'X-Standin-Artifact-SHA256':hash(bytes),'X-Standin-Body-Revision':String(s.selectionRevision),'X-Standin-Character-SHA256':s.resolvedBody.assetSha256};
 if(u.searchParams.get('format')==='fbx'){
 assert.equal(u.searchParams.get('reviewKey'),key);downloads.push(s.resolvedBody.characterId);
 return route.fulfill({status:200,contentType:'application/octet-stream',body:bytes,headers});
 }
 return route.fulfill({status:200,contentType:'image/png',body:png,headers});
 }
 if(u.pathname==='/v1/analysis/jobs' && req.method()==='POST')analysisCalls++;
 return json({});
 });
 await page.addInitScript(()=>localStorage.setItem('standin.installation.credentials',JSON.stringify({installationId:'local-fixture',deviceToken:'fixture-token',consentVersion:'2026-08-02'})));
 await page.goto('http://127.0.0.1:1428/bar/actions',{waitUntil:'domcontentloaded'}); console.log('opened'); await page.waitForFunction(async()=>{const {useInstallationStore}=await import('/src/features/installation/installationStore.ts');return useInstallationStore.getState().status==='registered';});
 const data=await page.evaluate(()=>{
 const c=document.createElement('canvas');c.width=240;c.height=320;const x=c.getContext('2d');x.fillStyle='#f5f7f9';x.fillRect(0,0,240,320);
 x.fillStyle='#d8d2c8';x.beginPath();x.arc(120,55,21,0,7);x.fill();x.fillRect(89,83,62,98);
 x.strokeStyle='#b9b6b0';x.lineWidth=18;x.lineCap='round';x.beginPath();x.moveTo(87,95);x.lineTo(76,180);x.moveTo(153,95);x.lineTo(164,180);x.moveTo(104,175);x.lineTo(99,282);x.moveTo(137,175);x.lineTo(142,282);x.stroke();
 x.fillStyle='#667085';x.font='12px sans-serif';x.fillText('QA fixture · not actual FBX',36,311);return c.toDataURL('image/png').split(',')[1];
 });png=Buffer.from(data,'base64');
 await page.evaluate(async()=>{
 const {modelsService}=await import('/src/features/models/api/models.service.ts');
 modelsService.list=async()=>({origin:'server',defaultCharacterId:'body-1',characters:Array.from({length:9},(_,i)=>({characterId:'body-'+(i+1),displayName:'검증 체형 '+(i+1),gender:'unspecified',availability:'available',source:'builtin',isDefault:i===0,rigProfile:'test',revision:'1',previewUrl:null,description:null,bodyRef:{characterId:'body-'+(i+1)}}))});
 const {poseService}=await import('/src/features/pose-viewer/api/pose.service.ts');
 poseService.analyze=async()=>({jobId:'job_fixture',capabilities:{bodyPreviews:true,bodyPreviewAssets:true,refine:false,fbxExport:true,characterSelection:true},people:[0,1].map(index=>({index,confidence:'high',skeletonState:'valid',skeletonSource:'full_image',coverageClass:'full',fallbackMode:'none',refineAllowed:false,refinableLimbs:[],candidates:[1,2,3,4,5].map(n=>({id:'pose-'+n,poseId:'pose-'+n,rank:n,title:'포즈 후보 '+n,tags:[],matchLevel:'high',thumbnailUrl:'',previewImages:[],bvhAvailable:true,bvhUrl:'/v1/pose-candidates/pose-'+n+'/export?jobId=job_fixture&personIndex='+index+'&candidateId=pose-'+n}))}))});
 const {exportService}=await import('/src/features/export/api/export.service.ts');
 exportService.getDefaultFolder=async()=>'/fixture-only';exportService.saveCandidates=async({files})=>{window.__saved=files.map(f=>new TextDecoder().decode(f.content));return files.map(f=>({path:'/fixture-only/'+f.fileName}));};
 const {usePoseSelectionStore:s}=await import('/src/features/pose-viewer/store/poseSelectionStore.ts');s.getState().startJob('fixture-local','legacy-wrong-body');
 const {useUploadStore:u}=await import('/src/features/upload/store/uploadStore.ts');u.getState().setDraft({file:new File(['fixture'],'fixture.png',{type:'image/png'}),source:'file',width:400,height:600,previewUrl:''},'bar');
 const {router}=await import('/src/app/router.tsx');await router.navigate('/bar/candidates');
 });
  await page.locator('[data-pose-candidate]').first().waitFor().catch(async e=>{console.log('DOM',await page.locator('body').innerText());throw e;}); console.log('cards');
 await page.waitForFunction(()=>!document.querySelector('[data-pose-candidate]')?.disabled);
 await page.getByRole('button',{name:'체형 더보기',exact:true}).click();
 await page.getByRole('button',{name:'검증 체형 2',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="인물 1 체형 선택"] button[aria-pressed="true"]')?.textContent.includes('체형 2'));
 await page.getByRole('button',{name:'검증 체형 3',exact:true}).click();
 await page.getByRole('button',{name:'이 체형으로 확정',exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='이 체형으로 확정'&&!b.disabled));
 await page.screenshot({path:'/tmp/body-ux-check/body-panel-open.png'});
 await page.getByRole('button',{name:'이 체형으로 확정',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'체형 더보기',exact:true}).getAttribute('aria-expanded'),'false');
 await page.locator('[data-pose-candidate]').nth(2).click();
 await page.getByRole('button',{name:'다음 인물',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('[data-pose-candidate]')?.disabled);
 await page.locator('[data-pose-candidate]').first().click();
 assert.equal(selected[0].resolvedBody.characterId,'body-3');assert.equal(selected[1].resolvedBody.characterId,'body-1');
 const footer=await page.locator('[data-body-next]').boundingBox();assert(footer.y+footer.height<=460);
 await page.screenshot({path:'/tmp/body-ux-check/body-bar-ready.png'});
 await page.getByRole('button',{name:'앱 창으로 열기',exact:true}).click();
 await page.setViewportSize({width:1280,height:800});
 await page.getByRole('button',{name:'이 포즈 사용하기',exact:false}).waitFor();
 assert.equal(await page.locator('[data-pose-candidate][aria-pressed=true]').count(),2);
 await page.screenshot({path:'/tmp/body-ux-check/body-app-ready.png'});
 await page.getByRole('button',{name:'이 포즈 사용하기',exact:false}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('이 포즈로 저장')&&!b.disabled));
 await page.getByRole('button',{name:'이 포즈로 저장',exact:false}).click();
 await page.waitForFunction(()=>window.__saved?.length===2);
 const saved=await page.evaluate(()=>window.__saved);assert.deepEqual(saved.sort(),['FBX-fixture-body-1','FBX-fixture-body-3']);
 await page.evaluate(async()=>{const {router}=await import('/src/app/router.tsx');await router.navigate('/app/models');});
 await page.getByRole('radio',{name:'자동 추천 (기본)',exact:true}).waitFor();
 await page.getByRole('combobox').selectOption('body-6');
 await page.waitForFunction(()=>document.querySelector('select')?.value==='body-6');
 assert.equal(preferences.mode,'auto');
 await page.getByRole('radio',{name:'내 기본 체형으로 시작',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('input[type=radio]')].some(e=>e.checked&&e.parentElement.textContent.includes('내 기본')));
 assert.equal(preferences.mode,'fixed_default');assert.equal(selected[0].resolvedBody.characterId,'body-3');
 await page.screenshot({path:'/tmp/body-ux-check/body-preferences.png'});
 const beforeDownloads=downloads.length;
 await page.evaluate(async()=>{
  const {queryClient}=await import('/src/app/queryClient.ts');queryClient.removeQueries({predicate:q=>q.queryKey[0]==='body'&&q.queryKey[4]==='review'});
  const {useExportStore}=await import('/src/features/export/store/exportStore.ts');useExportStore.getState().clearError();
  const {router}=await import('/src/app/router.tsx');await router.navigate('/app/jobs/fixture-local/save');
 });
 await page.getByRole('button',{name:'체형·포즈 다시 확인',exact:true}).waitFor();
 assert.equal(downloads.length,beforeDownloads);
 assert.equal(analysisCalls,0);assert.equal(errors.length,0);
 fs.writeFileSync('/tmp/body-ux-check/body-ui-result.json',JSON.stringify({fixture:true,realFbx:false,checks:['9 cards','rapid body 2→3 latest wins','all images ready','confirm collapses','person isolation','pose preserved across bar/app','fixed footer at 720×460','final review fingerprint','saved body 3 and body 1','no analyze request','preferences auto/fixed explicit and existing job unchanged','direct save without review blocked'],saved,downloads,errors,requests:calls},null,2));
 console.log(JSON.stringify({saved,downloads,errors,requestCount:calls.length}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
