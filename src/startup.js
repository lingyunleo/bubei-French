/* The title page follows real initialization. No archive reads, fake progress,
   minimum viewing time, or shared ownership of the application's locks. */
(() => {
 'use strict';
 const root=document.documentElement,shell=document.getElementById('startup-shell');
 if(!shell)return;
 const template=shell.cloneNode(true),KEY='FR_VOCAB_STARTUP_HINT_V1',PREVIEW=window.CARNET_PREVIEW===true;
 const TIMES=Object.freeze({INDICATOR_DELAY_MS:200,EXIT_DURATION_MS:200,EXIT_CLEANUP_GRACE_MS:100,SLOW_NOTICE_MS:3000,SCENE_FALLBACK_MS:6000,DATA_STILL_PENDING_MS:10000});
 const state={active:true,removed:false,phase:'opening',dataReady:false,viewReady:false,target:null,backend:null,indicatorVisible:false,slow:false,pending:false,failed:false,startedAt:performance.now(),dataReadyAt:null,targetReadyAt:null,removedAt:null};
 const dark=matchMedia('(prefers-color-scheme: dark)'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let appearance={version:1,design:'classic',mode:'light',motion:'immersive',language:'zh'},lastHint='',sceneElapsed=0,sceneStart=0,sceneTimer=0,exitTimer=0,falling=false,exiting=false,sceneGeneration=0,sceneEpoch=null,restoreFocus=false;
 const timers=new Set(),locks=new Set();let release;
 const whenRemoved=new Promise(resolve=>release=resolve);
 const words={
 opening:['正在打开你的学习空间…','Opening your learning space…','Ouverture de votre espace d’apprentissage…'],
 'loading-data':['正在读取你的学习记录…','Loading your learning records…','Chargement de vos données d’apprentissage…'],
 portable:['正在准备便携快照…','Preparing the portable snapshot…','Préparation de l’instantané portable…'],
 view:['正在准备学习界面…','Preparing your learning space…','Préparation de votre espace d’apprentissage…'],
 scene:['正在准备书房…','Preparing your study…','Préparation de votre espace de lecture…'],
 slow:['准备时间较长，请稍候。','This is taking a little longer. Please wait.','La préparation prend un peu plus de temps. Veuillez patienter.'],
 'slow-scene':['书房准备时间较长，可以先使用静态画面。','Your study is taking longer to prepare. You can use a static view.','La préparation prend plus de temps. Vous pouvez utiliser une vue statique.'],
 pending:['学习记录仍未读取完成。请保留本页，或重新载入后重试。','Learning records are still loading. Keep this page open, or reload to try again.','Vos données sont toujours en cours de chargement. Gardez cette page ouverte ou rechargez-la.'],
 failed:['未能完成启动。请重新载入；若仍有问题，请检查浏览器存储权限。','Startup could not finish. Reload; if the problem continues, check browser storage permissions.','Le démarrage a échoué. Rechargez la page ; si le problème persiste, vérifiez les autorisations de stockage.'],
 fallback:['使用静态画面','Use a static view','Utiliser une vue statique'],reload:['重新载入','Reload','Recharger'],help:['查看帮助','Show help','Afficher l’aide'],
 guidance:['请确认浏览器允许本站使用本地存储。不要清除浏览器数据；如果已有备份，可在网站恢复后导入。','Check that this site can use browser storage. Do not clear browser data. If you have a backup, you can import it after the site opens.','Vérifiez l’accès au stockage du navigateur. N’effacez pas ses données. Vous pourrez importer une sauvegarde après l’ouverture du site.']
 };
 const language=()=>/^en(?:-|$)/i.test(root.lang)?1:/^fr(?:-|$)/i.test(root.lang)?2:0;
 const label=key=>words[key][language()];
 const write=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value;};
 const hidden=(el,value)=>{if(el&&el.hidden!==value)el.hidden=value;};
 function valid(value){return value&&Object.keys(value).length===5&&['version','design','mode','motion','language'].every(key=>Object.hasOwn(value,key))&&value.version===1&&['classic','atelier','verdure'].includes(value.design)&&['light','dark','system'].includes(value.mode)&&['immersive','standard','reduced','system'].includes(value.motion)&&['zh','en','fr'].includes(value.language)?{version:1,design:value.design,mode:value.mode,motion:value.motion,language:value.language}:null;}
 function parse(raw){try{return typeof raw==='string'&&raw.length<=1024?valid(JSON.parse(raw)):null;}catch(_){return null;}}
 function settingsHint(settings){return valid({version:1,design:settings?.designTheme,mode:settings?.theme,motion:['immersive','standard','reduced','system'].includes(settings?.carnetMotion)?settings.carnetMotion:settings?.motionMode==='simple'?'reduced':'system',language:settings?.language});}
 const reduced=()=>reduce.matches||appearance.motion==='reduced';
 function apply(){if(!state.active)return;root.dataset.theme=appearance.mode==='system'?(dark.matches?'dark':'light'):appearance.mode;root.dataset.designTheme=appearance.design;shell.dataset.motion=reduced()?'reduced':appearance.motion==='system'?'standard':appearance.motion;if(reduced()&&exiting)remove();}
 // A portable file may supply pure appearance metadata; no embedded backup is read here.
 const seed=parse(root.getAttribute('data-startup-hint'));root.removeAttribute('data-startup-hint');
 let cached=null;if(!PREVIEW){try{const raw=localStorage.getItem(KEY);cached=parse(raw);if(cached)lastHint=JSON.stringify(cached);}catch(_){}}
 if(seed||cached){appearance=seed||cached;root.lang=appearance.language==='zh'?'zh-CN':appearance.language;}
 apply();
 function syncHint(settings,{persist=true}={}){const next=settingsHint(settings);if(!next)return;appearance=next;if(state.active){apply();refresh();}if(PREVIEW||!persist)return;const value=JSON.stringify(next);if(value===lastHint)return;try{localStorage.setItem(KEY,value);lastHint=value;}catch(_){}}
 function later(fn,delay){const id=setTimeout(()=>{timers.delete(id);fn();},delay);timers.add(id);return id;}
 function lock(){for(const el of document.body.children){if(el.id==='carnet-reader'||!el.matches('#app,#carnet-scene-host,#carnet-story,#carnet-lessons,#carnet-components-preview,#carnet-preview-bar,.carnet-story-ui'))continue;if(!el.inert){el.inert=true;el.dataset.startupInert='';locks.add(el);}}}
 root.classList.add('startup-active');lock();
 const observer=new MutationObserver(records=>{if(!state.active)return;if(records.some(r=>r.type==='childList'))lock();if(records.some(r=>r.attributeName==='lang'))refresh();});
 observer.observe(document.body,{childList:true});observer.observe(root,{attributes:true,attributeFilter:['lang']});
 function refresh(){if(!state.active)return;if(shell.contains(document.activeElement))restoreFocus=true;const key=state.failed?'failed':state.pending&&!state.dataReady?'pending':state.slow?(state.phase==='scene'?'slow-scene':'slow'):state.phase;
  write(shell.querySelector('.startup-status'),state.indicatorVisible?label(key):'');
  const fallback=shell.querySelector('[data-startup-action=fallback]'),reload=shell.querySelector('[data-startup-action=reload]'),help=shell.querySelector('[data-startup-action=help]');
  write(fallback,label('fallback'));write(reload,label('reload'));write(help,label('help'));write(shell.querySelector('.startup-help'),label('guidance'));
  hidden(fallback,!(state.slow&&state.dataReady&&state.phase==='scene'&&!falling&&!state.failed));hidden(reload,!(state.failed||state.pending&&!state.dataReady));hidden(help,reload.hidden);
  shell.classList.toggle('startup-waiting',state.indicatorVisible);shell.classList.toggle('startup-static',state.slow||state.failed);
 }
 function pauseScene(){clearTimeout(sceneTimer);sceneTimer=0;if(sceneStart){sceneElapsed+=performance.now()-sceneStart;sceneStart=0;}}
 function armScene(){if(!state.active||state.phase!=='scene'||state.viewReady||falling||document.hidden)return;sceneStart=performance.now();sceneTimer=setTimeout(()=>{pauseScene();requestSceneFallback();},Math.max(0,TIMES.SCENE_FALLBACK_MS-sceneElapsed));}
 async function requestSceneFallback(){if(!state.active||state.failed||!state.dataReady||state.phase!=='scene'||falling)return;falling=true;const generation=sceneGeneration;pauseScene();refresh();try{await window.VocabCarnetScene?.useStaticFallback();}catch(error){if(generation===sceneGeneration)fail(error);}finally{if(generation===sceneGeneration){falling=false;refresh();}}}
 function setPhase(phase,scope={}){if(!state.active||state.failed||exiting||!['opening','loading-data','portable','view','scene'].includes(phase)||state.phase===phase&&(phase!=='scene'||sceneEpoch===(scope.sceneEpoch??null)))return;pauseScene();sceneGeneration++;falling=false;sceneEpoch=phase==='scene'?(scope.sceneEpoch??null):null;state.phase=phase;if(phase==='scene'){sceneElapsed=0;armScene();}refresh();}
 function mark(name){try{performance.mark('startup:'+name);}catch(_){}}
 function markDataReady({mode='normal'}={}){if(!state.active||state.failed||state.dataReady)return;state.dataReady=true;state.mode=mode;state.dataReadyAt=performance.now();mark('data-ready');setPhase('view');finish();}
 function markViewReady({target,backend=null}={}){if(!state.active||state.failed||state.viewReady||!['today','recovery','journey','app'].includes(target)||['disposed','none'].includes(backend))return;state.viewReady=true;state.target=target;state.backend=backend;state.targetReadyAt=performance.now();mark('target-ready');pauseScene();finish();}
 function stopWaiting(){for(const timer of timers)clearTimeout(timer);timers.clear();pauseScene();shell.classList.add('startup-static');}
 function remove(){if(!state.active)return;stopWaiting();clearTimeout(exitTimer);observer.disconnect();dark.removeEventListener('change',apply);reduce.removeEventListener('change',apply);document.removeEventListener('visibilitychange',visibility);shell.removeEventListener('click',click);shell.removeEventListener('transitionend',transition);
  const focused=shell.contains(document.activeElement)||restoreFocus&&(document.activeElement===document.body||document.activeElement===root);for(const el of locks){if(el.hasAttribute('data-startup-inert')){el.inert=false;delete el.dataset.startupInert;}}locks.clear();root.classList.remove('startup-active');shell.remove();state.active=false;state.removed=true;state.removedAt=performance.now();mark('removed');
  if(focused&&!document.querySelector('dialog[open]')){const target=document.querySelector(state.target==='journey'?'#carnet-title':'#app h1');if(target){const old=target.getAttribute('tabindex');target.tabIndex=-1;target.focus({preventScroll:true});if(old===null)target.addEventListener('blur',()=>{if(target.getAttribute('tabindex')==='-1')target.removeAttribute('tabindex');},{once:true});else target.setAttribute('tabindex',old);}}
  release();window.dispatchEvent(new Event('vocab-startup-ready'));
 }
 function finish(){if(!state.active||state.failed||!state.dataReady||!state.viewReady||exiting)return;exiting=true;stopWaiting();if(!state.indicatorVisible||reduced()||document.hidden){remove();return;}shell.classList.add('startup-leaving');exitTimer=setTimeout(remove,TIMES.EXIT_DURATION_MS+TIMES.EXIT_CLEANUP_GRACE_MS);}
 function transition(e){if(exiting&&e.target===shell&&e.propertyName==='opacity')remove();}
 function fail(error){if(!state.active||state.failed||exiting)return;stopWaiting();state.failed=true;state.phase='failed';state.indicatorVisible=true;console.error('[VocabStartup]',error);refresh();}
 function visibility(){pauseScene();if(document.hidden&&exiting)remove();else if(!document.hidden)armScene();}
 function click(e){const action=e.target.closest('[data-startup-action]')?.dataset.startupAction;if(action==='reload')location.reload();else if(action==='fallback')requestSceneFallback();else if(action==='help')hidden(shell.querySelector('.startup-help'),false);}
 function resetClone(clone,settings){clone.querySelectorAll('#startup-shell').forEach(el=>el.remove());clone.classList.remove('startup-active');clone.querySelectorAll('[data-startup-inert]').forEach(el=>{el.removeAttribute('inert');el.removeAttribute('data-startup-inert');});const hint=settingsHint(settings);if(hint)clone.setAttribute('data-startup-hint',JSON.stringify(hint));const body=clone.querySelector('body');body.prepend(template.cloneNode(true));}
 shell.addEventListener('click',click);shell.addEventListener('transitionend',transition);document.addEventListener('visibilitychange',visibility);dark.addEventListener('change',apply);reduce.addEventListener('change',apply);
 later(()=>{if(!state.active||exiting)return;state.indicatorVisible=true;refresh();},TIMES.INDICATOR_DELAY_MS);
 later(()=>{if(!state.active||exiting)return;state.slow=true;refresh();},TIMES.SLOW_NOTICE_MS);
 later(()=>{if(!state.active||exiting)return;state.pending=true;refresh();},TIMES.DATA_STILL_PENDING_MS);
 window.VocabStartup=Object.freeze({TIMES,setPhase,markDataReady,markViewReady,fail,isActive:()=>state.active,getState:()=>({...state}),whenRemoved,syncHint,resetClone,requestSceneFallback});
})();
