/* Small, interruptible transitions. Rendering and saving never wait for animation. */
(() => {
'use strict';
const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
const fluid = 'cubic-bezier(.18,.88,.24,1)', spring = 'cubic-bezier(.2,.8,.3,1)';
const modalStates = new WeakMap(), modals = new Set(), running = new Set(), renderAnimations = new Set();
const pressAnimations = new WeakMap(), enteredViews = new Set(), completedGroups = new Set();
let preferredMode = 'standard', effectiveReduced = systemReduced.matches;
let lastTrigger = null, triggerAt = 0, pressed = null, renderState = null;
const isReduced = () => preferredMode === 'simple' || systemReduced.matches;
function animate(node, frames, options = {}, done) {
  if (!node || isReduced() || document.hidden || !node.animate) { done?.(); return null; }
  let animation;
  try { animation = node.animate(frames, { fill: 'none', ...options }); }
  catch (_) { done?.(); return null; }
  running.add(animation);
  animation.finished.then(() => { running.delete(animation); renderAnimations.delete(animation); done?.(); }, () => { running.delete(animation); renderAnimations.delete(animation); });
  return animation;
}
function remember(target) {
  const button = target?.closest?.('button, a.button, [role="button"]');
  if (button && !button.disabled) { lastTrigger = button; triggerAt = performance.now(); }
  return button;
}
function sourceButton(explicit) {
  if (explicit?.getBoundingClientRect) return explicit;
  const active = document.activeElement;
  if (active?.matches?.('button,a.button,[role="button"]') && !active.closest('dialog')) return active;
  return performance.now() - triggerAt < 1800 ? lastTrigger : null;
}
function originSelector(node) {
  if (!node) return '';
  if (node.id) return '#' + CSS.escape(node.id);
  const attrs = ['data-action', 'data-id', 'data-view', 'data-context-key', 'data-context-id'].filter(name => node.hasAttribute(name));
  return attrs.length ? node.tagName.toLowerCase() + attrs.map(name => '[' + name + '=\"' + CSS.escape(node.getAttribute(name)) + '\"]').join('') : '';
}
function resolveOrigin(state) {
  const resolved = state.originResolver?.();
  if (resolved?.isConnected) return resolved;
  if (state.origin?.isConnected) return state.origin;
  return state.originSelector ? [...document.querySelectorAll(state.originSelector)].find(node => validRect(node)) : null;
}
function validRect(node) {
  if (!node?.isConnected) return null;
  const r = node.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
function cleanupModal(dialog, state) {
  if (!state) return;
  state.animations.forEach(a => a?.cancel()); state.animations = [];
  state.ghost?.remove(); state.ghost = null;
  if (state.hiddenTitle) { state.hiddenTitle.node.style.visibility = state.hiddenTitle.value; state.hiddenTitle = null; }
  if (state.inline !== null) { dialog.style.cssText = state.inline; state.inline = null; }
  dialog.classList.remove('motion-morphing', 'motion-opening', 'motion-closing', 'motion-shared');
  delete dialog.dataset.motion;
}
function stateFor(dialog) {
  let state = modalStates.get(dialog);
  if (!state) {
    state = { generation: 0, animations: [], inline: null, origin: null, originSelector: '', originResolver: null, naturalRect: null, closing: false, restoreFocus: null, shared: false, ghost: null, hiddenTitle: null };
    modalStates.set(dialog, state); modals.add(dialog);
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (dialog.open && state.inline === null && !state.closing) state.naturalRect = validRect(dialog);
    }).observe(dialog);
    dialog.addEventListener('close', () => {
      if (dialog.open) return; // A queued native close may arrive after a rapid reopen.
      state.generation++; cleanupModal(dialog, state); state.closing = false;
      const restore = state.restoreFocus; state.restoreFocus = null; restore?.();
    });
  }
  return state;
}
function pin(dialog, state, rect) {
  state.inline = dialog.style.cssText;
  Object.assign(dialog.style, {
    position: 'fixed', inset: 'auto', margin: '0', left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', height: rect.height + 'px', minWidth: '0', minHeight: '0', maxWidth: 'none', maxHeight: 'none'
  });
}
function geometry(rect, radius) {
  return { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', borderRadius: radius };
}
function sourceTitle(origin) {
  if (!origin) return null;
  if (origin.matches('.headword,.fr,[lang="fr"]')) return origin;
  return origin.querySelector('.fr,.headword,footer [data-action="word"][lang="fr"],[data-action="word"][lang="fr"]');
}
function sharedTitle(dialog, state, closing = false) {
  const source = sourceTitle(resolveOrigin(state)), target = dialog.querySelector('.word-detail .headword');
  const from = validRect(source), to = validRect(target);
  if (!from || !to || source.textContent.trim() !== target.textContent.trim()) return;
  const sourceStyle = getComputedStyle(source), targetStyle = getComputedStyle(target);
  const ghost = document.createElement('span');
  ghost.className = 'motion-shared-title'; ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('inert', '');
  ghost.textContent = target.textContent; ghost.lang = 'fr';
  Object.assign(ghost.style, {fontFamily:targetStyle.fontFamily,fontWeight:targetStyle.fontWeight,lineHeight:targetStyle.lineHeight,color:targetStyle.color,letterSpacing:targetStyle.letterSpacing});
  state.hiddenTitle = {node:target,value:target.style.visibility}; target.style.visibility = 'hidden';
  state.ghost = ghost; dialog.append(ghost);
  const initial = {left:from.left+'px',top:from.top+'px',width:from.width+'px',fontSize:sourceStyle.fontSize,opacity:1};
  const final = {left:to.left+'px',top:to.top+'px',width:to.width+'px',fontSize:targetStyle.fontSize,opacity:1};
  // Font size, rather than scaling the text layer, keeps letter shapes crisp.
  state.animations.push(animate(ghost, closing ? [final,{...initial,opacity:0}] : [initial,final], {duration:closing?240:320,easing:fluid,fill:'both'}));
}
function openModal(dialog, origin, options = {}) {
  if (!dialog) return;
  const state = stateFor(dialog), wasOpen = dialog.open, previous = state.naturalRect;
  state.generation++; const generation = state.generation;
  cleanupModal(dialog, state); state.closing = false; state.restoreFocus = null;
  if (!wasOpen) {
    state.origin = sourceButton(origin);
    if (state.origin?.closest('dialog') && !options.allowNestedOrigin) state.origin = null;
    state.originResolver = typeof options.resolveOrigin === 'function' ? options.resolveOrigin : null;
    state.originSelector = originSelector(state.origin); state.shared = !!options.shared;
    dialog.showModal();
  }
  if (isReduced() || document.hidden) return;
  const content = [...dialog.children], target = validRect(dialog);
  if (!target) return;
  state.naturalRect = target;
  const resized = wasOpen && previous && ['width', 'height', 'left', 'top'].some(key => Math.abs(previous[key] - target[key]) > 2);
  const source = wasOpen ? (resized ? previous : null) : validRect(state.origin);
  if (source) {
    const surface = getComputedStyle(dialog), radius = surface.borderRadius, background = surface.backgroundColor;
    const sourceStyle = !wasOpen && state.origin ? getComputedStyle(state.origin) : surface;
    const sourceBackground = sourceStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ? background : sourceStyle.backgroundColor;
    const sourceRadius = !wasOpen && state.shared ? sourceStyle.borderRadius : Math.min(source.height / 2, 32) + 'px';
    if (!wasOpen && state.shared) sharedTitle(dialog, state);
    pin(dialog, state, target);
    dialog.classList.add('motion-morphing'); if (!wasOpen) dialog.classList.add('motion-opening');
    if (state.shared && !wasOpen) dialog.classList.add('motion-shared');
    dialog.dataset.motion = wasOpen ? 'updating' : 'opening';
    const finish = () => { if (generation === state.generation) cleanupModal(dialog, state); };
    state.animations.push(animate(dialog, [
      { ...geometry(source, wasOpen ? radius : sourceRadius), backgroundColor: sourceBackground, opacity: wasOpen ? 1 : .94 },
      { ...geometry(target, radius), backgroundColor: background, opacity: 1 }
    ], { duration: wasOpen ? 220 : 320, easing: fluid }, finish));
    content.forEach(child => state.animations.push(animate(child, [{ opacity: wasOpen ? .4 : 0 }, { opacity: wasOpen ? .4 : 0, offset: .28 }, { opacity: 1 }], { duration: wasOpen ? 180 : 300, easing: fluid })));
  } else {
    // Missing/offscreen origin: fade without inventing a direction or scaling text.
    content.forEach(child => state.animations.push(animate(child, [{ opacity: .45 }, { opacity: 1 }], { duration: 160, easing: fluid })));
    if (!wasOpen) state.animations.push(animate(dialog, [{ opacity: .4 }, { opacity: 1 }], { duration: 180, easing: fluid }));
  }
}
function closeModal(dialog, onDone) {
  if (!dialog) { onDone?.(); return; }
  const state = stateFor(dialog);
  if (!dialog.open) { onDone?.(); return; }
  if (state.closing) return;
  // An early Escape returns from the visible intermediate shape, not the final panel.
  const interrupted = dialog.classList.contains('motion-morphing') ? {rect:validRect(dialog),radius:getComputedStyle(dialog).borderRadius,opacity:getComputedStyle(dialog).opacity,content:new Map([...dialog.children].map(node=>[node,getComputedStyle(node).opacity]))} : null;
  state.generation++; const generation = state.generation;
  cleanupModal(dialog, state); state.closing = true;
  state.restoreFocus = () => {
    onDone?.();
    const active = document.activeElement;
    if (!active || active === document.body || dialog.contains(active)) resolveOrigin(state)?.focus?.({ preventScroll: true });
  };
  const finish = () => {
    if (generation !== state.generation) return;
    cleanupModal(dialog, state); state.closing = false;
    if (dialog.open) dialog.close();
    const restore = state.restoreFocus; state.restoreFocus = null; restore?.();
  };
  if (isReduced() || document.hidden) { finish(); return; }
  const start = interrupted?.rect || validRect(dialog), origin = resolveOrigin(state), target = validRect(origin);
  dialog.classList.add('motion-closing'); dialog.dataset.motion = 'closing';
  if (start && target) {
    const radius = interrupted?.radius || getComputedStyle(dialog).borderRadius, content = [...dialog.children];
    if (state.shared) sharedTitle(dialog, state, true);
    pin(dialog, state, start); dialog.classList.add('motion-morphing');
    content.forEach(child => state.animations.push(animate(child, [{ opacity: interrupted?.content.get(child) ?? 1 }, { opacity: 0 }], { duration: 90, easing: 'ease-out', fill: 'forwards' })));
    state.animations.push(animate(dialog, [
      { ...geometry(start, radius), opacity: interrupted?.opacity ?? 1 },
      { ...geometry(target, state.shared ? getComputedStyle(origin).borderRadius : Math.min(target.height / 2, 32) + 'px'), opacity: 0 }
    ], { duration: 240, easing: 'cubic-bezier(.32,0,.36,1)' }, finish));
  } else state.animations.push(animate(dialog, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-out' }, finish));
}
function renderAnimate(node, frames, options) {
  const animation = animate(node, frames, options); if (animation) renderAnimations.add(animation); return animation;
}
function beforeRender(view, key = view) {
  const changed = !renderState || renderState.view !== view || renderState.key !== key;
  if (changed) { renderAnimations.forEach(animation => animation.cancel()); renderAnimations.clear(); }
  renderState = { view, key, changed, previousView: renderState?.view };
}
function afterRender(view, key = view, options = {}) {
  if (!renderState?.changed || renderState.view !== view || renderState.key !== key) return;
  renderState.changed = false;
  const firstEntry = !enteredViews.has(view); enteredViews.add(view);
  const completion = document.querySelector('.summary-layout .completion-mark');
  const completionKey = completion?.dataset.completionKey || options.completionId || key;
  const firstCompletion = completion && !completedGroups.has(completionKey);
  if (completion) completedGroups.add(completionKey);
  if (isReduced() || document.hidden) return;
  if (firstCompletion) {
    completion.querySelectorAll('path,polyline').forEach(path => {
      const length = path.getTotalLength?.() || 60;
      renderAnimate(path,[{strokeDasharray:String(length),strokeDashoffset:String(length)},{strokeDasharray:String(length),strokeDashoffset:'0'}],{duration:340,easing:fluid});
    });
  }
  if(view === 'today' && window.VocabEditorialMotion) return;
  if ((view === 'today' || view === 'contexts') && firstEntry) {
    const cards = [...document.querySelectorAll(view === 'contexts' ? '.context-grid .context-card' : '.main .card')].filter(card => validRect(card)).slice(0,6);
    // Opacity leaves layout and the card's tilt transform completely untouched.
    cards.forEach((card,index) => renderAnimate(card,[{opacity:.35},{opacity:1}],{duration:210,delay:Math.min(index*30,120),easing:fluid,fill:'backwards'}));
    return;
  }
  // Returns and local updates should feel immediate, not replay an entrance.
  if ((view === 'today' || view === 'contexts') && !firstEntry) return;
  const container = document.querySelector(view === 'study' ? '.study-question, .summary-layout' : view === 'onboarding' ? '.welcome-flow, .onboarding-shell' : '.main');
  if (!container) return;
  const spelling = options.spelling || !!container.querySelector('.spell-input');
  // Never transform the spelling input or any of its ancestors (mobile keyboard safety).
  renderAnimate(container,[{opacity:spelling ? .78 : .55},{opacity:1}],{duration:view==='study'?140:180,easing:fluid});
  const actions = view === 'study' && document.querySelector('.study-actions');
  if (actions) renderAnimate(actions,[{opacity:.72},{opacity:1}],{duration:140,easing:fluid});
}
function press(button) {
  if (!button || button.disabled) return;
  if (pressed && pressed !== button) release(true);
  pressAnimations.get(button)?.cancel(); button.classList.add('motion-pressed'); pressed = button;
}
function release(cancelled = false) {
  const button = pressed; pressed = null;
  if (!button) return;
  button.classList.remove('motion-pressed');
  if (cancelled || !button.isConnected || isReduced() || document.hidden) return;
  const animation = animate(button,[{transform:'scale(.96)',offset:0},{transform:'scale(1.01)',offset:.58},{transform:'scale(.999)',offset:.83},{transform:'scale(1)',offset:1}],{duration:260,easing:spring});
  if (animation) pressAnimations.set(button, animation);
}
function settle() {
  release(true); running.forEach(animation => animation.cancel()); running.clear(); renderAnimations.clear();
  const callbacks = [];
  modals.forEach(dialog => {
    const state = modalStates.get(dialog); if (!state) return;
    const closing = state.closing, callback = state.restoreFocus;
    state.generation++; cleanupModal(dialog, state); state.closing = false; state.restoreFocus = null;
    if (closing) { if (dialog.open) dialog.close(); if (callback) callbacks.push(callback); }
  });
  callbacks.forEach(callback => callback());
}
function applyMode() {
  const value = preferredMode === 'simple' || systemReduced.matches, changed = value !== effectiveReduced;
  effectiveReduced = value; document.documentElement.dataset.motion = value ? 'simple' : 'standard';
  if (value) settle();
  if (changed) window.dispatchEvent(new CustomEvent('vocab-motionchange',{detail:{mode:preferredMode,reduced:value}}));
}
function setMode(mode) { preferredMode = mode === 'simple' ? 'simple' : 'standard'; applyMode(); }
document.addEventListener('pointerdown', event => { if (event.isPrimary !== false && event.button === 0) press(remember(event.target)); }, { capture: true, passive: true });
document.addEventListener('pointerup', () => release(), { capture: true, passive: true });
document.addEventListener('pointercancel', () => release(true), { capture: true, passive: true });
document.addEventListener('click', event => remember(event.target), { capture: true, passive: true });
document.addEventListener('keydown', event => {
  if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || ![' ', 'Enter'].includes(event.key)) return;
  if (event.target.matches?.('button,a.button,[role="button"]')) press(remember(event.target));
}, true);
document.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) release(); }, true);
window.addEventListener('blur', () => release(true));
document.addEventListener('visibilitychange', () => { document.documentElement.dataset.motionPaused = String(document.hidden); if(document.hidden) settle(); });
window.addEventListener('pagehide',settle);
systemReduced.addEventListener?.('change',applyMode);
applyMode();
window.VocabMotion = Object.freeze({ setMode, isReduced, animate, beforeRender, afterRender, openModal, closeModal, modalIsClosing: dialog => !!modalStates.get(dialog)?.closing });
})();
