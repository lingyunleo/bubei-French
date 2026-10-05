/* VocabData 4.5 — validated local data, immutable edits, v2 migration. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./legacy-parser.js'), require('./legacy-core.js'), root, require('./assistant-import.js'), require('./history.js'), require('./engine.js'));
  else root.VocabData = factory(root.VocabParser, root.VocabCore, root, root.VocabAssistantImport, root.VocabHistory);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P, C, host, AssistantImport, H, Engine) {
  'use strict';
  const RELEASE = typeof host.VOCAB_RELEASE === 'string' && host.VOCAB_RELEASE.length > 0;
  const VERSION = 4, KEY = RELEASE ? 'FR_VOCAB_APP_V4' : 'FR_VOCAB_ATELIER_APP_V4', OLD_KEY = 'FR_VOCAB_APP_V2', DB_NAME = RELEASE ? 'FR_VOCAB_DATA_V4' : 'FR_VOCAB_ATELIER_DATA_V4';
  const DEFAULTS = { dailyGoal:20, dailyGoalEnabled:true, newBatch:10, reviewBatch:20, language:'zh', theme:'dark', designTheme:'atelier', themeByDesign:{classic:'light',atelier:'dark'}, font:'serif', autoWord:false, autoExample:false, listening:false, retention:0.9, onboardingComplete:true, showShortcutHints:true, motionMode:'standard' };
  const BAD = new Set(['__proto__', 'prototype', 'constructor']);
  let dbPromise = null, backend = null, blocked = false, pendingFallback = null, resetting = false;
  const listeners = new Set();
  let channel = null;
  function error(message, code) { const e = new Error(message); if (code) e.code = code; return e; }
  function fail(message, code) { throw error(message, code); }
  function plain(v) { return v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v)); }
  function safeCopy(input) {
    let count = 0, chars = 0; const ancestors = new Set();
    function visit(v, depth) {
      if (++count > 700000 || depth > 35) fail('数据结构过大或嵌套过深。');
      if (v === null || typeof v === 'boolean') return v;
      if (typeof v === 'string') { chars += v.length; if (v.length > 500000 || chars > 60000000) fail('数据文本过大。'); return v; }
      if (typeof v === 'number') { if (!Number.isFinite(v)) fail('数据包含无效数字。'); return v; }
      if (typeof v !== 'object' || (!Array.isArray(v) && !plain(v)) || ancestors.has(v)) fail('数据必须是普通 JSON 对象。');
      ancestors.add(v);
      let out;
      if (Array.isArray(v)) { if (v.length > 100000) fail('数据列表过长。'); out = v.map(x => x === undefined ? null : visit(x, depth + 1)); }
      else { out = {}; for (const k of Object.keys(v)) { if (BAD.has(k) || k.length > 200) fail('数据包含不安全字段。'); if (v[k] !== undefined) out[k] = visit(v[k], depth + 1); } }
      ancestors.delete(v); return out;
    }
    return visit(input, 0);
  }
  function parse(input,depth=0) {
    if(depth>5)fail('备份嵌套过深。');
    if (typeof input === 'string') { if (input.length > 180000000) fail('备份文件过大。'); try { input = JSON.parse(input); } catch (_) { fail('备份不是有效 JSON。'); } }
    if(plain(input)&&input.storageFormat==='history-blocks-v1')return {storageFormat:input.storageFormat,state:parse(input.state,depth+1)};
    if(plain(input)&&input.version===VERSION){
      if(plain(input.state))return {version:VERSION,state:parse(input.state,depth+1)};
      const {events=[],eventArchive,...core}=input;
      return H.normalize({...safeCopy(core),events,eventArchive});
    }
    return safeCopy(input);
  }
  function cloneForChange(state){
    const {events=[],eventArchive,...core}=state;
    const result=JSON.parse(JSON.stringify(core));result.events=events.slice();
    if(eventArchive)result.eventArchive=eventArchive.slice();return result;
  }
  function num(v, min, max, name, integer = true) { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) fail(name + '无效。'); return v; }
  function text(v, max, name, required = false) { if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(name + '无效。'); return v.normalize('NFC').trim(); }
  function uid(prefix) { return prefix + '-' + (host.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)); }
  function map(v, name) { if (!plain(v)) fail(name + '必须是对象。'); return v; }
  function validateSkills(value) {
    map(value, '词条技能数据');
    for (const kind of ['spelling','listening']) {
      if (value[kind] === undefined) continue;
      const record = map(value[kind], '技能练习记录');
      // Missing counters cannot be reconstructed without inventing practice history.
      for (const key of ['attempts','correct','mistakes','assisted']) num(record[key],0,Number.MAX_SAFE_INTEGER,'技能练习次数');
      if (record.corrections !== undefined) num(record.corrections,0,Number.MAX_SAFE_INTEGER,'技能订正次数');
      if (record.lastPracticedAt !== undefined && record.lastPracticedAt !== null) num(record.lastPracticedAt,0,8640000000000000,'最近技能练习时间');
    }
  }
  function url(v, name) { v = text(v || '', 4000, name); if (v && !/^https?:\/\//i.test(v)) fail(name + '必须是 http 或 https 地址。'); return v; }
  function settings(extra) {
    const s = { ...DEFAULTS, ...extra };
    for (const k of ['dailyGoal','newBatch','reviewBatch']) num(s[k], 1, 200, '每日或每轮数量');
    if (!['zh','en','fr'].includes(s.language)) fail('界面语言无效。');
    if (!['standard','simple'].includes(s.motionMode)) fail('动效设置无效。');
    if (!['light','dark','system'].includes(s.theme)) fail('主题无效。');
    if (!['classic','atelier','verdure'].includes(s.designTheme)) fail('界面风格无效。');
    const colors = map(s.themeByDesign, '各界面配色');
    for (const [design,color] of Object.entries(colors)) if (!['classic','atelier','verdure'].includes(design) || !['light','dark','system'].includes(color)) fail('各界面配色无效。');
    s.themeByDesign = { ...DEFAULTS.themeByDesign, ...colors, [s.designTheme]:s.theme };
    if (!['serif','sans'].includes(s.font)) fail('字体无效。');
    for (const k of ['autoWord','autoExample','listening','dailyGoalEnabled','onboardingComplete','showShortcutHints']) if (typeof s[k] !== 'boolean') fail('学习设置无效。');
    num(s.retention, 0.7, 0.99, '目标记忆率', false);
    return s;
  }
  function legacyShape(state) { return { version:2, revision:state.revision, activeDeckId:state.activeDeckId, settings:state.settings, decks:state.decks }; }
  function checkEntries(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 5000) fail('词表需要包含 1–5000 个词条。');
    const seen = new Set();
    for (const w of entries) {
      const result = P.validateEntry(w);
      if (!result.valid && !w.needsConfirmation) fail('词条「' + (w.french || '') + '」：' + result.errors.join('；'));
      const key = P.wordKey(w);
      if (seen.has(key)) fail('同一词表内有重复词形「' + w.french + '」。请合并释义，或把不同词义放入不同词表；不会自动覆盖。');
      seen.add(key);
    }
    return entries;
  }
  function fresh() {
    const state = C.createState(); state.version = VERSION; state.settings = settings({ ...state.settings, ...DEFAULTS, theme:'light', designTheme:'classic', carnetMotion:'immersive', listening:true, onboardingComplete:false });
    return Object.assign(state, { cards:{}, skills:{}, events:[], session:null, contexts:{}, aliases:{}, trash:[], migration:null });
  }
  function validate(value) {
    const input = parse(value);
    if (!plain(input) || input.version !== VERSION) fail('请选择有效的学习备份文件。');
    const old = C.validateState(legacyShape(input));
    for (const d of old.decks) if (d.words.length) checkEntries(d.words);
    const out = { ...old, version:VERSION, settings:{...old.settings,...settings(input.settings)} };
    // Keep validated legacy setting values rather than arbitrary overrides.
    Object.assign(out.settings, old.settings);
    for (const key of ['cards','skills','contexts','aliases']) out[key] = map(input[key] === undefined ? {} : input[key], key);
    out.events = input.events === undefined ? [] : input.events;
    if(input.eventArchive)out.eventArchive=input.eventArchive;
    if (!Array.isArray(out.events) || out.events.some(e => !plain(e))) fail('学习记录无效。');
    out.session = input.session === undefined ? null : input.session;
    if (out.session !== null && !plain(out.session)) fail('学习会话无效。');
    if (input.lastSummary !== undefined) { if (input.lastSummary !== null && !plain(input.lastSummary)) fail('学习总结无效。'); out.lastSummary = input.lastSummary; }
    if (input.createdAt !== undefined) out.createdAt = num(input.createdAt,0,8640000000000000,'创建时间');
    out.migration = input.migration === undefined ? null : input.migration;
    if (out.migration !== null && !plain(out.migration)) fail('迁移记录无效。');
    const wordIds = new Set(out.decks.flatMap(d => d.words.map(w => w.id)));
    for (const key of ['cards','skills','contexts','aliases']) for (const wordId of Object.keys(out[key])) {
      if (!wordIds.has(wordId)) fail('附加学习数据引用了不存在的词条。');
      if (key === 'cards') map(out[key][wordId], '词条学习数据');
    }
    for (const skill of Object.values(out.skills)) validateSkills(skill);
    // Undo can restore an older skill record even when the current one is valid.
    const undoSkill = out.session?.undo?.skill;
    if (undoSkill !== undefined && undoSkill !== null) validateSkills(undoSkill);
    for (const card of Object.values(out.cards)) {
      if (card.dueAt !== undefined && card.dueAt !== null) num(card.dueAt,0,8640000000000000,'词条复习时间');
      for (const key of ['started','acquired']) if (card[key] !== undefined && typeof card[key] !== 'boolean') fail('词条学习状态无效。');
      if (card.fsrs !== undefined && card.fsrs !== null) {
        const f=map(card.fsrs,'记忆调度数据');
        num(f.due,0,8640000000000000,'下次复习时间');
        if(f.last_review!==undefined&&f.last_review!==null)num(f.last_review,0,8640000000000000,'最近复习时间');
        num(f.state,0,3,'记忆状态');num(f.stability,0,Number.MAX_SAFE_INTEGER,'记忆稳定度',false);num(f.difficulty,0,10,'词条难度',false);
        for(const key of ['reps','lapses','learning_steps'])num(f[key],0,Number.MAX_SAFE_INTEGER,'记忆记录次数');
        for(const key of ['elapsed_days','scheduled_days'])num(f[key],0,Number.MAX_SAFE_INTEGER,'记忆间隔',false);
      }
    }
    for (const [wordId, values] of Object.entries(out.aliases)) {
      if (!Array.isArray(values) || values.length > 30) fail('可接受答案列表无效。');
      out.aliases[wordId] = [...new Set(values.map(v => text(v, 2000, '可接受答案', true)))];
    }
    for (const [wordId, values] of Object.entries(out.contexts)) {
      if (!Array.isArray(values) || values.length > 100) fail('例句列表无效。');
      const ids = new Set();
      out.contexts[wordId] = values.map(c => {
        map(c, '例句'); const item = { ...c };
        item.id = text(c.id, 200, '例句 ID', true); if (ids.has(item.id)) fail('例句 ID 重复。'); ids.add(item.id);
        item.text = text(c.text, 12000, '例句', true);
        for (const key of ['translation','source','author','license']) item[key] = text(c[key] || '', 12000, '例句信息');
        item.sourceUrl = url(c.sourceUrl, '例句来源'); item.audioUrl = url(c.audioUrl, '音频来源');
        item.target = text(c.target === undefined ? '' : c.target, 2000, '例句目标词形');
        item.licenseUrl = url(c.licenseUrl, '许可地址');
        item.audioId = text(c.audioId || '', 200, '本地音频 ID');
        item.type = c.type || 'tts'; if (!['tts','human','original'].includes(item.type)) fail('音频类型无效。');
        if (c.origin !== undefined && !['default','custom'].includes(c.origin)) fail('例句来源类型无效。');
        if (c.favorite !== undefined && typeof c.favorite !== 'boolean') fail('例句收藏标记无效。');
        return item;
      });
    }
    out.trash = input.trash === undefined ? [] : input.trash;
    if (!Array.isArray(out.trash) || out.trash.length > 100 || out.trash.some(t => !plain(t) || !['deck','word'].includes(t.kind) || typeof t.id !== 'string')) fail('回收站数据无效。');
    for (const item of out.trash) {
      if (item.kind === 'word') item.word = C.validateWord(item.word);
      else {
        if (!plain(item.deck) || !Array.isArray(item.deck.words)) fail('回收站词表无效。');
        item.deck.words = item.deck.words.map(word => C.validateWord(word));
      }
    }
    const runtime = Engine || host.VocabEngine;
    if (runtime?.validateRuntime) runtime.validateRuntime(out);
    return out;
  }
  function migrate(value, options = {}) {
    let raw = parse(value);
    for(let i=0;i<5&&plain(raw)&&plain(raw.state)&&(raw.storageFormat==='history-blocks-v1'||raw.version===VERSION);i++)raw=raw.state;
    const hasDesign = plain(raw.settings) && Object.prototype.hasOwnProperty.call(raw.settings, 'designTheme');
    const design = hasDesign ? raw.settings.designTheme : options.designThemeFallback;
    if (design !== undefined && !['classic','atelier','verdure'].includes(design)) fail('界面风格无效。');
    if (!hasDesign && design !== undefined) raw = { ...raw, settings:{...raw.settings,designTheme:design} };
    if (raw.version === VERSION) return validate(raw);
    if (raw.version !== 2) fail('备份版本不支持；请使用 3.x 或 4.x 网站导出的完整备份。');
    const old = C.validateState(raw), out = fresh();
    out.decks = old.decks; out.activeDeckId = old.activeDeckId; out.settings = {...old.settings, ...DEFAULTS, ...(design === undefined ? {} : {designTheme:design})};
    out.migration = { from:2, at:Date.now(), original:old, note:'保留原始双模式进度和到期时间；新记忆档案由首次实际评分建立。' };
    // The new storage has no committed revision yet. Original revision stays above.
    out.revision = 0;
    return validate(out);
  }
  function previewImport(input, options = {}) {
    if (typeof input === 'string' && input.length > 10000000) fail('导入文本超过 10 MB，请拆分词表。');
    const rows = typeof input === 'string' ? P.parseDelimited(input) : input;
    if (!Array.isArray(rows) || rows.length > 5001) fail('每次最多导入 5000 个词条。');
    if (options.header !== 'no' && AssistantImport?.detect(rows)) return AssistantImport.parse(rows);
    const result=P.parseRows(rows, {header:options.header || 'auto'});
    const first=rows.findIndex(row=>Array.isArray(row)&&row.some(cell=>P.normalize(cell)));
    if(first<0||options.header==='no')return result;
    const names=rows[first].map(cell=>P.compare(cell).replace(/[\s_-]/g,''));
    const aliasIndex=names.findIndex(name=>['可接受答案','其他答案','aliases','acceptedanswers'].includes(name));
    const frenchHeaders=['法语','法语词条','单词','词条','词汇','french','français','francais','mot','word','vocabulaire'];
    const meaningHeaders=['中文','中文释义','释义','含义','意思','中文意思','meaning','chinese','translation','traduction','sens'];
    if(aliasIndex<0||!names.some(n=>frenchHeaders.includes(n))||!names.some(n=>meaningHeaders.includes(n)))return result;
    const sourceRows=new Map(rows.map((row,index)=>[rows.sourceRows?rows.sourceRows[index]:index+1,row]));
    const unsupported=message=>message.includes('「可接受答案」尚未加入自动判题');
    result.warnings=result.warnings.filter(w=>!unsupported(w.message));
    result.entries=result.entries.filter(entry=>{
      entry.warnings=entry.warnings.filter(w=>!unsupported(w));
      const cell=P.normalize(sourceRows.get(entry.sourceRow)?.[aliasIndex]);
      const aliases=[...new Set(cell.split(/[;；\n]/).map(value=>P.normalize(value)).filter(Boolean))];
      if(aliases.length>30||aliases.some(a=>a.length>2000)){result.errors.push({row:entry.sourceRow,message:'可接受答案最多 30 项，每项最多 2000 字符；请用分号分隔。'});return false;}
      entry.aliases=aliases;
      if(entry.hasGender&&entry.practiceGender!==false&&aliases.length){const message='阴阳性双形式题仍分别核对完整词形；可接受答案仅用于单形拼写题。';entry.warnings.push(message);result.warnings.push({row:entry.sourceRow,message});}
      return true;
    });
    return result;
  }
  function findDeck(s, id) { const d = s.decks.find(d => d.id === id); if (!d) fail('词表不存在。'); return d; }
  function cleanup(s, ids) {
    for (const key of ['cards','skills','contexts','aliases']) for (const id of ids) delete s[key][id];
    // A changed list invalidates a pending queue; completed events remain genuine history.
    s.session = null;
  }
  function attachments(s, ids) { return Object.fromEntries(['cards','skills','contexts','aliases'].map(key => [key, Object.fromEntries(ids.filter(id => s[key][id] !== undefined).map(id => [id,s[key][id]]))])); }
  function syncDefaultContexts(s, before, after) {
    const list=s.contexts[after.id];if(!list||!before)return;
    s.contexts[after.id]=list.flatMap(c=>{
      // Old backups have no origin field. Only an untouched generated default
      // can be inferred safely; a user's edited or recorded sentence stays owned.
      const inherited=c.origin==='default'||(c.origin===undefined&&c.id==='base-'+before.id&&c.type==='tts'&&!c.audioId&&!c.audioUrl&&c.text===before.example&&(c.translation||'')===(before.exampleZh||''));
      if(!inherited)return [c];
      if(!after.example)return [];
      return [{...c,origin:'default',text:after.example,translation:after.exampleZh||'',source:after.source||'',target:c.target&&after.example.includes(c.target)?c.target:''}];
    });
  }
  function putTrash(s, item) { s.trash.unshift({id:uid('trash'), deletedAt:Date.now(), ...item}); s.trash = s.trash.slice(0,100); }
  function importEntries(value, entries, options = {}) {
    const s = validate(value); entries = checkEntries(parse(entries));
    const mode = options.mode || 'new'; let d, info;
    if (mode === 'new') { d = C.createDeck(s, text(options.name || '我的词表',200,'词表名称',true), entries); info = {added:d.words.length,updated:0,removed:0}; }
    else if (mode === 'merge' || mode === 'replace') {
      d = findDeck(s,options.deckId); const originals=new Map(d.words.map(w=>[w.id,w])),before = d.words.map(w => w.id);
      info = C.mergeDeck(s, d.id, entries, {replace:mode === 'replace', name:options.name === undefined ? d.name : options.name});
      for(const word of d.words)syncDefaultContexts(s,originals.get(word.id),word);
      const kept = new Set(d.words.map(w => w.id)); cleanup(s,before.filter(id => !kept.has(id))); s.activeDeckId = d.id;
    } else fail('导入方式无效。');
    // The legacy content validator intentionally strips extension fields. Attach
    // explicit answers only after the final stable word IDs are known.
    const byKey=new Map(d.words.map(w=>[P.wordKey(w),w.id]));
    for(const entry of entries)if(entry.aliases!==undefined)s.aliases[byKey.get(P.wordKey(entry))]=entry.aliases;
    // Revisions count persisted commits, not intermediate edits.
    s.revision = value.revision;
    return {state:validate(s),deckId:d.id,...info};
  }
  function renameDeck(value,id,name) { const s = validate(value), d = findDeck(s,id); d.name = text(name,200,'词表名称',true); d.updatedAt=Date.now(); return validate(s); }
  function reorderDeck(value,id,toIndex) { const s=validate(value);findDeck(s,id);num(toIndex,0,s.decks.length-1,'排序位置');const i=s.decks.findIndex(d=>d.id===id);s.decks.splice(toIndex,0,s.decks.splice(i,1)[0]);return s; }
  // Reset study records only. Kept content and word IDs stay valid for media,
  // favorites, explicit spelling answers, and a future restore from the trash.
  function resetDeckProgress(value,deckId) {
    const s=validate(value),d=findDeck(s,deckId),ids=new Set(d.words.map(w=>w.id));
    d.progress={};C.ensureProgress(d);
    for(const t of s.trash) {
      if(t.kind==='word'&&t.deckId===deckId) {
        ids.add(t.word.id);
        const blank=C.ensureProgress({words:[t.word],progress:{}});
        t.progress=Object.fromEntries(['learn','speed'].map(mode=>[mode,blank.progress[mode].words[t.word.id]]));
        if(t.attachments){t.attachments.cards={};t.attachments.skills={};}
      } else if(t.kind==='deck'&&t.deck?.id===deckId) {
        for(const w of t.deck.words)ids.add(w.id);
        t.deck.progress={};C.ensureProgress(t.deck);
        if(t.attachments){t.attachments.cards={};t.attachments.skills={};}
      }
    }
    for(const id of ids){delete s.cards[id];delete s.skills[id];}
    const removed=e=>ids.has(e.wordId)||e.deckId===deckId,priorEvents=s.events;
    // scopeDeckIds and answer choices may mention a deck without learning its
    // words. Only actual task/progress references invalidate an active batch.
    function touches(record) {
      if(!record||typeof record!=='object')return false;
      if(ids.has(record.wordId)||record.deckId===deckId)return true;
      for(const key of ['wordIds','completedIds','failedIds','mistakeIds'])if(Array.isArray(record[key])&&record[key].some(id=>ids.has(id)))return true;
      if(record.failures&&Object.keys(record.failures).some(id=>ids.has(id)))return true;
      return touches(record.current)||touches(record.summary)||touches(record.undo)||touches(record.session)||(Array.isArray(record.queue)&&record.queue.some(touches));
    }
    if(touches(s.session))s.session=null;
    else if(s.session?.undo) {
      // Undo stores an event-array offset. Rebase it after removing unrelated
      // deck history so the next undo still removes exactly its own answer.
      const undo=s.session.undo;
      undo.eventsLength=priorEvents.slice(0,undo.eventsLength).filter(e=>!removed(e)).length;
    }
    if(touches(s.lastSummary))s.lastSummary=null;
    s.events=priorEvents.filter(e=>!removed(e));H.filterArchive(s,e=>!removed(e));
    return validate(s);
  }
  function deleteDeck(value,id) {
    const s=validate(value),d=findDeck(s,id),ids=d.words.map(w=>w.id);
    putTrash(s,{kind:'deck',deck:d,index:s.decks.indexOf(d),selected:s.settings.studyDeckIds.includes(id),attachments:attachments(s,ids)});
    s.decks=s.decks.filter(d=>d.id!==id); s.settings.studyDeckIds=s.settings.studyDeckIds.filter(x=>x!==id);
    if(s.activeDeckId===id)s.activeDeckId=s.decks[0]?.id||null;
    cleanup(s,ids);return validate(s);
  }
  function restoreDeck(value,trashId) {
    const s=validate(value),i=s.trash.findIndex(t=>t.id===trashId),t=s.trash[i];if(!t)fail('回收记录不存在。');
    if(t.kind!=='deck')return restoreWord(s,trashId);
    if(s.decks.some(d=>d.id===t.deck.id))fail('此词表已经存在，无法重复恢复。');
    s.decks.splice(Math.min(t.index||0,s.decks.length),0,t.deck);s.trash.splice(i,1);
    for(const k of ['cards','skills','contexts','aliases'])Object.assign(s[k],t.attachments?.[k]||{});
    if(t.selected)s.settings.studyDeckIds.push(t.deck.id);if(!s.activeDeckId)s.activeDeckId=t.deck.id;s.session=null;return validate(s);
  }
  function editWord(value,deckId,wordId,patch) {
    const s=validate(value),d=findDeck(s,deckId),w=d.words.find(w=>w.id===wordId);if(!w)fail('词条不存在。');patch=parse(patch);map(patch,'词条内容');
    const before={...w},allowed=['raw','french','meaning','pos','masc','fem','spell','phonetic','usage','example','exampleZh','source','hasGender','practiceGender','needsConfirmation','fullMeaning','fullUsage','originalMeaning','originalNotes'];
    for(const k of allowed)if(patch[k]!==undefined)w[k]=patch[k];
    if(patch.aliases!==undefined)s.aliases[wordId]=patch.aliases;
    checkEntries(d.words);syncDefaultContexts(s,before,w);d.updatedAt=Date.now();s.session=null;return validate(s);
  }
  function addWord(value,deckId,entry) {
    const s=validate(value),d=findDeck(s,deckId);entry=parse(entry);const incoming={...entry};delete incoming.aliases;
    const info=importEntries(s,[...d.words,incoming],{deckId,mode:'merge'}),out=info.state;
    if(entry.aliases){const added=findDeck(out,deckId).words.find(w=>P.wordKey(w)===P.wordKey(incoming));out.aliases[added.id]=entry.aliases;}
    return validate(out);
  }
  function deleteWord(value,deckId,wordId) {
    const s=validate(value),d=findDeck(s,deckId),index=d.words.findIndex(w=>w.id===wordId);if(index<0)fail('词条不存在。');
    const progress=Object.fromEntries(['learn','speed'].map(mode=>[mode,d.progress[mode].words[wordId]]));
    putTrash(s,{kind:'word',deckId,index,word:d.words[index],progress,attachments:attachments(s,[wordId])});
    d.words.splice(index,1);C.ensureProgress(d);d.updatedAt=Date.now();cleanup(s,[wordId]);return validate(s);
  }
  function restoreWord(value,trashId) {
    const s=validate(value),i=s.trash.findIndex(t=>t.id===trashId),t=s.trash[i];if(!t||t.kind!=='word')fail('词条回收记录不存在。');
    const d=findDeck(s,t.deckId);if(d.words.some(w=>w.id===t.word.id||P.wordKey(w)===P.wordKey(t.word)))fail('词表已有相同词条，无法重复恢复。');
    d.words.splice(Math.min(t.index||0,d.words.length),0,t.word);C.ensureProgress(d);
    for(const mode of ['learn','speed'])d.progress[mode].words[t.word.id]=t.progress[mode];
    for(const k of ['cards','skills','contexts','aliases'])Object.assign(s[k],t.attachments?.[k]||{});
    s.trash.splice(i,1);d.updatedAt=Date.now();s.session=null;return validate(s);
  }
  function exportBackup(state) { return {app:'Vocabulaire',version:VERSION,exportedAt:Date.now(),state:H.expand(validate(state))}; }
  function openDB() {
    if(resetting)return Promise.reject(error('本机数据正在清除，请重新载入后继续。','RESET_IN_PROGRESS'));
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!host.indexedDB){reject(error('此环境不支持 IndexedDB。'));return;}
      let settled=false;const request=host.indexedDB.open(DB_NAME,1);
      const timer=setTimeout(()=>{if(!settled){settled=true;reject(error('浏览器存储暂时无法打开。'));}},3500);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('data'))db.createObjectStore('data');if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});};
      request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;request.result.onversionchange=e=>{request.result.close();dbPromise=null;if(e.newVersion===null){resetting=true;emit({external:true,resetting:true});}};resolve(request.result);};
      request.onerror=()=>{clearTimeout(timer);if(!settled){settled=true;reject(request.error||error('无法打开浏览器存储。'));}};
      request.onblocked=()=>{clearTimeout(timer);if(!settled){settled=true;reject(error('请关闭此网站的其他旧窗口后重试。'));}};
    });return dbPromise;
  }
  async function readDB() { const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('data','readonly'),store=tx.objectStore('data'),q=store.get('state'),consumed=store.get('consumedFallback');tx.oncomplete=()=>resolve({state:q.result||null,consumedFallback:consumed.result||null});tx.onabort=()=>reject(tx.error||error('无法读取浏览器存储。'));tx.onerror=()=>{};}); }
  function legacyStored() {
    // Keep previews/experiments isolated; releases retain the original V2 upgrade path.
    if (!RELEASE) return null;
    const raw=host.localStorage?.getItem(OLD_KEY);if(!raw)return null;const index=parse(raw);
    if(index.storageFormat==='blocks-v1')index.decks=index.decks.map(d=>{if(typeof d.wordRef!=='string'||!d.wordRef.startsWith(OLD_KEY+'_WORDS_'))fail('词库引用无效。');const block=host.localStorage.getItem(d.wordRef);if(!block)fail('词库数据不完整。');return {...d,words:parse(block)};});
    const migrated=migrate(index);
    const language=host.localStorage.getItem('FR_VOCAB_INTERFACE_LANGUAGE');if(language&&['zh-CN','en','fr'].includes(language))migrated.settings.language=language==='zh-CN'?'zh':language;
    return migrated;
  }
  async function load() {
    let stored=null,warning='',consumedFallback=null;blocked=false;pendingFallback=null;
    try { const record=await readDB();stored=record.state;consumedFallback=record.consumedFallback;backend='indexedDB'; }
    catch(e){backend='localStorage';warning='主存储暂不可用，使用浏览器备用存储。';try{stored=host.localStorage?.getItem(KEY)||null;if(!host.localStorage)throw error('没有本地存储');}catch(_){backend='memory';warning='浏览器无法保存数据，本次仅临时使用。请及时导出备份。';}}
    if(backend==='indexedDB'){
      let fallback=null;try{fallback=host.localStorage?.getItem(KEY);}catch(_){}
      // A fallback copy is unsynchronized work, not an older v2 archive. Rejoin
      // it before considering legacy data; keep the old primary as a snapshot.
      // An exact consumed marker prevents replay if localStorage cleanup failed.
      if(fallback&&fallback!==consumedFallback){try{
        const transfer=migrate(fallback);const primary=stored?migrate(stored):null;
        pendingFallback={raw:fallback};transfer.revision=primary?.revision||0;
        return {state:transfer,persistent:true,backend,warning:primary?'已接回备用存储中的进度；原主存档会在保存前保留为恢复快照。':'已读取备用存储中的进度，下一次保存将迁入主存储。',migrated:true};
      }catch(e){
        blocked=true;pendingFallback={raw:fallback};
        // Keep a valid primary archive available for reading/export, including
        // its revision. An explicit recovery must still match this exact
        // fallback before recording it as consumed in the same transaction.
        let retained;try{retained=stored?migrate(stored):fresh();}catch(_){retained=fresh();}
        return {state:retained,persistent:false,backend,blocked:true,warning:'主存档或备用存档无法校验，已停止覆盖：'+e.message};}}
    }
    if(stored){try{return {state:migrate(stored),persistent:backend!=='memory',backend,warning};}catch(e){blocked=true;return {state:fresh(),persistent:false,backend,blocked:true,warning:'现有存档无法校验，已停止覆盖。请先导出或恢复备份：'+e.message};}}
    try { const old=legacyStored();if(old)return {state:old,persistent:backend!=='memory',backend,warning,migrated:true}; }
    catch(e){warning+=(warning?' ':'')+'存档暂时无法读取：'+e.message;}
    return {state:fresh(),persistent:backend!=='memory',backend,warning};
  }
  function emit(value) { for(const fn of listeners){try{fn(value);}catch(_){}} }
  function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
  async function save(value,options={}) {
    if(resetting)fail('本机数据正在清除，请重新载入后继续。','RESET_IN_PROGRESS');
    const s=validate(value),expected=options.expectedRevision===undefined?s.revision:options.expectedRevision;
    num(expected,0,Number.MAX_SAFE_INTEGER,'保存版本');if(blocked&&!options.recover)fail('现有存档无法校验，已停止覆盖。请恢复备份。','STORAGE_CORRUPT');
    if(!backend)await load();
    if(blocked&&!options.recover)fail('现有存档无法校验，已停止覆盖。请恢复备份。','STORAGE_CORRUPT');
    const candidate={...s,revision:expected+1};
    // A storage-only envelope makes old application versions stop safely,
    // rather than silently discard an event archive they cannot understand.
    const storedCandidate=candidate.eventArchive?.length?{storageFormat:'history-blocks-v1',state:candidate}:candidate;let warning='';
    if(backend==='indexedDB') {
      try { const db=await openDB();await new Promise((resolve,reject)=>{
        const tx=db.transaction(['data','snapshots'],'readwrite'),store=tx.objectStore('data'),q=store.get('state');let problem=null;
        q.onsuccess=()=>{try{const prior=q.result;let revision;try{revision=prior?H.withKnownBlocks(s,()=>migrate(prior)).revision:0;}catch(e){if(!options.recover){problem=error('已保存的数据无法校验，请恢复备份。','STORAGE_CORRUPT');tx.abort();return;}revision=expected;}
          if(revision!==expected){problem=error('另一窗口已更新进度，请先载入最新数据。','REVISION_CONFLICT');tx.abort();return;}
          if(pendingFallback){let current;try{current=host.localStorage.getItem(KEY);}catch(e){problem=error('无法核对备用数据，请导出备份后重试。','REVISION_CONFLICT');tx.abort();return;}if(current!==pendingFallback.raw){problem=error('另一页面已更新备用进度，请先重新载入。','REVISION_CONFLICT');tx.abort();return;}}
          if((options.snapshot||pendingFallback)&&prior)tx.objectStore('snapshots').put({id:'previous',savedAt:Date.now(),state:prior});
          if(pendingFallback)store.put(pendingFallback.raw,'consumedFallback');store.put(storedCandidate,'state');}catch(e){problem=e;try{tx.abort()}catch(_){reject(e)}}};
        tx.oncomplete=resolve;tx.onabort=()=>reject(problem||tx.error||error('保存未完成。'));tx.onerror=()=>{};
      });}catch(e){if(['REVISION_CONFLICT','STORAGE_CORRUPT'].includes(e.code))throw e;return {state:s,persistent:false,backend,warning:'浏览器未能保存本次更改。请导出备份后重试：'+e.message};}
    } else if(backend==='localStorage') {
      const write=()=>{if(resetting)fail('本机数据正在清除，请重新载入后继续。','RESET_IN_PROGRESS');const raw=host.localStorage.getItem(KEY);let prior=null;try{prior=raw?H.withKnownBlocks(s,()=>migrate(raw)):null;}catch(e){if(!options.recover)throw error('现有存档无法校验。','STORAGE_CORRUPT');}
        if((prior?.revision||0)!==expected)throw error('另一窗口已更新进度，请先载入最新数据。','REVISION_CONFLICT');
        if(options.snapshot&&prior)host.localStorage.setItem(KEY+'_SNAPSHOT',JSON.stringify({id:'previous',savedAt:Date.now(),state:prior}));host.localStorage.setItem(KEY,JSON.stringify(storedCandidate));};
      try{if(host.navigator?.locks?.request)await host.navigator.locks.request(KEY,write);else write();warning='使用浏览器备用存储，请定期导出备份。';}
      catch(e){if(['REVISION_CONFLICT','STORAGE_CORRUPT'].includes(e.code))throw e;return {state:s,persistent:false,backend,warning:'备用存储无法保存本次更改，请及时导出备份：'+e.message};}
    } else return {state:s,persistent:false,backend:'memory',warning:'本次仅临时使用，关闭页面前请导出备份。'};
    if(backend==='indexedDB'&&pendingFallback){try{if(host.localStorage.getItem(KEY)===pendingFallback.raw)host.localStorage.removeItem(KEY);}catch(_){}pendingFallback=null;}
    blocked=false;const notice={revision:candidate.revision,backend};emit(notice);channel?.postMessage(notice);return {state:candidate,persistent:true,backend,warning};
  }
  async function listSnapshots(){if(!backend)await load();if(backend==='indexedDB'){const db=await openDB();return new Promise((resolve,reject)=>{const q=db.transaction('snapshots','readonly').objectStore('snapshots').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}try{const raw=host.localStorage?.getItem(KEY+'_SNAPSHOT');return raw?[parse(raw)]:[];}catch(_){return [];}}
  async function restoreSnapshot(id,expectedRevision){const item=(await listSnapshots()).find(s=>s.id===id);if(!item)fail('恢复快照不存在。');const s=migrate(item.state);s.revision=expectedRevision;return save(s,{expectedRevision,snapshot:true,recover:true});}
  async function closeForReset(notify=true){resetting=true;if(notify)channel?.postMessage({resetting:true});const pending=dbPromise;dbPromise=null;if(pending){const db=await pending.catch(()=>null);db?.close();}}
  if(host.window===host){host.addEventListener?.('storage',e=>{if(e.key===KEY||e.key===null)emit({external:true,backend:'localStorage'});});if(host.BroadcastChannel){channel=new host.BroadcastChannel(KEY);channel.onmessage=e=>{if(e.data?.resetting)closeForReset(false);emit({...e.data,external:true});};}}
  return Object.freeze({VERSION,KEY,DB_NAME,fresh,validate,cloneForChange,migrate,previewImport,importEntries,renameDeck,reorderDeck,resetDeckProgress,deleteDeck,restoreDeck,editWord,deleteWord,addWord,restoreWord,exportBackup,load,save,subscribe,listSnapshots,restoreSnapshot,closeForReset});
});
