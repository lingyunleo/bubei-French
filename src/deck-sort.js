/* Deck order is previewed in the DOM, then committed once on release. */
(() => {
'use strict';
let mounted = null;
const reduced = () => window.VocabMotion?.isReduced() || matchMedia('(prefers-reduced-motion: reduce)').matches;
function mount(list, options = {}) {
  mounted?.destroy();
  if (!list) { mounted = null; return; }
  const scroller = list.closest('#modal-body'), dialog = list.closest('dialog'), labels = options.labels || {};
  const status = list.parentElement.querySelector('.deck-sort-status');
  let gesture = null, pending = false, alive = true, suppressClickUntil = 0, scrollFrame = 0, lastFrame = 0;
  const animations = new Map(), events = new AbortController();
  const listen = (target, event, callback, extra = {}) => target?.addEventListener(event, callback, {signal: events.signal, ...extra});
  const cards = () => [...list.children].filter(node => node.matches('.manager-row'));
  const order = () => cards().map(node => node.dataset.deckId);
  const announce = text => { if (status) status.textContent = text || ''; };
  const format = (key, name, index) => (labels[key] || '{name} · {position} / {total}').replace('{name}', name).replace('{position}', index + 1).replace('{total}', cards().length);
  const nameOf = row => row.querySelector('.deck-title').textContent;
  function stopAnimations() { animations.forEach(animation => animation.cancel()); animations.clear(); }
  function animate(node, frames, duration = 190) {
    animations.get(node)?.cancel();
    if (reduced() || !node.isConnected) return;
    const animation = window.VocabMotion?.animate(node, frames, {duration, easing:'cubic-bezier(.18,.82,.26,1)'}) || node.animate?.(frames, {duration, easing:'cubic-bezier(.18,.82,.26,1)'});
    if (!animation) return;
    animations.set(node, animation);
    animation.finished.then(() => { if (animations.get(node) === animation) animations.delete(node); }, () => {});
  }
  function reflow(mutate) {
    const rows = cards().filter(row => row !== gesture?.row), positions = new Map(rows.map(row => [row, row.getBoundingClientRect().top]));
    rows.forEach(row => animations.get(row)?.cancel());
    mutate();
    rows.forEach(row => { const delta = positions.get(row) - row.getBoundingClientRect().top; if (Math.abs(delta) > .5) animate(row,[{transform:'translateY('+delta+'px)'},{transform:'translateY(0)'}]); });
  }
  function restoreOrder(ids) {
    const rows = new Map(cards().map(row => [row.dataset.deckId, row]));
    ids.forEach(id => { if (rows.has(id)) list.append(rows.get(id)); });
  }
  function updatePositions() {
    const rows = cards();
    rows.forEach((row,index) => {
      const handle = row.querySelector('.deck-sort-handle');
      handle.setAttribute('aria-label',format('handle',nameOf(row),index));
      handle.setAttribute('aria-disabled',String(pending || rows.length < 2));
    });
  }
  function start(g) {
    if (gesture !== g || pending || !alive || !list.isConnected) return;
    clearTimeout(g.timer); g.active = true;
    const rect = g.row.getBoundingClientRect();
    g.startOrder = order(); g.width = rect.width; g.height = rect.height;
    g.grabY = g.keyboard ? rect.height / 2 : Math.max(0,Math.min(rect.height,g.startY - rect.top));
    g.placeholder = document.createElement('div'); g.placeholder.className = 'deck-sort-placeholder';
    g.placeholder.style.height = rect.height + 'px'; g.placeholder.setAttribute('aria-hidden','true');
    g.row.before(g.placeholder); list.append(g.row);
    g.row.classList.add('is-dragging'); g.row.style.width = rect.width + 'px';
    g.row.style.top = (rect.top - list.getBoundingClientRect().top) + 'px';
    list.classList.add('is-sorting'); g.handle.setAttribute('aria-pressed','true');
    g.handle.focus({preventScroll:true});
    if (!g.keyboard) { try { g.handle.setPointerCapture(g.pointerId); } catch (_) {} }
    announce(format('lifted',nameOf(g.row),g.startOrder.indexOf(g.row.dataset.deckId)));
    if (!g.keyboard) { position(g); scrollFrame=requestAnimationFrame(autoScroll); }
  }
  function placeholderIndex(g) { return [...list.children].filter(node=>node!==g.row).indexOf(g.placeholder); }
  function movePlaceholder(g, index) {
    const others=cards().filter(row=>row!==g.row), target=Math.max(0,Math.min(others.length,index));
    if (target===placeholderIndex(g)) return;
    reflow(()=>list.insertBefore(g.placeholder,others[target]||g.row));
    announce(format('position',nameOf(g.row),target));
    if (g.keyboard) {
      const before=g.row.getBoundingClientRect().top;
      g.row.style.top=g.placeholder.offsetTop+'px';
      const delta=before-g.row.getBoundingClientRect().top;
      animate(g.row,[{transform:'translateY('+delta+'px)'},{transform:'translateY(0)'}],150);
      g.placeholder.scrollIntoView({block:'nearest',behavior:'instant'});
    }
  }
  function position(g) {
    const top=Math.max(0,Math.min(list.clientHeight-g.height,g.y-list.getBoundingClientRect().top-g.grabY));
    g.row.style.top=top+'px';
    const center=top+g.height/2, others=cards().filter(row=>row!==g.row);
    let target=others.findIndex(row=>center<row.offsetTop+row.offsetHeight/2);
    if(target<0)target=others.length;
    movePlaceholder(g,target);
  }
  function autoScroll(now) {
    scrollFrame=0;
    const g=gesture;
    if (!g?.active || g.keyboard || !alive || !list.isConnected) return;
    const dt=lastFrame?Math.min(32,now-lastFrame):16;lastFrame=now;
    const bounds=scroller.getBoundingClientRect(), edge=Math.min(64,bounds.height/4);
    const amount=g.y<bounds.top+edge?-Math.min(1,(bounds.top+edge-g.y)/edge):g.y>bounds.bottom-edge?Math.min(1,(g.y-bounds.bottom+edge)/edge):0;
    if(amount){const old=scroller.scrollTop;scroller.scrollTop+=amount*dt*.72;if(scroller.scrollTop!==old)position(g)}
    scrollFrame=requestAnimationFrame(autoScroll);
  }
  function clean(g, cancelled=false) {
    clearTimeout(g.timer);cancelAnimationFrame(scrollFrame);scrollFrame=0;lastFrame=0;
    try { if(g.handle.hasPointerCapture(g.pointerId))g.handle.releasePointerCapture(g.pointerId); } catch (_) {}
    if(!g.active)return;
    const rect=g.row.getBoundingClientRect();
    g.placeholder.replaceWith(g.row);
    g.row.classList.remove('is-dragging');g.row.style.removeProperty('width');g.row.style.removeProperty('top');
    list.classList.remove('is-sorting');g.handle.setAttribute('aria-pressed','false');
    if(cancelled){stopAnimations();restoreOrder(g.startOrder)}
    else {const delta=rect.top-g.row.getBoundingClientRect().top;animate(g.row,[{transform:'translateY('+delta+'px)',boxShadow:'0 14px 28px #143d3124'},{transform:'translateY(0)',boxShadow:'0 0 0 #143d3100'}],240)}
    updatePositions();
    if(g.handle.isConnected&&dialog?.open)g.handle.focus({preventScroll:true});
  }
  function cancel() {
    const g=gesture;gesture=null;
    if(!g)return;
    if(g.active)suppressClickUntil=performance.now()+450;
    clean(g,true);
    if(g.active)announce(labels.cancelled||'');
  }
  async function finish() {
    const g=gesture;if(!g)return;gesture=null;
    if(!g.active){clean(g);return}
    suppressClickUntil=performance.now()+450;
    const index=placeholderIndex(g), oldIndex=g.startOrder.indexOf(g.row.dataset.deckId);
    clean(g);
    if(index===oldIndex){announce(format('dropped',nameOf(g.row),index));return}
    pending=true;list.setAttribute('aria-busy','true');list.classList.add('is-saving');updatePositions();
    announce(labels.saving||'');
    let ok=false;
    try{ok=(await options.onReorder?.(g.row.dataset.deckId,index))===true}catch(error){options.onError?.(error)}
    pending=false;
    if(!alive||!list.isConnected)return;
    list.removeAttribute('aria-busy');list.classList.remove('is-saving');
    if(!ok){const focused=document.activeElement===g.handle;stopAnimations();restoreOrder(g.startOrder);if(focused&&dialog?.open)g.handle.focus({preventScroll:true});announce(labels.failed||'')}
    else announce(format('dropped',nameOf(g.row),index));
    updatePositions();
  }
  listen(document,'pointerdown',()=>{if(!gesture)suppressClickUntil=0},{capture:true});
  listen(list,'pointerdown',event=>{
    const header=event.target.closest('.deck-sort-header');
    if(!header||event.button!==0||event.isPrimary===false||pending||gesture||cards().length<2)return;
    const row=header.closest('.manager-row'),handle=row.querySelector('.deck-sort-handle');
    const g=gesture={row,handle,pointerId:event.pointerId,startY:event.clientY,y:event.clientY,startX:event.clientX,active:false,keyboard:false};
    if(event.pointerType!=='mouse')g.timer=setTimeout(()=>start(g),180);
  });
  listen(window,'pointermove',event=>{
    const g=gesture;if(!g||g.keyboard||event.pointerId!==g.pointerId)return;
    g.y=event.clientY;
    if(!g.active&&Math.hypot(event.clientX-g.startX,event.clientY-g.startY)>=6)start(g);
    if(g.active){event.preventDefault();position(g)}
  },{passive:false});
  listen(window,'pointerup',event=>{if(gesture&&!gesture.keyboard&&event.pointerId===gesture.pointerId)void finish()});
  listen(window,'pointercancel',event=>{if(gesture&&event.pointerId===gesture.pointerId)cancel()});
  listen(list,'lostpointercapture',event=>{if(gesture?.active&&event.target===gesture.handle&&event.pointerId===gesture.pointerId&&!gesture.handle.hasPointerCapture(event.pointerId))cancel()});
  listen(document,'click',event=>{if(performance.now()<suppressClickUntil&&event.target.closest('#deck-sort-list')){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
  listen(list,'keydown',event=>{
    const handle=event.target.closest('.deck-sort-handle');
    if(!handle||pending||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
    if([' ','Enter'].includes(event.key)){
      event.preventDefault();event.stopPropagation();if(event.repeat)return;
      if(gesture?.keyboard){void finish();return}
      if(!gesture&&cards().length>1){const row=handle.closest('.manager-row');gesture={row,handle,keyboard:true,active:false};start(gesture)}
    }else if(gesture?.keyboard&&['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      const g=gesture,index=placeholderIndex(g),target=event.key==='Home'?0:event.key==='End'?cards().length-1:index+(event.key==='ArrowUp'?-1:1);
      movePlaceholder(g,target);
    }else if(event.key==='Tab'&&gesture){cancel()}
  });
  listen(document,'keydown',event=>{if(event.key==='Escape'&&gesture){event.preventDefault();event.stopImmediatePropagation();cancel()}},{capture:true});
  listen(dialog,'cancel',event=>{if(gesture){event.preventDefault();cancel()}});
  listen(dialog,'close',cancel);
  listen(window,'blur',cancel);
  listen(window,'pagehide',cancel);
  listen(document,'visibilitychange',()=>{if(document.hidden)cancel()});
  listen(window,'resize',cancel);
  listen(window,'vocab-motionchange',()=>{stopAnimations()});
  const observer=new MutationObserver(()=>{if(!list.isConnected)destroy()});
  observer.observe(dialog||document.body,{childList:true,subtree:true});
  function destroy(){cancel();alive=false;stopAnimations();observer.disconnect();events.abort()}
  updatePositions();
  function refresh(){const ids=options.getOrder?.();if(!ids||!alive||!list.isConnected)return;cancel();const focused=list.contains(document.activeElement)?document.activeElement:null;restoreOrder(ids);updatePositions();focused?.focus({preventScroll:true})}
  mounted={cancel,destroy,refresh};
}
window.VocabDeckSort=Object.freeze({mount,cancel:()=>mounted?.cancel(),refresh:()=>mounted?.refresh()});
})();
