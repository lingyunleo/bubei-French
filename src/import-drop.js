/* The library's file-drop entrance only validates files; preview and saving belong to the app. */
(() => {
'use strict';
window.VocabFileDrop?.beforeRender?.();
const extensions = new Set(['xlsx','xls','csv','tsv','txt','ods']);
const maxBytes = 12 * 1024 * 1024;
const defaults = {
 idle:'也可将 Excel / CSV / TSV 文件拖到这里预览',
 active:'松手预览词表', outside:'将文件拖到「导入」旁的区域，再松手预览',
 busy:'请先完成或关闭当前窗口，再拖入文件',
 multiple:'每次只能导入一个文件，请重新拖入单个词表。',
 unsupported:'请选择 Excel（.xlsx / .xls）、CSV、TSV、TXT 或 ODS 文件。',
 directory:'暂不支持拖入文件夹，请选择其中的单个词表文件。',
 tooLarge:'文件不能超过 12 MB，请拆分后再导入。',
 unreadable:'未能取得文件，请重新拖入，或点击「导入」选择文件。',
 failed:'未能读取文件，请点击「导入」重试。'
};
let mounted = null, inflight = null;
const fileDrag = transfer => !!transfer && (Array.from(transfer.types || []).some(type => type.toLowerCase() === 'files') || Array.from(transfer.items || []).some(item => item.kind === 'file'));

function mount({area, trigger, onFile, onError, labels = {}} = {}) {
 mounted?.destroy();
 if (!(area instanceof Element) || !(trigger instanceof Element) || typeof onFile !== 'function') return () => {};
 const text = {...defaults, ...labels}, disposers = [];
 const hint = document.createElement('span');
 hint.className = 'import-drop-hint'; hint.textContent = text.idle;
 hint.setAttribute('role','status'); hint.setAttribute('aria-live','polite'); hint.setAttribute('aria-atomic','true');
 area.classList.add('import-drop-area'); area.append(hint);
 let destroyed = false, dragging = false, cancelled = false;
 const valid = () => !destroyed && area.isConnected;
 const blocked = () => !!inflight || !!document.querySelector('dialog[open]') || trigger.matches(':disabled,[aria-disabled="true"]');
 const inside = node => node instanceof Node && area.contains(node);
 const inRect = event => {const r=area.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom};
 const listen = (target, type, fn, options) => {target.addEventListener(type,fn,options);disposers.push(()=>target.removeEventListener(type,fn,options))};
 function show(isInside) {
  if (!valid() || cancelled) return;
  dragging = true;
  area.classList.add('import-drop-dragging');
  area.classList.toggle('import-drop-ready',isInside && !blocked());
  const next = blocked() ? text.busy : isInside ? text.active : text.outside;
  if (hint.textContent !== next) hint.textContent = next;
 }
 function clear() {
  dragging = false;
  area.classList.remove('import-drop-dragging','import-drop-ready');
  hint.textContent = text.idle;
 }
 function error(code) {if(valid())onError?.(text[code] || text.failed,code)}
 function enter(event) {
  if (!valid() || !fileDrag(event.dataTransfer)) return;
  event.preventDefault();
  if (!dragging) cancelled = false;
  show(inside(event.target));
 }
 function over(event) {
  if (!valid() || !fileDrag(event.dataTransfer)) return;
  // The document guard exists only while this library entrance is mounted.
  event.preventDefault();
  const accept = inside(event.target) && !blocked() && !cancelled;
  try {event.dataTransfer.dropEffect = accept ? 'copy' : 'none'} catch (_) {}
  show(inside(event.target));
 }
 function leave(event) {
  if (!valid() || !dragging || !fileDrag(event.dataTransfer)) return;
  if (event.relatedTarget instanceof Node && document.documentElement.contains(event.relatedTarget)) {show(inside(event.relatedTarget));return;}
  if ((event.target===document.documentElement || event.target===document.body) && !event.relatedTarget) {clear();return;}
  // Moving between a button, its icon and its text must not flash the outline.
  show(inRect(event));
 }
 async function drop(event) {
  if (!valid() || !fileDrag(event.dataTransfer)) return;
  event.preventDefault(); event.stopPropagation();
  const targetInside = inside(event.target), wasCancelled = cancelled;
  clear();
  if (wasCancelled) return;
  if (blocked()) {error('busy');return;}
  if (!targetInside) {error('outside');return;}
  const token = {}; inflight = token;
  try {
   const items = Array.from(event.dataTransfer.items || []).filter(item=>item.kind==='file');
   const files = Array.from(event.dataTransfer.files || []);
   if (items.length>1 || files.length>1) {error('multiple');return;}
   // Inspect directory metadata only after drop; hovering never reads a file.
   if (items[0]) {
    let entry = null;
    try {entry = items[0].webkitGetAsEntry?.()} catch (_) {}
    if (entry?.isDirectory) {error('directory');return;}
    if (!entry && items[0].getAsFileSystemHandle) {
     let handle = null;
     try {handle = await items[0].getAsFileSystemHandle()} catch (_) {}
     if (handle?.kind==='directory') {error('directory');return;}
    }
   }
   if (!valid()) return;
   // An async directory check may finish after the user opened another panel.
   if (document.querySelector('dialog[open]')) {error('busy');return;}
   const file = files[0] || items[0]?.getAsFile?.();
   if (!file) {error('unreadable');return;}
   if (file.webkitRelativePath?.includes('/')) {error('directory');return;}
   if (!extensions.has(file.name.toLowerCase().split('.').pop())) {error('unsupported');return;}
   if (file.size>maxBytes) {error('tooLarge');return;}
   // This becomes the normal focus-return target when the app opens its modal.
   trigger.focus({preventScroll:true});
   await onFile(file);
  } catch (_) {error('failed')}
  finally {if(inflight===token)inflight=null;clear();}
 }
 function destroy() {
  if (destroyed) return;
  destroyed = true; clear();
  for (const dispose of disposers) dispose();
  hint.remove(); area.classList.remove('import-drop-area');
  if (mounted?.destroy===destroy) mounted=null;
 }
 listen(document,'dragenter',enter,true);
 listen(document,'dragover',over,true);
 listen(document,'dragleave',leave,true);
 listen(document,'drop',drop,true);
 listen(document,'dragend',clear,true);
 listen(document,'keydown',event=>{if(event.key==='Escape'&&dragging){clear();cancelled=true}},true);
 listen(window,'blur',clear);
 listen(window,'pagehide',clear);
 listen(document,'visibilitychange',()=>{if(document.hidden)clear()});
 mounted = {destroy};
 return destroy;
}
window.VocabFileDrop = Object.freeze({mount, beforeRender:()=>mounted?.destroy()});
})();
