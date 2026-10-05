/* Manual, comparative performance evidence; intentionally not a CI time gate.
 * Set CARNET_PREVIOUS_RELEASE to an unmodified official HTML and
 * CARNET_RELEASE_HTML to the built candidate. Optional: CARNET_PERF_REPEATS=3,
 * CARNET_PERF_PREPARE_ONLY=1, and the normal runtime/results overrides.
 * Never point this tool at a personal portable HTML or an existing profile.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const paths=require('./paths.cjs');
const baseline=paths.previousRelease;
assert.ok(baseline,'CARNET_PREVIOUS_RELEASE must identify the unmodified official baseline HTML');
const out=path.join(paths.runRoot,'onboarding-performance');fs.mkdirSync(out,{recursive:true});
const repeats=Number(process.env.CARNET_PERF_REPEATS||3),scrollMs=4000;
assert.ok(Number.isInteger(repeats)&&repeats>0&&repeats<=10);
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function hasPortableState(html){
 const scriptTags=html.match(/<script\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)||[];
 return scriptTags.some(tag=>/(?:^|\s)id\s*=\s*(?:"portable-state"|'portable-state'|portable-state(?=\s|\/?>))/i.test(tag));
}
function freezeFile(file,label){const bytes=fs.readFileSync(file);assert.ok(!hasPortableState(bytes.toString()),'Personal portable HTML is forbidden');const target=path.join(out,label+'.html');fs.writeFileSync(target,bytes);return {file:target,sha256:sha(bytes),bytes:bytes.length};}
const files={baseline:freezeFile(path.resolve(baseline),'official-baseline'),candidate:freezeFile(paths.releaseFile,'built-candidate')};
if(process.env.CARNET_PERF_BASELINE_SHA256)assert.equal(files.baseline.sha256,process.env.CARNET_PERF_BASELINE_SHA256);
function bundledRuntime(html){
 const context=vm.createContext({console,setTimeout,clearTimeout,VOCAB_RELEASE:'performance-fixture'});
 for(const name of ['legacy-parser.js','assistant-import.js','legacy-core.js','vendor/fsrs.umd.js','history.js','engine.js','data.js']){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=html.match(new RegExp('<script data-bundled-source="'+escaped+'">([\\s\\S]*?)<\\/script>'));
  assert.ok(match,'Missing baseline module '+name);vm.runInContext(match[1],context,{filename:name});
 }
 return context;
}
// Every word, meaning, example and event is invented. The template history is
// produced through the baseline's actual learning engine, then assigned to
// fictional words; all final fixtures pass that baseline's full validator.
function syntheticFixture(count){
 const D=VocabData,E=VocabEngine,H=VocabHistory,DAY=86400000,epoch=Date.UTC(2024,0,1,10);
 const copy=x=>JSON.parse(JSON.stringify(x));
 const entry=i=>({french:'motfictif'+String(i).padStart(5,'0'),meaning:'虚构测试词条 '+i+'；仅用于性能验证',pos:'n.m.',example:'Voici un mot fictif pour cet essai.',exampleZh:'这是供测试使用的虚构词条。',usage:'Contenu synthétique, sans source personnelle.'});
 let state=D.fresh();
 for(let offset=0;offset<count;offset+=5000)state=D.importEntries(state,Array.from({length:Math.min(5000,count-offset)},(_,i)=>entry(offset+i)),{name:'Synthetic fixture '+(offset/5000+1),mode:'new'}).state;
 state.settings.studyDeckIds=state.decks.map(d=>d.id);state.settings.onboardingComplete=false;
 E.ensureState(state,epoch);
 let template=D.importEntries(D.fresh(),[entry(99999)],{name:'Synthetic event model',mode:'new'}).state;
 template.settings.studyDeckIds=template.decks.map(d=>d.id);template.settings.listening=false;E.ensureState(template,epoch);
 const modelWord=template.decks[0].words[0];let time=epoch;
 for(let n=0;n<5;n++){
  E.start(template,n?'review':'learn',{wordIds:[modelWord.id],limit:1,ignoreGoal:true},time);
  if(!n)E.skipToRecall(template);E.reveal(template);E.answer(template,{rating:3},time);E.next(template,time);E.finish(template);time=template.cards[modelWord.id].dueAt;
 }
 for(let n=0;n<20;n++){time+=DAY;E.start(template,'spelling',{wordIds:[modelWord.id],limit:1},time);E.answer(template,{typed:modelWord.french},time);E.next(template,time);E.finish(template);}
 const modelEvents=copy(template.events),learned=Math.floor(count/5);let index=0;
 function shift(value,offset){if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(['time','dueAt','due','last_review','review','at','lastPracticedAt'].includes(key)&&typeof value[key]==='number'&&value[key]>1000000000000)value[key]+=offset;else if(typeof value[key]==='object')shift(value[key],offset);}}
 for(const deck of state.decks)for(const word of deck.words){
  if(index<learned){
   const offset=Math.floor(index*600/Math.max(learned,1))*DAY,card=copy(template.cards[modelWord.id]);card.wordId=word.id;shift(card,offset);state.cards[word.id]=card;
   state.skills[word.id]=copy(template.skills[modelWord.id]);shift(state.skills[word.id],offset);
   for(let n=0;n<modelEvents.length;n++){const event=copy(modelEvents[n]);event.id='synthetic-event-'+index+'-'+n;event.sessionId='synthetic-session-'+index+'-'+n;event.wordId=word.id;event.deckId=deck.id;delete event.contentVersion;shift(event,offset);state.events.push(event);}
  }
  index++;
 }
 state.events.sort((a,b)=>a.time-b.time);state.createdAt=epoch;state.session=null;
 state=D.validate(state);E.ensureState(state,epoch);state=D.validate(state);
 return JSON.stringify({state,meta:{words:count,learnedWords:learned,events:H.allEvents(state).length,activeEvents:state.events.length,archiveBlocks:(state.eventArchive||[]).length,contexts:Object.keys(state.contexts).length,description:'Invented vocabulary; baseline-engine learning and spelling history spread over 600 days; immersive default appearance; onboardingComplete=false'}});
}
const runtime=bundledRuntime(fs.readFileSync(files.baseline.file,'utf8')),fixtures={};
let scaleLimitError='';
try{vm.runInContext('('+syntheticFixture.toString()+')(8500)',runtime);}catch(error){scaleLimitError=error.message;}
assert.match(scaleLimitError,/5000/,'Baseline must enforce the documented total-word limit');
for(const [name,count] of [['default50',50],['large5000',5000]]){
 const result=JSON.parse(vm.runInContext('('+syntheticFixture.toString()+')('+count+')',runtime));
 const json=JSON.stringify(result.state);fixtures[name]={state:result.state,meta:{...result.meta,bytes:Buffer.byteLength(json),sha256:sha(json)}};
 fs.writeFileSync(path.join(out,name+'-synthetic.json'),json);
}
const report={createdAt:new Date().toISOString(),scaleLimit:{requested:8500,tested:5000,reason:'Official 4.16.2 rejects more than 5000 total words; the upper supported size is used without changing product limits.',baselineValidationError:scaleLimitError},conditions:{platform:os.platform(),architecture:os.arch(),osRelease:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),node:process.version,viewport:{width:1440,height:1000},deviceScaleFactor:1,headless:true,cpuThrottling:'none',motion:'no-preference; saved carnetMotion=immersive',network:'Offline; single local HTML; no audio playback',isolation:'New incognito browser context per sample; never uses an existing browser profile',sampling:'Alternating baseline/candidate order across repetitions; one browser and sample at a time',scroll:'4 seconds of requestAnimationFrame-driven document scrolling from chapter 0 to 2.8 and back; no animation or content is removed',readiness:'First two animation frames after journey, lesson controls and hidden scene loader are present',instrumentation:'Init-script wrapper times original VocabApp.getState and getSettings; no source replacements. Instrumentation and frame sampling have a small shared overhead.',limits:'Local headless Chromium result using runtime-default rendering; frame intervals are animation-frame callbacks, not measured display presentation. Empty scenario is first navigation; data scenarios are reload after synthetic IndexedDB seeding. No absolute millisecond pass/fail threshold; no generalization to Safari/mobile or personal archives.',repeats,scrollMs},files,fixtures:Object.fromEntries(Object.entries(fixtures).map(([k,v])=>[k,v.meta])),samples:[]};
const write=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));write();
if(process.env.CARNET_PERF_PREPARE_ONLY==='1'){console.log('Prepared synthetic fixtures:',JSON.stringify(report.fixtures));process.exit(0);}

function instrument(){
 const counters=()=>({count:0,totalMs:0,maxMs:0});
 const probe=window.__onboardingPerf={phase:'startup',calls:{startup:{getState:counters(),getSettings:counters()},scroll:{getState:counters(),getSettings:counters()}},ready:null};
 let app;
 Object.defineProperty(window,'VocabApp',{configurable:true,get(){return app;},set(value){app=value;for(const key of ['getState','getSettings']){const original=value?.[key];if(typeof original!=='function')continue;value[key]=function(...args){const started=performance.now();try{return original.apply(this,args);}finally{const bucket=probe.calls[probe.phase]?.[key];if(bucket){const duration=performance.now()-started;bucket.count++;bucket.totalMs+=duration;bucket.maxMs=Math.max(bucket.maxMs,duration);}}};}}});
 let stable=0;
 function check(){
  if(document.body?.dataset.carnetView==='journey'&&document.querySelector('.carnet-loading')?.hidden&&document.querySelector('#carnet-lessons [data-lesson-chapter]'))stable++;else stable=0;
  if(stable>=2){probe.ready={navigationToReadyMs:performance.now(),calls:JSON.parse(JSON.stringify(probe.calls.startup))};probe.phase='idle';}else requestAnimationFrame(check);
 }
 requestAnimationFrame(check);
}
function frameSummary(intervals){const sorted=intervals.slice().sort((a,b)=>a-b);const q=p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]||0;return {frames:intervals.length,medianMs:q(.5),p95Ms:q(.95),maxMs:sorted.at(-1)||0,over33ms:intervals.filter(n=>n>33.4).length,over50ms:intervals.filter(n=>n>50).length};}
async function sample(browser,label,scenario,repeat){
 const context=await browser.newContext({viewport:report.conditions.viewport,deviceScaleFactor:1,reducedMotion:'no-preference',locale:'zh-CN',timezoneId:'Asia/Shanghai',offline:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(instrument);page.setDefaultTimeout(120000);
 const ready=()=>page.waitForFunction(()=>window.__onboardingPerf?.ready,null,{timeout:120000});
 const started=Date.now();
 try{
  await page.goto(pathToFileURL(files[label].file).href,{waitUntil:'load',timeout:120000});await ready();
  if(scenario!=='empty'){
   await page.evaluate(async state=>{const clean=VocabData.validate(state);await new Promise((resolve,reject)=>{const request=indexedDB.open('FR_VOCAB_DATA_V4',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('data','readwrite');tx.objectStore('data').put(clean.eventArchive?.length?{storageFormat:'history-blocks-v1',state:clean}:clean,'state');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});},fixtures[scenario].state);
   await page.reload({waitUntil:'load',timeout:120000});await ready();
  }
  const startup=await page.evaluate(()=>({ready:__onboardingPerf.ready,startup:VocabCarnetProduct.getStartup(),scene:VocabCarnetReview.getState().scene,navigation:performance.getEntriesByType('navigation')[0]?.toJSON()}));
  assert.equal(startup.startup.wordCount,scenario==='empty'?0:fixtures[scenario].meta.words);
  assert.equal(startup.startup.blocked,false);assert.equal(startup.startup.needsOnboarding,true);
  await page.waitForTimeout(350);
  const scrolling=await page.evaluate(duration=>new Promise(resolve=>{
   const probe=__onboardingPerf;probe.phase='scroll';const intervals=[],start=performance.now(),unit=VocabCarnetReview.getState().unit;let last=null;
   function tick(now){if(last!==null)intervals.push(now-last);last=now;const p=Math.min(1,(now-start)/duration),triangle=p<.5?p*2:(1-p)*2;scrollTo({top:unit*2.8*triangle,behavior:'instant'});if(p<1)requestAnimationFrame(tick);else requestAnimationFrame(()=>{probe.phase='idle';resolve({elapsedMs:performance.now()-start,intervals,calls:probe.calls.scroll});});}
   requestAnimationFrame(tick);
  }),scrollMs);
  assert.deepEqual(errors,[],'Unexpected page errors');
  const result={label,scenario,repeat,startedAt:new Date(started).toISOString(),loadAverage:os.loadavg(),startup,scroll:{...scrolling,summary:frameSummary(scrolling.intervals)}};
  report.samples.push(result);write();console.log(JSON.stringify({label,scenario,repeat,readyMs:startup.ready.navigationToReadyMs,startupGetState:startup.ready.calls.getState,scrollGetState:scrolling.calls.getState,frames:result.scroll.summary}));
 }finally{await context.close();}
}
function median(values){const n=values.slice().sort((a,b)=>a-b);return n.length%2?n[(n.length-1)/2]:(n[n.length/2-1]+n[n.length/2])/2;}
(async()=>{
 const {launchBrowser,launchOptions}=require('./runtime.cjs'),browser=await launchBrowser('chromium');report.conditions.browser=browser.version();report.conditions.browserArgs=launchOptions('chromium').args;report.conditions.executableOverride=!!process.env.CARNET_CHROME;
 try{for(let repeat=1;repeat<=repeats;repeat++)for(const scenario of ['empty','default50','large5000'])for(const label of repeat%2?['baseline','candidate']:['candidate','baseline'])await sample(browser,label,scenario,repeat);}
 finally{await browser.close();write();}
 report.medians=[];
 for(const scenario of ['empty','default50','large5000'])for(const label of ['baseline','candidate']){const samples=report.samples.filter(x=>x.scenario===scenario&&x.label===label);report.medians.push({scenario,label,samples:samples.length,readyMs:median(samples.map(x=>x.startup.ready.navigationToReadyMs)),startupGetStateCount:median(samples.map(x=>x.startup.ready.calls.getState.count)),startupGetStateMs:median(samples.map(x=>x.startup.ready.calls.getState.totalMs)),scrollGetStateCount:median(samples.map(x=>x.scroll.calls.getState.count)),scrollGetStateMs:median(samples.map(x=>x.scroll.calls.getState.totalMs)),frameMedianMs:median(samples.map(x=>x.scroll.summary.medianMs)),frameP95Ms:median(samples.map(x=>x.scroll.summary.p95Ms)),frameMaxMs:median(samples.map(x=>x.scroll.summary.maxMs)),frames:median(samples.map(x=>x.scroll.summary.frames)),over50ms:median(samples.map(x=>x.scroll.summary.over50ms))});}
 write();
 const md=['# Onboarding performance comparison','',`Requested 8500 words exceed the official baseline limit. Tested its supported maximum of 5000 words with 25000 records. Baseline validation: ${scaleLimitError}`,'',...Object.entries(report.conditions).map(([key,value])=>'- '+key+': '+(typeof value==='object'?JSON.stringify(value):value)),'','| Scenario | Build | Ready ms | Startup full copies / ms | Scroll full copies / ms | Frame median / p95 / max ms | Frames / >50ms |','| --- | --- | ---: | ---: | ---: | ---: | ---: |',...report.medians.map(x=>`| ${x.scenario} | ${x.label} | ${x.readyMs.toFixed(1)} | ${x.startupGetStateCount} / ${x.startupGetStateMs.toFixed(1)} | ${x.scrollGetStateCount} / ${x.scrollGetStateMs.toFixed(1)} | ${x.frameMedianMs.toFixed(1)} / ${x.frameP95Ms.toFixed(1)} / ${x.frameMaxMs.toFixed(1)} | ${x.frames} / ${x.over50ms} |`),'','Fixture and release hashes, raw samples, frame intervals and per-call totals are in results.json. Synthetic fixtures and byte-identical frozen HTMLs are saved beside it.'];
 fs.writeFileSync(path.join(out,'summary.md'),md.join('\n')+'\n');console.log('RESULTS',path.join(out,'results.json'));console.table(report.medians);
})().catch(error=>{report.failure=error.stack;write();console.error(error);process.exitCode=1;});
