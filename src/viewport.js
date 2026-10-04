/* Keep the study canvas inside the visible viewport without disabling zoom.
   Safari can pan its visual viewport while bringing an input above the keyboard;
   matching both its height AND offset avoids losing the question off the top. */
(() => {
 'use strict';
 const root=document.documentElement;
 const mobileQuery=matchMedia('(max-width: 760px), (pointer: coarse)');
 const spellSelector='.spell-input';
 const journeyInputSelector='.journey-shell input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]),.journey-shell textarea';
 let view='',questionKey='',scheduled=0,locked='',returnScroll={x:0,y:0},lastUnzoomedHeight=innerHeight;
 let baselineHeight=innerHeight,baselineWidth=innerWidth;
 const isMobile=()=>mobileQuery.matches;
 const focusedSpell=()=>document.activeElement?.matches?.(spellSelector)?document.activeElement:null;
 const focusedJourney=()=>document.activeElement?.matches?.(journeyInputSelector)?document.activeElement:null;
 const number=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
 function geometry(){
  const vv=window.visualViewport;
  const scale=number(vv?.scale,1);
  const zoomed=Math.abs(scale-1)>.02;
  const visualHeight=number(vv?.height,innerHeight);
  const width=number(vv?.width,innerWidth);
  // Do not interpret pinch zoom as a keyboard or counteract the user's panning.
  if(!zoomed)lastUnzoomedHeight=visualHeight;
  if(!zoomed&&Math.abs(innerWidth-baselineWidth)>80){baselineWidth=innerWidth;baselineHeight=innerHeight;}
  if(!zoomed)baselineHeight=Math.max(baselineHeight,innerHeight,document.documentElement.clientHeight);
  const height=zoomed?lastUnzoomedHeight:visualHeight;
  return {height,width,scale,zoomed,top:zoomed?0:Math.max(0,number(vv?.offsetTop)),keyboardSpace:!zoomed&&baselineHeight-visualHeight>100};
 }
 function refresh(){
  scheduled=0;
  const g=geometry();
  root.style.setProperty('--vh',Math.max(1,g.height)+'px');
  root.style.setProperty('--visual-top',g.top+'px');
  const study=view==='study'&&isMobile();
  const journey=view==='onboarding'&&isMobile()&&!!document.querySelector('.journey-shell');
  const nextLock=study?'study':journey?'journey':'';
  if(nextLock!==locked){
   if(nextLock&&!locked)returnScroll={x:scrollX,y:scrollY};
   root.classList.toggle('study-viewport',study);root.classList.toggle('journey-viewport',journey);
   if(!nextLock&&locked){root.style.removeProperty('--visual-top');window.scrollTo(returnScroll.x,returnScroll.y);}
   locked=nextLock;
  }
  root.classList.toggle('keyboard-open',study&&g.keyboardSpace&&!!focusedSpell());
  root.classList.toggle('compact-study-viewport',study&&g.height<560);
  root.classList.toggle('short-study-viewport',study&&g.height<420);
  root.classList.toggle('viewport-zoomed',study&&g.zoomed);
  root.classList.toggle('journey-keyboard-open',journey&&g.keyboardSpace&&!!focusedJourney());
  // A naturally short landscape screen is not a keyboard. Retain a compact
  // frame through keyboard closing/pinch gestures only after actual occlusion.
  root.classList.toggle('journey-short-viewport',journey&&g.height<420&&(g.keyboardSpace||(g.zoomed&&root.classList.contains('journey-short-viewport'))));
  root.classList.toggle('journey-tiny-viewport',journey&&g.height<=280&&(g.keyboardSpace||(g.zoomed&&root.classList.contains('journey-tiny-viewport'))));
  root.classList.toggle('journey-viewport-zoomed',journey&&g.zoomed);
  if(journey){root.style.setProperty('--journey-vh',Math.max(1,g.height)+'px');root.style.setProperty('--journey-visual-top',g.top+'px');}
  else{root.style.removeProperty('--journey-vh');root.style.removeProperty('--journey-visual-top');}
 }
 function schedule(){if(!scheduled)scheduled=requestAnimationFrame(refresh);}
 function beforeRender(){
  const active=focusedSpell();
  if(!active||view!=='study')return null;
  const inputs={};
  document.querySelectorAll('#app '+spellSelector).forEach(el=>{if(el.id)inputs[el.id]=el.value;});
  return {questionKey,id:active.id,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,inputs,scrollTop:document.querySelector('.study-question')?.scrollTop||0};
 }
 function afterRender(snapshot,context={}){
  view=context.view||'';questionKey=context.questionKey||'';
  refresh();
  // Restore only an input that was already focused in this exact question.
  // New words, revealed answers, navigation and modal forms never gain focus here.
  if(!snapshot||view!=='study'||!questionKey||questionKey!==snapshot.questionKey||document.querySelector('dialog[open]'))return;
  const target=document.getElementById(snapshot.id);
  if(!target?.matches(spellSelector)||!target.closest('#app'))return;
  for(const [id,value] of Object.entries(snapshot.inputs)){
   const input=document.getElementById(id);if(input?.matches(spellSelector))input.value=value;
  }
  target.focus({preventScroll:true});
  if(snapshot.start!==null)target.setSelectionRange(snapshot.start,snapshot.end,snapshot.direction||'none');
  const question=document.querySelector('.study-question');if(question)question.scrollTop=snapshot.scrollTop;
  refresh();
 }
 function destroy(){
  if(scheduled)cancelAnimationFrame(scheduled);
  window.removeEventListener('resize',schedule);
  window.visualViewport?.removeEventListener('resize',schedule);
  window.visualViewport?.removeEventListener('scroll',schedule);
  document.removeEventListener('focusin',schedule);
  document.removeEventListener('focusout',schedule);
  mobileQuery.removeEventListener?.('change',schedule);
  root.classList.remove('study-viewport','keyboard-open','compact-study-viewport','short-study-viewport','viewport-zoomed','journey-viewport','journey-keyboard-open','journey-short-viewport','journey-tiny-viewport','journey-viewport-zoomed');
  root.style.removeProperty('--journey-vh');root.style.removeProperty('--journey-visual-top');root.style.removeProperty('--visual-top');
  if(locked)window.scrollTo(returnScroll.x,returnScroll.y);locked='';
 }
 window.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 document.addEventListener('focusin',schedule);
 document.addEventListener('focusout',schedule);
 mobileQuery.addEventListener?.('change',schedule);
 window.VocabViewport={beforeRender,afterRender,refresh,isMobile,destroy};
 refresh();
})();
