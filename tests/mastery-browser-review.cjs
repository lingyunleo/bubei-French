/* Manual mastery, exercised against the generated HTML in disposable browsers.
   Fixtures are original synthetic entries. No personal files or browser profiles.
   Storage fault injection aborts a real IndexedDB transaction; it never replaces
   VocabData.save or the learning engine with a pretend successful operation. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {launchBrowser}=require('./runtime.cjs'),paths=require('./paths.cjs');
const file=paths.releaseFile,out=path.join(paths.runRoot,'manual-mastery');
fs.mkdirSync(out,{recursive:true});
const engines=(process.env.CARNET_MASTERY_BROWSERS||'Chromium,WebKit').split(',').map(s=>s.trim()).filter(Boolean);
const report={file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checkedAt:new Date().toISOString(),browsers:[],checks:[],errors:[],screenshots:[],limitations:['390 px and landscape viewports are browser emulation, not physical devices. Audible dictation quality and software keyboards are outside this review.','Storage exhaustion is simulated by aborting an actual snapshot write transaction. No real browser profile or disk is filled.','WebKit cannot open file URLs with Playwright offline mode on the reviewed macOS runtime. Its HTTP(S) requests are blocked instead; Chromium uses native offline mode.']};
let browser,engine;
const pass=(name,detail)=>{report.checks.push({engine,name,...(detail?{detail}:{})});console.log('PASS',engine,name);};
const state=page=>page.evaluate(()=>VocabApp.getState());
const current=page=>page.evaluate(()=>VocabEngine.current(VocabApp.getState()));
async function ready(page){await page.waitForFunction(()=>window.VocabCarnetProduct&&window.VocabCarnetReview);await page.evaluate(()=>VocabCarnetProduct.ready);await page.waitForFunction(()=>!window.VocabStartup?.isActive());}
async function show(page,view){await page.evaluate(view=>document.body.dataset.carnetView==='app'?VocabApp.previewNavigate(view):VocabCarnetReview.show(view),view);await page.waitForFunction(view=>document.body.dataset.carnetView==='app'&&VocabApp.getView()===view,view);}
async function close(page){if(await page.locator('#modal').evaluate(el=>el.open)){await page.locator('#modal-close').click();await page.waitForFunction(()=>!document.getElementById('modal').open);}}
async function saved(page){await page.evaluate(()=>VocabCarnetProduct.suspend());await page.waitForFunction(async()=>{const a=VocabApp.getState(),b=(await VocabData.load()).state;return a.revision===b.revision&&JSON.stringify(a.session)===JSON.stringify(b.session);});}
async function boot(target=file,options={}){const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true,offline:engine.toLowerCase()!=='webkit',...options});await context.route(/^https?:\/\//,route=>route.abort());const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(engine+': '+error.message));await page.goto(pathToFileURL(target).href);await ready(page);return {page,context};}
async function fresh({review=false,touch=false}={}){
 const result=await boot(file,touch?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{}),{page}=result;
 await page.evaluate(async review=>{
  const old=VocabApp.getState();
  const entries=[['lune','月亮'],['porte','门'],['rivière','河流'],['plume','羽毛'],['nuage','云'],['jardin','花园']].map(([french,meaning])=>({french,spell:french,meaning,pos:'n.',example:'Voici '+french+'.',exampleZh:'合成验证例句。',source:'Original synthetic browser fixture'}));
  const s=VocabData.importEntries(VocabData.fresh(),entries,{mode:'new',name:'Synthetic mastery review'}).state;
  Object.assign(s.settings,{onboardingComplete:true,language:'zh',showShortcutHints:true,autoWord:false,autoExample:false,listening:false,dailyGoalEnabled:false,studyDeckIds:[s.decks[0].id]});
  VocabEngine.ensureState(s);
  if(review)for(const w of s.decks[0].words)Object.assign(s.cards[w.id],{acquired:true,started:true,dueAt:Date.now()-1000,acquisitionStage:'recall'});
  const saved=await VocabData.save(s,{expectedRevision:old.revision,snapshot:true});if(!saved.persistent)throw new Error(saved.warning);
 },review);
 await page.reload();await ready(page);await show(page,'today');
 result.ids=(await state(page)).decks[0].words.map(w=>w.id);return result;
}
async function begin(page,kind,ids){await close(page);await page.evaluate(({kind,ids})=>VocabApp.begin(kind,{replace:true,limit:ids.length,ignoreGoal:true,wordIds:ids}),{kind,ids});await page.locator('.shortcut-note [data-action=master-word]').waitFor();}
async function resume(page,kind){await close(page);await page.evaluate(kind=>VocabApp.begin(kind),kind);await page.waitForFunction(()=>VocabApp.getView()==='study');}
async function word(page,id){await close(page);await show(page,'library');await page.locator('#word-filter').selectOption('all');await page.locator('.word-row[data-id="'+id+'"]').click();await page.locator('.word-detail').waitFor();}
async function waitMarked(page,id,marked=true){await page.waitForFunction(({id,marked})=>VocabEngine.isManuallyMastered(VocabApp.getState(),id)===marked,{id,marked});}
async function mark(page,id){await page.locator('.shortcut-note [data-action=master-word]').click();await waitMarked(page,id);}
async function unmark(page,id){await word(page,id);await page.locator('#modal-body [data-action=master-word]').click();await waitMarked(page,id,false);await close(page);}
async function spell(page,value){await page.locator('#spell-input').fill(value);await page.locator('[data-action=check-spelling]').click();await page.waitForFunction(()=>VocabApp.getState().session.current.answered);}
async function next(page){const token=(await current(page))?.token;await page.locator('[data-action=next]').click();await page.waitForFunction(token=>VocabApp.getState().session.done||VocabApp.getState().session.current.token!==token,token);}
async function screenshot(page,name){const target=path.join(out,engine.toLowerCase()+'-'+name+'.png');await page.screenshot({path:target});report.screenshots.push(target);}
function sameRecords(a,b){for(const key of ['decks','cards','skills','events','contexts','aliases','trash','session'])assert.deepEqual(a[key],b[key],key);}
async function history(page){return page.evaluate(()=>{const s=VocabApp.getState(),v=VocabEngine.stats(s);return {events:s.events,skills:s.skills,weekly:VocabEngine.weeklyActivity(s),counts:Object.fromEntries(['newToday','learnedToday','reviewedToday','spellingToday','answersToday'].map(k=>[k,v[k]]))};});}
async function layout(page,label){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.locator('.shortcut-note').scrollIntoViewIfNeeded();
 const b=await page.locator('.shortcut-note').evaluate(el=>{const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};const hint=el.querySelector('.desktop-hint');return {bar:rect(el),undo:rect(el.querySelector('[data-action=undo]')),mark:rect(el.querySelector('[data-action=master-word]')),hint:rect(hint),hintVisible:getComputedStyle(hint).display!=='none'&&!!hint.getClientRects().length,overflow:document.documentElement.scrollWidth>innerWidth+1};});
 assert.ok(Math.abs(b.undo.left-b.bar.left)<2,label+' undo at left');assert.ok(Math.abs(b.mark.right-b.bar.right)<2,label+' mastery at right');assert.ok(Math.abs(b.undo.top-b.mark.top)<3,label+' same row');assert.ok(b.undo.right<=b.mark.left,label+' controls do not overlap');
 if(b.hintVisible){assert.ok(Math.abs((b.hint.left+b.hint.right-b.bar.left-b.bar.right)/2)<2,label+' hint centred');assert.ok(b.undo.right<=b.hint.left&&b.hint.right<=b.mark.left,label+' hint does not overlap controls');}
 assert.equal(b.overflow,false,label+' no horizontal overflow');pass(label,b);
}
async function setHints(page,value){await page.locator('[data-action=study-options]').click();const toggle=page.locator('#modal [data-setting=showShortcutHints]');if(await toggle.getAttribute('aria-checked')!==String(value))await toggle.click();await close(page);}
async function revealAncestors(locator){for(const details of await locator.locator('xpath=ancestor::details').all())if(await details.getAttribute('open')===null)await details.locator('summary').first().click();}
async function download(page,action,name){await show(page,'settings');const button=page.locator('[data-action='+action+']');await revealAncestors(button);const pending=page.waitForEvent('download',{timeout:120000});await button.click();const d=await pending,target=path.join(out,engine.toLowerCase()+'-'+name);await d.saveAs(target);return target;}

async function basics(){
 const {page,context,ids}=await fresh();try{
  await begin(page,'spelling',[ids[2]]);await spell(page,(await current(page)).word.spell);await next(page);
  await begin(page,'learn',ids.slice(0,2));const original=await state(page),originalHistory=await history(page),first=original.session.current.wordId;
  for(const theme of ['classic','atelier','verdure']){await page.evaluate(design=>VocabCarnetProduct.setAppearance({design,mode:'light',motion:'reduced'}),theme);await layout(page,theme+' desktop footer');await setHints(page,false);await layout(page,theme+' desktop footer without hints');await setHints(page,true);}
  await screenshot(page,'desktop-study');await page.setViewportSize({width:390,height:844});await layout(page,'390 px footer');await screenshot(page,'390-study');await page.setViewportSize({width:844,height:390});await layout(page,'landscape footer');await screenshot(page,'landscape-study');await page.setViewportSize({width:1440,height:1000});
  // Use the actual browser double-click sequence, including the second click
  // landing after a fast save may have already replaced the first button.
  await page.locator('.shortcut-note [data-action=master-word]').dblclick();await waitMarked(page,first);await saved(page);
  let s=await state(page);assert.deepEqual(s.session.masteredIds,[first]);assert.equal(s.session.answers,0);assert.notEqual(s.session.current.wordId,first);assert.deepEqual(await history(page),originalHistory);pass('Double-click marks only the original question, advances once, and changes no real history');
  await page.locator('.shortcut-note [data-action=undo]').click();await waitMarked(page,first,false);s=await state(page);assert.deepEqual(s.cards,original.cards);assert.deepEqual(s.skills,original.skills);assert.deepEqual(s.events,original.events);assert.deepEqual(s.session,original.session);pass('Footer undo restores exact cards, skills, history and original session');
  await mark(page,first);const second=(await current(page)).word.id;await mark(page,second);await page.locator('.summary-layout').waitFor();assert.match(await page.locator('.summary-heading').innerText(),/其中标熟\s*2/);assert.match(await page.locator('.summary-heading').innerText(),/作答\s*0/);assert.equal(await page.locator('[data-action=spell-batch]').isDisabled(),true);assert.deepEqual(await history(page),originalHistory);await screenshot(page,'summary');pass('Last-word mastery completes the group with explicit manual count and zero invented answers');
  await word(page,first);assert.match(await page.locator('[data-word-schedule]').innerText(),/已标熟/);await page.locator('#modal-body [data-action=master-word]').click();await waitMarked(page,first,false);assert.deepEqual((await state(page)).cards[first],original.cards[first]);await page.locator('#modal-body [data-action=master-word]').click();await waitMarked(page,first);await close(page);await page.locator('#word-filter').selectOption('mastered');assert.equal(await page.locator('.word-row').count(),2);pass('Word detail can cancel/reapply mastery and the library filters exactly the marked words');
 }finally{await context.close();}
}

async function practicePreservation(kind,phase){
 const {page,context,ids}=await fresh();try{
  await begin(page,kind,ids.slice(0,2));const id=(await current(page)).word.id;
  if(phase==='revealed'){await page.locator('#spell-input').fill('brouillon à conserver');await page.locator('[data-action=show-spelling-answer]').click();await page.waitForFunction(()=>VocabApp.getState().session.current.revealed);}
  else{await spell(page,'orthographe incorrecte');if(phase==='correction'){await next(page);assert.equal((await current(page)).correction,true);await page.locator('#spell-input').fill('début de correction');}}
  await saved(page);const before=await state(page),beforeEvents=before.events.length;
  await mark(page,id);const paused=await state(page);assert.deepEqual(paused.session.masteryPauses[id].current,before.session.current);assert.deepEqual(paused.session.masteryPauses[id].draft,before.session.draft);assert.deepEqual(paused.events,before.events);assert.deepEqual(paused.skills,before.skills);
  await unmark(page,id);await resume(page,kind);assert.notEqual((await current(page)).word.id,id);await spell(page,(await current(page)).word.spell);await next(page);
  let s=await state(page);assert.equal(s.session.round,before.session.round);assert.deepEqual(s.session.current,before.session.current);assert.deepEqual(s.session.draft,before.session.draft);assert.equal(s.events.length,beforeEvents+1);assert.deepEqual(s.skills[id],before.skills[id]);
  if(phase==='answered'){assert.equal(await page.locator('[data-action=check-spelling]').count(),0);await next(page);}
  else if(phase==='revealed'){await page.locator('[data-action=assisted-next]').click();await page.waitForFunction(()=>VocabApp.getState().session.current.correction);}
  await spell(page,(await current(page)).word.spell);let c=await current(page);assert.equal(c.feedback.independent,false);assert.notEqual(c.feedback.passed,true);assert.equal(c.feedback.next,'round-retry');assert.equal(c.progress.completed,1);
  await next(page);c=await current(page);assert.equal(c.round,2);assert.equal(c.correction,false);assert.equal(c.assisted,false);await spell(page,c.word.spell);c=await current(page);assert.equal(c.feedback.independent,true);assert.equal(c.feedback.passed,true);assert.equal(c.progress.completed,2);
  pass(kind+' '+phase+': mark/unmark preserves token, hint/correction, feedback and draft; copied answer is not independent, next round can pass');
 }finally{await context.close();}
}

async function reviewPreservation(){
 const {page,context,ids}=await fresh({review:true});try{
  await begin(page,'review',ids.slice(0,4));const id=(await current(page)).word.id;
  async function rate(value){const token=(await current(page)).token;await page.locator('[data-action=reveal]').click();await page.locator('[data-action=rate][data-rating="'+value+'"]').click();await page.waitForFunction(token=>VocabApp.getState().session.done||VocabApp.getState().session.current.token!==token,token);}
  await rate(1);
  for(let n=0;n<4&&(await current(page)).word?.id!==id;n++)await rate(3);
  let s=await state(page);assert.equal(s.session.current.wordId,id);assert.equal(s.session.current.relearn,true);const prior=s.session.current,events=s.events,skills=s.skills;
  await mark(page,id);await unmark(page,id);await resume(page,'review');s=await state(page);assert.deepEqual(s.session.current,prior);assert.deepEqual(s.events,events);assert.deepEqual(s.skills,skills);pass('Meaning-review relearn task survives marking and cancelling with its original token and history');
 }finally{await context.close();}
}

async function persistence(){
 const original=await fresh(),{page,context,ids}=original;let restored,portable;try{
  await begin(page,'spelling',ids.slice(0,2));const id=(await current(page)).word.id;await spell(page,'wrong');await next(page);await page.locator('#spell-input').fill('pause à reprendre');await saved(page);const before=(await state(page)).cards[id];await mark(page,id);await page.locator('#spell-input').fill('second brouillon');await saved(page);const expected=await state(page);
  await page.reload();await ready(page);sameRecords(await state(page),expected);pass('Reload preserves manual flags, suspended correction, current question and typed draft');
  const backup=await download(page,'backup','mastery-backup.json'),payload=JSON.parse(fs.readFileSync(backup,'utf8'));sameRecords(payload.state,expected);assert.equal(payload.state.cards[id].manualMastered,true);
  restored=await boot();await show(restored.page,'settings');await restored.page.locator('#backup-input').setInputFiles(backup);await restored.page.locator('[data-action=commit-restore]').click();await restored.page.waitForFunction(()=>!document.getElementById('modal').open);sameRecords(await state(restored.page),expected);pass('Actual JSON download and restore UI retain full mastery and paused-question data in a fresh context');
  const portableFile=await download(page,'portable','mastery-portable.html');portable=await boot(portableFile);sameRecords(await state(portable.page),expected);pass('Actual portable HTML restores full mastery state offline in a separate browser context');
  await unmark(portable.page,id);assert.deepEqual((await state(portable.page)).cards[id],before);await resume(portable.page,'spelling');await spell(portable.page,(await current(portable.page)).word.spell);await next(portable.page);assert.equal((await current(portable.page)).correction,true);assert.equal(await portable.page.locator('#spell-input').inputValue(),'pause à reprendre');pass('Portable restoration still allows cancelling mastery and resuming the suspended correction/draft');
  await word(page,id);await page.locator('#modal-footer [data-action=edit-word]').click();await page.locator('[data-action=delete-word]').click();await page.locator('[data-action=confirm-delete-word]').click();await page.waitForFunction(id=>!VocabApp.getState().cards[id],id);let s=await state(page);const trash=s.trash.find(t=>t.word?.id===id);assert.equal(trash.attachments.cards[id].manualMastered,true);await page.locator('[data-action=manage]').click();await page.locator('[data-action=trash]').click();await page.locator('[data-action=restore-trash][data-id="'+trash.id+'"]').click();await waitMarked(page,id);assert.deepEqual((await state(page)).cards[id],expected.cards[id]);await close(page);pass('Delete/restore through the word recycle bin preserves original scheduling and manual mastery');
  await page.locator('[data-action=manage]').click();await page.locator('[data-action=reset-deck]').click();assert.match(await page.locator('#modal-body').innerText(),/标熟/);await page.locator('[data-action=confirm-reset-deck]').click();await page.waitForFunction(()=>!Object.values(VocabApp.getState().cards).some(c=>c.manualMastered));s=await state(page);assert.equal(s.session,null);assert.deepEqual(s.events,[]);assert.deepEqual(s.skills,{});assert.equal(s.decks[0].words.length,6);pass('Confirmed deck reset clears mastery and progress while keeping vocabulary');
 }finally{await portable?.context.close();await restored?.context.close();await context.close();}
}

async function saveFailure(){
 const {page,context,ids}=await fresh();try{
  await begin(page,'spelling',ids.slice(0,2));await page.locator('#spell-input').fill('non enregistré');await saved(page);const before=await state(page),id=before.session.current.wordId;
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;window.__masteryFailure={count:0,restore:()=>{IDBObjectStore.prototype.put=original;}};IDBObjectStore.prototype.put=function(...args){if(this.name==='snapshots'){window.__masteryFailure.count++;this.transaction.abort();throw new DOMException('Synthetic snapshot quota failure','QuotaExceededError');}return original.apply(this,args);};});
  await page.locator('.shortcut-note [data-action=master-word]').click();await page.waitForFunction(()=>window.__masteryFailure.count>0&&document.querySelector('#toast').textContent.includes('保存'));await page.locator('.shortcut-note [data-action=master-word]').waitFor({state:'visible'});
  const after=await state(page);assert.deepEqual(after.cards,before.cards);assert.deepEqual(after.events,before.events);assert.deepEqual(after.skills,before.skills);assert.deepEqual(after.session,before.session);assert.equal(await page.locator('#spell-input').inputValue(),'non enregistré');const disk=await page.evaluate(async()=>(await VocabData.load()).state);assert.equal(disk.cards[id].manualMastered,undefined);assert.deepEqual(disk.session,before.session);assert.equal(await page.locator('.shortcut-note [data-action=master-word]').isEnabled(),true);pass('Actual snapshot transaction failure leaves mastery, question and draft intact, reports failure and re-enables the control');
  await page.evaluate(()=>window.__masteryFailure.restore());await mark(page,id);await saved(page);assert.equal((await state(page)).cards[id].manualMastered,true);pass('The same mastery action succeeds once storage writes recover');
 }finally{await context.close();}
}

async function corruptedStorage(){
 const {page,context,ids}=await fresh();try{
  await begin(page,'learn',ids.slice(0,2));const before=await state(page),id=before.session.current.wordId;
  const raw=await page.evaluate(async id=>{const s=VocabApp.getState();s.cards[id].manualMastered='invalid';await new Promise((resolve,reject)=>{const request=indexedDB.open('FR_VOCAB_DATA_V4',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('data','readwrite');tx.objectStore('data').put(s,'state');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});return s;},id);
  await page.locator('.shortcut-note [data-action=master-word]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('校验'));assert.deepEqual((await state(page)).cards,before.cards);assert.deepEqual((await state(page)).session,before.session);
  const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('FR_VOCAB_DATA_V4',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,q=db.transaction('data','readonly').objectStore('data').get('state');q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};}));assert.deepEqual(stored,raw);pass('Malformed persisted mastery is rejected during the real save and its original archive is not overwritten');
 }finally{await context.close();}
}

async function touchLayouts(){
 const {page,context,ids}=await fresh({touch:true});try{
  assert.equal(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches),true);
  for(const language of ['zh','en','fr']){
   await show(page,'settings');await page.locator('#settings-form select[name=language]').selectOption(language);
   const submit=page.locator('#settings-form button[type=submit]');if(await submit.isEnabled())await submit.click();await page.waitForFunction(language=>VocabApp.getState().settings.language===language,language);
   await begin(page,'learn',ids.slice(0,2));
   for(const [name,viewport]of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
    await page.setViewportSize(viewport);await layout(page,'touch '+language+' '+name+' footer');assert.equal(await page.locator('.shortcut-note .desktop-hint').isVisible(),false);await screenshot(page,'touch-'+language+'-'+name);
   }
  }
  pass('Touch contexts keep hints hidden and all three languages usable in portrait and landscape');
 }finally{await context.close();}
}

async function delayActualRead(page,skip){
 await page.evaluate(skip=>{
  const original=IDBObjectStore.prototype.get,gate=window.__masteryReadGate={skip,waiting:false,released:false,intercepted:false,reads:0,restore:()=>{IDBObjectStore.prototype.get=original;}};
  IDBObjectStore.prototype.get=function(...args){
   const store=this,request=original.apply(store,args);
   if(!gate.intercepted&&store.name==='data'&&store.transaction.mode==='readwrite'&&args[0]==='state'&&gate.skip--===0){
    gate.intercepted=true;
    // The original read result and eventual real writes remain untouched.
    // Repeated real reads keep its transaction active until the test releases
    // the original success callback after an ordinary navigation/UI action.
    Object.defineProperty(request,'onsuccess',{configurable:true,set(handler){request.addEventListener('success',event=>{
     gate.waiting=true;
     const pump=()=>{const keepalive=original.call(store,'synthetic-mastery-keepalive');gate.reads++;keepalive.onsuccess=()=>{if(gate.released)handler.call(request,event);else pump();};};pump();
    });}});
   }
   return request;
  };
 },skip);
}
async function releaseRead(page){await page.evaluate(()=>{window.__masteryReadGate.released=true;window.__masteryReadGate.restore();});}
async function asynchronousNavigation(){
 for(const phase of ['draft','snapshot']){
  const {page,context,ids}=await fresh();try{
   await begin(page,'spelling',ids.slice(0,2));await page.locator('#spell-input').fill('saisie pendant sauvegarde');await saved(page);const before=await state(page),id=before.session.current.wordId;
   await delayActualRead(page,phase==='draft'?0:1);await page.locator('.shortcut-note [data-action=master-word]').click();await page.waitForFunction(()=>window.__masteryReadGate.waiting);assert.equal(await page.locator('#spell-input').getAttribute('readonly'),'');
   if(phase==='draft')await page.locator('[data-action=pause]').click();else await page.locator('[data-action=study-options]').click();
   const title=phase==='snapshot'?await page.locator('#modal-title').innerText():null;
   await releaseRead(page);
   if(phase==='draft'){
    await page.waitForFunction(()=>VocabApp.getView()==='today');const after=await state(page);assert.deepEqual(after.cards,before.cards);assert.deepEqual(after.session,before.session);assert.deepEqual(after.events,before.events);await resume(page,'spelling');assert.equal(await page.locator('#spell-input').inputValue(),'saisie pendant sauvegarde');assert.equal(await page.locator('#spell-input').isEditable(),true);pass('Navigating home during the real draft write cancels the stale mastery action and preserves the exact current input');
   }else{
    await waitMarked(page,id);assert.equal(await page.locator('#modal').evaluate(el=>el.open),true);assert.equal(await page.locator('#modal-title').innerText(),title);const after=await state(page);assert.deepEqual(after.session.masteryPauses[id].current,before.session.current);assert.deepEqual(after.session.masteryPauses[id].draft,before.session.draft);assert.deepEqual(after.events,before.events);await close(page);pass('Opening study options during the real mastery write keeps the newer dialog open and retains the suspended input');
   }
   assert.ok(await page.evaluate(()=>window.__masteryReadGate.reads>0));
  }finally{await context.close();}
 }
}

(async()=>{try{
 for(engine of engines){browser=await launchBrowser(engine);report.browsers.push({engine,version:browser.version()});await basics();await touchLayouts();for(const kind of ['spelling','dictation'])for(const phase of ['correction','revealed','answered'])await practicePreservation(kind,phase);await reviewPreservation();await persistence();await saveFailure();await corruptedStorage();await asynchronousNavigation();await browser.close();browser=null;}
 assert.deepEqual(report.errors,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),report.sha256,'Generated HTML must remain unchanged throughout this review');report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}finally{await browser?.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,output:out}));}})();
