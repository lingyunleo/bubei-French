/* Run only in independent, ephemeral browser contexts with synthetic records. */
const paths=require('./paths.cjs');
const {launchBrowser}=require('./runtime.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const file=paths.releaseFile;
const out=path.join(paths.runRoot,'产品动效与弹窗');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],measurements=[],browsers={};let browser;
const pass=(engine,check)=>{checks.push({engine,check});console.log('PASS',engine,check)};
async function boot(context,seed=true,{delayFirstCounterFrameMs=0}={}){
 const p=await context.newPage();p.setDefaultTimeout(20000);
 p.on('pageerror',e=>errors.push({message:e.message,stack:e.stack,url:p.url(),phase:p.productPhase||'boot'}));
 await p.addInitScript(({delayFirstCounterFrameMs})=>{
  window.__productProbe={animations:[],counts:[],countSamples:[],delayedFrame:null};
  const original=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   window.__productProbe.animations.push({class:this.className,parent:this.parentElement?.className||'',duration:typeof options==='object'?options.duration:options});
   return original.call(this,frames,options);
  };
  const sample=(element,value)=>{
   if(!element?.matches?.('.editorial-count-display'))return;
   const text=String(value);window.__productProbe.counts.push(text);
   window.__productProbe.countSamples.push({value:text,at:performance.now()});
  };
  // Read the actual mutation records: a completed animation may remove its
  // display span before this callback runs. Sampling only connected nodes
  // loses those writes, especially when the renderer batches delivery.
  new MutationObserver(records=>{
   for(const record of records){
    if(record.type==='childList'){
     for(const node of record.addedNodes){
      sample(record.target,node.textContent);
      sample(node,node.textContent);
      node.querySelectorAll?.('.editorial-count-display').forEach(e=>sample(e,e.textContent));
     }
    }else if(record.type==='characterData'){
     sample(record.target.parentElement,record.oldValue);
     sample(record.target.parentElement,record.target.data);
    }
   }
  }).observe(document,{subtree:true,childList:true,characterData:true,characterDataOldValue:true});
  if(delayFirstCounterFrameMs){
   const nativeFrame=requestAnimationFrame.bind(window),nativeCancel=cancelAnimationFrame.bind(window),pending=new Map();
   let held=false,serial=0;
   window.requestAnimationFrame=callback=>{
    // The counter requests its first frame immediately after adding this span.
    // Hold that delivery only; subsequent frames use the native frame clock.
    if(held||!document.querySelector('.editorial-count-display'))return nativeFrame(callback);
    held=true;const ticket=--serial,task={timer:null,frame:null};
    const probe=window.__productProbe.delayedFrame={requested:performance.now(),delivered:null,elapsed:null};
    pending.set(ticket,task);
    task.timer=setTimeout(()=>{
     task.timer=null;task.frame=nativeFrame(now=>{
      pending.delete(ticket);probe.delivered=now;probe.elapsed=performance.now()-probe.requested;callback(now);
     });
    },delayFirstCounterFrameMs);
    return ticket;
   };
   window.cancelAnimationFrame=ticket=>{
    const task=pending.get(ticket);
    if(!task)return nativeCancel(ticket);
    if(task.timer!==null)clearTimeout(task.timer);
    if(task.frame!==null)nativeCancel(task.frame);
    pending.delete(ticket);
   };
  }
 },{delayFirstCounterFrameMs});
 await p.goto(pathToFileURL(file).href);
 await p.waitForFunction(()=>window.VocabApp&&window.VocabCarnetProduct);
 await p.evaluate(()=>VocabCarnetProduct.ready);
 if(seed){
  await p.evaluate(async()=>{
   let s=VocabData.importEntries(VocabData.fresh(),VocabSeed.slice(0,30),{name:'产品动效合成测试',mode:'new'}).state;
   Object.assign(s.settings,{onboardingComplete:true,autoWord:false,autoExample:false,designTheme:'classic',theme:'light',carnetMotion:'immersive',motionMode:'standard',dailyGoalEnabled:false});
   const r=await VocabData.save(s,{expectedRevision:VocabApp.getState().revision});
   if(!r.ok&&r.ok!==undefined)throw Error('fixture save failed');
  });
  await p.reload();await p.waitForFunction(()=>window.VocabApp&&document.body.dataset.carnetView==='app');
 }
 return p;
}
async function counterTransition(p,engine,phase){
 try{
  await p.waitForFunction(()=>{
   const count=document.querySelector('.today-grid .count');
   return window.__productProbe.counts.some(value=>Number(value)>0&&Number(value)<30)
    &&count?.textContent.trim()==='30'&&!count.querySelector('.editorial-count-display');
  });
 }finally{
  const result=await p.evaluate(()=>({probe:window.__productProbe,visibility:document.visibilityState,count:document.querySelector('.today-grid .count')?.textContent,viewport:{width:innerWidth,height:innerHeight}}));
  measurements.push({engine,phase,...result});
 }
 const probe=await p.evaluate(()=>window.__productProbe);
 assert.ok(new Set(probe.counts).size>1,'Counter must visibly pass through distinct values');
 assert.ok(probe.counts.includes('21'),'Counter must begin at its first rendered value, even after a delayed frame');
 assert.equal(await p.locator('.today-grid .count').first().innerText(),'30');
 return probe;
}
// Completion is based on actual browser animation state, not machine speed.
async function settledAnimations(p,selector='#app'){
 await p.waitForFunction(selector=>[...document.querySelectorAll(selector)].every(node=>node.getAnimations({subtree:true}).every(animation=>{
  const timing=animation.effect?.getComputedTiming();
  return timing?.endTime===Infinity||['finished','idle'].includes(animation.playState);
 })),selector);
}
async function tiltState(p,card,active){
 const element=await card.elementHandle();
 try{await p.waitForFunction(({element,active})=>active
  ?element.classList.contains('context-tilt-active')&&getComputedStyle(element).transform!=='none'&&Number(getComputedStyle(element,'::after').opacity)>.4
  :!element.classList.contains('context-tilt-active'),{element,active});}
 finally{await element.dispose();}
}
async function smoothState(p,enabled){await p.waitForFunction(enabled=>window.VocabSmoothScroll?.status().enabled===enabled,enabled);}
async function savedSpelling(p){await p.waitForFunction(()=>VocabApp.getState().session?.draft?.typed==='écriture conservée');}
async function view(p,name){p.productPhase=name;await p.evaluate(v=>VocabCarnetReview.show(v),name);await p.waitForFunction(name=>document.body.dataset.carnetView==='app'&&VocabApp.getView()===name,name);if(name==='contexts')await p.locator('[data-action=context-filter][data-favorite=false]').click();await settledAnimations(p);}
async function modalGeometry(p){await p.waitForFunction(()=>document.getElementById('modal').open&&!document.getElementById('modal').classList.contains('motion-morphing'));return p.locator('#modal').evaluate(e=>({width:e.offsetWidth,height:e.offsetHeight,body:document.getElementById('modal-body').clientHeight,scroll:document.getElementById('modal-body').scrollHeight,style:e.style.cssText,morph:e.classList.contains('motion-morphing'),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,viewport:innerWidth}));}
async function close(p){await p.locator('#modal-close').click();await p.waitForFunction(()=>!document.getElementById('modal').open);}
(async()=>{for(const engine of ['Chromium','WebKit']){browser=await launchBrowser(engine);browsers[engine]=browser.version();const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'}),p=await boot(context);
 const probe=await counterTransition(p,engine,'initial-counter');assert.ok(probe.animations.some(a=>a.parent==='editorial-line'));assert.equal(await p.locator('.hero-light').count(),0);pass(engine,'首页刷新：标题逐行显现、真实数字过渡后为30；无环轨装饰');
 await p.screenshot({path:path.join(out,engine+'-首页.png'),fullPage:true});
 await view(p,'contexts');let card=p.locator('.context-grid .context-card').first(),r=await card.boundingBox();await p.mouse.move(r.x+r.width*.15,r.y+r.height*.25);await tiltState(p,card,true);let tilt=await card.evaluate(e=>({active:e.classList.contains('context-tilt-active'),transform:getComputedStyle(e).transform,light:getComputedStyle(e,'::after').opacity,border:getComputedStyle(e,'::before').animationName,borderDisplay:getComputedStyle(e,'::before').display}));assert.equal(tilt.active,true);assert.notEqual(tilt.transform,'none');assert.ok(Number(tilt.light)>.4);assert.equal(tilt.border,'context-border-orbit');assert.notEqual(tilt.borderDisplay,'none');await p.screenshot({path:path.join(out,engine+'-例句悬停.png')});await p.mouse.move(10,100);await tiltState(p,card,false);assert.equal(await card.evaluate(e=>e.classList.contains('context-tilt-active')),false);pass(engine,'例句卡片：3D透视、跟随光泽、旋转描边与松开弹簧回正');
 await card.locator('[data-action=favorite]').click();await p.waitForFunction(()=>document.querySelector('.context-grid .favorite-button').getAttribute('aria-pressed')==='true');await p.locator('[data-action=context-filter][data-favorite=true]').count().then(async n=>{if(n)await p.locator('[data-action=context-filter][data-favorite=true]').click()});const fav=await p.evaluate(()=>Object.values(VocabApp.getState().contexts).flat().filter(e=>e.favorite).length);assert.equal(fav,1);pass(engine,'收藏写入与筛选交互保留；动效不替代状态更新');
 await view(p,'library');await p.locator('[data-action=import]:visible').click();let geo=await modalGeometry(p);assert.equal(geo.width,920);assert.ok(geo.body>400);assert.equal(geo.style,'');measurements.push({engine,panel:'import',...geo});await p.screenshot({path:path.join(out,engine+'-导入面板.png')});await close(p);
 for(let i=0;i<4;i++){await p.locator('.word-row').nth(i).click();geo=await modalGeometry(p);assert.ok(geo.height>=480);assert.ok(geo.body>=250);assert.equal(geo.morph,false);assert.equal(geo.style,'');await close(p);}pass(engine,'桌面导入920px；重复打开词条后内容可见，动画尺寸无残留');
 // Short interaction gaps intentionally interrupt motion; completion is checked via dialog.open.
 for(let i=0;i<3;i++){await p.locator('.word-row').nth(i).dispatchEvent('click');await p.waitForTimeout(60);await p.locator('[data-action=edit-word]').dispatchEvent('click');await p.waitForTimeout(50);await p.locator('#modal-close').dispatchEvent('click');await p.waitForFunction(()=>!document.getElementById('modal').open);}await p.locator('.word-row').first().click();geo=await modalGeometry(p);assert.ok(geo.body>250);assert.equal(geo.style,'');await close(p);pass(engine,'快速中断词条展开、切换编辑、关闭后再次打开，面板未塌陷');
 await p.locator('.word-row').first().click();await p.locator('[data-action=edit-word]').click();await p.locator('#french').fill('lecture de test');await modalGeometry(p);assert.equal(await p.locator('#french').inputValue(),'lecture de test');geo=await modalGeometry(p);assert.ok(geo.body>400);measurements.push({engine,panel:'edit',...geo});await close(p);pass(engine,'词条详情切换为编辑表单时，输入与面板尺寸稳定');
 await view(p,'settings');await p.evaluate(()=>document.activeElement?.blur());await p.mouse.move(1300,400);await p.mouse.wheel(0,220);await smoothState(p,true);assert.equal(await p.evaluate(()=>VocabSmoothScroll.status().enabled),true);await p.locator('[data-action=theme-picker]:visible').first().click();await smoothState(p,false);assert.equal(await p.evaluate(()=>VocabSmoothScroll.status().enabled),false);await p.locator('[data-carnet=close-appearance]').last().click();await p.waitForFunction(()=>!document.getElementById('carnet-appearance').open);await p.locator('input[name=newBatch]').focus();await smoothState(p,false);assert.equal(await p.evaluate(()=>VocabSmoothScroll.status().enabled),false);pass(engine,'桌面正式内容滚轮平滑；外观弹窗及输入自动退回原生');
 await p.evaluate(()=>VocabApp.begin('spelling',{replace:true,limit:1}));await p.locator('#spell-input').fill('écriture conservée');await savedSpelling(p);const before=await p.evaluate(()=>JSON.stringify(VocabApp.getState().session));await p.locator('[data-action=study-options]').click();geo=await modalGeometry(p);assert.ok(geo.width<=560);assert.ok(geo.body>180);await smoothState(p,false);assert.equal(await p.evaluate(()=>VocabSmoothScroll.status().enabled),false);await close(p);assert.equal(await p.locator('#spell-input').inputValue(),'écriture conservée');assert.equal(await p.evaluate(()=>JSON.stringify(VocabApp.getState().session)),before);pass(engine,'学习弹窗开合保留拼写输入和会话，学习页不启用平滑滚动');
 await p.evaluate(()=>VocabCarnetProduct.setAppearance({design:'atelier',mode:'dark',motion:'standard'}));assert.equal(await p.locator('#spell-input').inputValue(),'écriture conservée');await view(p,'today');await p.reload();await p.waitForFunction(()=>document.body.dataset.carnetView==='app'&&window.VocabApp);await p.waitForFunction(()=>__productProbe.animations.some(a=>a.parent==='editorial-line'));await settledAnimations(p,'.hero h1');assert.ok(await p.evaluate(()=>__productProbe.animations.some(a=>a.parent==='editorial-line')));await p.screenshot({path:path.join(out,engine+'-ATELIER深色.png')});pass(engine,'ATELIER深色同样有首页标题入场；切换主题保留输入');
 p.productPhase='guide-return';await p.evaluate(()=>VocabCarnetReview.show('journey',{fromStart:true}));await smoothState(p,false);assert.equal(await p.evaluate(()=>VocabSmoothScroll.status().enabled),false);pass(engine,'回到引导后产品平滑滚动关闭，不接管引导进度');await context.close();
 const delayedContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'}),delayed=await boot(delayedContext,true,{delayFirstCounterFrameMs:750});
 const delayedProbe=await counterTransition(delayed,engine,'delayed-first-counter-frame');
 assert.ok(delayedProbe.delayedFrame?.elapsed>=750,'The regression check must actually delay the first frame beyond the 560ms transition');
 pass(engine,'计数首帧延迟750ms后仍从21渐进到30；未因启动延迟跳过过渡');await delayedContext.close();
 const reducedContext=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),quiet=await boot(reducedContext);await settledAnimations(quiet);assert.equal(await quiet.evaluate(()=>__productProbe.animations.filter(a=>a.parent==='editorial-line').length),0);assert.equal(await quiet.locator('.today-grid .count').first().innerText(),'30');await view(quiet,'contexts');card=quiet.locator('.context-grid .context-card').first();r=await card.boundingBox();await quiet.mouse.move(r.x+25,r.y+100);await settledAnimations(quiet);await smoothState(quiet,false);assert.equal(await card.evaluate(e=>getComputedStyle(e).transform),'none');assert.equal(await quiet.evaluate(()=>VocabSmoothScroll.status().enabled),false);pass(engine,'系统减少动效：标题/数字直接就位、卡片不倾斜、滚动保持原生');await reducedContext.close();
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'}),mobile=await boot(mobileContext);await settledAnimations(mobile);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await view(mobile,'contexts');card=mobile.locator('.context-grid .context-card').first();const touch=await card.evaluate(e=>{const r=e.getBoundingClientRect(),n=e.querySelector('.sentence'),init={bubbles:true,cancelable:true,pointerId:88,pointerType:'touch',isPrimary:true,button:0,clientX:r.left+35,clientY:r.top+110};const down=new PointerEvent('pointerdown',init);n.dispatchEvent(down);return {prevented:down.defaultPrevented,touchAction:getComputedStyle(e).touchAction}});await tiltState(mobile,card,true);assert.equal(touch.prevented,false);assert.notEqual(await card.evaluate(e=>getComputedStyle(e).transform),'none');await card.evaluate(e=>e.querySelector('.sentence').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:88,pointerType:'touch',isPrimary:true,button:0})));await tiltState(mobile,card,false);await smoothState(mobile,false);assert.equal(await card.evaluate(e=>e.classList.contains('context-tilt-active')),false);assert.equal(await mobile.evaluate(()=>VocabSmoothScroll.status().enabled),false);await mobile.evaluate(()=>scrollBy(0,300));await mobile.waitForFunction(()=>scrollY>0);assert.ok(await mobile.evaluate(()=>scrollY)>0);await mobile.screenshot({path:path.join(out,engine+'-手机例句.png')});pass(engine,'390px：触摸倾斜/松开回正不取消事件，手机保留原生滚动且无横溢出');
 await view(mobile,'library');await mobile.locator('.word-row').first().click();geo=await modalGeometry(mobile);assert.equal(geo.width,374);assert.ok(geo.body>550);assert.ok(geo.left>=7&&geo.right<=383);measurements.push({engine,panel:'mobile-word',...geo});await mobile.screenshot({path:path.join(out,engine+'-手机词条.png')});pass(engine,'手机词条面板总边距16px，主体高度充足，头尾操作始终可见');await mobileContext.close();await browser.close();browser=null;}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({file,browsers,checks,measurements,errors,limitations:['Independent Chromium and WebKit 26.5 only; the specific physical Safari build in the user video and physical iOS keyboard/scroll were not tested.','The video collapse was not reproduced in fresh WebKit 26.5 before the fix; defensive natural flex sizing and panel minimum height were verified.']},null,2));console.log('DONE',checks.length,out);
})().catch(async e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({file,browsers,checks,measurements,errors,error:e.stack},null,2));console.error(e);await browser?.close();process.exitCode=1;});
