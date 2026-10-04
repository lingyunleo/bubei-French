/* Restore the product's editorial reveals without decorative scene elements.
   The real count stays readable to assistive technology throughout the reveal. */
(() => {
 'use strict';
 const seen=new Set(),animations=new Set(),counters=new Set();
 let observer=null;
 const reduced=()=>window.VocabMotion?.isReduced()??matchMedia('(prefers-reduced-motion:reduce)').matches;
 const visible=node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight};
 const appVisible=()=>document.body.dataset.carnetView==='app';
 function animate(node,frames,options){const a=window.VocabMotion?.animate(node,frames,options);if(a){animations.add(a);a.finished.then(()=>animations.delete(a),()=>animations.delete(a))}return a}
 function title(node){
  if(!node||seen.has('title')||!visible(node)||!appVisible())return;
  seen.add('title');if(reduced()||document.hidden)return;
  const lines=node.innerHTML.split(/<br\s*\/?\s*>/i);if(lines.length<2)return;
  node.setAttribute('aria-label',lines.map(text=>{const span=document.createElement('span');span.innerHTML=text;return span.textContent}).join(' '));
  node.innerHTML=lines.map(text=>'<span class="editorial-line" aria-hidden="true"><span>'+text+'</span></span>').join('');
  node.querySelectorAll('.editorial-line>span').forEach((line,i)=>animate(line,[{transform:'translateY(88%)',opacity:.15},{transform:'translateY(0)',opacity:1}],{duration:560,delay:i*85,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));
 }
 function count(node,key){
  if(!node||seen.has(key)||!appVisible())return;seen.add(key);
  const raw=node.textContent.trim(),value=Number(raw);if(!/^\d+$/.test(raw)||!value||reduced()||document.hidden)return;
  const original=document.createElement('span'),display=document.createElement('span');
  original.className='editorial-count-source';original.textContent=raw;
  display.className='editorial-count-display';display.setAttribute('aria-hidden','true');display.textContent=raw;
  node.replaceChildren(original,display);node.classList.add('editorial-count');
  const state={node,raw,frame:0,finish(){cancelAnimationFrame(this.frame);if(this.node.contains(display)){this.node.textContent=this.raw;this.node.classList.remove('editorial-count')}counters.delete(this)}};
  counters.add(state);let start=null;const from=Math.max(0,Math.floor(value*.7));
  // Begin when a frame can actually be painted, not while the browser is still
  // waiting to schedule it (for example a busy WebKit startup).
  const step=now=>{if(!node.isConnected||reduced()||document.hidden||!appVisible()){state.finish();return}if(start===null)start=now;const p=Math.min(1,(now-start)/560);display.textContent=String(Math.round(from+(value-from)*(1-Math.pow(1-p,3))));if(p<1)state.frame=requestAnimationFrame(step);else state.finish()};state.frame=requestAnimationFrame(step);
 }
 function enter(node,key,index){
  if(seen.has(key)||!appVisible())return;seen.add(key);
  if(reduced()||document.hidden||node.contains(document.activeElement))return;
  animate(node,[{opacity:.4,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:400,delay:Math.min(index*50,100),easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
 }
 function settle(){observer?.disconnect();observer=null;animations.forEach(a=>a.cancel());animations.clear();for(const c of [...counters])c.finish()}
 function refresh(view){
  if(view!=='today'||!appVisible())return;
  title(document.querySelector('.hero h1'));
  const pending=new Map();
  document.querySelectorAll('.today-grid>.task-card,.today-bottom>.card').forEach((n,i)=>pending.set(n,()=>enter(n,'home-card-'+i,i)));
  document.querySelectorAll('.today-grid .count,.today-bottom .stat strong').forEach((n,i)=>pending.set(n,()=>count(n,'home-count-'+i)));
  observer?.disconnect();
  if(window.IntersectionObserver){observer=new IntersectionObserver(entries=>{for(const item of entries)if(item.isIntersecting){pending.get(item.target)?.();observer?.unobserve(item.target);pending.delete(item.target)}},{threshold:.1});for(const n of pending.keys())observer.observe(n)}else for(const[n,fn]of pending)if(visible(n))fn();
 }
 // Finishing the guide exposes an already-rendered app. Wait for that hand-off
 // so an invisible first render cannot consume the one-time title reveal.
 new MutationObserver(()=>{const view=window.VocabApp?.getView();window.VocabSmoothScroll?.refresh(view);if(appVisible())refresh(view)}).observe(document.body,{attributes:true,attributeFilter:['data-carnet-view']});
 window.addEventListener('vocab-motionchange',settle);window.addEventListener('pagehide',settle);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)settle()});
 window.VocabEditorialMotion=Object.freeze({beforeRender:settle,refresh});
})();
