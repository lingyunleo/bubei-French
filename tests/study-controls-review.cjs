/* Study controls and optional keyboard hints. Disposable browser contexts and
   original synthetic/starter fixtures only; never opens a user's browser profile. */
const {launchBrowser}=require('./runtime.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const paths=require('./paths.cjs');
const {runRoot}=paths;
const file=paths.releaseFile;
const sha256=fs.existsSync(file)?require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
const out=path.join(runRoot,'study-controls');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],screenshots=[];let browser;
const pass=name=>{checks.push(name);console.log('PASS',name)};
const current=page=>page.evaluate(()=>VocabEngine.current(VocabApp.getState()));
const state=page=>page.evaluate(()=>VocabApp.getState());
async function ready(page){await page.waitForFunction(()=>window.VocabCarnetProduct&&window.VocabCarnetReview);await page.evaluate(()=>VocabCarnetProduct.ready);await page.waitForFunction(()=>document.querySelector('.carnet-loading')?.hidden&&!window.VocabStartup?.isActive())}
async function app(page,view){await page.evaluate(view=>VocabCarnetReview.show(view),view);await page.waitForFunction(()=>document.body.dataset.carnetView==='app')}
async function shot(page,name){const target=path.join(out,name+'.png');await page.screenshot({path:target});screenshots.push(target)}
async function persisted(page){await page.evaluate(()=>VocabCarnetProduct.suspend());await page.waitForFunction(async()=>{const s=VocabApp.getState(),p=(await VocabData.load()).state;return s.revision===p.revision&&s.settings.showShortcutHints===p.settings.showShortcutHints})}
async function close(page){await page.locator('#modal-close').click();await page.waitForFunction(()=>!document.getElementById('modal').open)}
async function key(page,key){await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press(key)}
async function begin(page,kind='learn',index=0,limit=1){await page.evaluate(({kind,index,limit})=>VocabApp.begin(kind,{replace:true,limit,ignoreGoal:true,wordIds:VocabApp.getState().decks[0].words.slice(index,index+limit).map(w=>w.id)}),{kind,index,limit});await page.waitForFunction(()=>VocabApp.getView()==='study')}
async function setHints(page,enabled){
 await page.locator('[data-action=study-options]').click();
 const control=page.locator('#modal [data-setting=showShortcutHints]');
 if((await control.getAttribute('aria-checked'))!==String(enabled))await control.click();
 await page.waitForFunction(enabled=>document.documentElement.dataset.shortcutHints===(enabled?'visible':'hidden'),enabled);
 assert.equal(await control.getAttribute('aria-checked'),String(enabled));
 await close(page);
}
async function assertHints(page,expected){
 const details=await page.locator('#app .shortcut-key').evaluateAll(elements=>elements.map(el=>({text:el.textContent.trim(),hidden:el.getAttribute('aria-hidden'),visible:!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'})));
 assert.ok(details.length>=2,'A choice or recall question must include both per-action hints and footer hints');
 assert.ok(details.every(x=>x.visible===expected),JSON.stringify(details));
 assert.ok(details.every(x=>x.hidden==='true'),'Decorative keyboard hints should not alter accessible action names');
 assert.equal(await page.locator('#app [data-action=hint],#app .shortcut-note [data-action=word]').count(),0);
 assert.equal(await page.locator('#app .shortcut-note [data-action=undo]').count(),1);
 assert.equal(await page.locator('#app').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'Study content has no horizontal overflow');
}
async function fresh(name,viewport,hasTouch=false,isMobile=false){
 const context=await browser.newContext({viewport,hasTouch,isMobile,reducedMotion:'reduce'});
 // Read-only call-through instrumentation observes real audio dispatch without
 // replacing playback, voice selection, or any learning logic.
 await context.addInitScript(()=>{
  window.__studyAudioCalls={word:0,example:0};
  Object.defineProperty(window,'AudioKit',{configurable:true,set(api){Object.defineProperty(window,'AudioKit',{configurable:true,writable:true,value:Object.freeze({...api,speak(...args){window.__studyAudioCalls.word++;return api.speak(...args)},play(...args){window.__studyAudioCalls.example++;return api.play(...args)}})})}});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(name+': '+e.message));
 await page.goto(pathToFileURL(file).href);await ready(page);
 await page.evaluate(async()=>{
  const old=VocabApp.getState();
  const entries=VocabSeed.slice(0,6).map((w,i)=>({...w,fullMeaning:'合成测试完整释义 '+i+'\n完整释义不得因入口合并而丢失。',fullUsage:'合成测试完整用法 '+i}));
  const next=VocabData.importEntries(old,entries,{mode:'new',name:'学习控件专项 · 合成词表'}).state;
  for(const [index,word]of next.decks[0].words.entries())next.contexts[word.id]=VocabSeed[index].contexts.map((c,i)=>({...c,id:'synthetic-'+index+'-'+i,origin:'default'}));
  Object.assign(next.settings,{onboardingComplete:true,showShortcutHints:true,autoWord:false,autoExample:false,listening:false,dailyGoalEnabled:false,language:'zh'});
  VocabEngine.ensureState(next);await VocabData.save(next,{expectedRevision:old.revision,snapshot:true});
 });
 await page.reload();await ready(page);await app(page,'today');
 return {context,page};
}
async function recall(page,index=0){await begin(page,'learn',index);await page.locator('[data-action=study-options]').click();await page.locator('[data-action=skip-and-close]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).kind==='recall');await page.locator('[data-action=reveal]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).revealed)}

(async()=>{
 assert.ok(fs.existsSync(file),'Build the standalone release candidate before running this review.');
 browser=await launchBrowser('Chromium');
 const {context,page}=await fresh('desktop',{width:1440,height:1000});
 await begin(page);assert.equal((await current(page)).kind,'choice');
 for(const design of ['classic','atelier','verdure']){
  await page.evaluate(design=>VocabCarnetProduct.setAppearance({design,mode:'light',motion:'reduced'}),design);
  const token=(await current(page)).token;
  await setHints(page,true);await assertHints(page,true);await shot(page,'desktop-'+design+'-hints-visible');
  await setHints(page,false);await assertHints(page,false);assert.equal((await current(page)).token,token);
  await shot(page,'desktop-'+design+'-hints-hidden');
 }
 pass('Three themes: real study-options switches immediately show/hide numeric and Space/P/S hints without replacing the question; redundant footer actions absent');
 await persisted(page);const beforeReload=(await current(page)).token;await page.reload();await ready(page);await app(page,'study');await assertHints(page,false);assert.equal((await current(page)).token,beforeReload);assert.equal((await state(page)).settings.showShortcutHints,false);
 pass('Hidden-hint preference and unfinished question persist after reopening the standalone HTML');
 let c=await current(page);await key(page,String(c.options.findIndex(o=>o.id===c.word.id)+1));await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).answered);assert.equal((await current(page)).feedback.correct,true);assert.equal((await current(page)).feedback.assisted,false);
 await key(page,'z');await page.waitForFunction(()=>!VocabEngine.current(VocabApp.getState()).answered);
 const baseline=(await state(page)).events.length;await page.locator('[data-action=reveal]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).revealed);c=await current(page);assert.equal(c.assisted,true);assert.equal(c.revealed,true);assert.equal(c.answered,false);assert.equal((await state(page)).events.length,baseline);
 await page.locator('[data-action=assisted-next]').click();await page.waitForFunction(n=>VocabApp.getState().events.length>n,baseline);let event=(await state(page)).events.at(-1);assert.equal(event.assisted,true);assert.equal(event.correct,false);
 pass('Hidden numeric and undo shortcuts still work; choosing “看答案” marks assistance without scoring early and retains retry semantics');
 for(const [index,keyName,rating]of [[1,'q',3],[2,'w',2],[3,'e',1]]){
  await recall(page,index);await assertHints(page,false);c=await current(page);assert.equal(c.assisted,false);
  const titles=await page.locator('[data-action=rate]').evaluateAll(nodes=>nodes.map(n=>({title:n.title,text:n.textContent})));assert.ok(titles.every(n=>!/^\s*[QWE]\b/.test(n.title)));
  if(keyName==='q'){
   const audio=await page.evaluate(()=>({...window.__studyAudioCalls}));await key(page,'p');await page.waitForFunction(n=>window.__studyAudioCalls.word>n,audio.word);await key(page,'s');await page.waitForFunction(n=>window.__studyAudioCalls.example>n,audio.example);
   await shot(page,'desktop-recall-hints-hidden');
  }
  const answerCount=(await state(page)).events.length;await key(page,keyName);await page.waitForFunction(n=>VocabApp.getState().events.length>n,answerCount);event=(await state(page)).events.at(-1);assert.equal(event.rating,rating);assert.equal(event.assisted,false);
 }
 pass('Recall uses normal unassisted Q/W/E ratings with hints hidden; P word and S example keys still dispatch the actual audio functions; tooltips contain only rating explanations');
 await recall(page,4);const token=(await current(page)).token;
 assert.equal(await page.locator('#app [data-action=full-word]').count(),1);assert.equal(await page.locator('#app [data-action=word]').count(),0);
 await page.locator('#app [data-action=full-word]').click();assert.match(await page.locator('#modal-body').innerText(),/合成测试完整释义 4/);await page.locator('#modal-footer [data-action=word]').click();
 const exampleCount=await page.locator('#modal .context-card').count();assert.ok(exampleCount>=2,'All examples remain reachable');
 await page.locator('#modal-footer [data-action=edit-word]').click();await page.locator('#word-form').waitFor();assert.equal(await page.locator('#word-form [name=french]').inputValue(),(await current(page)).word.french);await close(page);
 await page.locator('#app [data-action=full-word]').click();await page.locator('#modal-footer [data-action=word]').click();await page.locator('#modal [data-action=edit-context]').first().click();await page.locator('#context-form').waitFor();assert.ok((await page.locator('#context-form [name=text]').inputValue()).length>0);await close(page);
 await page.locator('#app [data-action=full-word]').click();await page.locator('#modal-footer [data-action=word]').click();await page.locator('#modal-footer [data-action=add-context]').click();await page.locator('#context-form').waitFor();await close(page);assert.equal((await current(page)).token,token);
 pass('One full-meaning entry retains full text, every example, existing-example editing, add-example/audio and word editing; cancelling keeps the same study question');
 await begin(page,'spelling',5);await page.locator('#spell-input').fill('draft qwe ps');await setHints(page,true);assert.equal(await page.locator('#spell-input').inputValue(),'draft qwe ps');await setHints(page,false);assert.equal(await page.locator('#spell-input').inputValue(),'draft qwe ps');
 await page.locator('#spell-input').fill('');await page.locator('[data-action=show-spelling-answer]').click();await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).revealed);c=await current(page);assert.equal(c.assisted,true);assert.equal(c.answered,false);await page.locator('[data-action=assisted-next]').click();
 await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).correction);c=await current(page);assert.equal(c.progress.completed,0);await page.locator('#spell-input').fill(c.word.spell);await page.locator('#spell-input').press('Enter');await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).answered);c=await current(page);assert.equal(c.feedback.independent,false);assert.equal(c.feedback.next,'round-retry');assert.equal(c.progress.completed,0);
 await key(page,'Space');await page.waitForFunction(()=>!VocabEngine.current(VocabApp.getState()).answered);c=await current(page);assert.equal(c.round,2);assert.equal(c.correction,false);assert.equal(c.assisted,false);await page.locator('#spell-input').fill(c.word.spell);await page.locator('#spell-input').press('Enter');await page.waitForFunction(()=>VocabEngine.current(VocabApp.getState()).answered);c=await current(page);assert.equal(c.feedback.independent,true);assert.equal(c.progress.completed,1);await shot(page,'desktop-spelling-second-round-pass');
 pass('Hint switches preserve typed draft; spelling answer-reveal still requires correction then an independent next-round pass; Enter and Space stay active');
 await app(page,'settings');const setting=page.locator('input[name=showShortcutHints]');assert.equal(await setting.isVisible(),true);assert.equal(await setting.isChecked(),false);await setting.check();await page.locator('#settings-form button[type=submit]').click();await page.waitForFunction(()=>VocabApp.getState().settings.showShortcutHints===true);await persisted(page);await page.reload();await ready(page);await app(page,'settings');assert.equal(await page.locator('input[name=showShortcutHints]').isChecked(),true);
 pass('Main settings switch also saves the same hint preference and survives reload');
 await context.close();
 for(const [name,viewport,mobile]of [['mobile-390',{width:390,height:844},true],['touch-1024',{width:1024,height:1366},false]]){
  const {context,page}=await fresh(name,viewport,true,mobile);
  for(const design of ['classic','atelier','verdure']){
   await page.evaluate(design=>VocabCarnetProduct.setAppearance({design,mode:'light',motion:'reduced'}),design);await begin(page);await assertHints(page,false);
   await page.locator('[data-action=study-options]').click();assert.equal(await page.locator('#modal .desktop-shortcut-setting:visible').count(),0);assert.equal(await page.locator('#modal [data-setting=autoWord]').isVisible(),true);assert.equal(await page.locator('#modal [data-setting=autoExample]').isVisible(),true);await close(page);
   await recall(page,0);await assertHints(page,false);await shot(page,name+'-'+design+'-recall');
  }
  await app(page,'settings');assert.equal(await page.locator('.desktop-shortcut-setting:visible').count(),0);
  await begin(page,'spelling',5);await page.locator('#spell-input').fill('qwe ps texte');assert.equal((await current(page)).answered,false);await page.evaluate(()=>VocabCarnetProduct.setAppearance({design:'classic',mode:'dark',motion:'reduced'}));assert.equal(await page.locator('#spell-input').inputValue(),'qwe ps texte');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot(page,name+'-spelling-input');
  pass(name+': all three themes hide keyboard labels and their switch on touch, retain audio settings, accept text and preserve it across theme change');await context.close();
 }
 assert.deepEqual(errors,[]);pass('No uncaught browser errors in actual single-file desktop and touch previews');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({file,sha256,browser:browser.version(),checkedAt:new Date().toISOString(),checks,errors,screenshots,method:'Disposable Chrome contexts; synthetic library and original project examples; real UI clicks and keyboard input; audio wrapper only counts and forwards calls.',limitations:['390 px and 1024 px touch sizes are browser emulation, not physical devices. Mobile software-keyboard movement and audible TTS quality were not tested. Reduced-motion mode is used to isolate functional checks.']},null,2));
 console.log(JSON.stringify({passed:checks.length,output:out}));await browser.close();
})().catch(async error=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({file,sha256,checks,errors,screenshots,error:error.stack},null,2));console.error(error);await browser?.close();process.exitCode=1});
