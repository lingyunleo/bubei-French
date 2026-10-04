/* Desktop document-wheel enhancement. Lenis 1.3.26 (MIT) remains optional:
   native scrolling is the fallback, and no animation loop runs while idle. */
(() => {
 'use strict';
 window.VocabSmoothScroll?.destroy?.();
 const root=document.documentElement;
 const desktop=matchMedia('(min-width:761px) and (hover:hover) and (pointer:fine)');
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const pages=new Set(['today','library','contexts','settings']);
 const editors='input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
 const nativeKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Spacebar']);
 let view='',instance=null,frame=0,frames=0,rendering=true,destroyed=false,foreground=true;
 const disposers=[];
 const listen=(target,type,handler,options)=>{target?.addEventListener(type,handler,options);disposers.push(()=>target?.removeEventListener(type,handler,options))};
 function cleanClasses(){for(const name of [...root.classList])if(name==='lenis'||name.startsWith('lenis-')||name==='vocab-smooth-scroll')root.classList.remove(name)}
 // Portable HTML can have been exported during a wheel animation.
 cleanClasses();
 function reason(){
  if(destroyed)return 'destroyed';
  if(window.CARNET_ENABLED&&document.body.dataset.carnetView!=='app')return 'guide';
  if(rendering)return 'render';
  if(!pages.has(view))return 'view';
  if(!desktop.matches)return 'pointer';
  if(reduced.matches||root.dataset.motion==='simple'||window.VocabMotion?.isReduced?.())return 'motion';
  if(document.hidden||!foreground)return 'background';
  if(document.querySelector('dialog[open]'))return 'dialog';
  if(document.activeElement?.closest?.(editors))return 'input';
  if(Math.abs((window.visualViewport?.scale||1)-1)>.02)return 'zoom';
  if(window.getSelection()?.isCollapsed===false)return 'selection';
  if(root.scrollHeight-root.clientHeight<2)return 'short-page';
  if(typeof window.Lenis!=='function')return 'unavailable';
  return '';
 }
 function detach(){
  if(frame)cancelAnimationFrame(frame);frame=0;
  const previous=instance;instance=null;
  // stop() cancels Lenis's current interpolation; destroy() removes its
  // wheel listeners so a disabled enhancement never locks native scrolling.
  if(previous){previous.stop();previous.destroy()}
  cleanClasses();
 }
 function nestedNative(node){
  if(!(node instanceof Element)||node===root||node===document.body)return false;
  if(node.matches(editors+',dialog,[data-lenis-prevent],[data-lenis-prevent-wheel],[data-lenis-prevent-vertical]'))return true;
  const vertical=node.scrollHeight>node.clientHeight+1,horizontal=node.scrollWidth>node.clientWidth+1;
  if(!vertical&&!horizontal)return false;
  const style=getComputedStyle(node),scrollable=/^(auto|scroll|overlay)$/;
  return vertical&&scrollable.test(style.overflowY)||horizontal&&scrollable.test(style.overflowX);
 }
 function nativeWheel(event){
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||Math.abs(event.deltaX)>=Math.abs(event.deltaY))return true;
  return event.composedPath().some(nestedNative);
 }
 function tick(time){
  frame=0;const active=instance;if(!active)return;
  if(reason()){detach();return}
  active.raf(time);frames++;
  if(instance===active&&active.isScrolling==='smooth')frame=requestAnimationFrame(tick);
 }
 function wake(active){
  // virtualScroll runs before Lenis chooses whether to animate. Checking
  // after its wheel handler avoids creating frames for a prevented gesture.
  queueMicrotask(()=>{if(instance===active&&!frame&&active.isScrolling==='smooth'&&!reason())frame=requestAnimationFrame(tick)});
 }
 function ensure(){
  if(reason()){detach();return null}
  if(instance)return instance;
  try{
   let active;
   active=new window.Lenis({
    autoRaf:false,autoResize:false,smoothWheel:true,syncTouch:false,
    lerp:.14,wheelMultiplier:1,gestureOrientation:'vertical',
    anchors:false,autoToggle:false,allowNestedScroll:false,
    respectReducedMotion:true,prevent:nestedNative,
    virtualScroll:({event})=>{if(reason()||event.type!=='wheel'||nativeWheel(event))return false;wake(active);return true}
   });
   instance=active;root.classList.add('vocab-smooth-scroll');return active;
  }catch(_){detach();return null}
 }
 function reconcile(){if(!destroyed)ensure()}
 function wheelCapture(event){
  if(reason()||nativeWheel(event)){detach();return}
  const active=ensure();if(!active)return;
  // Refresh the clock before the first gesture after an idle interval; a
  // stale RAF timestamp would otherwise jump straight to the new target.
  if(!frame&&active.isScrolling!=='smooth')active.raf(performance.now());
 }
 function beforeRender(){rendering=true;detach()}
 function refresh(nextView){
  if(destroyed)return;if(typeof nextView==='string')view=nextView;
  rendering=false;detach();ensure();
 }
 function resized(){if(!destroyed&&!rendering){detach();ensure()}}
 function keyboard(event){
  if(nativeKeys.has(event.key)||event.key==='Tab'||event.key==='Escape'||event.key==='Enter'&&event.target?.closest?.('a[href]'))detach();
 }
 function nativeScroll(){
  // Respect an external scrollTo/anchor/scrollbar adjustment even if a wheel
  // animation was still moving. Lenis's own writes match animatedScroll.
  if(instance?.isScrolling==='smooth'&&Math.abs(window.scrollY-instance.animatedScroll)>2)detach();
 }
 const dialogs=new MutationObserver(changes=>{if(changes.some(change=>change.target.tagName==='DIALOG'))reconcile()});
 dialogs.observe(root,{subtree:true,attributes:true,attributeFilter:['open']});
 const sizes=typeof ResizeObserver==='function'?new ResizeObserver(resized):null;
 sizes?.observe(root);
 listen(window,'wheel',wheelCapture,{capture:true,passive:true});
 listen(window,'keydown',keyboard,{capture:true});
 listen(window,'pointerdown',detach,{capture:true,passive:true});
 listen(window,'touchstart',detach,{capture:true,passive:true});
 listen(window,'scroll',nativeScroll,{passive:true});
 listen(window,'click',event=>{if(event.target?.closest?.('a[href]'))detach()},{capture:true});
 listen(document,'focusin',reconcile);
 listen(document,'focusout',()=>queueMicrotask(reconcile));
 listen(document,'selectionchange',()=>{if(window.getSelection()?.isCollapsed===false)detach()});
 listen(document,'visibilitychange',reconcile);
 listen(window,'blur',()=>{foreground=false;detach()});
 listen(window,'focus',()=>{foreground=true;reconcile()});
 listen(window,'pagehide',()=>{foreground=false;detach()});
 listen(window,'pageshow',()=>{foreground=true;reconcile()});
 listen(window,'resize',resized,{passive:true});
 listen(window.visualViewport,'resize',resized,{passive:true});
 listen(window,'vocab-motionchange',reconcile);
 listen(desktop,'change',reconcile);
 listen(reduced,'change',reconcile);
 function destroy(){destroyed=true;detach();dialogs.disconnect();sizes?.disconnect();for(const dispose of disposers)dispose()}
 window.VocabSmoothScroll=Object.freeze({
  beforeRender,refresh,destroy,
  status:()=>({enabled:!!instance,running:!!frame,view,reason:reason(),frames})
 });
})();
