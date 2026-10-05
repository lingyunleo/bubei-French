// Fresh, isolated browser contexts only. Run against a built single HTML:
// node guide-recovery-accessibility.cjs
// Optional: CARNET_RELEASE_HTML, CARNET_PLAYWRIGHT, CARNET_CHROME,
// CARNET_WEBKIT_CACHE, CARNET_BROWSERS, CARNET_SOURCE_FIXTURE=1.
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const paths=require('./paths.cjs'),{launchBrowser}=require('./runtime.cjs');
const originalFile=path.resolve(process.env.CARNET_TEST_FILE||process.argv[2]||paths.releaseFile),out=path.join(paths.runRoot,'引导恢复与可访问性');
fs.mkdirSync(out,{recursive:true});let file=originalFile;
// A development-only fixture is clearly labelled and never modifies a release.
if(process.env.CARNET_SOURCE_FIXTURE==='1'){
 let html=fs.readFileSync(file,'utf8');const source=paths.sourceRoot;
 for(const name of ['app.js','data.js','carnet-preview.js','carnet-lessons.js','carnet-story.css']){
  const tag=name.endsWith('.css')?'style':'script',regex=new RegExp('<'+tag+' data-bundled-source="'+name.replaceAll('.','\\.')+'">[\\s\\S]*?</'+tag+'>');
  assert.ok(regex.test(html),'Missing bundled module: '+name);
  const body=fs.readFileSync(path.join(source,name),'utf8').replace(/<\/script/gi,'<\\/script');
  html=html.replace(regex,()=>'<'+tag+' data-bundled-source="'+name+'">'+body+'</'+tag+'>');
 }
 file=path.join(out,'source-fixture.html');fs.writeFileSync(file,html);
}
const checks=[],errors=[];let browser;
function pass(engine,name){checks.push({engine,name});console.log('PASS',engine,name);}
async function boot(options={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:options.reduced?'reduce':'no-preference'}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 if(options.corrupt)await page.addInitScript(()=>{if(!sessionStorage.getItem('audit-seeded')){localStorage.setItem('FR_VOCAB_APP_V4','{synthetic-broken-json');sessionStorage.setItem('audit-seeded','1');}});
 if(options.noSpeech)await page.addInitScript(()=>Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined}));
 if(options.reduced)await page.addInitScript(()=>{window.auditMainAnimations=[];const native=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('#app .main'))auditMainAnimations.push({frames,options});return native.call(this,frames,options);};});
 await page.goto(pathToFileURL(file).href);await ready(page);return page;
}
async function ready(page){await page.waitForFunction(()=>window.VocabCarnetReview?.getState().lessons&&document.querySelector('.carnet-loading')?.hidden&&!window.VocabStartup?.isActive(),null,{timeout:60000});}
async function chapter(page,n){await page.evaluate(n=>VocabCarnetReview.jump(n,true),n);await page.waitForTimeout(80);}
async function language(page,value){
 await page.evaluate(async language=>{await VocabCarnetProduct.finishOnboarding({intent:'enter',preferences:{language}});await VocabCarnetReview.show('today');await VocabCarnetReview.show('journey',{fromStart:true});},value);
 await page.waitForFunction(value=>document.documentElement.lang===value,value);
}
async function backupFor(page,name){return page.evaluate(name=>VocabData.exportBackup(VocabData.importEntries(VocabData.fresh(),[{french:'lire',meaning:'阅读',pos:'v.'}],{name,mode:'new'}).state),name);}
async function chooseBackup(page,backup){await page.locator('#backup-input').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.locator('#modal [data-action=commit-restore]').waitFor();}
async function rawPrimary(page,key='state'){return page.evaluate(key=>new Promise((resolve,reject)=>{const req=indexedDB.open('FR_VOCAB_DATA_V4',1);req.onsuccess=()=>{const db=req.result,q=db.transaction('data','readonly').objectStore('data').get(key);q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};req.onerror=()=>reject(req.error);}),key);}
async function rejectConcurrentRestore(page){
 // Both conflicts display the same text. Require a fresh notice mutation so
 // the second assertion cannot accidentally accept the first operation's error.
 await page.evaluate(()=>{window.auditRecoveryConflictReceived=false;const notice=document.getElementById('modal-toast');window.auditRecoveryConflictObserver=new MutationObserver(()=>{if(!notice.hidden&&notice.textContent.startsWith('另一窗口已更新。'))window.auditRecoveryConflictReceived=true;});window.auditRecoveryConflictObserver.observe(notice,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});});
 try{await page.locator('#modal [data-action=commit-restore]').click();await page.waitForFunction(()=>window.auditRecoveryConflictReceived&&document.getElementById('modal').open);}
 finally{await page.evaluate(()=>{window.auditRecoveryConflictObserver?.disconnect();delete window.auditRecoveryConflictObserver;delete window.auditRecoveryConflictReceived;});}
}
(async()=>{
 for(const engine of (process.env.CARNET_BROWSERS||'chromium,webkit').split(',')){
  browser=await launchBrowser(engine);
  let page=await boot({corrupt:true,reduced:true});assert.equal(await page.evaluate(()=>VocabCarnetProduct.getStartup().blocked),true);
  assert.equal(await page.evaluate(()=>document.body.dataset.carnetView),'app');
  await page.evaluate(()=>VocabCarnetReview.show('journey',{fromStart:true}));await chapter(page,7);await page.locator('#carnet-lesson-goal').fill('999');await page.locator('[data-lesson-action=restore]').click();
  await page.waitForFunction(()=>document.getElementById('modal').open&&document.body.dataset.carnetView==='app');
  assert.equal(await page.evaluate(()=>VocabApp.getState().settings.onboardingComplete),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('FR_VOCAB_APP_V4')),'{synthetic-broken-json');
  pass(engine,'Recovery opens from a blocked archive without saving onboarding or validating unrelated learning preferences');
  await page.locator('#modal [data-action=close]').click();await page.waitForFunction(()=>!document.getElementById('modal').open);
  assert.equal(await page.evaluate(()=>localStorage.getItem('FR_VOCAB_APP_V4')),'{synthetic-broken-json');
  await page.evaluate(()=>VocabCarnetReview.show('journey',{fromStart:true}));await chapter(page,7);await page.locator('[data-lesson-action=restore]').click();
  const backup=await page.evaluate(()=>{const imported=VocabData.importEntries(VocabData.fresh(),[{french:'lire',meaning:'阅读',pos:'v.'}],{name:'Synthetic recovery',mode:'new'});return VocabData.exportBackup(imported.state);});
  await page.locator('#backup-input').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.locator('#modal [data-action=commit-restore]').waitFor();assert.equal(await page.evaluate(()=>VocabApp.getState().decks.length),0);
  pass(engine,'Cancelling and previewing recovery preserve data; restoration still requires explicit confirmation');
  await page.locator('#modal [data-action=commit-restore]').click();await page.waitForFunction(()=>VocabApp.getState().decks[0]?.name==='Synthetic recovery'&&!document.getElementById('modal').open);
  await page.reload();await ready(page);assert.equal(await page.evaluate(()=>VocabCarnetProduct.getStartup().blocked),false);assert.equal(await page.evaluate(()=>VocabApp.getState().decks[0]?.name),'Synthetic recovery');
  pass(engine,'Confirmed backup restores successfully and remains usable after reloading');await page.context().close();
  page=await boot({reduced:true});
  await page.evaluate(async()=>{let state=VocabData.importEntries(VocabData.fresh(),[{french:'livre',meaning:'书',pos:'n.m.'}],{name:'Existing primary',mode:'new'}).state;state.settings.onboardingComplete=true;for(let n=0;n<3;n++){state=(await VocabData.save(state,{expectedRevision:state.revision})).state;}localStorage.setItem('FR_VOCAB_APP_V4','{broken-fallback-with-primary');});
  await page.reload();await ready(page);assert.equal(await page.evaluate(()=>VocabApp.getState().revision),3);assert.equal(await page.evaluate(()=>VocabApp.getState().decks[0].name),'Existing primary');assert.equal(await page.evaluate(()=>VocabCarnetProduct.getStartup().blocked),true);
  await page.evaluate(()=>VocabCarnetReview.show('journey',{fromStart:true}));await chapter(page,7);await page.locator('[data-lesson-action=restore]').click();const replacement=await backupFor(page,'Confirmed replacement');await chooseBackup(page,replacement);
  await page.evaluate(()=>localStorage.setItem('FR_VOCAB_APP_V4','{changed-in-another-tab'));await rejectConcurrentRestore(page);
  assert.equal(await page.locator('#modal').evaluate(e=>e.open),true);assert.equal((await rawPrimary(page)).decks[0].name,'Existing primary');assert.equal(await page.evaluate(()=>localStorage.getItem('FR_VOCAB_APP_V4')),'{changed-in-another-tab');
  pass(engine,'Recovery preserves a valid primary revision and refuses to overwrite a concurrently changed fallback');
  await page.evaluate(async()=>{localStorage.setItem('FR_VOCAB_APP_V4','{broken-fallback-with-primary');await new Promise((resolve,reject)=>{const req=indexedDB.open('FR_VOCAB_DATA_V4',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('data','readwrite'),store=tx.objectStore('data'),q=store.get('state');q.onsuccess=()=>{const state=q.result;state.revision++;store.put(state,'state');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);});});
  await rejectConcurrentRestore(page);assert.equal(await page.locator('#modal').evaluate(e=>e.open),true);assert.equal((await rawPrimary(page)).revision,4);assert.equal((await rawPrimary(page)).decks[0].name,'Existing primary');
  pass(engine,'Recovery also refuses a concurrent primary-archive revision change');
  await page.reload();await ready(page);await page.evaluate(()=>VocabCarnetReview.show('journey',{fromStart:true}));await chapter(page,7);await page.locator('[data-lesson-action=restore]').click();await chooseBackup(page,replacement);await page.locator('#modal [data-action=commit-restore]').click();await page.waitForFunction(()=>VocabApp.getState().decks[0]?.name==='Confirmed replacement');
  assert.equal(await rawPrimary(page,'consumedFallback'),'{broken-fallback-with-primary');assert.equal(await page.evaluate(async()=>(await VocabData.listSnapshots()).some(s=>s.state.decks[0]?.name==='Existing primary')),true);
  await page.reload();await ready(page);assert.equal(await page.evaluate(()=>VocabCarnetProduct.getStartup().blocked),false);assert.equal(await page.evaluate(()=>VocabApp.getState().decks[0].name),'Confirmed replacement');
  pass(engine,'Explicit recovery consumes only the checked fallback, keeps the prior primary snapshot and survives refresh');await page.context().close();
  page=await boot({noSpeech:true});
  for(const locale of ['zh','en','fr']){
   if(locale!=='zh')await language(page,locale);
   await chapter(page,3);await page.locator('[data-carnet=listen]').click();
   const feedback=page.locator('.reader-audio-feedback');await feedback.waitFor({state:'visible'});
   const message=await feedback.locator('p').innerText();assert.ok(message.length>20);if(locale!=='zh')assert.doesNotMatch(message,/\p{Script=Han}/u);
   await feedback.locator('[data-carnet=retry-listen]').focus();await page.keyboard.press('Enter');assert.equal(await feedback.isVisible(),true);assert.equal(await page.locator('[data-carnet=listen]').getAttribute('aria-busy'),null);
   assert.equal(await page.locator('[data-carnet=listen]').evaluate(e=>document.activeElement===e),true);
   if(locale==='zh'){await page.screenshot({path:path.join(out,engine+'-reader-audio-error-desktop.png')});await page.setViewportSize({width:390,height:844});await chapter(page,3);await page.screenshot({path:path.join(out,engine+'-reader-audio-error-mobile.png')});assert.equal(await feedback.isVisible(),true);await page.setViewportSize({width:1440,height:1000});}
   await chapter(page,6);await page.locator('[data-lesson-action=play-word]').click();const status=await page.locator('[data-audio-status]').innerText();assert.ok(status.length>20);if(locale!=='zh')assert.doesNotMatch(status,/\p{Script=Han}/u);
   for(const selector of ['.carnet-lesson-dots','.carnet-entry-options']){const label=await page.locator(selector).getAttribute('aria-label');assert.ok(label);if(locale!=='zh')assert.doesNotMatch(label,/\p{Script=Han}/u);}
   pass(engine,locale+': reader failure, retry and sound-chapter failure are visible and localized; translated group labels follow language changes');
  }
  // A failed voice service can recover on retry; only this synthetic playback is stubbed.
  await chapter(page,3);await page.evaluate(()=>{window.auditPlaybackEnded=false;window.AudioKit={...AudioKit,speak:async(_text,options)=>{options.onStatus?.({state:'playing'});options.onStatus?.({state:'ended'});window.auditPlaybackEnded=true;return {state:'ended',ok:true};}};});
  await page.locator('[data-carnet=retry-listen]').click();await page.waitForFunction(()=>window.auditPlaybackEnded&&document.querySelector('.reader-audio-feedback').hidden&&!document.querySelector('[data-carnet=listen]').hasAttribute('aria-busy'));assert.equal(await page.locator('.reader-audio-feedback').isVisible(),false);assert.equal(await page.locator('[data-carnet=listen]').getAttribute('aria-busy'),null);
  pass(engine,'Successful retry clears the previous failure and busy state');await page.context().close();
  page=await boot({reduced:true});await chapter(page,7);await page.locator('[data-lesson-action=finish]').click();await page.waitForFunction(()=>document.body.dataset.carnetView==='app');
  assert.equal(await page.evaluate(()=>VocabCarnetReview.getState().appearance.motion),'immersive');assert.equal(await page.evaluate(()=>VocabCarnetReview.getState().resolved.motion),'reduced');assert.deepEqual(await page.evaluate(()=>auditMainAnimations),[]);
  pass(engine,'System reduced motion overrides the saved immersive preference, including the final home-page transition');await page.context().close();await browser.close();browser=null;
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({file,originalFile,sourceFixture:process.env.CARNET_SOURCE_FIXTURE==='1',checks,errors,untested:['Physical devices, native keyboards and actual installed speech voices.']},null,2));console.log('DONE',checks.length,out);
})().catch(async error=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({file,checks,errors,error:error.stack},null,2));console.error(error);await browser?.close();process.exitCode=1;});
