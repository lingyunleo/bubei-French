/* Settings-only guide regression. Fresh browser contexts and generated words only.
   Run after building the formal HTML. Also checks the separate src/index.html preview.
   CARNET_BROWSERS, CARNET_RELEASE_HTML and runtime.cjs browser overrides are supported. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const paths = require('./paths.cjs');
const {launchBrowser} = require('./runtime.cjs');
const file = paths.releaseFile;
const out = path.join(paths.runRoot, '引导设置读取专项');
fs.mkdirSync(out, {recursive:true});
const report = {
  file, sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'), previewFile:path.join(paths.sourceRoot, 'index.html'), checks:[], errors:[], samples:[],
  fixture:{decks:2, wordsPerDeck:2400, source:'Generated test labels, meanings and examples; no personal vocabulary or backups.'},
  instrumentation:[
    'VocabApp.getState/getSettings wrappers count calls without replacing the returned data or implementation.',
    'Native Node.textContent setter is observed for unchanged writes to the guide next button, fallback note and loading label.',
    'AudioKit.speak alone is replaced when checking reader/lesson rate and voice arguments; real speech output and installed voices are not validated.',
    'Regional language tags are assigned to document.documentElement.lang because saved language options are zh/en/fr.',
    'Large vocabulary is generated through the production import/validation API and saved in a fresh browser context. Preview retains its built-in memory-only sample.',
    'Learning-record comparisons include draft text and task state but omit draft.selection, transient caret metadata that may change when a rendered input receives focus.',
  ],
  untested:['Physical devices, native on-screen keyboards, audible speech output and installed system voices.'],
};
let browser;
function pass(engine, name) { report.checks.push({engine,name}); console.log('PASS', engine, name); }
function instrumentation() {
  const audit = window.__onboardingAudit = {enabled:true, getState:0, getSettings:0, unchangedText:0, textWrites:0, stacks:[], started:performance.now()};
  let app;
  Object.defineProperty(window, 'VocabApp', {configurable:true, get:()=>app, set:value=>{
    app=value;
    for(const name of ['getState','getSettings']) {
      if(typeof value[name]!=='function') continue;
      const original=value[name];
      value[name]=function(...args) {
        if(audit.enabled) { audit[name]++; if(name==='getState'&&audit.stacks.length<3) audit.stacks.push(new Error().stack); }
        return original.apply(this,args);
      };
    }
  }});
  const native=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');
  Object.defineProperty(Node.prototype,'textContent',{...native,set(value){
    if(audit.enabled&&this.nodeType===1&&this.matches('.carnet-story-next,.carnet-fallback-note,.carnet-loading span')) {
      audit.textWrites++;
      if(native.get.call(this)===String(value??'')) audit.unchangedText++;
    }
    native.set.call(this,value);
  }});
  window.__auditRead = callback => { const enabled=audit.enabled; audit.enabled=false; try {return callback();} finally {audit.enabled=enabled;} };
}
async function ready(page) {
  await page.waitForFunction(()=>window.VocabApp&&window.VocabCarnetReview&&window.VocabCarnetProduct);
  await page.evaluate(()=>VocabCarnetProduct.ready);
  await page.waitForFunction(()=>window.VocabCarnetReview.getState().lessons&&document.querySelector('.carnet-loading')?.hidden,null,{timeout:90000});
  await frames(page);
}
async function frames(page,n=3) {
  await page.evaluate(n=>new Promise(resolve=>{const tick=()=>--n<=0?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}),n);
}
async function boot(engine, preview=false) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
  await context.addInitScript(instrumentation);
  const page=await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.errors.push({engine,message:error.message}));
  await page.goto(pathToFileURL(preview?report.previewFile:file).href); await ready(page);
  return page;
}
async function resetAudit(page) {
  await page.evaluate(()=>Object.assign(__onboardingAudit,{enabled:true,getState:0,getSettings:0,unchangedText:0,textWrites:0,stacks:[],started:performance.now()}));
}
async function auditSample(page,engine,phase) {
  const sample=await page.evaluate(()=>({...__onboardingAudit,elapsedMs:Math.round(performance.now()-__onboardingAudit.started)}));
  delete sample.enabled; delete sample.started; report.samples.push({engine,phase,...sample});
  assert.equal(sample.getState,0,phase+': guide must not clone complete learning state; '+sample.stacks.join('\n'));
  assert.equal(sample.unchangedText,0,phase+': unchanged hot-path text must not be rewritten');
  return sample;
}
async function chapter(page,n) {
  await page.evaluate(n=>VocabCarnetReview.jump(n,true),n); await frames(page);
}
async function show(page,view) {
  await page.evaluate(view=>VocabCarnetReview.show(view,view==='journey'?{fromStart:true}:{}),view); await frames(page);
}
async function state(page) {return page.evaluate(()=>__auditRead(()=>VocabApp.getState()));}
async function copyChecks(page,engine) {
  const result=await page.evaluate(()=>__auditRead(()=>{
    if(typeof VocabApp.getSettings!=='function'||typeof VocabCarnetProduct.getSettings!=='function') return {available:false};
    const initial=VocabApp.getState(), baseline=JSON.stringify(initial), expected=JSON.stringify(initial.settings);
    if(window.CARNET_PREVIEW&&typeof window.VocabCarnetPreview?.getSettings!=='function') return {available:false};
    const readers=[()=>VocabApp.getSettings(),()=>VocabCarnetProduct.getSettings()];
    if(window.CARNET_PREVIEW) readers.push(()=>VocabCarnetPreview.getSettings());
    for(const get of readers) {
      const settings=get();
      if(JSON.stringify(settings)!==expected||'decks' in settings) return {available:true,settingsMatch:false};
      settings.language='mutated'; settings.themeByDesign.classic='mutated'; settings.studyDeckIds.push('mutated');
    }
    initial.settings.themeByDesign.classic='mutated'; initial.settings.studyDeckIds.push('mutated');
    initial.decks[0].words[0].meaning='mutated'; initial.decks.push({id:'mutated'}); initial.cards.mutated={}; initial.events.push({mutated:true});
    if(initial.session) { initial.session.draft={typed:'mutated'}; if(initial.session.current)initial.session.current.wordId='mutated'; }
    const skill=Object.values(initial.skills)[0]; if(skill?.spelling)skill.spelling.attempts=-999;
    if(initial.events[0])initial.events[0].wordId='mutated';
    const fromBridge=VocabCarnetProduct.getState(); fromBridge.decks[0].words[0].french='mutated';
    return {available:true,settingsMatch:true,isolated:JSON.stringify(VocabApp.getState())===baseline};
  }));
  assert.deepEqual(result,{available:true,settingsMatch:true,isolated:true});
  pass(engine,'App and product settings readers return independent nested settings; both full-state readers retain independent learning snapshots');
}
async function seedLarge(page) {
  const result=await page.evaluate(async()=>{
    let next=VocabData.fresh();
    for(let deck=0;deck<2;deck++) {
      const entries=Array.from({length:2400},(_,index)=>({
        french:deck===0&&index<2?['lire','livre'][index]:'mot simulé '+deck+' '+index,
        meaning:'自编性能测试条目 '+deck+' / '+index+'。'+'这是一条隔离的测试释义，用来检查大词库下的设置读取和文案刷新。'.repeat(18),
        pos:'n.', example:'Un exemple inventé pour vérifier la lecture des préférences.', exampleZh:'仅用于本次自动检查的自编例句。',
      }));
      next=VocabData.importEntries(next,entries,{name:'Synthetic settings audit '+deck,mode:'new'}).state;
    }
    Object.assign(next.settings,{onboardingComplete:false,autoWord:false,autoExample:false,listening:false,rate:.77,voiceURI:'audit-voice-a',dailyGoal:23,newBatch:7});
    next.settings.studyDeckIds=next.decks.map(deck=>deck.id);
    const saved=await VocabData.save(next,{expectedRevision:0});
    return {persistent:saved.persistent,words:saved.state.decks.reduce((n,d)=>n+d.words.length,0),jsonBytes:new TextEncoder().encode(JSON.stringify(saved.state)).length};
  });
  assert.equal(result.persistent,true); assert.equal(result.words,4800);
  return result;
}
async function scrollChapters(page,engine,phase) {
  await resetAudit(page);
  for(const n of [0,1,2,3,4,5,6,7,6,5,4,3,2,1,0]) {
    await chapter(page,n);
    const actual=await page.evaluate(()=>VocabCarnetReview.getState().activeStep);
    assert.equal(actual,n,'Chapter '+n+' active step');
  }
  await page.mouse.move(700,700);
  for(let n=0;n<12;n++) {await page.mouse.wheel(0,55);await frames(page,2);}
  for(let n=0;n<12;n++) {await page.mouse.wheel(0,-55);await frames(page,2);}
  await auditSample(page,engine,phase);
}
async function languageChecks(page,engine) {
  for(const language of ['zh','en','fr']) {
    await resetAudit(page);
    await page.evaluate(async language=>{
      VocabCarnetProduct.beginOnboarding();
      const result=await VocabCarnetProduct.finishOnboarding({intent:'enter',preferences:{language}});
      if(!result.ok)throw new Error(JSON.stringify(result));
      await VocabCarnetReview.show('today'); await VocabCarnetReview.show('journey',{fromStart:true});
    },language);
    await page.waitForFunction(language=>document.documentElement.lang===(language==='zh'?'zh-CN':language),language); await frames(page);
    await auditSample(page,engine,language+' preference save and today-to-guide replay');
    await localeAssertions(page,language);
    await scrollChapters(page,engine,language+' guide chapters and native wheel scrolling');
  }
  for(const language of ['en-US','fr-CA']) {
    await resetAudit(page);
    await page.evaluate(language=>document.documentElement.lang=language,language); await frames(page,5);
    await localeAssertions(page,language);
    await auditSample(page,engine,language+' document language change');
    await scrollChapters(page,engine,language+' guide chapters and native wheel scrolling');
  }
  pass(engine,'All seven guide chapters and interactive reader follow Chinese, English, French, en-US and fr-CA without complete-state reads or repeated hot-path text writes');
}
async function localeAssertions(page,language) {
  const english=language.startsWith('en'), french=language.startsWith('fr');
  assert.equal(await page.locator('#carnet-title').textContent(),english?'A little time.A little French.':french?'Un moment.Pour le français.':'为法语，留一点时间。');
  assert.equal(await page.locator('[data-lesson-text=recallK]').innerText(),english?'04 / 07 · RECALL':french?'04 / 07 · RAPPEL':'04 / 07 · 回忆');
  assert.equal(await page.locator('.carnet-story-header [data-carnet=appearance]').innerText(),english?'Appearance':french?'Apparence':'外观');
  await chapter(page,7);
  assert.equal(await page.locator('.carnet-story-next').innerText(),english?'Back to opening ↑':french?'Revenir au début ↑':'回到开场 ↑');
  await chapter(page,3);
  assert.equal(await page.locator('[data-carnet=listen]').getAttribute('aria-label'),english?'Play sentence':french?'Écouter la phrase':'朗读例句');
}
async function digest(page) {
  return page.evaluate(async()=>{
    const s=__auditRead(()=>VocabApp.getState());
    const records={}; for(const key of ['decks','cards','skills','events','eventArchive','contexts','aliases','trash','session']) if(s[key]!==undefined) records[key]=s[key];
    // Recreating or focusing a study input can move its caret without changing
    // the answer draft or any learning record. Check those separately from focus.
    if(records.session?.draft)delete records.session.draft.selection;
    const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
    const bytes=new TextEncoder().encode(JSON.stringify(stable(records)));
    const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    return {sha,words:s.decks.reduce((n,d)=>n+d.words.length,0),session:s.session,events:s.events.length,skills:s.skills};
  });
}
async function dataAndPreferenceChecks(page,engine) {
  await show(page,'today');
  await page.evaluate(()=>__auditRead(()=>VocabApp.begin('spelling',{replace:true,limit:2,ignoreGoal:true,wordIds:VocabApp.getState().decks[0].words.slice(0,2).map(w=>w.id)})));
  await page.locator('#spell-input').fill(await page.evaluate(()=>__auditRead(()=>VocabEngine.current(VocabApp.getState()).word.spell)));
  await page.locator('#spell-input').press('Enter');
  await page.waitForFunction(()=>__auditRead(()=>VocabEngine.current(VocabApp.getState()).answered));
  await page.locator('[data-action=next]').click();
  await page.locator('#spell-input').fill('ébauche conservée');
  await show(page,'journey');
  const before=await digest(page); assert.ok(before.events>0); assert.equal(before.session.draft.typed,'ébauche conservée');
  await copyChecks(page,engine);
  await chapter(page,5); await page.locator('#carnet-lesson-answer').fill('liv');
  await page.evaluate(()=>{window.__spoken=[];window.AudioKit={...AudioKit,speak:async(text,options)=>{__spoken.push({text,rate:options.rate,voiceURI:options.voiceURI});options.onStatus?.({state:'playing'});options.onStatus?.({state:'ended'});return {state:'ended',ok:true};}};});
  for(const preferences of [{rate:.64,voiceURI:'audit-current-a'},{rate:1.23,voiceURI:'audit-current-b'}]) {
    await resetAudit(page);
    await page.evaluate(async preferences=>{VocabCarnetProduct.beginOnboarding();const result=await VocabCarnetProduct.finishOnboarding({intent:'enter',preferences});if(!result.ok)throw new Error(JSON.stringify(result));await VocabCarnetReview.show('today');await VocabCarnetReview.show('journey',{fromStart:true});},preferences);
    await frames(page); await auditSample(page,engine,'Sound preference save and today-to-guide replay '+preferences.rate);
    await resetAudit(page); await chapter(page,3); await page.locator('[data-carnet=listen]').click();
    await chapter(page,6); await page.locator('[data-lesson-action=play-word]').click();
    assert.deepEqual(await page.evaluate(()=>__spoken.slice(-2).map(({rate,voiceURI})=>({rate,voiceURI}))),[preferences,preferences]);
    await auditSample(page,engine,'Latest reader and sound-chapter preferences '+preferences.rate);
  }
  for(const [design,mode] of [['classic','dark'],['atelier','light'],['verdure','dark']]) {
    await resetAudit(page); await page.evaluate(({design,mode})=>VocabCarnetReview.setAppearance({design,mode,motion:'reduced'}),{design,mode});
    assert.deepEqual(await page.evaluate(()=>({design:VocabCarnetProduct.getSettings().designTheme,mode:VocabCarnetProduct.getSettings().theme})),{design,mode});
    assert.equal(await page.locator('html').getAttribute('data-design-theme'),design);
    await auditSample(page,engine,'Live appearance '+design+' '+mode);
  }
  await chapter(page,5); assert.equal(await page.locator('#carnet-lesson-answer').inputValue(),'liv');
  assert.deepEqual(await digest(page),before);
  await page.screenshot({path:path.join(out,engine+'-large-library-guide.png')});
  await show(page,'today'); await page.locator('[data-action=resume]').click();
  assert.equal(await page.locator('#spell-input').inputValue(),'ébauche conservée');
  await page.locator('#spell-input').press('Escape');
  await page.waitForFunction(()=>VocabApp.getView()==='today'); assert.deepEqual(await digest(page),before);
  pass(engine,'Latest rate and voice reach reader and sound chapter; three themes update immediately while demo draft and real spelling session, scores and 4,800 words remain intact');
  const downloadPromise=page.waitForEvent('download'); await page.evaluate(()=>VocabApp.exportBackup(false));
  const download=await downloadPromise, backupPath=path.join(out,engine+'-synthetic-backup.json'); await download.saveAs(backupPath);
  const payload=JSON.parse(fs.readFileSync(backupPath,'utf8')); assert.equal(payload.state.session.draft.typed,'ébauche conservée');
  const restored=await boot(engine+'-restore');
  await show(restored,'settings'); await restored.locator('#backup-input').setInputFiles(backupPath);
  await restored.locator('[data-action=commit-restore]').waitFor();
  assert.equal((await state(restored)).decks.length,0);
  await restored.locator('[data-action=commit-restore]').click();
  await restored.waitForFunction(()=>!document.getElementById('modal').open);
  assert.deepEqual(await digest(restored),before);
  await restored.reload(); await ready(restored); assert.deepEqual(await digest(restored),before);
  await restored.locator('[data-action=resume]').click(); assert.equal(await restored.locator('#spell-input').inputValue(),'ébauche conservée');
  assert.deepEqual(await restored.evaluate(()=>VocabApp.getSettings()),payload.state.settings);
  await restored.context().close();
  pass(engine,'Actual exported JSON previews without changing data and restores complete vocabulary, progress, settings and unfinished spelling into a new context, including after reload');
}
async function previewChecks(engine) {
  const page=await boot(engine+'-preview',true);
  assert.equal(await page.evaluate(()=>CARNET_PREVIEW),true);
  await auditSample(page,engine,'Separate preview entry startup'); await copyChecks(page,engine+'-preview');
  await scrollChapters(page,engine,'Separate preview entry chapters and native wheel scrolling');
  await page.context().close();
  pass(engine,'Separate development preview exposes working settings reads and scrolls without complete-state reads or unchanged hot-path text writes');
}
(async()=>{
  assert.ok(fs.existsSync(file),'Build the formal release before this regression.');
  for(const engine of (process.env.CARNET_BROWSERS||'chromium,webkit').split(',').filter(Boolean)) {
    browser=await launchBrowser(engine); const page=await boot(engine);
    assert.equal(await page.evaluate(()=>CARNET_PREVIEW),false); assert.equal(await page.evaluate(()=>VOCAB_RELEASE),paths.releaseConfig.version);
    await auditSample(page,engine,'Empty formal entry startup');
    report.samples.push({engine,phase:'Synthetic large vocabulary',...await seedLarge(page)});
    await page.reload(); await ready(page); await auditSample(page,engine,'4,800-word formal entry startup');
    await copyChecks(page,engine); await languageChecks(page,engine); await dataAndPreferenceChecks(page,engine);
    await page.context().close(); await previewChecks(engine); await browser.close(); browser=null;
  }
  assert.deepEqual(report.errors,[]); fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
  console.log('DONE',report.checks.length,out);
})().catch(async error=>{
  report.failure=error.stack; fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(report,null,2));
  console.error(error); await browser?.close(); process.exitCode=1;
});
