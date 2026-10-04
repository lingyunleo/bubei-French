/* Media is stored separately from vocabulary. Nothing is fetched until an explicit play/cache action. */
(function (global) {
  'use strict';
  const DB_NAME = global.VOCAB_RELEASE ? 'FR_VOCAB_MEDIA_V4' : 'FR_VOCAB_ATELIER_MEDIA_V4', STORE = 'audio', MAX_FILE = 15 * 1024 * 1024, MAX_TOTAL = 150 * 1024 * 1024;
  const TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'application/ogg', 'audio/opus', 'audio/flac', 'audio/x-flac', 'audio/webm']);
  let dbPromise, current = null, generation = 0, mutations = Promise.resolve(), resetting = false;
  const clampRate = value => Math.min(1.5, Math.max(0.5, Number(value) || 1));
  const VOICE_WAIT_MS = 800;
  const voiceLanguage = voice => String(voice && voice.lang || '').replace(/_/g, '-').toLowerCase();
  const isFrenchVoice = voice => /^fr(?:-|$)/.test(voiceLanguage(voice));
  const isGoogleFrench = voice => ['fr', 'fr-fr'].includes(voiceLanguage(voice)) &&
    String(voice && voice.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase() === 'google francais';
  function selectVoice(voices, voiceURI = '') {
    const list = Array.isArray(voices) ? voices : [];
    return (voiceURI ? list.find(voice => voice.voiceURI === voiceURI) : undefined) ||
      list.find(isGoogleFrench) || list.find(voice => voiceLanguage(voice) === 'fr-fr') || list.find(isFrenchVoice);
  }
  function availableVoices() {
    try { return Array.from(global.speechSynthesis.getVoices() || []); } catch (_) { return []; }
  }
  const labelFor = mode => mode === 'original' ? '原声片段' : mode === 'human' ? '真人朗读' : '浏览器朗读';
  const builtins = () => Array.isArray(global.VocabBuiltinMedia) ? global.VocabBuiltinMedia : [];
  const cleanText = (value, max = 2000) => String(value || '').trim().slice(0, max);
  function safeURL(value) {
    if (!value || String(value).length > 4096) throw new Error('请提供 HTTPS 音频地址。');
    let url;
    try { url = new URL(String(value)); } catch (_) { throw new Error('音频地址无效。'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('音频地址仅支持无账号信息的 HTTPS 链接。');
    return url.href;
  }
  function metadata(context) {
    const out = {};
    for (const key of ['source', 'author', 'license', 'licenseUrl', 'sourceUrl', 'text', 'translation']) out[key] = cleanText(context[key]);
    for (const key of ['sourceUrl', 'licenseUrl']) if (out[key]) out[key] = safeURL(out[key]);
    return out;
  }
  function requireRights(context) {
    if (!cleanText(context.source) || !cleanText(context.license)) throw new Error('请先填写音频来源及许可说明；自有录音也可注明由本人录制。');
    metadata(context);
  }
  function openDB() {
    if (resetting) return Promise.reject(new Error('本机数据正在清除，请重新载入后继续。'));
    if (!global.indexedDB) return Promise.reject(new Error('此浏览器无法保存音频；请使用支持 IndexedDB 的浏览器。'));
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => { req.result.onversionchange = e => { req.result.close(); dbPromise = null; if(e.newVersion===null){resetting=true;stop();} }; resolve(req.result); };
      req.onerror = () => { dbPromise = null; reject(new Error('音频存储不可用，请检查浏览器存储权限。')); };
      req.onblocked = () => { dbPromise = null; reject(new Error('音频数据库正由其他页面占用，请关闭旧页面后重试。')); };
    });
    return dbPromise;
  }
  async function readAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error);
    });
  }
  async function readOne(id) {
    const builtin = builtins().find(item => item.id === id);
    if (builtin) return Object.assign({}, builtin, { blob: decodeRecord(builtin) });
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
    });
  }
  function serialize(task) {
    if(resetting)return Promise.reject(new Error('本机数据正在清除，请重新载入后继续。'));
    const run=()=>global.navigator?.locks?.request?global.navigator.locks.request(DB_NAME,task):task();
    const promise = mutations.then(run, run); mutations = promise.catch(() => {}); return promise;
  }
  async function fingerprint(blob) {
    const bytes=new Uint8Array(await blob.arrayBuffer());
    if(global.crypto?.subtle){const hash=await global.crypto.subtle.digest('SHA-256',bytes);return 'sha256-'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
    // In older/insecure environments the compact key only finds candidates;
    // their complete bytes are compared before reusing an existing recording.
    let a=2166136261,b=5381;for(const byte of bytes){a=Math.imul(a^byte,16777619);b=Math.imul(b,33)^byte;}
    return 'bytes-'+bytes.length+'-'+(a>>>0)+'-'+(b>>>0);
  }
  async function sameAudio(a,b,key) {
    if(a.size!==b.size)return false;if(key.startsWith('sha256-'))return true;
    const left=new Uint8Array(await a.arrayBuffer()),right=new Uint8Array(await b.arrayBuffer());return left.every((byte,i)=>byte===right[i]);
  }
  function freshMediaId(){return 'media-'+(global.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
  async function storeDeduplicated(records) {
    return serialize(async()=>{
      const existing=await readAll(),byHash=new Map(),existingIds=new Set(existing.map(r=>r.id)),used=new Set([...existing,...builtins()].map(r=>r.id)),pending=[],touched=new Map(),mapping=Object.create(null),protectedUntil=Date.now()+300000;
      for(const record of existing){const key=record.contentHash||await fingerprint(record.blob);if(!byHash.has(key))byHash.set(key,[]);byHash.get(key).push(record);}
      for(const record of records){
        const key=await fingerprint(record.blob);let match=null;
        for(const candidate of byHash.get(key)||[])if(await sameAudio(candidate.blob,record.blob,key)){match=candidate;break;}
        if(match){mapping[record.id]=match.id;match.protectedUntil=protectedUntil;if(existingIds.has(match.id))touched.set(match.id,match);continue;}
        let id=record.id;while(used.has(id))id=freshMediaId();used.add(id);
        const item={...record,id,contentHash:key,protectedUntil};pending.push(item);mapping[record.id]=id;
        if(!byHash.has(key))byHash.set(key,[]);byHash.get(key).push(item);
      }
      if(pending.length||touched.size)await writeMany([...touched.values(),...pending],new Set(pending.map(r=>r.id)));
      return {mapping,addedIds:pending.map(r=>r.id),count:records.length};
    });
  }
  async function writeMany(records,newIds=new Set()) {
    const existing = await readAll(), sizes = new Map(existing.map(record => [record.id, record.blob.size]));
    records.forEach(record => sizes.set(record.id, record.blob.size));
    if ([...sizes.values()].reduce((sum, n) => sum + n, 0) > MAX_TOTAL) throw new Error('音频总量不能超过 150 MB，请先移除不需要的音频。');
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'); records.forEach(record => newIds.has(record.id)?tx.objectStore(STORE).add(record):tx.objectStore(STORE).put(record));
      tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(new Error('音频保存失败：浏览器存储空间可能不足。'));
    });
  }
  async function validateBlob(blob, name = '') {
    if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isFinite(blob.size) || !blob.size) throw new Error('请选择有效的音频文件。');
    if (blob.size > MAX_FILE) throw new Error('单个音频不能超过 15 MB。');
    let type = String(blob.type || '').split(';')[0].toLowerCase();
    const ext = String(name).toLowerCase().split('.').pop();
    if (!type) type = ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm' })[ext] || '';
    if (!TYPES.has(type)) throw new Error('只支持 MP3、M4A、AAC、WAV、OGG、FLAC 或 WebM 音频。');
    const bytes = new Uint8Array(await blob.slice(0, 80).arrayBuffer());
    const ascii = (start, size) => String.fromCharCode(...bytes.slice(start, start + size));
    const valid = ascii(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224) ||
      (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') || ascii(0, 4) === 'OggS' ||
      ascii(0, 4) === 'fLaC' || ascii(4, 4) === 'ftyp' ||
      (bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163);
    if (!valid) throw new Error('文件内容不是可识别的音频，请勿仅更改文件扩展名。');
    if (type === 'application/ogg') type = 'audio/ogg';
    return blob.type === type ? blob : new Blob([blob], { type });
  }
  function decodeRecord(record) {
    const type = String(record.type || '').toLowerCase();
    if (!TYPES.has(type) || typeof record.data !== 'string' || record.data.length > Math.ceil(MAX_FILE / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(record.data)) throw new Error('备份中的音频格式无效或过大。');
    let str; try { str = global.atob(record.data); } catch (_) { throw new Error('备份中的音频编码无效。'); }
    const bytes = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    return new Blob([bytes], { type });
  }
  async function encodeBlob(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer()); let str = '';
    for (let i = 0; i < bytes.length; i += 16384) str += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return global.btoa(str);
  }
  function stop() {
    generation++;
    const item = current; current = null;
    if (global.speechSynthesis) global.speechSynthesis.cancel();
    if (!item) return;
    clearTimeout(item.timer);
    if (item.cleanupVoiceWait) item.cleanupVoiceWait();
    if (item.audio) { item.audio.onended = item.audio.onerror = null; item.audio.pause(); item.audio.removeAttribute('src'); item.audio.load(); }
    if (item.controller) item.controller.abort();
    if (item.url) URL.revokeObjectURL(item.url);
    item.emit('stopped', { ok: false }); item.resolve({ ok: false, state: 'stopped', mode: item.mode, label: labelFor(item.mode) });
  }
  function createRun(mode, options = {}, extra = {}) {
    stop(); const token = generation;
    let resolve; const promise = new Promise(done => { resolve = done; });
    const item = { mode, token, resolve, promise, ...extra };
    item.emit = (state, more = {}) => {
      const status = { ok: state !== 'error' && state !== 'stopped', mode, label: labelFor(mode), state, ...extra, ...more };
      if (typeof options.onStatus === 'function') { try { options.onStatus(status); } catch (_) { /* UI callbacks must not interrupt playback. */ } }
      return status;
    };
    item.finish = (state, more) => {
      if (current !== item) return;
      clearTimeout(item.timer); if (item.cleanupVoiceWait) item.cleanupVoiceWait(); if (item.url) URL.revokeObjectURL(item.url); current = null;
      item.resolve(item.emit(state, more));
    };
    current = item; return item;
  }
  function speak(text, options = {}) {
    const item = createRun('tts', options, options.fallback ? { fallback: true, reason: options.reason || '' } : {});
    const value = cleanText(text, 5000);
    if (!value) { item.finish('error', { error: '没有可朗读的法语文本。' }); return item.promise; }
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) { item.finish('error', { error: '此浏览器不支持朗读，请添加音频。' }); return item.promise; }
    item.emit('loading');
    // A callback may stop playback synchronously while rendering the loading state.
    if (current !== item || item.token !== generation) return item.promise;
    let started = false;
    const startSpeaking = () => {
      if (current !== item || item.token !== generation || started) return;
      started = true;
      if (item.cleanupVoiceWait) item.cleanupVoiceWait();
      const utterance = new global.SpeechSynthesisUtterance(value);
      utterance.lang = 'fr-FR'; utterance.rate = clampRate(options.rate);
      const voice = selectVoice(availableVoices(), options.voiceURI);
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (current === item && item.token === generation) {
          clearTimeout(item.timer);
          item.emit('playing', { voiceName: voice ? voice.name || '' : '', voiceURI: voice ? voice.voiceURI || '' : '' });
        }
      };
      utterance.onend = () => item.finish('ended');
      utterance.onerror = event => item.finish('error', { error: ['not-allowed', 'audio-busy'].includes(event.error) ? '浏览器暂停了声音，请再次点击播放。' : '浏览器朗读失败，请检查系统是否安装法语语音。' });
      item.timer = setTimeout(() => { if (current === item) { item.finish('error', { error: '朗读未启动，请再次点击播放或检查法语语音。' }); global.speechSynthesis.cancel(); } }, 15000);
      try { global.speechSynthesis.speak(utterance); } catch (_) { item.finish('error', { error: '朗读无法启动，请再次点击播放。' }); }
    };
    if (availableVoices().length) startSpeaking();
    else {
      const synthesis = global.speechSynthesis;
      const changed = () => {
        const voices = availableVoices();
        // A partial first event may only contain local voices. Give the requested
        // voice (or Google French in automatic mode) the rest of the bounded wait.
        if (options.voiceURI ? voices.some(voice => voice.voiceURI === options.voiceURI) : voices.some(isGoogleFrench)) startSpeaking();
      };
      item.cleanupVoiceWait = () => {
        clearTimeout(item.voiceTimer);
        if (typeof synthesis.removeEventListener === 'function') synthesis.removeEventListener('voiceschanged', changed);
        item.cleanupVoiceWait = null;
      };
      if (typeof synthesis.addEventListener === 'function') synthesis.addEventListener('voiceschanged', changed);
      item.voiceTimer = setTimeout(startSpeaking, VOICE_WAIT_MS);
      changed();
    }
    return item.promise;
  }
  function fallbackFrom(item, text, options, reason) {
    if (current !== item) return;
    clearTimeout(item.timer);
    if (item.cleanupVoiceWait) item.cleanupVoiceWait();
    if (item.audio) { item.audio.onended = item.audio.onerror = null; item.audio.pause(); item.audio.removeAttribute('src'); item.audio.load(); }
    if (item.url) URL.revokeObjectURL(item.url);
    current = null;
    speak(text, { ...options, fallback: true, reason }).then(item.resolve);
  }
  async function play(context, options = {}) {
    context = context && typeof context === 'object' ? context : {};
    if (context.type === 'tts' || (!context.audioId && !context.audioUrl)) return speak(context.text, options);
    try { requireRights(context); } catch (error) { return speak(context.text, { ...options, fallback: true, reason: error.message }); }
    const mode = context.type === 'original' ? 'original' : 'human', item = createRun(mode, options);
    item.emit('loading');
    try {
      let src;
      if (context.audioId) {
        const record = await readOne(context.audioId);
        if (current !== item) return item.promise;
        if (record) { item.url = URL.createObjectURL(record.blob); src = item.url; }
      }
      if (!src && context.audioUrl) src = safeURL(context.audioUrl);
      if (!src) throw new Error('本地音频缺失。');
      if (current !== item) return item.promise;
      const audio = new global.Audio(); item.audio = audio;
      audio.preload = 'none'; audio.src = src; audio.playbackRate = clampRate(options.rate);
      audio.onended = () => item.finish('ended');
      audio.onerror = () => {
        if (current !== item) return;
        fallbackFrom(item, context.text, options, '音频不可用，已改用浏览器朗读。');
      };
      item.timer = setTimeout(() => {
        if (current !== item) return;
        fallbackFrom(item, context.text, options, '音频加载超时，已改用浏览器朗读。');
      }, 20000);
      try { await audio.play(); }
      catch (error) {
        if (current !== item) return item.promise;
        if (error && error.name === 'NotAllowedError') { item.finish('error', { error: '浏览器暂停了声音，请再次点击播放。' }); return item.promise; }
        throw error;
      }
      if (current === item) { clearTimeout(item.timer); item.emit('playing'); }
    } catch (error) {
      if (current !== item) return item.promise;
      fallbackFrom(item, context.text, options, error.message || '音频不可用。');
    }
    return item.promise;
  }
  async function importAudio(file) {
    const blob = await validateBlob(file, file && file.name);
    const id=freshMediaId(),result=await storeDeduplicated([{ id, blob, name: cleanText(file.name, 200), addedAt: Date.now(), source: '用户导入的音频', license: '由导入者确认使用权限' }]);
    return result.mapping[id];
  }
  async function removeAudio(id) {
    if (builtins().some(item => item.id === id)) throw new Error('内置示范音频无需单独删除，可移除词条中的音频关联。');
    await serialize(async () => {
      const db = await openDB();
      return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(new Error('删除音频失败。')); });
    });
  }
  async function hasAudio(id) { if (!id) return false; try { return !!(await readOne(id)); } catch (_) { return false; } }
  async function cacheAudio(context) {
    if (!context || context.type === 'tts') throw new Error('浏览器朗读不能缓存为录音。');
    requireRights(context);
    if (context.audioId && await hasAudio(context.audioId)) return context.audioId;
    const url = safeURL(context.audioUrl), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await global.fetch(url, { mode: 'cors', credentials: 'omit', redirect: 'follow', signal: controller.signal, referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('音频下载失败。');
      if (response.url) safeURL(response.url);
      if (Number(response.headers.get('content-length')) > MAX_FILE) throw new Error('单个音频不能超过 15 MB。');
      const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!TYPES.has(type)) throw new Error('服务器返回的内容不是音频。');
      let blob;
      if (response.body && response.body.getReader) {
        const reader = response.body.getReader(), chunks = []; let total = 0;
        while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > MAX_FILE) { await reader.cancel(); throw new Error('单个音频不能超过 15 MB。'); } chunks.push(part.value); }
        blob = new Blob(chunks, { type });
      } else blob = await response.blob();
      blob = await validateBlob(blob);
      const id = 'cache-' + (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
      const result=await storeDeduplicated([{ id, blob, name: cleanText(context.text, 200), addedAt: Date.now(), audioUrl: url, ...metadata(context) }]);
      return result.mapping[id];
    } catch (error) { throw new Error(error.name === 'AbortError' ? '音频缓存超时，请重试。' : (error.message || '无法缓存音频，来源可能不允许跨站下载。')); }
    finally { clearTimeout(timer); }
  }
  async function exportMedia(references) {
    const wanted=references===undefined?null:new Set([...references].filter(id=>!builtins().some(item=>item.id===id)));
    if(wanted&&!wanted.size)return [];
    const records = await readAll(), out = [];
    for (const record of records) {if(wanted&&!wanted.has(record.id))continue;const { blob, contentHash, protectedUntil, ...rest } = record; out.push({ ...rest, type: blob.type, data: await encodeBlob(blob) }); }
    return out;
  }
  async function validateMedia(records) {
    if (!Array.isArray(records) || records.length > 2000) throw new Error('音频备份格式无效。');
    let bytes = 0; const ids = new Set(), validated = [];
    for (const record of records) {
      if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(record.id) || ids.has(record.id) || builtins().some(item => item.id === record.id)) throw new Error('音频备份包含无效、重复或保留的标识。');
      ids.add(record.id); const blob = await validateBlob(decodeRecord(record)); bytes += blob.size;
      if (bytes > MAX_TOTAL) throw new Error('音频备份不能超过 150 MB。');
      validated.push({ id: record.id, blob, name: cleanText(record.name, 200), addedAt: Number(record.addedAt) || Date.now(), ...metadata(record) });
    }
    return validated;
  }
  async function restoreMedia(records){return storeDeduplicated(await validateMedia(records));}
  async function importMedia(records){const result=await restoreMedia(records);return result.count;}
  async function cleanupMedia(references) {
    if(typeof references!=='function'&&!Array.isArray(references)&&!(references instanceof Set))throw new Error('清理音频前需要核对保留的引用。');
    return serialize(async()=>{
      const protectedIds=new Set(typeof references==='function'?await references():references),records=await readAll(),unused=records.filter(r=>!protectedIds.has(r.id)&&!(r.protectedUntil>Date.now()));
      if(!unused.length)return {count:0,bytes:0};
      const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');for(const item of unused)tx.objectStore(STORE).delete(item.id);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(new Error('音频清理未完成，请重试。'));});
      return {count:unused.length,bytes:unused.reduce((sum,item)=>sum+item.blob.size,0)};
    });
  }
  async function storageStatus(references) {
    try { const records = await readAll(),wanted=references===undefined?null:new Set(references),unused=wanted?records.filter(r=>!wanted.has(r.id)&&!(r.protectedUntil>Date.now())):[];return { available: true, count: records.length, bytes: records.reduce((sum, item) => sum + item.blob.size, 0), unusedCount:unused.length,unusedBytes:unused.reduce((sum,r)=>sum+r.blob.size,0),maxBytes: MAX_TOTAL, maxFileBytes: MAX_FILE, builtinCount: builtins().length }; }
    catch (error) { return { available: false, count: 0, bytes: 0, maxBytes: MAX_TOTAL, maxFileBytes: MAX_FILE, builtinCount: builtins().length, error: error.message }; }
  }
  async function closeForReset(){resetting=true;stop();await mutations;const pending=dbPromise;dbPromise=null;if(pending){const db=await pending.catch(()=>null);db?.close();}}
  global.AudioKit = Object.freeze({ stop, speak, play, importAudio, removeAudio, hasAudio, cacheAudio, exportMedia, importMedia, restoreMedia, cleanupMedia, storageStatus, labelFor, safeURL, selectVoice, VOICE_WAIT_MS, MAX_FILE, MAX_TOTAL, closeForReset });
  if (global.addEventListener) global.addEventListener('pagehide', stop);
})(typeof window === 'undefined' ? globalThis : window);
