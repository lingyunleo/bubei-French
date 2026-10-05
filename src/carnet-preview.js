/* Seven-chapter guide: native document scroll + original scene + real app.
   Scene progress and the sentence demonstration never mutate study state. */
(() => {
 'use strict';
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
 const PREVIEW=window.CARNET_PREVIEW===true;
 const P=window.VocabCarnetProduct||window.VocabCarnetPreview,S=window.VocabCarnetScene;
 const systemDark=matchMedia('(prefers-color-scheme: dark)'),systemReduced=matchMedia('(prefers-reduced-motion: reduce)');
 let measuredHeight=innerHeight,measuredWidth=innerWidth,unit=innerHeight*1.65,progress=0,frame=0,mounted=false,scenePromise=null,sceneEpoch=0,currentView='journey',readerRevealed=false,activeStep=0,lastStoryScroll=0,appearanceFocus=null,appearanceSelector='',appearanceIndex=0,appearanceLock=null,appearanceQueue=Promise.resolve(),readerBusy=false,lessons=null,lessonHost=null,replay=false;
 // The app synchronizes html.lang before resolving P.ready and after preference changes.
 // A label read must not copy words or study history on every scroll frame.
 const text=(zh,en,fr)=>/^en(?:-|$)/i.test(document.documentElement.lang)?en:/^fr(?:-|$)/i.test(document.documentElement.lang)?fr:zh;
 const getSettings=()=>P.getSettings?.()||window.VocabApp?.getSettings?.()||P.getState?.()?.settings||window.VocabApp?.getState?.()?.settings||{};
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const soundIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
 let chromeLanguage='',sceneStatus='idle',routeEpoch=0;
 let readerAudioState='idle';
 function buildChrome(){chromeLanguage=document.documentElement.lang;
  const bar=document.createElement('div');bar.id='carnet-preview-bar';bar.innerHTML='<span>'+text('视觉验收 · 演示数据','Visual review · demo data','Aperçu visuel · démonstration')+'</span><nav aria-label="'+text('开发预览','Review previews','Aperçus')+'">'+[['journey',text('开场','Opening','Ouverture')],['today',text('今日','Today','Aujourd’hui')],['study',text('学习','Study','Apprendre')],['spelling',text('拼写','Spelling','Orthographe')],['components',text('组件','Components','Composants')]].map(([v,label])=>'<button type="button" data-preview-view="'+v+'" aria-pressed="'+(v===currentView)+'">'+label+'</button>').join('')+'<button type="button" data-carnet="appearance">'+text('外观','Appearance','Apparence')+'</button></nav>';
  if(PREVIEW)document.body.prepend(bar);
  const story=document.createElement('main');story.id='carnet-story';story.setAttribute('aria-label',text('不背法语：七幕入门引导','Vocabulaire: seven-chapter introduction','Vocabulaire : initiation en sept chapitres'));
  story.innerHTML='<section class="carnet-chapter" data-chapter="0" aria-labelledby="carnet-title"><div class="carnet-caption on-dark"><div class="chapter-kicker">01 / 07 · '+text('入室','ENTER','ENTRER')+'</div><h1 id="carnet-title">'+text('为法语，<span>留一点时间。</span>','A little time.<span>A little French.</span>','Un moment.<span>Pour le français.</span>')+'</h1><div class="caption-fr">Un peu, chaque jour.</div><p>'+text('从一个词、一句话开始。<br>向下滚动，走进你的学习空间。','Begin with a word, a sentence.<br>Scroll down and step into your study.','Un mot, une phrase pour commencer.<br>Descendez pour entrer dans votre espace.')+'</p><div class="caption-actions"><button class="button" data-carnet="chapter" data-chapter-target="1">'+text('走近书桌','Step inside','Entrer')+' <span aria-hidden="true">↓</span></button><button class="text-button" data-carnet="chapter" data-chapter-target="3">'+text('跳过开场','Skip opening','Passer l’ouverture')+'</button></div></div></section>'+
  '<section class="carnet-chapter" data-chapter="1" aria-labelledby="carnet-write-title"><div class="carnet-caption on-dark"><div class="chapter-kicker">02 / 07 · '+text('落笔','WRITE','ÉCRIRE')+'</div><h2 id="carnet-write-title">'+text('把每天一点，<br>写在这里。','Make a little<br>room for words.','Quelques mots,<br>chaque jour.')+'</h2><p>'+text('墨水落在纸上。<br>新的习惯，也从这一笔开始。','Ink meets paper.<br>A small habit begins with a stroke.','L’encre rencontre le papier.<br>Une habitude commence par un trait.')+'</p></div></section>'+
  '<section class="carnet-chapter" data-chapter="2" aria-labelledby="carnet-book-title"><div class="carnet-caption on-dark"><div class="chapter-kicker">03 / 07 · '+text('读一句','READ','LIRE')+'</div><h2 id="carnet-book-title">'+text('打开一本书，<br>遇见一个词。','Open a book.<br>Meet a word.','Ouvrir un livre.<br>Rencontrer un mot.')+'</h2><p>'+text('词语有了语境，<br>记忆也有了可以停留的地方。','A word in context.<br>A place for memory to settle.','Un mot en contexte.<br>Un repère pour la mémoire.')+'</p></div></section><section class="carnet-reader-spacer" aria-label="'+text('可操作例句页','Interactive example','Exemple interactif')+'"></section>';
  if(!lessonHost){lessonHost=document.createElement('div');lessonHost.id='carnet-lessons';}story.append(lessonHost);document.body.append(story);
  const header=document.createElement('header');header.className='carnet-story-header carnet-story-ui';header.innerHTML='<div class="carnet-story-brand">'+text('不背法语','Vocabulaire','Vocabulaire')+'<small>VOCABULAIRE</small></div><div class="header-actions"><button class="text-button" data-carnet="appearance">'+text('外观','Appearance','Apparence')+'</button><button class="text-button" data-carnet="direct-entry">'+text('直接使用','Enter app','Ouvrir l’app')+' <span aria-hidden="true">↗</span></button></div>';document.body.append(header);
  const footer=document.createElement('footer');footer.className='carnet-story-footer carnet-story-ui';footer.innerHTML='<div class="carnet-scroll-cue">'+text('向下滚动 · 随时可以往回看','SCROLL TO EXPLORE · AND RETURN','DÉFILER · REVENIR À TOUT MOMENT')+'</div><nav class="carnet-stepper" aria-label="'+text('开场章节','Opening chapters','Chapitres')+'">'+[[0,text('入室','Enter','Entrer')],[1,text('落笔','Write','Écrire')],[2,text('读一句','Read','Lire')],[4,text('回忆','Recall','Rappel')],[5,text('拼写','Write','Écrire')],[6,text('声音','Sound','Écouter')],[7,text('启程','Begin','Commencer')]].map(([v,l])=>'<button type="button" data-carnet="chapter" data-chapter-target="'+v+'" aria-label="'+l+'">'+String(Number(v)>3?Number(v):Number(v)+1).padStart(2,'0')+'<span class="step-text">'+l+'</span></button>').join('')+'</nav><button type="button" class="button carnet-story-next" data-carnet="next">'+text('继续','Continue','Continuer')+' ↓</button>';document.body.append(footer);
  const reader=document.createElement('article');reader.id='carnet-reader';reader.className='carnet-story-ui';reader.setAttribute('aria-label',text('读一句法语','A sentence in French','Une phrase en français'));reader.hidden=true;reader.inert=true;
  reader.innerHTML='<div class="carnet-reader-caption"><div class="chapter-kicker">03 / 07 · '+text('读一句','READ','LIRE')+'</div><h2>'+text('让词语，<br>留在一句话里。','A word.<br>In its own world.','Un mot.<br>Dans son contexte.')+'</h2><p>'+text('先读一遍。<br>再揭晓它的含义。','Read it first.<br>Then reveal its meaning.','Lisez d’abord.<br>Découvrez ensuite le sens.')+'</p></div><div class="carnet-reader-sheet"><div class="reading-label"><span>CARNET DE FRANÇAIS</span><span>01</span></div><p class="sentence" lang="fr">J’aime <mark>lire</mark> quelques pages chaque jour.</p><div class="margin-note" lang="fr">un livre <span lang="'+escape(document.documentElement.lang)+'">· '+text('一本书','a book','un ouvrage')+'</span></div><div class="reader-answer" aria-live="polite"><div class="answer-placeholder">'+text('试着理解这句话，然后揭晓含义。','Take a moment, then reveal the meaning.','Prenez un instant, puis révélez le sens.')+'</div></div><div class="reader-actions"><button class="button primary" data-carnet="reveal">'+text('揭晓含义','Reveal meaning','Révéler le sens')+'</button><button class="icon-button" data-carnet="listen" aria-label="'+text('朗读例句','Play sentence','Écouter la phrase')+'">'+soundIcon+'</button></div><div class="reader-audio-feedback" role="status" aria-live="polite" hidden><p id="carnet-reader-audio-status"></p><button type="button" class="text-button" data-carnet="retry-listen" aria-describedby="carnet-reader-audio-status">'+text('重试朗读','Retry playback','Réessayer')+'</button></div><div class="reader-end"><span>'+text('演示例句 · 不计入学习','Demo · no study record','Exemple · sans enregistrement')+'</span><span>01</span></div></div>';document.body.append(reader);
  const status=document.createElement('div');status.className='carnet-loading carnet-story-ui';status.innerHTML='<i></i><span>'+text('正在准备书房','Preparing your study','Préparation de l’espace')+'</span>';status.setAttribute('role','status');document.body.append(status);
  const fallback=document.createElement('div');fallback.className='carnet-fallback-note carnet-story-ui';fallback.hidden=true;fallback.setAttribute('role','status');document.body.append(fallback);
  const dialog=document.createElement('dialog');dialog.id='carnet-appearance';dialog.setAttribute('aria-labelledby','carnet-appearance-title');dialog.innerHTML='<header><h2 id="carnet-appearance-title">'+text('让空间适合你','Make it yours','À votre goût')+'</h2><button type="button" class="icon-button" data-carnet="close-appearance" aria-label="'+text('关闭','Close','Fermer')+'">×</button></header><div class="carnet-appearance-body">'+appearanceGroup('design',text('界面风格','Visual style','Style'),[['classic','CLASSIQUE',text('清晰、克制','Clear & quiet','Clair et sobre')],['atelier','ATELIER',text('纸张、木色与墨绿','Paper, wood & ink','Papier, bois et encre')],['verdure','VERDURE',text('青绿、柔和自然','Soft, natural greens','Verts doux et naturels')]])+appearanceGroup('mode',text('配色','Colour','Couleurs'),[['light',text('浅色','Light','Clair')],['dark',text('深色','Dark','Sombre')],['system',text('跟随系统','System','Système')]])+appearanceGroup('motion',text('动效强度','Motion','Animations'),[['immersive',text('沉浸','Immersive','Immersif')],['standard',text('标准','Standard','Standard')],['reduced',text('简约','Reduced','Réduit')],['system',text('跟随系统','System','Système')]])+'</div><footer><button class="button primary" data-carnet="close-appearance">'+text('完成','Done','Terminé')+'</button></footer>';document.body.append(dialog);
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeAppearance()});
  dialog.addEventListener('close',()=>{if(dialog.open)return;unlockAppearanceScroll();const target=appearanceOrigin();target?.setAttribute('aria-expanded','false');target?.focus({preventScroll:true});});
  let backdropDown=false;dialog.addEventListener('pointerdown',e=>{const r=dialog.getBoundingClientRect();backdropDown=e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)});
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(backdropDown&&e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))closeAppearance();backdropDown=false;});
  buildComponents();mountLessons();
 }
 function appearanceGroup(key,label,values){return '<span class="carnet-option-label" id="carnet-label-'+key+'">'+label+'</span><div class="carnet-options '+(key==='design'?'themes':'')+'" role="group" aria-labelledby="carnet-label-'+key+'">'+values.map(([v,l,sub])=>'<button type="button" data-appearance-key="'+key+'" data-appearance-value="'+v+'" aria-pressed="false">'+(sub?'<strong>'+l+'</strong><small>'+sub+'</small>':l)+'</button>').join('')+'</div>'}
 function buildComponents(){const panel=document.createElement('main');panel.id='carnet-components-preview';panel.innerHTML='<div class="carnet-components-head"><div><div class="eyebrow">CARNET · DESIGN SYSTEM</div><h1>'+text('同一套秩序，三种气质。','One system. Three expressions.','Un système, trois expressions.')+'</h1><p>'+text('六套配色共用文字层级、组件尺寸和导航位置。切换外观时，下面的输入和已揭晓的例句都会保留。','Six palettes share hierarchy, dimensions and navigation. Changing appearance keeps your text and revealed example intact.','Six palettes partagent hiérarchie, dimensions et navigation. Les saisies et l’exemple révélé sont préservés.')+'</p></div><button class="button" data-carnet="appearance">'+text('切换外观','Change appearance','Changer l’apparence')+'</button></div><div class="carnet-component-grid"><section class="card"><h2>'+text('词卡与例句','Word & sentence','Mot et phrase')+'</h2><p class="word-sample" lang="fr">lire</p><p class="muted">/liʁ/ · v.</p><p style="margin-top:16px">'+text('阅读；读','read','lire')+'</p><div class="divider"></div><p class="example" lang="fr">J’aime <mark>lire</mark> quelques pages chaque jour.</p><p class="muted">'+text('我喜欢每天读几页书。','I like to read a few pages every day.','Je lis quelques pages chaque jour.')+'</p></section><section class="card"><h2>'+text('输入保持稳定','Stable input','Une saisie stable')+'</h2><label for="carnet-test-input" class="carnet-option-label">'+text('试着输入，再切换主题','Type, then change the theme','Saisissez, puis changez de thème')+'</label><input id="carnet-test-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Un peu, chaque jour." style="width:100%"><div class="divider"></div><label class="check-row"><input type="checkbox" checked><span>'+text('保留当前输入与选择','Keep input and selection','Conserver la saisie et la sélection')+'</span></label><button class="button primary" data-preview-view="spelling">'+text('进入真实拼写预览','Try real spelling','Essayer l’orthographe')+'</button></section><section class="card"><h2>'+text('操作与判定','Actions & ratings','Actions et évaluation')+'</h2><div class="row wrap"><button class="button primary" data-preview-view="study">'+text('开始学习','Start learning','Apprendre')+'</button><button class="button" data-preview-view="today">'+text('返回今日','Back to today','Aujourd’hui')+'</button><button class="button" disabled>'+text('不可用状态','Unavailable','Indisponible')+'</button></div><div class="divider"></div><div class="ratings"><button class="button" type="button">'+text('认识','Know','Connu')+'</button><button class="button" type="button">'+text('模糊','Hazy','Vague')+'</button><button class="button" type="button">'+text('忘记了','Forgot','Oublié')+'</button></div></section><section class="card"><h2>'+text('界面配色','Colour tokens','Palette')+'</h2><div class="carnet-token-row">'+['bg','surface','ink','muted','accent','line','danger'].map(k=>'<span class="carnet-token"><i style="background:var(--'+k+')"></i>'+k+'</span>').join('')+'</div><div class="divider"></div><p class="muted">'+text('输入框与按钮使用明确的边界；错误和正确状态同时保留文字与颜色提示。','Inputs and buttons have visible boundaries. Correctness uses both text and colour.','Les champs et boutons ont des contours nets. La correction utilise texte et couleur.')+'</p></section></div>';document.body.append(panel)}
 function mountLessons(){if(lessons)return;lessons=window.VocabCarnetLessons.mount(lessonHost,{flow:true,getSettings,replay,starterCount:window.VocabSeed.length,onContinue:chapter=>jump(chapter),finish:async payload=>{
   const result=await P.finishOnboarding({...payload,replay});
   if(result.ok){await show('today',{navigate:false});if(resolvedAppearance().motion!=='reduced')document.querySelector('#app .main')?.animate([{opacity:.65},{opacity:1}],{duration:220,easing:'ease-out'});}
   return result;
  }});}
 function barHeight(){return $('#carnet-preview-bar')?.getBoundingClientRect().height||0;}
 function resolvedAppearance(){const a=P.getAppearance();return {...a,mode:a.mode==='system'?(systemDark.matches?'dark':'light'):a.mode,motion:systemReduced.matches?'reduced':a.motion==='system'?'standard':a.motion}}
 function syncAppearance(){const a=P.getAppearance(),resolved=resolvedAppearance();document.documentElement.dataset.carnetMotion=resolved.motion;S.setAppearance(resolved);$$('[data-appearance-key]').forEach(b=>b.setAttribute('aria-pressed',String(a[b.dataset.appearanceKey]===b.dataset.appearanceValue)));$('meta[name=theme-color]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();refreshFallback();schedule()}
 function setAppearance(patch){const run=async()=>{const y=scrollY;const ok=await P.setAppearance(patch);syncAppearance();if(currentView==='journey')scrollTo({top:y,behavior:'instant'});return ok};const op=appearanceQueue.then(run,run);appearanceQueue=op.catch(console.error);return op}
 function lockAppearanceScroll(){if(appearanceLock)return;appearanceLock={x:scrollX,y:scrollY,html:document.documentElement.style.overflow,body:document.body.style.overflow};document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';}
 function unlockAppearanceScroll(){if(!appearanceLock)return;const previous=appearanceLock;appearanceLock=null;document.documentElement.style.overflow=previous.html;document.body.style.overflow=previous.body;scrollTo({left:previous.x,top:previous.y,behavior:'instant'});}
 function appearanceOrigin(){
  if(appearanceFocus?.isConnected)return appearanceFocus;
  if(appearanceSelector){const nodes=$$(appearanceSelector);if(nodes[appearanceIndex])return nodes[appearanceIndex];}
  return document.querySelector(currentView==='journey'?'.carnet-story-header [data-carnet=appearance]':'#app [data-action=theme-picker]');
 }
 function openAppearance(origin){
  const dialog=$('#carnet-appearance');if(!dialog)return;
  stopNavigation();clearSnapIntent();
  if(!dialog.open){appearanceFocus=origin||document.activeElement;appearanceSelector=appearanceFocus?.matches('[data-action=theme-picker]')?'[data-action="theme-picker"]':appearanceFocus?.matches('[data-carnet=appearance]')?'[data-carnet="appearance"]':appearanceFocus?.id?'#'+CSS.escape(appearanceFocus.id):'';appearanceIndex=appearanceSelector?$$(appearanceSelector).indexOf(appearanceFocus):0;}
  appearanceOrigin()?.setAttribute('aria-controls','carnet-appearance');appearanceOrigin()?.setAttribute('aria-expanded','true');
  syncAppearance();lockAppearanceScroll();
  if(window.VocabMotion)window.VocabMotion.openModal(dialog,appearanceOrigin(),{allowNestedOrigin:true,resolveOrigin:appearanceOrigin});else if(!dialog.open)dialog.showModal();
 }
 function closeAppearance(){const dialog=$('#carnet-appearance');if(!dialog?.open)return;if(window.VocabMotion)window.VocabMotion.closeModal(dialog);else dialog.close()}
 function refreshFallback(){const el=$('.carnet-fallback-note');if(!el)return;const low=systemReduced.matches||resolvedAppearance().motion==='reduced',staticMode=S.__getDebugState().backend==='static';el.hidden=activeStep>=4||low||!staticMode;const label=text('已为你开启简约动效','A calmer view is ready.','Le mode simplifié est activé.');if(el.textContent!==label)el.textContent=label;}
 function localLoading(){const el=$('.carnet-loading');if(!el)return;el.hidden=sceneStatus!=='pending'||!!window.VocabStartup?.isActive();const span=el.querySelector('span');if(span){const label=text('正在准备书房…','Preparing your study…','Préparation de votre espace de lecture…');if(span.textContent!==label)span.textContent=label;}}
 async function mountScene(){if(mounted)return scenePromise;mounted=true;sceneStatus='pending';const epoch=++sceneEpoch;localLoading();window.VocabStartup?.setPhase('scene',{sceneEpoch:epoch});scenePromise=(async()=>{const result=await S.mount($('#carnet-scene-host'),{onProgress(){if(epoch===sceneEpoch)localLoading();}});if(epoch!==sceneEpoch||!mounted||!['webgl','static','simplified'].includes(result?.backend))return {backend:'disposed'};sceneStatus='ready';window.VocabStartup?.setPhase('view');localLoading();refreshFallback();schedule();return result;})();syncAppearance();return scenePromise;}
 // Confirm the chosen target's layout after a frame, without waiting forever for
 // requestAnimationFrame in a background tab. Route changes invalidate this hand-off.
 function targetReady(target,backend,epoch){return new Promise(resolve=>{let frame=0,done=false;const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);if(epoch===routeEpoch)window.VocabStartup?.markViewReady({target,backend});resolve();};const visibility=()=>{if(document.hidden)finish();};if(document.hidden){finish();return;}document.addEventListener('visibilitychange',visibility);frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(finish);});});}

 function measure(){const story=$('#carnet-story');if(currentView!=='journey'||!story)return;const typing=document.activeElement?.matches('input,textarea,[contenteditable=true]');if(!typing&&(Math.abs(innerWidth-measuredWidth)>40||Math.abs(innerHeight-measuredHeight)>150&&innerWidth>760)){measuredWidth=innerWidth;measuredHeight=innerHeight}const h=measuredHeight-barHeight();story.style.setProperty('--story-h',h+'px');document.documentElement.style.setProperty('--carnet-stable-height',h+'px');unit=h*1.65;S.resize();schedule()}
 function layoutReader(){const paper=$('.carnet-reader-sheet'),host=$('#carnet-scene-host'),caption=$('.carnet-reader-caption');if(currentView!=='journey'||innerWidth<=760||!paper||!host||!caption)return;const rect=S.getBookRect()?.rightPage;if(!rect)return;const top=host.getBoundingClientRect().top;paper.style.left=rect.x+'px';paper.style.top=(rect.y-top)+'px';paper.style.width=rect.width+'px';paper.style.height=rect.height+'px';caption.style.left=(rect.x-rect.width-35)+'px';caption.style.top=(rect.y-top+60)+'px';caption.style.width=(rect.width-35)+'px';}
 function update(){frame=0;if(currentView!=='journey'||!$('#carnet-story')||!$('#carnet-reader')||!$('.carnet-story-next'))return;const raw=Math.max(0,scrollY/unit);let chapter=Math.min(3,Math.floor(raw+.002));const previous=activeStep;
  for(const el of $$('#carnet-lessons [data-lesson-chapter]'))if(el.getBoundingClientRect().top<=barHeight()+Math.min(180,measuredHeight*.22))chapter=Number(el.dataset.lessonChapter);
  progress=chapter>=4?chapter:Math.min(raw,3.99);activeStep=chapter;document.body.dataset.carnetChapter=String(chapter);document.body.dataset.carnetPhase=chapter>=4?'lesson':'opening';
  const sceneP=Math.min(raw,3);if(chapter<4)S.suspend(false);S.setProgress(sceneP);if(chapter>=4)requestAnimationFrame(()=>{if(activeStep>=4)S.suspend(true)});
  const activeIndex=chapter>=4?chapter-1:Math.min(2,chapter);$$('.carnet-stepper button').forEach((b,i)=>{if(i===activeIndex){b.setAttribute('aria-current','step');if(previous!==chapter){const nav=b.parentElement;if(b.offsetLeft<nav.scrollLeft)nav.scrollLeft=b.offsetLeft;else if(b.offsetLeft+b.offsetWidth>nav.scrollLeft+nav.clientWidth)nav.scrollLeft=b.offsetLeft+b.offsetWidth-nav.clientWidth;}}else b.removeAttribute('aria-current')});
  // A caption starts arriving before its chapter anchor, in the same fixed
  // composition as the scene. Both its ink and the reading light follow scroll
  // continuously, including reverse scrolling; no chapter-boundary flash.
  const smooth=(start,end,value)=>{const t=clamp((value-start)/(end-start));return t*t*(3-2*t)};
  let captionOpacity=0;$$('.carnet-caption').forEach((el,i)=>{
   const local=raw-i,arrival=i===0?1:smooth(-.18,-.02,local);
   const departure=1-smooth(i===1?.15:.28,i===1?.34:.52,local),opacity=arrival*departure;
   captionOpacity=Math.max(captionOpacity,opacity);el.style.opacity=String(opacity);el.inert=opacity<.1;el.setAttribute('aria-hidden',String(opacity<.1));
  });$('#carnet-scene-host').style.setProperty('--carnet-caption-scrim',captionOpacity);
  if(readerBusy&&(raw<2.99||raw>3.5)){window.AudioKit.stop();readerBusy=false;$('[data-carnet=listen]').removeAttribute('aria-busy');}
  const visible=raw>2.84&&raw<3.65,opacity=smooth(2.84,3,raw)*(1-smooth(3.25,3.65,raw));$('#carnet-reader').hidden=!visible;$('#carnet-reader').style.opacity=opacity;$('#carnet-reader').inert=raw<2.99||raw>3.5||!!window.VocabStartup?.isActive();$('#carnet-reader').setAttribute('aria-hidden',String(raw<2.99||raw>3.5));if(visible)requestAnimationFrame(layoutReader);
  lessons?.setChapter(chapter>=4?chapter:null);refreshFallback();const next=$('.carnet-story-next'),label=chapter>=7?text('回到开场 ↑','Back to opening ↑','Revenir au début ↑'):text('继续 ↓','Continue ↓','Continuer ↓');if(next.textContent!==label)next.textContent=label;lastStoryScroll=scrollY;
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update)}
 // Button navigation owns only a short, cancellable journey along native scroll.
 // Give the ink and page-turn sequences more screen time than a normal chapter.
 let navigation=null,navigationFrame=0,snapTimer=0,wheelIntent=null;
 const isTyping=()=>document.activeElement?.matches('input,textarea,select,[contenteditable=true]');
 const reduceNavigation=()=>systemReduced.matches||resolvedAppearance().motion==='reduced';
 function stopNavigation(){cancelAnimationFrame(navigationFrame);navigationFrame=0;navigation=null;}
 function clearSnapIntent(){clearTimeout(snapTimer);snapTimer=0;wheelIntent=null;}
 function chapterOffset(n){const el=n>=4?lessonHost?.querySelector('[data-lesson-chapter="'+n+'"]'):null;return el?el.getBoundingClientRect().top+scrollY-barHeight():Math.min(n,3)*unit;}
 function scrollLimit(y){return clamp(y,0,Math.max(0,document.documentElement.scrollHeight-innerHeight));}
 function navigationRoute(from,to){
  const cuts=[from,to,...[1,2,3].map(n=>n*unit).filter(y=>y>Math.min(from,to)&&y<Math.max(from,to))].sort((a,b)=>from<to?a-b:b-a);
  const parts=[];let total=0;
  for(let i=1;i<cuts.length;i++){
   const a=cuts[i-1],b=cuts[i],stage=Math.floor((a+b)/2/unit),weight=stage===0?1700:stage===1?2600:stage===2?2200:1100;
   const cost=Math.abs(b-a)/unit*weight;parts.push({from:a,to:b,start:total,end:total+cost});total+=cost;
  }
  return {parts,total,duration:clamp(total,650,5200)};
 }
 function animateScroll(to,{chapter=null,snap=false,instant=false}={}){
  stopNavigation();clearSnapIntent();to=scrollLimit(to);const from=scrollY;
  if(instant||reduceNavigation()||Math.abs(to-from)<2){scrollTo({top:to,behavior:'instant'});schedule();return;}
  const route=navigationRoute(from,to),duration=snap?clamp(420+Math.abs(to-from),420,620):route.duration;
  const run=navigation={from,to,chapter,snap,duration,started:performance.now()};
  const tick=now=>{
   if(navigation!==run||currentView!=='journey')return;
   if(document.querySelector('dialog[open]')){stopNavigation();return;}
   if(reduceNavigation()){scrollTo({top:to,behavior:'instant'});stopNavigation();schedule();return;}
   const t=clamp((now-run.started)/duration),eased=t*t*(3-2*t),distance=eased*route.total;
   const part=route.parts.find(p=>distance<=p.end)||route.parts.at(-1);
   const y=t===1?to:part.from+(part.to-part.from)*clamp((distance-part.start)/(part.end-part.start));
   scrollTo({top:y,behavior:'instant'});schedule();
   if(t<1)navigationFrame=requestAnimationFrame(tick);else stopNavigation();
  };
  navigationFrame=requestAnimationFrame(tick);
 }
 function jump(chapter,instant=false){const n=clamp(Number(chapter)||0,0,7);animateScroll(chapterOffset(n),{chapter:n,instant});}
 function nestedScroll(target){
  for(let el=target instanceof Element?target:null;el&&el!==document.body;el=el.parentElement){
   if(el.matches('dialog,input,textarea,select,[contenteditable=true],.carnet-stepper'))return true;
   if(/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+2)return true;
  }
  return false;
 }
 function canSnap(){return currentView==='journey'&&!!$('#carnet-story')&&!navigation&&!reduceNavigation()&&!isTyping()&&!document.querySelector('dialog[open]')&&!document.documentElement.classList.contains('carnet-demo-keyboard');}
 function settleChapter(){
  snapTimer=0;const intent=wheelIntent;wheelIntent=null;
  if(!intent||performance.now()-intent.time>1600||!canSnap())return;
  const threshold=Math.min(150,Math.max(64,measuredHeight*.14));
  const anchors=[0,1,2,3,4,5,6,7].map(n=>({chapter:n,y:scrollLimit(chapterOffset(n))}));
  const nearest=anchors.reduce((a,b)=>Math.abs(b.y-scrollY)<Math.abs(a.y-scrollY)?b:a);
  const gap=Math.abs(nearest.y-scrollY);
  // Proximity only: a stop in the middle of a shot remains exactly where it is.
  if(gap>2&&gap<=threshold)animateScroll(nearest.y,{chapter:nearest.chapter,snap:true});
 }
 function armSnap(){clearTimeout(snapTimer);if(wheelIntent&&canSnap())snapTimer=setTimeout(settleChapter,260);}
 function onWheel(e){
  if(currentView!=='journey'||e.ctrlKey||e.metaKey||Math.abs(e.deltaY)<=Math.abs(e.deltaX))return;
  stopNavigation();clearSnapIntent();
  if(!canSnap()||nestedScroll(e.target))return;
  wheelIntent={time:performance.now()};armSnap();
 }
 function manualPointer(e){
  // A second chapter button click retargets from the current frame, never queues.
  if(e.pointerType!=='touch'&&e.target.closest?.('[data-carnet=chapter],[data-carnet=next]')){clearSnapIntent();return;}
  stopNavigation();clearSnapIntent();
 }
 window.addEventListener('wheel',onWheel,{passive:true});
 window.addEventListener('pointerdown',manualPointer,{passive:true});
 window.addEventListener('touchstart',()=>{stopNavigation();clearSnapIntent();},{passive:true});
 window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Escape'].includes(e.key)){stopNavigation();clearSnapIntent();}});
 document.addEventListener('focusin',e=>{if(e.target.matches('input,textarea,select,[contenteditable=true]')){stopNavigation();clearSnapIntent();}});
 async function show(view,options={}){stopNavigation();clearSnapIntent();if(view===currentView&&view!=='journey')return true;const epoch=++routeEpoch;if(document.body.dataset.carnetView==='app'&&!await P.suspend())return false;window.AudioKit.stop();if(view==='journey'){
   if(currentView!=='journey'){P.beginOnboarding();replay=!P.getStartup().needsOnboarding;lessons?.setPreferences(getSettings(),{replay});}
   currentView='journey';document.body.dataset.carnetView='journey';window.VocabViewport?.afterRender(null,{view:'carnet-story'});const result=await mountScene();if(epoch!==routeEpoch||result?.backend==='disposed')return false;measure();scrollTo({top:options.fromStart?0:lastStoryScroll,behavior:'instant'});update();await targetReady('journey',result.backend,epoch);
  }else{window.VocabStartup?.setPhase('view');document.documentElement.classList.remove('carnet-demo-keyboard');if(currentView==='journey')lastStoryScroll=scrollY;lessons?.setChapter(null);currentView=view;document.body.dataset.carnetView=view==='components'?'components':'app';S.destroy();mounted=false;sceneStatus='aborted';sceneEpoch++;localLoading();if(view==='components'){window.VocabViewport?.afterRender(null,{view:'components'});scrollTo({top:0,behavior:'instant'})}else{if(options.navigate!==false)await P.showApp(view);scrollTo({top:0,behavior:'instant'});window.VocabViewport?.refresh()}$('#carnet-reader').inert=true;}
  $$('[data-preview-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewView===view)));if(view!=='journey'&&view!=='components')await targetReady(view==='today'?'today':'app',null,epoch);return true;
 }
 let entering=false;
 async function directEntry(){if(entering)return;entering=true;try{await lessons.submit('enter');if(currentView==='journey')jump(7);}finally{entering=false;}}
 function reveal(){readerRevealed=true;$('.reader-answer').innerHTML='<strong lang="fr">lire <span class="muted">· '+text('动词','verb','verbe')+'</span></strong><p>'+text('阅读；读<br>我喜欢每天读几页书。','To read.<br>I like to read a few pages every day.','Lire quelques pages.<br>Une petite habitude, chaque jour.')+'</p>';$('[data-carnet=reveal]').textContent=text('已揭晓','Revealed','Révélé');$('[data-carnet=reveal]').disabled=true}
 function readerAudioStatus(state=readerAudioState){
  readerAudioState=state;readerBusy=['loading','playing'].includes(state);
  const button=$('[data-carnet=listen]'),feedback=$('.reader-audio-feedback');
  if(button){if(readerBusy)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');}
  if(!feedback)return;
  const retryFocused=feedback.contains(document.activeElement);feedback.hidden=state!=='error';
  if(feedback.hidden&&retryFocused)button?.focus({preventScroll:true});
  feedback.querySelector('p').textContent=!window.speechSynthesis||!window.SpeechSynthesisUtterance?text('此浏览器暂不支持合成朗读。你可以继续阅读，或换用支持朗读的浏览器。','Speech synthesis is unavailable in this browser. Keep reading, or use a browser with speech support.','La synthèse vocale n’est pas disponible dans ce navigateur. Continuez à lire ou utilisez un navigateur compatible.'):text('朗读未能启动。请检查设备的法语声音，再点击重试。','Playback could not start. Check your French voices, then try again.','La lecture n’a pas démarré. Vérifiez vos voix françaises, puis réessayez.');
 }
 async function listen(){if(readerBusy)return;readerAudioStatus('loading');const settings=getSettings();try{const result=await window.AudioKit.speak('J’aime lire quelques pages chaque jour.',{rate:settings.rate,voiceURI:settings.voiceURI,onStatus(s){readerAudioStatus(s.state);}});if(result?.state)readerAudioStatus(result.state);}catch(_){readerAudioStatus('error');}finally{readerBusy=false;$('[data-carnet=listen]')?.removeAttribute('aria-busy');}}
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.matches('[data-action=theme-picker]')){e.preventDefault();e.stopImmediatePropagation();openAppearance(b);return}if(b.matches('[data-action=onboarding-replay]')){e.preventDefault();e.stopImmediatePropagation();show('journey',{fromStart:true});return}if(b.dataset.previewView){e.preventDefault();show(b.dataset.previewView).catch(console.error);return}if(b.dataset.appearanceKey){const key=b.dataset.appearanceKey,value=b.dataset.appearanceValue;setAppearance({[key]:value}).catch(console.error);return}switch(b.dataset.carnet){case 'appearance':openAppearance(b);break;case 'close-appearance':closeAppearance();break;case 'chapter':jump(b.dataset.chapterTarget);break;case 'next':{const nextFrom=navigation?.chapter??activeStep;nextFrom>=7?jump(0):jump(nextFrom+1);break;}case 'direct-entry':directEntry();break;case 'reveal':reveal();break;case 'listen':case 'retry-listen':listen();break;}},true);
 window.addEventListener('scroll',()=>{schedule();if(!navigation)armSnap();},{passive:true});window.addEventListener('resize',()=>{stopNavigation();clearSnapIntent();measure();},{passive:true});document.addEventListener('carnet:open-story',()=>show('journey',{fromStart:true}));systemDark.addEventListener('change',syncAppearance);systemReduced.addEventListener('change',syncAppearance);

 // The interactive chapters stay in native document flow. Keep just the focused
 // field inside the keyboard's visible rectangle; never remap chapter progress.
 let keyboardFrame=0;
 function keepLessonInputVisible(){
  keyboardFrame=0;const input=document.activeElement,vv=window.visualViewport;
  const typing=currentView==='journey'&&input?.matches('#carnet-lesson-answer,#carnet-lesson-goal')&&matchMedia('(max-width:760px), (pointer:coarse)').matches;
  const covered=typing&&vv&&Math.abs(vv.scale-1)<.02&&measuredHeight-vv.height>100;
  document.documentElement.classList.toggle('carnet-demo-keyboard',!!covered);
  if(!covered||document.querySelector('dialog[open]'))return;
  const r=input.getBoundingClientRect(),top=vv.offsetTop+20,bottom=vv.offsetTop+vv.height-24;
  if(r.bottom>bottom)scrollBy({top:r.bottom-bottom,behavior:'instant'});
  else if(r.top<top)scrollBy({top:r.top-top,behavior:'instant'});
 }
 function scheduleKeyboard(){if(!keyboardFrame)keyboardFrame=requestAnimationFrame(keepLessonInputVisible)}
 window.visualViewport?.addEventListener('resize',scheduleKeyboard,{passive:true});
 document.addEventListener('focusin',scheduleKeyboard);document.addEventListener('focusout',scheduleKeyboard);
 window.addEventListener('pagehide',()=>{stopNavigation();clearSnapIntent();routeEpoch++;sceneEpoch++;mounted=false;sceneStatus='aborted';window.VocabStartup?.setPhase('view');S.destroy();});
 window.addEventListener('pageshow',async event=>{if(!event.persisted||currentView!=='journey'||!lessonHost?.isConnected)return;const epoch=++routeEpoch;try{measure();const result=await mountScene();if(epoch!==routeEpoch||result?.backend==='disposed')return;update();await targetReady('journey',result.backend,epoch);}catch(error){console.error(error);window.VocabStartup?.fail(error);}});
 window.addEventListener('vocab-startup-ready',schedule,{once:true});
 const languageObserver=new MutationObserver(()=>{if(!chromeLanguage||chromeLanguage===document.documentElement.lang)return;stopNavigation();clearSnapIntent();const value=$('#carnet-test-input')?.value||'',scroll=scrollY,open=$('#carnet-appearance')?.open;$('#carnet-preview-bar')?.remove();lessonHost?.remove();$('#carnet-story')?.remove();$$('.carnet-story-ui').forEach(el=>el.remove());$('#carnet-appearance')?.remove();$('#carnet-components-preview')?.remove();buildChrome();lessons?.syncLanguage();$('#carnet-test-input').value=value;if(readerRevealed)reveal();readerAudioStatus();localLoading();syncAppearance();measure();scrollTo({top:scroll,behavior:'instant'});if(open)$('#carnet-appearance').showModal();});languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

 window.VocabCarnetReview={show,jump,setAppearance,getState:()=>({progress,unit,activeStep,currentView,readerRevealed,appearance:P.getAppearance(),resolved:resolvedAppearance(),scene:S.__getDebugState(),lessons:lessons?.getState(),replay,navigation:navigation?{chapter:navigation.chapter,snap:navigation.snap,duration:navigation.duration,target:navigation.to}:null}),mountScene,refresh:schedule};
 async function init(){await P.ready;const startup=P.getStartup();replay=!startup.needsOnboarding;document.documentElement.dataset.carnetPreview=String(PREVIEW);buildChrome();P.beginOnboarding();if(PREVIEW&&!document.getElementById('portable-state'))await P.setAppearance({design:'classic',mode:'light',motion:'system'});syncAppearance();
  if(!PREVIEW&&(!startup.needsOnboarding||startup.blocked)){await show('today',{navigate:false});return;}
  document.body.dataset.carnetView='journey';window.VocabViewport?.afterRender(null,{view:'carnet-story'});measure();const epoch=++routeEpoch,result=await mountScene();if(epoch!==routeEpoch||result?.backend==='disposed')return;update();await targetReady('journey',result.backend,epoch);
 }
 init().catch(error=>{console.error(error);window.VocabStartup?.fail(error);const el=$('.carnet-loading');if(el){el.hidden=false;el.textContent=text('场景准备未完成，可从顶部进入产品预览。','Scene unavailable; use the product preview above.','Scène indisponible ; utilisez les aperçus ci-dessus.')}});
})();
