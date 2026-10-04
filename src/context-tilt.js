/* A single delegated, short-lived spring for the context notebook. Native touch scrolling stays in charge. */
(() => {
'use strict';
const selector = '.context-grid .context-card';
const interactive = 'button,a,input,select,textarea,label,summary,[contenteditable="true"],[role="button"]';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => window.VocabMotion?.isReduced() ?? reduced.matches;
let current = null, frame = 0, observer = null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function allowedCard(target) {
  if (isReduced() || document.hidden || target?.closest?.('dialog,' + interactive)) return null;
  return target?.closest?.(selector) || null;
}
function clearCard(card) {
  card.classList.remove('context-tilt-active', 'context-tilt-returning');
  ['--context-rotate-x', '--context-rotate-y', '--context-light-x', '--context-light-y', '--context-light-opacity'].forEach(name => card.style.removeProperty(name));
}
function reset() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  observer?.disconnect(); observer = null;
  if (current) clearCard(current.card);
  current = null;
}
function draw(s) {
  s.card.style.setProperty('--context-rotate-x', s.x.toFixed(3) + 'deg');
  s.card.style.setProperty('--context-rotate-y', s.y.toFixed(3) + 'deg');
  s.card.style.setProperty('--context-light-x', s.lightX.toFixed(2) + '%');
  s.card.style.setProperty('--context-light-y', s.lightY.toFixed(2) + '%');
  s.card.style.setProperty('--context-light-opacity', s.light.toFixed(3));
}
function tick(now) {
  frame = 0;
  const s = current;
  if (!s) return;
  if (!s.card.isConnected || !s.card.matches(selector) || isReduced() || document.hidden) { reset(); return; }
  const dt = Math.min((now - (s.last || now - 16.7)) / 1000, .032);
  s.last = now;
  // Tracking is nearly critical; release is lightly underdamped, giving one quiet overshoot.
  const stiffness = s.returning ? 210 : 245, damping = s.returning ? 21 : 31;
  s.vx += ((s.tx - s.x) * stiffness - s.vx * damping) * dt;
  s.vy += ((s.ty - s.y) * stiffness - s.vy * damping) * dt;
  s.x += s.vx * dt; s.y += s.vy * dt;
  s.light += ((s.returning ? 0 : 1) - s.light) * Math.min(1, dt * 12);
  draw(s);
  const settled = Math.abs(s.tx - s.x) + Math.abs(s.ty - s.y) < .012 && Math.abs(s.vx) + Math.abs(s.vy) < .06 && Math.abs((s.returning ? 0 : 1) - s.light) < .012;
  if (settled || now - s.updated > 1200) {
    if (s.returning) reset();
    else { s.x = s.tx; s.y = s.ty; s.vx = s.vy = 0; s.light = 1; draw(s); }
    return;
  }
  frame = requestAnimationFrame(tick);
}
function schedule() {
  if (current && !frame) { current.last = 0; frame = requestAnimationFrame(tick); }
}
function follow(card, event) {
  if (current?.card !== card) {
    reset();
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    current = { card, rect, pointerId: event.pointerId, pointerType: event.pointerType, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, light: 0, lightX: 50, lightY: 50, last: 0, updated: performance.now(), returning: false };
    card.classList.add('context-tilt-active');
    // Observe removals only while a card is active; a hundred idle cards need no listeners or animation loops.
    observer = new MutationObserver(() => { if (current && (!current.card.isConnected || !current.card.matches(selector))) reset(); });
    observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  }
  const s = current, x = clamp((event.clientX - s.rect.left) / s.rect.width, 0, 1), y = clamp((event.clientY - s.rect.top) / s.rect.height, 0, 1);
  s.tx = (0.5 - y) * 7; s.ty = (x - 0.5) * 8;
  s.lightX = x * 100; s.lightY = y * 100;
  s.pointerId = event.pointerId; s.pointerType = event.pointerType;
  s.returning = false; s.updated = performance.now();
  s.card.classList.remove('context-tilt-returning');
  schedule();
}
function release() {
  if (!current || current.returning) return;
  current.tx = current.ty = 0; current.returning = true; current.updated = performance.now();
  current.card.classList.add('context-tilt-returning');
  schedule();
}
document.addEventListener('pointerdown', event => {
  if (event.isPrimary === false || event.button !== 0) return;
  const card = allowedCard(event.target);
  if (!card) { reset(); return; }
  follow(card, event);
}, { passive: true });
document.addEventListener('pointermove', event => {
  if (event.isPrimary === false) return;
  const card = allowedCard(event.target);
  if (event.pointerType === 'mouse') {
    if (!card) { if (current?.pointerType === 'mouse') { if (event.target?.closest?.(interactive)) reset(); else release(); } return; }
    follow(card, event);
  } else if (current?.pointerId === event.pointerId && !current.returning) {
    if (card === current.card) follow(card, event);
    else release();
  }
}, { passive: true });
document.addEventListener('pointerout', event => {
  if (current && event.pointerType === 'mouse' && event.pointerId === current.pointerId && !current.card.contains(event.relatedTarget)) release();
}, { passive: true });
document.addEventListener('pointerup', event => { if (current?.pointerId === event.pointerId) release(); }, { passive: true });
document.addEventListener('pointercancel', event => { if (current?.pointerId === event.pointerId) reset(); }, { passive: true });
document.addEventListener('scroll', reset, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
window.addEventListener('blur', reset);
window.addEventListener('resize', reset, { passive: true });
window.addEventListener('pagehide', reset);
reduced.addEventListener?.('change', () => { if (reduced.matches) reset(); });
window.addEventListener('vocab-motionchange', () => { if (isReduced()) reset(); });
window.VocabContextTilt = Object.freeze({ reset });
})();
