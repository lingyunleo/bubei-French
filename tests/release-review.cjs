/* Formal release checks. All browser data is synthetic, in fresh ephemeral profiles. */
const paths = require('./paths.cjs');
const {launchBrowser}=require('./runtime.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const releaseConfig = paths.releaseConfig;
const version = releaseConfig.version, previousVersion = releaseConfig.previousVersion || 'provided';
const release = paths.releaseFile;
const oldRelease = paths.previousRelease;
const out = path.join(paths.runRoot, '正式发布');
fs.mkdirSync(out, {recursive:true});
const checks = [], errors = [], requests = [];
const legacyReport={status:oldRelease?'not-run':'skipped',file:oldRelease,requested:paths.previousReleaseRequested,checks:[],reason:oldRelease?null:paths.previousReleaseRequested?'CARNET_PREVIOUS_RELEASE file is unavailable.':'No previous release supplied; current-release and synthetic V2 migration checks do not need it.'};
fs.writeFileSync(path.join(out,'optional-previous-release.json'),JSON.stringify(legacyReport,null,2));
const pass = name => { checks.push(name); console.log('PASS', name); };
let browser;
async function pageIn(context, file=release) {
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error=>errors.push(error.message));
  page.on('request', request=>{if(/^https?:/.test(request.url())) requests.push(request.url());});
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(()=>window.VocabApp);
  if(file===release) {
    await page.waitForFunction(()=>window.VocabCarnetProduct && window.VocabCarnetReview);
    await page.evaluate(()=>VocabCarnetProduct.ready);
    await page.waitForFunction(()=>document.querySelector('.carnet-loading')?.hidden);
  }
  return page;
}
async function newContext(mobile=false) {
  return browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',acceptDownloads:true});
}
async function app(page, view) {
  await page.evaluate(view=>VocabCarnetReview.show(view),view);
  await page.waitForFunction(()=>document.body.dataset.carnetView==='app');
}
async function capture(page, name) { await page.screenshot({path:path.join(out,name+'.png')}); }
async function saved(page) {
  await page.evaluate(()=>VocabCarnetProduct.suspend());
  await page.waitForFunction(async()=>{
    const current=VocabApp.getState(), persisted=(await VocabData.load()).state;
    return current.revision===persisted.revision && JSON.stringify(current.session)===JSON.stringify(persisted.session);
  });
}
function compareRecords(actual, expected) {
  for(const key of ['decks','cards','skills','events','contexts','aliases','trash','session']) assert.deepEqual(actual[key],expected[key],key);
}
async function importBackup(page, payload, name='synthetic-v4.json') {
  await app(page,'settings');
  await page.locator('#backup-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
  await page.locator('[data-action=commit-restore]').click();
  await page.waitForFunction(()=>!document.getElementById('modal').open);
}
async function actualBackup(page) {
  const pending=page.waitForEvent('download');
  await page.evaluate(()=>VocabApp.exportBackup(false));
  const downloaded=await pending, file=path.join(out,'正式版测试备份.json');
  await downloaded.saveAs(file);
  assert.doesNotMatch(downloaded.suggestedFilename(),/ATELIER|CARNET|实验/);
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

(async()=>{
  assert.ok(fs.existsSync(release),'The real final release must already be built.');
  browser=await launchBrowser('Chromium');
  const context=await newContext(), page=await pageIn(context);
  let startup=await page.evaluate(()=>VocabCarnetProduct.getStartup());
  assert.equal(startup.needsOnboarding,true);assert.equal(startup.persistent,true);assert.equal(startup.hasWords,false);
  const markers=await page.evaluate(()=>({version:window.VOCAB_RELEASE,preview:window.CARNET_PREVIEW,key:VocabData.KEY,db:VocabData.DB_NAME,title:document.title,author:document.querySelector('meta[name=author]')?.content}));
  assert.equal(markers.version,version);assert.equal(markers.preview,false);assert.equal(markers.key,'FR_VOCAB_APP_V4');assert.equal(markers.db,'FR_VOCAB_DATA_V4');assert.ok(markers.title.includes(version));assert.doesNotMatch(markers.title,/实验|验收/);assert.equal(markers.author,'凌云_Léo');assert.equal(await page.locator('#carnet-preview-bar').count(),0);
  pass('Final file boots as '+version+' with formal V4 storage keys, original author and no development preview controls');
  for(const n of [0,1,2,3.25,4,5,6,7,2,7]) { await page.evaluate(n=>VocabCarnetReview.jump(n,true),n); await page.waitForTimeout(80); }
  assert.equal(await page.locator('.carnet-stepper button').count(),7);
  if(!await page.locator('.carnet-pace').evaluate(el=>el.open))await page.locator('.carnet-pace summary').click();
  await page.locator('input[name=carnet-pace][value=false]').check();
  await page.locator('[data-lesson-action=finish]').click();
  await page.waitForFunction(()=>document.body.dataset.carnetView==='app');
  let state=await page.evaluate(()=>VocabApp.getState());
  assert.equal(state.decks.length,1);assert.equal(state.decks[0].words.length,50);assert.equal(Object.values(state.contexts).flat().length,100);assert.equal(state.events.length,0);assert.equal(state.settings.onboardingComplete,true);assert.equal(state.settings.dailyGoalEnabled,false);
  await page.reload();await page.waitForFunction(()=>window.VocabCarnetProduct&&document.body.dataset.carnetView==='app');
  assert.equal(await page.evaluate(()=>VocabApp.getState().decks[0].words.length),50);
  pass('All seven guide chapters support jumps in both directions; actual final CTA saves the starter library and preferences and skips onboarding after reload');
  for(const design of ['classic','atelier','verdure']) for(const mode of ['light','dark']) {
    await page.evaluate(value=>VocabCarnetProduct.setAppearance(value),{design,mode,motion:'reduced'});
    assert.deepEqual(await page.evaluate(()=>VocabCarnetProduct.getAppearance()),{design,mode,motion:'reduced'});
    await capture(page,'桌面-'+design+'-'+mode);
  }
  for(const view of ['library','contexts','settings','today']) {
    await app(page,view);assert.equal(await page.evaluate(()=>VocabApp.getView()),view);
    assert.doesNotMatch(await page.locator('#app').innerText(),/双主题实验版|CARNET 实验版|视觉验收/);
  }
  await app(page,'settings');assert.match(await page.locator('.about-section').innerText(),/凌云_Léo/);
  pass('Six appearances render in the real app; today/library/examples/settings keep formal branding and original author');
  await page.evaluate(()=>VocabApp.begin('learn',{replace:true,limit:2}));
  let current=await page.evaluate(()=>VocabEngine.current(VocabApp.getState()));
  assert.equal(await page.evaluate(()=>VocabApp.getState().settings.listening),true);
  assert.equal(current.kind,'listening-choice');
  const beforeAnswer=await page.evaluate(()=>VocabApp.getState());
  await page.locator('[data-action=choice][data-id="'+current.word.id+'"]').click();
  await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).answered);
  await page.locator('[data-action=undo]').click();
  await page.waitForFunction(()=>!VocabEngine.current(VocabApp.getState()).answered);
  state=await page.evaluate(()=>VocabApp.getState());assert.deepEqual(state.cards,beforeAnswer.cards);assert.deepEqual(state.events,beforeAnswer.events);
  pass('New-user listening choice is enabled; answering and Undo retain original judging and restore card/event state');
  await page.evaluate(()=>VocabApp.begin('spelling',{replace:true,wordIds:[VocabApp.getState().decks[0].words[0].id],limit:1}));
  await page.locator('#spell-input').fill('épreuve en cours');
  await page.locator('#spell-input').evaluate(e=>{e.focus();e.setSelectionRange(2,4)});
  const sessionId=await page.evaluate(()=>VocabApp.getState().session.id);
  await page.evaluate(()=>VocabCarnetProduct.setAppearance({design:'classic',mode:'light',motion:'standard'}));
  assert.equal(await page.locator('#spell-input').inputValue(),'épreuve en cours');assert.deepEqual(await page.locator('#spell-input').evaluate(e=>[e.selectionStart,e.selectionEnd]),[2,4]);
  await app(page,'today');await app(page,'spelling');assert.equal(await page.locator('#spell-input').inputValue(),'épreuve en cours');
  await saved(page);await page.reload();await page.waitForFunction(()=>window.VocabCarnetProduct&&document.body.dataset.carnetView==='app');await app(page,'spelling');
  assert.equal(await page.evaluate(()=>VocabApp.getState().session.id),sessionId);assert.equal(await page.locator('#spell-input').inputValue(),'épreuve en cours');
  pass('Theme switch, pause/resume and reload preserve ongoing spelling session and text; theme switch preserves selection');
  const beforeWrong=await page.evaluate(()=>VocabApp.getState());await page.locator('#spell-input').fill('wrong');await page.locator('[data-action=check-spelling]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).answered);assert.equal(await page.evaluate(()=>VocabEngine.current(VocabApp.getState()).feedback.next),'retry');
  await page.locator('[data-action=undo]').click();await page.waitForFunction(()=>!VocabEngine.current(VocabApp.getState()).answered);state=await page.evaluate(()=>VocabApp.getState());assert.deepEqual(state.skills,beforeWrong.skills);assert.deepEqual(state.cards,beforeWrong.cards);assert.deepEqual(state.events,beforeWrong.events);
  await page.locator('#spell-input').fill('wrong');await page.locator('[data-action=check-spelling]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).answered);await page.locator('[data-action=next]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).correction);current=await page.evaluate(()=>VocabEngine.current(VocabApp.getState()));await page.locator('#spell-input').fill(current.word.spell);await page.locator('[data-action=check-spelling]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).answered);assert.equal(await page.evaluate(()=>VocabEngine.current(VocabApp.getState()).feedback.independent),false);assert.equal(await page.evaluate(()=>VocabApp.getState().session.completedIds.length),0);
  await page.locator('[data-action=next]').click();await page.waitForFunction(()=>!VocabEngine.current(VocabApp.getState()).answered);current=await page.evaluate(()=>VocabEngine.current(VocabApp.getState()));assert.equal(current.correction,false);await page.locator('#spell-input').fill(current.word.spell);await page.locator('[data-action=check-spelling]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).answered);assert.equal(await page.evaluate(()=>VocabEngine.current(VocabApp.getState()).feedback.independent),true);
  pass('Spelling error Undo, immediate correction and later-round independent pass retain existing engine semantics');
  await page.evaluate(()=>VocabApp.begin('spelling',{replace:true,wordIds:[VocabApp.getState().decks[0].words[1].id],limit:1}));await page.locator('#spell-input').fill('portable & sauvegarde');await saved(page);
  const expected=await page.evaluate(()=>VocabApp.getState());
  const backup=await actualBackup(page);assert.equal(backup.version,4);compareRecords(backup.state,expected);
  const restoreContext=await newContext(), restorePage=await pageIn(restoreContext);await importBackup(restorePage,backup);const restored=await restorePage.evaluate(()=>VocabApp.getState());compareRecords(restored,expected);assert.equal(restored.settings.onboardingComplete,true);await app(restorePage,'spelling');assert.equal(await restorePage.locator('#spell-input').inputValue(),'portable & sauvegarde');
  pass('Actual JSON backup download remains V4 and restores complete state and ongoing input through the ordinary restore UI');
  await app(page,'settings');await page.locator('.data-tools').evaluate(e=>e.open=true);const pending=page.waitForEvent('download');await page.locator('[data-action=portable]').click();const download=await pending,portable=path.join(out,'便携正式版测试.html');await download.saveAs(portable);assert.doesNotMatch(download.suggestedFilename(),/ATELIER|CARNET|实验/);assert.ok(download.suggestedFilename().includes(version));
  const portableContext=await newContext(), portablePage=await pageIn(portableContext,portable);await portablePage.waitForFunction(()=>window.VocabCarnetProduct&&document.body.dataset.carnetView==='app');assert.equal(await portablePage.evaluate(()=>window.VOCAB_RELEASE),version);assert.equal(await portablePage.evaluate(()=>window.CARNET_PREVIEW),false);assert.doesNotMatch(await portablePage.title(),/实验|验收/);compareRecords(await portablePage.evaluate(()=>VocabApp.getState()),expected);await app(portablePage,'spelling');assert.equal(await portablePage.locator('#spell-input').inputValue(),'portable & sauvegarde');
  pass('Actual exported portable HTML reopens with formal release identity and all words/events/progress/session/draft intact');
  await portablePage.reload();await portablePage.waitForFunction(()=>window.VocabApp&&document.getElementById('modal').open);assert.match(await portablePage.locator('#modal-title').innerText(),/预览备份恢复/);assert.equal(await portablePage.evaluate(()=>VocabApp.getState().decks.length),1);
  pass('Reopening portable with existing local library requests confirmation instead of overwriting');
  if (oldRelease) {
  legacyReport.status='running';
  const legacyStart=checks.length;
  const oldContext=await newContext(), oldPage=await pageIn(oldContext,oldRelease);
  const oldBackup=await oldPage.evaluate(async()=>{
    let state=VocabData.importEntries(VocabData.fresh(),VocabSeed.slice(0,5),{name:'旧正式版 · 合成升级样本',mode:'new'}).state;
    state.settings.onboardingComplete=true;state.settings.autoWord=false;state.settings.autoExample=false;state.settings.dailyGoalEnabled=false;
    const bytes=new Uint8Array(52),v=new DataView(bytes.buffer),ascii=(n,s)=>[...s].forEach((c,i)=>bytes[n+i]=c.charCodeAt(0));
    ascii(0,'RIFF');v.setUint32(4,44,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,8,true);
    const audioId=await AudioKit.importAudio(new File([bytes],'release-test-silence.wav',{type:'audio/wav'}));
    const word=state.decks[0].words[0],example=structuredClone(VocabSeed[0].contexts[0]);state.contexts[word.id]=[{...example,id:'release-old-example',favorite:true,type:'human',audioId,audioUrl:'',source:'项目合成测试静音',license:'项目自编验证样本'}];
    VocabEngine.start(state,'learn',{limit:1},Date.now()-60000);let current=VocabEngine.current(state);VocabEngine.answer(state,{choice:current.word.id},Date.now()-59000);VocabEngine.next(state);VocabEngine.reveal(state);VocabEngine.answer(state,{rating:3},Date.now()-58000);
    VocabEngine.start(state,'spelling',{replace:true,wordIds:[state.decks[0].words[1].id],limit:1});state.session.draft={typed:'ancienne saisie'};
    const saved=await VocabData.save(state,{expectedRevision:0}),backup=VocabData.exportBackup(saved.state);backup.media=await AudioKit.exportMedia([audioId]);backup.mediaIncluded=true;return backup;
  });
  const upgradePage=await pageIn(oldContext);
  const upgraded=await upgradePage.evaluate(()=>VocabApp.getState());
  compareRecords(upgraded,oldBackup.state);assert.equal(upgraded.settings.onboardingComplete,true);assert.equal(await upgradePage.evaluate(()=>VocabCarnetProduct.getStartup().needsOnboarding),false);await app(upgradePage,'spelling');assert.equal(await upgradePage.locator('#spell-input').inputValue(),'ancienne saisie');await saved(upgradePage);
  pass('Same isolated browser reads prior '+previousVersion+' formal storage directly without losing words, progress, events, favorites or unfinished spelling');
  const legacyAudioId=oldBackup.media[0].id;
  assert.equal(await upgradePage.evaluate(id=>AudioKit.hasAudio(id),legacyAudioId),true);
  const oldAudio=await upgradePage.evaluate(id=>AudioKit.exportMedia([id]),legacyAudioId);assert.deepEqual(oldAudio,oldBackup.media);
  const dbNames=await upgradePage.evaluate(async()=> (await indexedDB.databases()).map(db=>db.name));assert.ok(dbNames.includes('FR_VOCAB_MEDIA_V4'));assert.equal(dbNames.includes('FR_VOCAB_ATELIER_MEDIA_V4'),false);
  pass('Prior formal local audio bytes and IDs remain accessible through FR_VOCAB_MEDIA_V4 without opening the experimental media database');
  const oldRestoreContext=await newContext(), oldRestorePage=await pageIn(oldRestoreContext);await importBackup(oldRestorePage,oldBackup,'synthetic-'+previousVersion+'.json');compareRecords(await oldRestorePage.evaluate(()=>VocabApp.getState()),oldBackup.state);
  const restoredAudio=await oldRestorePage.evaluate(id=>AudioKit.exportMedia([id]),legacyAudioId);
  assert.equal(restoredAudio.length,oldBackup.media.length);
  for(let index=0;index<oldBackup.media.length;index++)for(const [key,value] of Object.entries(oldBackup.media[index]))assert.deepEqual(restoredAudio[index][key],value);
  pass('Previous formal version V4 backup also migrates through file restore for browsers that isolate local-file storage');
  legacyReport.status='passed';legacyReport.checks=checks.slice(legacyStart);
  } else { console.log('SKIP optional previous-release comparison: '+legacyReport.reason); }
  fs.writeFileSync(path.join(out,'optional-previous-release.json'),JSON.stringify(legacyReport,null,2));
  const mobileContext=await newContext(true), mobile=await pageIn(mobileContext);await mobile.evaluate(()=>VocabCarnetReview.jump(7,true));await mobile.locator('[data-lesson-action=finish]').click();await mobile.waitForFunction(()=>document.body.dataset.carnetView==='app');
  for(const view of ['today','library','contexts','settings','spelling']) {
    await app(mobile,view);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view+' horizontal overflow');await capture(mobile,'手机-'+view);
  }
  assert.equal(await mobile.locator('.shortcut-hint:visible,.key-hint:visible,kbd:visible').count(),0);
  await mobile.locator('#spell-input').fill('saisie mobile');await mobile.evaluate(()=>VocabCarnetProduct.setAppearance({design:'classic',mode:'dark'}));assert.equal(await mobile.locator('#spell-input').inputValue(),'saisie mobile');
  pass('390px touch layout has no horizontal overflow in five app routes, hides shortcut hints and keeps spelling input across theme change');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);pass('All actual standalone files execute without uncaught page errors or network requests');
  fs.writeFileSync(path.join(out,'发布回归检查.json'),JSON.stringify({release,oldRelease,legacyCoverage:legacyReport,browser:browser.version(),checkedAt:new Date().toISOString(),checks,errors,requests,method:'Fresh isolated Chromium contexts; synthetic starter fixtures; optional previous-release coverage is reported separately; no real browser profile or user records.',limitations:['Desktop Chrome and a 390px touch emulation were tested. Physical iOS/Android devices and audible speech quality were not tested.']},null,2));
  await browser.close();console.log('DONE',checks.length,out);
})().catch(async error=>{if(legacyReport.status==='running'){legacyReport.status='failed';legacyReport.error=error.message;fs.writeFileSync(path.join(out,'optional-previous-release.json'),JSON.stringify(legacyReport,null,2));}fs.writeFileSync(path.join(out,'发布回归检查-失败.json'),JSON.stringify({release,oldRelease,checks,errors,requests,error:error.stack},null,2));console.error(error);await browser?.close();process.exitCode=1;});
