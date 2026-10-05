/* Manual B/C startup comparison. B is the optimized 4.16.3, never 4.16.2.
 * CARNET_PREVIOUS_RELEASE: archived B HTML; CARNET_STARTUP_BASELINE_SRC: its src/.
 * CARNET_STARTUP_STAGE=B|C|both (default both), CARNET_STARTUP_REPEATS=5.
 * For staged runs set CARNET_STARTUP_BASELINE_RESULTS to B's results.json in C.
 * CARNET_STARTUP_FIXTURES may name the prior synthetic performance output folder.
 * Optional CARNET_STARTUP_PREPARE_ONLY=1; normal release/runtime/results overrides apply.
 * No existing browser profile, portable HTML, private vocabulary, or CI time gate.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const paths=require('./paths.cjs');
const out=path.join(paths.runRoot,'startup-performance');fs.mkdirSync(out,{recursive:true});
const baseline=paths.previousRelease,baselineSrc=process.env.CARNET_STARTUP_BASELINE_SRC;
assert.ok(baseline&&baselineSrc,'Provide archived B HTML and src via CARNET_PREVIOUS_RELEASE and CARNET_STARTUP_BASELINE_SRC');
const expectedBaseline='7df43effaaa459348429fdd2e648ceeec9cb290504ad1b2acb21dba6e9719ac3';
const stage=process.env.CARNET_STARTUP_STAGE||'both',repeats=Number(process.env.CARNET_STARTUP_REPEATS||5),scrollMs=4000;
assert.ok(['B','C','both'].includes(stage));assert.ok(Number.isInteger(repeats)&&repeats>=5&&repeats<=20);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function portable(html){return (html.match(/<script\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)||[]).some(tag=>/(?:^|\s)id\s*=\s*(?:"portable-state"|'portable-state'|portable-state(?=\s|\/?>))/i.test(tag));}
function frozen(file,label){const bytes=fs.readFileSync(file);assert.ok(!portable(bytes.toString()),'Refusing portable personal data');const target=path.join(out,label+'.html');fs.writeFileSync(target,bytes);return {file:target,bytes:bytes.length,sha256:sha(bytes)};}
function freezeSource(root,label){assert.ok(!portable(fs.readFileSync(path.join(root,'index.html'),'utf8')),'Refusing portable personal data in preview');const target=path.join(out,label+'-src');fs.cpSync(root,target,{recursive:true,filter:file=>!file.endsWith('.html')||path.basename(file)==='index.html'});assert.ok(!portable(fs.readFileSync(path.join(target,'index.html'),'utf8')));const names=[];function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else names.push(path.relative(target,file)+':'+sha(fs.readFileSync(file)));}}walk(target);return {file:path.join(target,'index.html'),sourceTreeSha256:sha(names.sort().join('\n')),files:names.length};}
const files={B:frozen(baseline,'B-optimized-4.16.3')};assert.equal(files.B.sha256,expectedBaseline,'B must be the archived optimized 4.16.3');
files.B.preview=freezeSource(path.resolve(baselineSrc),'B');
if(stage!=='B'){files.C=frozen(paths.releaseFile,'C-splash-4.16.3');files.C.preview=freezeSource(paths.sourceRoot,'C');}
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
const fixtures={},runtime=bundledRuntime(fs.readFileSync(files.B.file,'utf8'));
const supplied=process.env.CARNET_STARTUP_FIXTURES;
const suppliedReport=supplied?JSON.parse(fs.readFileSync(path.join(supplied,'results.json'),'utf8')):null;
for(const [key,count] of [['default50',50],['large5000',5000]]){
 let state,meta;
 if(supplied){const raw=fs.readFileSync(path.join(supplied,key+'-synthetic.json'));meta=suppliedReport.fixtures[key];assert.match(meta.description,/Invented vocabulary/);assert.equal(sha(raw),meta.sha256);state=JSON.parse(raw);}
 else({state,meta}=JSON.parse(vm.runInContext('('+syntheticFixture.toString()+')('+count+')',runtime)));
 state.settings.onboardingComplete=true;
 // Same bytes for B/C and every repeat, and no engine/state changes in startup.
 const json=JSON.stringify(state);fixtures[key]={state,meta:{...meta,description:'Synthetic returning user; '+meta.description,onboardingComplete:true,bytes:Buffer.byteLength(json),sha256:sha(json)}};
 fs.writeFileSync(path.join(out,key+'-synthetic.json'),json);
}
const baselineReport=process.env.CARNET_STARTUP_BASELINE_RESULTS?JSON.parse(fs.readFileSync(process.env.CARNET_STARTUP_BASELINE_RESULTS,'utf8')):null;
if(baselineReport){assert.equal(baselineReport.files.B.sha256,expectedBaseline);assert.equal(baselineReport.files.B.preview.sourceTreeSha256,files.B.preview.sourceTreeSha256,'B source snapshot must remain identical');for(const key of Object.keys(fixtures))assert.equal(fixtures[key].meta.sha256,baselineReport.fixtures[key].sha256,'Staged B/C must use identical fixtures');}
const conditions={platform:os.platform(),architecture:os.arch(),osRelease:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),node:process.version,viewport:{width:1440,height:900},deviceScaleFactor:1,headless:true,cpuThrottling:'none',motion:'no-preference; formal immersive preference retained; developer preview keeps its existing system preference',network:'Offline, local file; no audio playback',isolation:'New incognito context per sample; no existing profile',cache:'Fresh context for each repeat; returning samples reload after an untimed seed navigation. Browser process and OS file cache may stay warm.',repeats,scrollMs,scrollTrajectory:'Full document down and back in 4 seconds, retaining all opening scenes and lesson chapters; actual observed chapters recorded',targetReadyDefinition:'Identical B/C observer: application attached; current target DOM and controls established; journey additionally waits current scene promise (not disposed), usable scene backend and decoded static image if applicable; then two RAF callbacks. Does not wait for startup-shell removal.',dataReadyDefinition:'Common dataReadyMs is VocabApp assignment after required data handling and initial render; loadResolvedMs separately records original D.load resolution. C product data-ready mark is also reported, without substituting it for B.',feedbackDefinition:'firstVisibleFeedbackMs is first RAF observation of visible branded shell, local loading text, old boot message, or target content. Browser first-paint/FCP are separate paint timings; RAF observation is not proof of pixel presentation.',handoffDefinition:'C removal and product target-ready marks are recorded separately; productExitMs measures the intended exit transition. It is not included in common targetReadyMs.',sampling:'One sample/browser at a time. Both mode alternates B/C; staged mode timestamps and baseline provenance are retained.',limits:'Five local headless Chromium samples per key scenario; warm-cache, scheduling and instrumentation variability remain. RAF intervals are not display presentation FPS. Headless Chromium does not establish Safari/iOS results; no absolute time CI gate.'};
const report={createdAt:new Date().toISOString(),stage,conditions,files,fixtures:Object.fromEntries(Object.entries(fixtures).map(([k,v])=>[k,v.meta])),baselineReport:process.env.CARNET_STARTUP_BASELINE_RESULTS||null,baselineConditions:baselineReport?.conditions||null,samples:[],historicalBaselineSamples:baselineReport?.samples.filter(s=>s.label==='B')||[]};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));save();
if(process.env.CARNET_STARTUP_PREPARE_ONLY==='1'){console.log('Prepared startup comparison',out);process.exit(0);}

function instrument({target}){
 const bucket=()=>({count:0,totalMs:0,maxMs:0}),newPhase=()=>({getState:bucket(),getSettings:bucket()});
 const p=window.__startupPerf={phase:'startup',calls:{startup:newPhase(),replay:newPhase(),scroll:newPhase()},appAttachedMs:null,loadStartedMs:null,loadResolvedMs:null,loadCalls:0,sceneMounts:0,scene:null,paints:{},longTasks:[],firstVisibleFeedbackMs:null,feedbackKind:null,shellSeen:false,shellRemovedMs:null,targetReadyMs:null,targetAtReady:null,marks:{},replayShellSeen:false};
 let expected=target,stable=0,observing=true,epoch=0;
 function intercept(name,transform){let value;Object.defineProperty(window,name,{configurable:true,get:()=>value,set:next=>{value=transform(next);}});}
 function timed(fn,key){return function(...args){const started=performance.now();try{return fn.apply(this,args);}finally{const b=p.calls[p.phase]?.[key];if(b){const ms=performance.now()-started;b.count++;b.totalMs+=ms;b.maxMs=Math.max(b.maxMs,ms);}}};}
 intercept('VocabApp',value=>{p.appAttachedMs=performance.now();for(const key of ['getState','getSettings'])if(typeof value?.[key]==='function')value[key]=timed(value[key],key);return value;});
 intercept('VocabData',value=>{if(typeof value?.load!=='function')return value;const original=value.load,wrapped={...value,async load(...args){p.loadCalls++;p.loadStartedMs=performance.now();const result=await original.apply(value,args);p.loadResolvedMs=performance.now();return result;}};return Object.isFrozen(value)?Object.freeze(wrapped):wrapped;});
 intercept('VocabCarnetScene',value=>{const mount=value.mount,destroy=value.destroy;value.mount=function(...args){const current=++epoch;p.sceneMounts++;p.scene={pending:true,epoch:current};const result=mount.apply(this,args);Promise.resolve(result).then(state=>{if(current===epoch)p.scene={pending:false,epoch:current,backend:state?.backend,resolvedMs:performance.now()};},error=>{if(current===epoch)p.scene={pending:false,epoch:current,error:String(error)};});return result;};value.destroy=function(...args){epoch++;p.scene=null;return destroy.apply(this,args);};return value;});
 for(const type of ['paint','longtask','mark'])try{new PerformanceObserver(list=>{for(const e of list.getEntries()){if(type==='paint')p.paints[e.name]=e.startTime;if(type==='mark'&&e.name.startsWith('startup:')){p.marks[e.name]=e.startTime;if(e.name==='startup:removed'){p.shellRemovedMs=e.startTime;p.shellRemovalSource='product-mark';}}if(type==='longtask')p.longTasks.push({start:e.startTime,duration:e.duration});}}).observe({type,buffered:true});}catch(_){}
 function visible(node){if(!node||!node.getClientRects().length)return false;for(let n=node;n&&n.nodeType===1;n=n.parentElement){const style=getComputedStyle(n);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;}return true;}
 function ready(){
  if(p.appAttachedMs===null||!window.VocabCarnetReview)return false;
  if(expected==='today')return document.body?.dataset.carnetView==='app'&&window.VocabApp.getView()==='today'&&!!document.querySelector('#app .main .page-header');
  if(document.body?.dataset.carnetView!=='journey'||!document.querySelector('#carnet-lessons [data-lesson-chapter]')||!document.querySelector('.carnet-caption'))return false;
  if(!p.scene||p.scene.pending||!p.scene.backend||['none','disposed'].includes(p.scene.backend))return false;
  if(p.scene.backend==='static'){const imgs=[...document.querySelectorAll('#carnet-scene-host img')].filter(visible);if(imgs.some(img=>!img.complete||!img.naturalWidth))return false;}
  return true;
 }
 function tick(){
  const shell=document.getElementById('startup-shell');if(shell){p.shellSeen=true;if(p.phase==='replay'||p.phase==='scroll')p.replayShellSeen=true;}else if(p.shellSeen&&p.shellRemovedMs===null)p.shellRemovedMs=performance.now();
  if(p.firstVisibleFeedbackMs===null){for(const [kind,selector] of [['startup-shell','#startup-shell .startup-brand'],['local-loading','.carnet-loading'],['old-boot','#app .boot'],['target','.carnet-caption, #app .main .page-header']])if(visible(document.querySelector(selector))){p.firstVisibleFeedbackMs=performance.now();p.feedbackKind=kind;break;}}
  if(observing){stable=ready()?stable+1:0;if(stable>=2){observing=false;p.targetReadyMs=performance.now();p.targetAtReady={expected,sceneMounts:p.sceneMounts,scene:p.scene,calls:JSON.parse(JSON.stringify(p.calls[p.phase]||{}))};}}
  if(observing||p.shellSeen&&p.shellRemovedMs===null||p.firstVisibleFeedbackMs===null)requestAnimationFrame(tick);
 }
 p.beginReplay=()=>{p.phase='replay';expected='journey';stable=0;observing=true;p.targetReadyMs=null;p.replayStartedMs=performance.now();requestAnimationFrame(tick);};
 requestAnimationFrame(tick);
}
function summary(values){if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b),mid=sorted.length/2;return {n:sorted.length,median:sorted.length%2?sorted[Math.floor(mid)]:(sorted[mid-1]+sorted[mid])/2,min:sorted[0],max:sorted.at(-1),p95:sorted[Math.floor((sorted.length-1)*.95)]};}
async function snapshot(page){return page.evaluate(()=>{const p=__startupPerf;return {appAttachedMs:p.appAttachedMs,loadStartedMs:p.loadStartedMs,loadResolvedMs:p.loadResolvedMs,loadCalls:p.loadCalls,dataReadyMs:p.appAttachedMs,firstVisibleFeedbackMs:p.firstVisibleFeedbackMs,feedbackKind:p.feedbackKind,paints:{...p.paints},targetReadyMs:p.targetReadyMs,targetAtReady:p.targetAtReady,marks:{...p.marks},shellSeen:p.shellSeen,shellRemovedMs:p.shellRemovedMs,shellRemovalSource:p.shellRemovalSource||'RAF observation',sceneMounts:p.sceneMounts,scene:p.scene,fullState:p.calls.startup.getState,settings:p.calls.startup.getSettings,longTasks:p.longTasks.filter(t=>t.start<=p.targetReadyMs),replayShellSeen:p.replayShellSeen};});}
async function waitTarget(page){await page.waitForFunction(()=>window.__startupPerf?.targetReadyMs!==null&&window.__startupPerf?.targetReadyMs!==undefined,null,{timeout:90000});}
async function waitHandoff(page){await page.waitForFunction(()=>!document.getElementById('startup-shell')&&!window.VocabStartup?.isActive(),null,{timeout:90000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function scroll(page){return page.evaluate(duration=>new Promise(resolve=>{const p=__startupPerf;p.phase='scroll';const maxY=Math.max(0,document.documentElement.scrollHeight-innerHeight),intervals=[],chapters=new Set(),start=performance.now();let last=null;
 function tick(now){if(last!==null)intervals.push(now-last);last=now;const ratio=Math.min(1,Math.max(0,(now-start)/duration));chapters.add(Number(document.body.dataset.carnetChapter));scrollTo({top:maxY*(ratio<.5?ratio*2:(1-ratio)*2),behavior:'instant'});if(document.getElementById('startup-shell'))p.replayShellSeen=true;if(ratio<1)requestAnimationFrame(tick);else requestAnimationFrame(()=>{p.phase='idle';resolve({elapsedMs:performance.now()-start,intervals,chapters:[...chapters].sort((a,b)=>a-b),maxY,calls:p.calls.scroll,shellAppeared:p.replayShellSeen});});}requestAnimationFrame(tick);
 }),scrollMs);}
async function runSample(browser,label,scenario,repeat){
 const preview=scenario==='preview',returning=['return50','return5000','replay5000'].includes(scenario),fixture=fixtures[scenario==='return50'?'default50':'large5000'];
 const context=await browser.newContext({viewport:conditions.viewport,deviceScaleFactor:1,reducedMotion:'no-preference',locale:'zh-CN',timezoneId:'Asia/Shanghai',offline:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(90000);
 await page.addInitScript(instrument,{target:returning?'today':'journey'});
 const file=preview?files[label].preview.file:files[label].file,startedAt=new Date().toISOString();
 try{
  await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:90000});
  if(returning){
   await page.waitForFunction(()=>window.VocabApp&&window.VocabCarnetReview);
   await page.evaluate(async state=>{const clean=VocabData.validate(state);await new Promise((resolve,reject)=>{const request=indexedDB.open('FR_VOCAB_DATA_V4',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('data','readwrite');tx.objectStore('data').put(clean.eventArchive?.length?{storageFormat:'history-blocks-v1',state:clean}:clean,'state');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});},fixture.state);
   await page.reload({waitUntil:'load',timeout:90000});
  }
  await waitTarget(page);await waitHandoff(page);
  const startup=await snapshot(page);await page.evaluate(()=>{__startupPerf.phase='idle';});
  const business=await page.evaluate(()=>VocabCarnetProduct.getStartup()),appearance=await page.evaluate(()=>VocabCarnetProduct.getAppearance());assert.equal(business.blocked,false);assert.equal(business.wordCount,preview?50:returning?fixture.meta.words:0);assert.equal(startup.loadCalls,1,'Startup must load data only once');assert.equal(startup.fullState.count,0,'Startup must not clone complete learning state');if(returning)assert.equal(startup.sceneMounts,0,'Returning user must not mount a scene');
  let replay=null,scrolling=null;
  if(scenario==='replay5000'){
   await page.evaluate(()=>{__startupPerf.beginReplay();VocabCarnetReview.show('journey',{fromStart:true});});await waitTarget(page);
   replay=await page.evaluate(()=>({targetReadyMs:__startupPerf.targetReadyMs-__startupPerf.replayStartedMs,scene:__startupPerf.scene,calls:__startupPerf.calls.replay,shellAppeared:__startupPerf.replayShellSeen}));
   assert.equal(replay.calls.getState.count,0);assert.equal(replay.shellAppeared,false);
  }
  if(['clean','replay5000','preview'].includes(scenario)){scrolling=await scroll(page);scrolling.frames=summary(scrolling.intervals);assert.equal(scrolling.calls.getState.count,0);assert.equal(scrolling.shellAppeared,false);assert.deepEqual(scrolling.chapters,[0,1,2,3,4,5,6,7],'Native scroll must traverse opening and every lesson');}
  assert.deepEqual(errors,[]);
  if(!conditions.sceneGpu)conditions.sceneGpu=await page.evaluate(()=>{const canvas=document.querySelector('.carnet-scene-canvas');if(!canvas)return null;const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');if(!gl)return null;const debug=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};});
  const productExitMs=startup.marks['startup:removed']!==undefined&&startup.marks['startup:target-ready']!==undefined?startup.marks['startup:removed']-startup.marks['startup:target-ready']:null;
  const result={label,scenario,repeat,startedAt,finishedAt:new Date().toISOString(),loadAverage:os.loadavg(),appearance,startup:{...startup,productExitMs,observedTargetToRemovalMs:startup.shellRemovedMs===null?null:startup.shellRemovedMs-startup.targetReadyMs},replay,scroll:scrolling};
  report.samples.push(result);save();console.log(JSON.stringify({label,scenario,repeat,feedbackMs:startup.firstVisibleFeedbackMs,fcpMs:startup.paints['first-contentful-paint'],dataMs:startup.dataReadyMs,targetMs:startup.targetReadyMs,exitMs:productExitMs,replayMs:replay?.targetReadyMs,frameMedianMs:scrolling?.frames?.median,fullCopies:startup.fullState.count}));
 }finally{await context.close();}
}
function finishReport(){
 const samples=[...report.historicalBaselineSamples,...report.samples];report.summaries=[];
 for(const label of ['B','C'])for(const scenario of ['clean','return50','return5000','replay5000','preview']){const group=samples.filter(s=>s.label===label&&s.scenario===scenario);if(!group.length)continue;
  const metrics={};for(const [name,read] of Object.entries({targetReadyMs:s=>s.startup.targetReadyMs,dataReadyMs:s=>s.startup.dataReadyMs,loadResolvedMs:s=>s.startup.loadResolvedMs,feedbackMs:s=>s.startup.firstVisibleFeedbackMs,firstPaintMs:s=>s.startup.paints['first-paint'],fcpMs:s=>s.startup.paints['first-contentful-paint'],shellRemovedMs:s=>s.startup.shellRemovedMs,productExitMs:s=>s.startup.productExitMs,replayReadyMs:s=>s.replay?.targetReadyMs,scrollFrameMedianMs:s=>s.scroll?.frames?.median,scrollFrameP95Ms:s=>s.scroll?.frames?.p95,fullStateCopies:s=>s.startup.fullState.count}))metrics[name]=summary(group.map(read).filter(Number.isFinite));
  report.summaries.push({label,scenario,samples:group.length,metrics});
 }
 report.investigation=[];
 for(const b of report.summaries.filter(s=>s.label==='B')){const c=report.summaries.find(s=>s.label==='C'&&s.scenario===b.scenario);if(!c)continue;for(const key of ['targetReadyMs','replayReadyMs'])if(b.metrics[key]&&c.metrics[key]){const before=b.metrics[key].median,after=c.metrics[key].median,threshold=Math.max(50,before*.1);report.investigation.push({scenario:b.scenario,metric:key,B:before,C:after,deltaMs:after-before,thresholdMs:threshold,investigate:after-before>threshold});}}
 save();const n=x=>x?x.median.toFixed(1)+' ['+x.min.toFixed(1)+'–'+x.max.toFixed(1)+']':'—';
 const lines=['# B/C startup performance','',...Object.entries(conditions).map(([k,v])=>'- '+k+': '+(typeof v==='object'?JSON.stringify(v):v)),'','B is optimized 4.16.3 (7df43eff…), not historical 4.16.2. Values are medians [min–max] in ms. Feedback is an observer estimate; FCP is a browser paint timing. Target-ready uses the same DOM/scene observer in B/C and excludes the shell exit transition.','', '| Build | Scenario | n | Feedback | FCP | Data ready | Target ready | Shell removed | Exit | Replay ready | RAF median | Full copies |','| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',...report.summaries.map(s=>{const m=s.metrics;return `| ${s.label} | ${s.scenario} | ${s.samples} | ${n(m.feedbackMs)} | ${n(m.fcpMs)} | ${n(m.dataReadyMs)} | ${n(m.targetReadyMs)} | ${n(m.shellRemovedMs)} | ${n(m.productExitMs)} | ${n(m.replayReadyMs)} | ${n(m.scrollFrameMedianMs)} | ${m.fullStateCopies?.max??'—'} |`;}),'','Investigation threshold = max(50 ms, 10% of B median). This flags investigation, never a cross-device pass/fail promise.','',...report.investigation.map(x=>`- ${x.scenario} ${x.metric}: ${x.deltaMs.toFixed(1)} ms; threshold ${x.thresholdMs.toFixed(1)} ms; investigate=${x.investigate}`)];fs.writeFileSync(path.join(out,'summary.md'),lines.join('\n')+'\n');
}
(async()=>{const {launchBrowser,launchOptions}=require('./runtime.cjs'),browser=await launchBrowser('chromium');conditions.browser=browser.version();conditions.browserArgs=launchOptions('chromium').args;
 try{if(baselineReport){assert.equal(conditions.browser,baselineReport.conditions.browser,'Staged comparison requires the same Chromium version');assert.equal(conditions.cpu,baselineReport.conditions.cpu);assert.deepEqual(conditions.viewport,baselineReport.conditions.viewport);}for(let repeat=1;repeat<=repeats;repeat++)for(const scenario of ['clean','return50','return5000','replay5000','preview'])for(const label of stage==='both'?(repeat%2?['B','C']:['C','B']):[stage])await runSample(browser,label,scenario,repeat);}
 finally{await browser.close();finishReport();}
 console.log('RESULTS',path.join(out,'results.json'));
})().catch(error=>{report.failure=error.stack;save();console.error(error);process.exitCode=1;});
