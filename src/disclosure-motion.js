/* Native disclosures with interruptible height motion. No app data or form transforms. */
(() => {
'use strict';
const states = new WeakMap(), active = new Set();
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => window.VocabMotion?.isReduced?.() ?? (document.documentElement.dataset.motion === 'simple' || reducedQuery.matches);
let nextId = 0;

function sync(state, open) {
  state.open = open;
  state.summary.setAttribute('aria-expanded', String(open));
  state.details.dataset.disclosureExpanded = String(open);
  // Closing content leaves the tab order immediately, while its pixels finish folding.
  if (!open && state.body.contains(document.activeElement)) state.summary.focus({preventScroll:true});
  state.body.inert = !open;
}
function nativeOpen(state, open) {
  state.nativeOpen = open;
  state.details.open = open;
}
function stopAnimation(state) {
  state.animation?.cancel();
  state.animation = null;
  state.resize?.disconnect();
  active.delete(state);
}
function finish(state, open = state.open) {
  stopAnimation(state);
  sync(state, open);
  nativeOpen(state, open);
  state.body.style.removeProperty('height');
  state.body.removeAttribute('data-disclosure-moving');
}
function move(state, open) {
  const from = state.details.open ? state.body.getBoundingClientRect().height : 0;
  stopAnimation(state);
  sync(state, open);
  if (reduced() || document.hidden || !state.details.isConnected || !state.body.animate) {
    finish(state, open); return;
  }
  nativeOpen(state, true);
  const to = open ? state.content.getBoundingClientRect().height : 0;
  if (Math.abs(from - to) < 1) { finish(state, open); return; }
  state.body.style.height = from + 'px';
  state.body.setAttribute('data-disclosure-moving', '');
  const animation = state.body.animate([{height:from+'px'}, {height:to+'px'}], {
    duration:open ? 220 : 180, easing:'cubic-bezier(.22,.74,.3,1)', fill:'forwards'
  });
  state.animation = animation;
  active.add(state);
  animation.finished.then(() => {
    if (state.animation === animation) finish(state);
  }, () => {});
  // Width changes or late content can change the natural end height mid-flight.
  if (window.ResizeObserver) {
    state.resize ||= new ResizeObserver(() => {
      if (state.animation && state.open && Math.abs(state.content.getBoundingClientRect().height - state.targetHeight) > 1) move(state, true);
    });
    state.targetHeight = to;
    state.resize.observe(state.content);
  }
}
function enhance(details) {
  if (states.has(details)) return;
  const summary = [...details.children].find(child => child.tagName === 'SUMMARY');
  if (!summary) return;
  const body = document.createElement('div'), content = document.createElement('div'), indicator = document.createElement('span');
  body.className = 'disclosure-body'; content.className = 'disclosure-content';
  do { body.id = 'vocab-disclosure-' + (++nextId); } while (document.getElementById(body.id));
  indicator.className = 'disclosure-indicator'; indicator.setAttribute('aria-hidden', 'true');
  for (const child of [...details.childNodes]) if (child !== summary) content.append(child);
  body.append(content); details.append(body); summary.append(indicator);
  summary.setAttribute('aria-controls', body.id);
  details.classList.add('motion-disclosure');
  const state = {details, summary, body, content, open:details.open, nativeOpen:details.open, animation:null, resize:null};
  states.set(details, state); sync(state, details.open);
}
function refresh(root = document) {
  if (root.matches?.('details')) enhance(root);
  root.querySelectorAll?.('details').forEach(enhance);
}
function settle() { [...active].forEach(state => finish(state)); }

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button > 0) return;
  const summary = event.target.closest?.('summary'), details = summary?.parentElement;
  if (details?.tagName !== 'DETAILS') return;
  // Preserve controls embedded in a summary, if one is introduced later.
  if (event.target.closest?.('a,button,input,select,textarea,[contenteditable="true"]')) return;
  enhance(details);
  const state = states.get(details);
  if (!state || state.summary !== summary) return;
  event.preventDefault();
  move(state, !state.open);
});
const observer = new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'attributes') {
      const state = states.get(record.target);
      if (state && state.details.open !== state.nativeOpen) finish(state, state.details.open);
    } else {
      record.addedNodes.forEach(node => { if (node.nodeType === 1) refresh(node); });
    }
  }
  // Renders and modal replacement may remove a disclosure during its transition.
  for (const state of [...active]) if (!state.details.isConnected) finish(state);
});
observer.observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['open']});
document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
document.addEventListener('close', event => {
  if (event.target.tagName === 'DIALOG') for (const state of [...active]) if (event.target.contains(state.details)) finish(state);
}, true);
window.addEventListener('pagehide', settle);
window.addEventListener('vocab-motionchange', () => { if (reduced()) settle(); });
reducedQuery.addEventListener?.('change', () => { if (reduced()) settle(); });
refresh();
window.VocabDisclosureMotion = Object.freeze({refresh, settle});
})();
