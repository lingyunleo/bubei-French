(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    let parser = null;
    try { parser = require('./legacy-parser.js'); } catch (_) { /* Core can validate backups independently. */ }
    module.exports = factory(parser);
  } else {
    root.VocabCore = factory(root.VocabParser || null);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Parser) {
  'use strict';

  const VERSION = 2;
  const DAY = 86400000;
  const MAX_WORDS = 5000;
  const MAX_DECKS = 100;
  const REVIEW_DAYS = [1, 3, 7, 14, 30, 60];
  const MODES = ['learn', 'speed'];
  const SPEED_STYLES = ['recall', 'spelling'];
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const TEXT_FIELDS = ['raw', 'french', 'meaning', 'pos', 'masc', 'fem', 'spell', 'phonetic', 'usage', 'example', 'exampleZh', 'source'];
  const DETAIL_FIELDS = {fullMeaning:['完整释义',50000], fullUsage:['完整用法',50000], originalMeaning:['原始释义',100000], originalNotes:['原始笔记',100000]};
  const wordIndexCache = new WeakMap();
  let sequence = 0;

  function fail(message) { throw new Error(message); }
  function plain(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  }
  function assertPlain(value, label) {
    if (!plain(value)) fail(label + '必须是对象。');
    for (const key of Object.keys(value)) {
      if (BAD_KEYS.has(key)) fail(label + '包含不安全的字段。');
    }
  }
  function number(value, label, min, max, integer) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      fail(label + '不是有效数字。');
    }
    return value;
  }
  function time(value, label, nullable) {
    if (nullable && value === null) return null;
    return number(value, label, 0, 8640000000000000, true);
  }
  function clock(now) { return time(now === undefined ? Date.now() : now, '时间', false); }
  function id(value, label) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value) || BAD_KEYS.has(value)) {
      fail(label + '无效。');
    }
    return value;
  }
  function string(value, label, max, required) {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(label + '无效或过长。');
    return value.normalize('NFC').trim();
  }
  function freshId(prefix, now, used) {
    let result;
    do {
      const random = typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2, 12) + '-' + (++sequence).toString(36);
      result = prefix + '-' + now.toString(36) + '-' + random;
    } while (used && used.has(result));
    return result;
  }
  function normalized(text) {
    return String(text || '').normalize('NFC').trim().toLocaleLowerCase('fr').replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  }
  function wordKey(word) {
    return Parser && typeof Parser.wordKey === 'function' ? Parser.wordKey(word) : normalized(word.french || word.spell || word.masc);
  }
  function cleanWord(input, requireId) {
    assertPlain(input, '词条');
    const out = {};
    out.id = requireId ? id(input.id, '词条 ID') : '';
    for (const field of TEXT_FIELDS) out[field] = string(input[field], '词条的 ' + field, field === 'meaning' || field === 'example' || field === 'exampleZh' || field === 'usage' ? 12000 : 2000, field === 'french' || field === 'meaning');
    for (const [field,[label,max]] of Object.entries(DETAIL_FIELDS)) {
      if (input[field] === undefined) continue;
      if (typeof input[field] !== 'string') fail(label + '必须是纯文本。');
      if (input[field].length > max) fail(label + '最多 ' + max + ' 个字符；内容未截断。');
      out[field] = input[field];
    }
    if (!out.exampleZh && typeof input.example_zh === 'string') out.exampleZh = string(input.example_zh, '例句翻译', 12000, false);
    if (input.hasGender !== undefined && typeof input.hasGender !== 'boolean') fail('阴阳性标记必须是布尔值。');
    if (input.practiceGender !== undefined && typeof input.practiceGender !== 'boolean') fail('双词形练习标记必须是布尔值。');
    if (input.needsConfirmation !== undefined && typeof input.needsConfirmation !== 'boolean') fail('确认标记必须是布尔值。');
    out.hasGender = input.hasGender === true;
    if (input.practiceGender !== undefined) out.practiceGender = input.practiceGender;
    out.needsConfirmation = input.needsConfirmation === true;
    if (out.hasGender && (!out.masc || !out.fem) && !out.needsConfirmation) fail('阴阳性词条必须提供完整的阳性和阴性形式。');
    if ((!out.hasGender || out.practiceGender === false) && !out.spell) out.spell = out.french;
    // Uncertain legacy forms stay editable, but an ordinary restored word must
    // satisfy the same answer rules as an import preview. The UI must block
    // needsConfirmation entries before presenting an answerable card.
    if (!out.needsConfirmation && Parser && typeof Parser.validateEntry === 'function') {
      const result = Parser.validateEntry(out);
      if (!result.valid) fail('词条「' + out.french + '」无效：' + result.errors.join('；'));
    }
    // Optional provenance travels with a word through edits, trash and backups.
    // Keep the literal CSV cell text; it is rendered as escaped text, never HTML.
    if (input.importedDictionary !== undefined) {
      const source = input.importedDictionary;
      assertPlain(source, '原始词典信息');
      if (source.kind !== 'eudic') fail('原始词典来源无效。');
      out.importedDictionary = {kind:'eudic'};
      for (const [field, max] of Object.entries({definition:100000, notes:100000, stars:100, ordinal:100})) {
        const value = source[field] === undefined && field !== 'definition' ? '' : source[field];
        if (typeof value !== 'string' || value.length > max || (field === 'definition' && !value.trim())) fail('原始词典的 ' + field + ' 无效或过长。');
        out.importedDictionary[field] = value;
      }
    }
    if (input.sourceRow !== undefined) out.sourceRow = number(input.sourceRow, '来源行号', 0, 1000000, true);
    else out.sourceRow = 0;
    if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.length > 100)) fail('词条提示无效。');
    out.warnings = (input.warnings || []).map(item => string(item, '词条提示', 2000, false));
    return out;
  }
  function initialWordState(mode) {
    return { stage: mode === 'speed' ? 3 : 1, attempts: 0, mistakes: 0, lastReviewedAt: null, dueAt: null, intervalDays: 0, reviewCount: 0, started: false, eligibleStep: 0 };
  }
  function createState(now) {
    clock(now);
    return { version: VERSION, revision: 0, activeDeckId: null, settings: { mode: 'learn', speedStyle: 'recall', studyDeckIds: [], batchSize: 10, voiceURI: '', rate: 0.88 }, decks: [] };
  }
  function ensureProgress(deck) {
    if (!plain(deck.progress)) deck.progress = {};
    for (const mode of MODES) {
      if (!plain(deck.progress[mode])) deck.progress[mode] = { words: {}, recent: [], step: 0 };
      const prog = deck.progress[mode];
      if (!plain(prog.words)) prog.words = {};
      if (!Array.isArray(prog.recent)) prog.recent = [];
      if (!Number.isInteger(prog.step) || prog.step < 0) prog.step = 0;
      const known = new Set(deck.words.map(word => word.id));
      for (const word of deck.words) {
        id(word.id, '词条 ID');
        if (!Object.prototype.hasOwnProperty.call(prog.words, word.id)) prog.words[word.id] = initialWordState(mode);
      }
      for (const key of Object.keys(prog.words)) if (!known.has(key)) delete prog.words[key];
      prog.recent = prog.recent.filter(key => known.has(key)).slice(-30);
    }
    return deck;
  }
  function prepareEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_WORDS) fail('词表需要包含 1–5000 个词条。');
    const seen = new Set();
    return entries.map(entry => {
      const word = cleanWord(entry, false);
      const key = wordKey(word);
      if (!key) fail('词条的法语内容不能为空。');
      if (seen.has(key)) fail('词表存在重复法语词条：' + word.french + '。请合并释义后再导入。');
      seen.add(key);
      return word;
    });
  }
  function createDeck(state, name, entries, now) {
    now = clock(now);
    if (state.decks.length >= MAX_DECKS) fail('最多保存 100 个词表。');
    const words = prepareEntries(entries);
    if (state.decks.reduce((n, deck) => n + deck.words.length, 0) + words.length > MAX_WORDS) fail('全部词表合计不能超过 5000 个词条。');
    const used = new Set();
    words.forEach(word => { word.id = freshId('w', now, used); used.add(word.id); });
    const deck = { id: freshId('d', now, new Set(state.decks.map(d => d.id))), name: string(name || '新词表', '词表名称', 200, true), createdAt: now, updatedAt: now, words, progress: {} };
    ensureProgress(deck);
    const studyDeckIds = selectedDecks(state).map(item => item.id);
    state.decks.push(deck);
    state.settings.studyDeckIds = studyDeckIds.concat(deck.id);
    state.activeDeckId = deck.id;
    state.revision += 1;
    return deck;
  }
  function mergeDeck(state, deckId, entries, options, now) {
    now = clock(now);
    options = options || {};
    const deck = state.decks.find(item => item.id === deckId);
    if (!deck) fail('找不到需要更新的词表。');
    const incoming = prepareEntries(entries);
    const existing = new Map(deck.words.map(word => [wordKey(word), word]));
    const incomingKeys = new Set(incoming.map(wordKey));
    const kept = options.replace ? deck.words.filter(word => incomingKeys.has(wordKey(word))) : deck.words;
    const added = incoming.filter(word => !existing.has(wordKey(word))).length;
    const finalSize = kept.length + added;
    const otherSize = state.decks.reduce((n, item) => n + (item.id === deckId ? 0 : item.words.length), 0);
    if (otherSize + finalSize > MAX_WORDS) fail('全部词表合计不能超过 5000 个词条。');
    const nextName = options.name === undefined ? deck.name : string(options.name, '词表名称', 200, true);
    const used = new Set(deck.words.map(word => word.id));
    const updates = new Map();
    let updated = 0;
    for (const word of incoming) {
      const old = existing.get(wordKey(word));
      word.id = old ? old.id : freshId('w', now, used);
      used.add(word.id);
      if (old) {
        // Enriching learning fields with a normal CSV must not discard the
        // attached dictionary original; a fresh Assistant export can replace it.
        if (!word.importedDictionary && old.importedDictionary) word.importedDictionary = {...old.importedDictionary};
        for (const field of Object.keys(DETAIL_FIELDS)) if (word[field] === undefined && old[field] !== undefined) word[field] = old[field];
        if (word.practiceGender === undefined && old.practiceGender !== undefined) word.practiceGender = old.practiceGender;
        const comparable = object => TEXT_FIELDS.map(field => object[field] || '').concat(Object.keys(DETAIL_FIELDS).map(field => object[field] === undefined ? null : object[field]), [!!object.hasGender, object.practiceGender === undefined ? null : object.practiceGender, !!object.needsConfirmation, object.importedDictionary || null]);
        if (JSON.stringify(comparable(old)) !== JSON.stringify(comparable(word))) updated += 1;
      }
      updates.set(wordKey(word), word);
    }
    const nextWords = kept.map(word => updates.get(wordKey(word)) || word);
    for (const word of incoming) if (!existing.has(wordKey(word))) nextWords.push(word);
    const removed = deck.words.length - kept.length;
    deck.words = nextWords;
    deck.name = nextName;
    deck.updatedAt = now;
    ensureProgress(deck);
    state.revision += 1;
    return { added, updated, removed };
  }
  function checkedMode(mode) { if (!MODES.includes(mode)) fail('学习模式无效。'); return mode; }
  function checkedSpeedStyle(style) {
    if (style === undefined) return 'recall';
    if (!SPEED_STYLES.includes(style)) fail('速刷方式无效。');
    return style;
  }
  function knownWordIds(deck) {
    let cached = wordIndexCache.get(deck);
    if (!cached || cached.words !== deck.words || cached.length !== deck.words.length) {
      cached = { words: deck.words, length: deck.words.length, ids: new Set(deck.words.map(word => word.id)) };
      wordIndexCache.set(deck, cached);
    }
    return cached.ids;
  }
  function wordStatus(deck, mode, wordId) {
    checkedMode(mode);
    if (!knownWordIds(deck).has(wordId)) fail('找不到词条进度。');
    if (!plain(deck.progress) || !plain(deck.progress[mode]) || !plain(deck.progress[mode].words) || !Object.prototype.hasOwnProperty.call(deck.progress[mode].words, wordId)) ensureProgress(deck);
    const result = deck.progress[mode].words[wordId];
    if (!result) fail('找不到词条进度。');
    return result;
  }
  function pickNext(deck, mode, settings, now) {
    now = clock(now);
    checkedMode(mode);
    ensureProgress(deck);
    const prog = deck.progress[mode];
    const spellingOnly = mode === 'speed' && checkedSpeedStyle(settings ? settings.speedStyle : undefined) === 'spelling';
    const batchSize = Math.max(1, Math.min(100, Number(settings && settings.batchSize) || 10));
    const activeCount = deck.words.filter(word => prog.words[word.id].started && prog.words[word.id].stage < 5).length;
    const recent = prog.recent;
    const lastId = recent.length ? recent[recent.length - 1] : null;
    const choices = [];
    deck.words.forEach((word, index) => {
      const status = prog.words[word.id];
      if (status.stage === 5) {
        if (status.dueAt !== null && status.dueAt <= now) choices.push({ word, status, index, tier: 0, isReview: true });
      } else if (status.started) {
        choices.push({ word, status, index, tier: status.eligibleStep <= prog.step && (status.dueAt === null || status.dueAt <= now) ? 1 : 3, isReview: false });
      } else if (activeCount < batchSize) choices.push({ word, status, index, tier: 2, isReview: false });
    });
    if (!choices.length) return null;
    let candidates = choices;
    const notImmediate = candidates.filter(item => item.word.id !== lastId);
    if (notImmediate.length) candidates = notImmediate;
    const due = candidates.filter(item => item.isReview);
    if (due.length) candidates = due;
    else {
      const ready = candidates.filter(item => item.tier < 3);
      if (ready.length) candidates = ready;
      const recentIds = recent.slice(-Math.min(4, Math.floor(batchSize)));
      const notRecent = candidates.filter(item => !recentIds.includes(item.word.id));
      if (notRecent.length) candidates = notRecent;
    }
    candidates.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.isReview && a.status.dueAt !== b.status.dueAt) return a.status.dueAt - b.status.dueAt;
      const ar = recent.lastIndexOf(a.word.id), br = recent.lastIndexOf(b.word.id);
      if (ar !== br) return ar - br;
      return (a.status.lastReviewedAt || 0) - (b.status.lastReviewedAt || 0) || a.index - b.index;
    });
    const next = candidates[0];
    let reason = next.isReview ? '这个词已到复习时间。' : next.status.started ? '继续完成已开始的词条。' : '开始一个新词条。';
    if (next.word.id === lastId) reason += ' 当前只有这个词可练习，可能连续出现；也可以稍后再来。';
    return { word: next.word, stage: next.isReview || spellingOnly ? 4 : next.status.stage, isReview: next.isReview, reason };
  }
  function commitAnswer(deck, mode, wordId, answer, now) {
    now = clock(now);
    const status = wordStatus(deck, mode, wordId);
    assertPlain(answer, '答题结果');
    const kind = answer.kind;
    if (!['correct', 'vague', 'wrong', 'assisted', 'familiar'].includes(kind)) fail('答题结果无效。');
    const stage = answer.stage === undefined ? (status.stage === 5 ? 4 : status.stage) : answer.stage;
    if (![1, 2, 3, 4].includes(stage) || (mode === 'speed' && stage < 3)) fail('答题阶段无效。');
    const isReview = answer.isReview === true;
    // Spelling-only speed practice presents stage 3 words as stage 4 without
    // changing stored progress until an answer is committed.
    const directSpelling = mode === 'speed' && answer.speedStyle === 'spelling' && stage === 4 && status.stage === 3 && !isReview;
    // A stale card must never overwrite a later manual stage change.
    if (kind !== 'familiar' && ((isReview && status.stage !== 5 && status.stage !== 4) || (!isReview && status.stage !== stage && !directSpelling))) {
      fail('词条进度已改变，请重新打开当前题目。');
    }
    if (kind !== 'familiar' && isReview && status.stage === 5 && status.dueAt !== null && status.dueAt > now) {
      fail('这道复习题已经完成或尚未到期，请继续下一题。');
    }
    const prog = deck.progress[mode];
    const wasReview = isReview || status.reviewCount > 0;
    prog.step += 1;
    status.started = true;
    status.attempts += 1;
    if (kind === 'wrong') status.mistakes += 1;
    status.lastReviewedAt = now;
    status.eligibleStep = prog.step + 2;
    status.dueAt = null;
    if (kind === 'familiar') {
      status.stage = 4;
    } else if (stage === 4) {
      if (kind === 'correct') {
        status.stage = 5;
        status.reviewCount = wasReview ? status.reviewCount + 1 : 1;
        status.intervalDays = REVIEW_DAYS[Math.min(status.reviewCount - 1, REVIEW_DAYS.length - 1)];
        status.dueAt = Math.min(now + status.intervalDays * DAY, 8640000000000000);
      } else {
        status.stage = 4;
        status.intervalDays = 0;
        status.reviewCount = 0;
        status.dueAt = Math.min(now + 60000, 8640000000000000);
      }
    } else if (stage === 1) {
      status.stage = kind === 'correct' ? 2 : 1;
    } else if (stage === 2) {
      status.stage = kind === 'correct' ? 3 : kind === 'vague' ? 2 : 1;
    } else {
      status.stage = kind === 'correct' ? 4 : mode === 'speed' ? 3 : kind === 'vague' ? 2 : 1;
    }
    prog.recent.push(wordId);
    prog.recent = prog.recent.slice(-30);
    deck.updatedAt = now;
    return status;
  }
  function stats(deck, mode, now) {
    now = clock(now);
    checkedMode(mode);
    ensureProgress(deck);
    const result = { total: deck.words.length, counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, due: 0, inProgress: 0, passed: 0, nextDueAt: null };
    for (const word of deck.words) {
      const status = deck.progress[mode].words[word.id];
      result.counts[status.stage] += 1;
      if (status.stage < 5 && status.started) result.inProgress += 1;
      if (status.stage === 5) {
        result.passed += 1;
        if (status.dueAt !== null && status.dueAt <= now) result.due += 1;
        if (status.dueAt !== null && (result.nextDueAt === null || status.dueAt < result.nextDueAt)) result.nextDueAt = status.dueAt;
      }
    }
    return result;
  }
  function selectedDecks(state) {
    const selected = new Set(Array.isArray(state.settings.studyDeckIds) ? state.settings.studyDeckIds : state.activeDeckId ? [state.activeDeckId] : []);
    return state.decks.filter(deck => selected.has(deck.id));
  }
  function studyStats(state, mode, now) {
    mode = checkedMode(mode === undefined ? state.settings.mode : mode);
    now = clock(now);
    const decks = selectedDecks(state);
    const result = { total: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, due: 0, inProgress: 0, passed: 0, nextDueAt: null, attempts: 0, deckCount: decks.length };
    for (const deck of decks) {
      const item = stats(deck, mode, now);
      for (const key of ['total', 'due', 'inProgress', 'passed']) result[key] += item[key];
      for (const stage of [1, 2, 3, 4, 5]) result.counts[stage] += item.counts[stage];
      if (item.nextDueAt !== null && (result.nextDueAt === null || item.nextDueAt < result.nextDueAt)) result.nextDueAt = item.nextDueAt;
      for (const word of deck.words) result.attempts += deck.progress[mode].words[word.id].attempts;
    }
    return result;
  }
  function pickNextAcross(state, now, lastWordId) {
    now = clock(now);
    const mode = checkedMode(state.settings.mode);
    const spellingOnly = mode === 'speed' && checkedSpeedStyle(state.settings.speedStyle) === 'spelling';
    const batchSize = Math.max(1, Math.min(100, Number(state.settings.batchSize) || 10));
    const entries = [];
    selectedDecks(state).forEach((deck, deckIndex) => {
      const prog = deck.progress && deck.progress[mode];
      const recent = prog && Array.isArray(prog.recent) ? prog.recent : [];
      const step = prog && Number.isInteger(prog.step) ? prog.step : 0;
      let deckReviewedAt = 0;
      const local = deck.words.map((word, index) => {
        const status = prog && prog.words && prog.words[word.id] || initialWordState(mode);
        deckReviewedAt = Math.max(deckReviewedAt, status.lastReviewedAt || 0);
        return { deckId: deck.id, deckIndex, word, index, status, step, recentIndex: recent.lastIndexOf(word.id) };
      });
      for (const entry of local) entries.push(Object.assign(entry, { deckReviewedAt }));
    });
    const activeCount = entries.filter(item => item.status.started && item.status.stage < 5).length;
    const reviewed = entries.filter(item => item.status.lastReviewedAt !== null).sort((a, b) =>
      b.status.lastReviewedAt - a.status.lastReviewedAt || b.recentIndex - a.recentIndex || b.deckIndex - a.deckIndex);
    const lastId = lastWordId === undefined ? (reviewed[0] && reviewed[0].word.id) : lastWordId;
    const choices = [];
    for (const item of entries) {
      const status = item.status;
      if (status.stage === 5) {
        if (status.dueAt !== null && status.dueAt <= now) choices.push(Object.assign({}, item, { tier: 0, isReview: true }));
      } else if (status.started) {
        choices.push(Object.assign({}, item, { tier: status.eligibleStep <= item.step && (status.dueAt === null || status.dueAt <= now) ? 1 : 3, isReview: false }));
      } else if (activeCount < batchSize) choices.push(Object.assign({}, item, { tier: 2, isReview: false }));
    }
    if (!choices.length) return null;
    // Due reviews take precedence across all selected decks. Avoiding an
    // immediate repeat only chooses among those reviews, never postpones them.
    const due = choices.filter(item => item.isReview);
    let candidates = due.length ? due : choices;
    const notImmediate = candidates.filter(item => item.word.id !== lastId);
    if (notImmediate.length) candidates = notImmediate;
    if (!due.length) {
      const ready = candidates.filter(item => item.tier < 3);
      if (ready.length) candidates = ready;
      const recentIds = new Set(reviewed.slice(0, Math.min(4, Math.floor(batchSize))).map(item => item.word.id));
      const notRecent = candidates.filter(item => !recentIds.has(item.word.id));
      if (notRecent.length) candidates = notRecent;
    }
    candidates.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.isReview && a.status.dueAt !== b.status.dueAt) return a.status.dueAt - b.status.dueAt;
      return (a.status.lastReviewedAt || 0) - (b.status.lastReviewedAt || 0) || a.deckReviewedAt - b.deckReviewedAt || a.index - b.index || a.deckIndex - b.deckIndex;
    });
    const next = candidates[0];
    let reason = next.isReview ? '这个词已到复习时间。' : next.status.started ? '继续完成已开始的词条。' : '开始一个新词条。';
    if (next.word.id === lastId) reason += ' 当前只有这个词可练习，可能连续出现；也可以稍后再来。';
    return { deckId: next.deckId, word: next.word, stage: next.isReview || spellingOnly ? 4 : next.status.stage, isReview: next.isReview, reason };
  }
  function validateWordState(input, mode) {
    assertPlain(input, '词条进度');
    const stage = number(input.stage, '学习阶段', mode === 'speed' ? 3 : 1, 5, true);
    if (typeof input.started !== 'boolean') fail('开始学习标记无效。');
    const result = {
      stage,
      attempts: number(input.attempts, '答题次数', 0, Number.MAX_SAFE_INTEGER, true),
      mistakes: number(input.mistakes, '错误次数', 0, Number.MAX_SAFE_INTEGER, true),
      lastReviewedAt: time(input.lastReviewedAt, '最近练习时间', true),
      dueAt: time(input.dueAt, '下次复习时间', true),
      intervalDays: number(input.intervalDays, '复习间隔', 0, 36500, false),
      reviewCount: number(input.reviewCount, '连续通过次数', 0, Number.MAX_SAFE_INTEGER, true),
      started: input.started,
      eligibleStep: number(input.eligibleStep, '题目间隔', 0, Number.MAX_SAFE_INTEGER, true)
    };
    if (result.mistakes > result.attempts) fail('错误次数不能超过答题次数。');
    if (result.dueAt !== null && result.lastReviewedAt !== null && result.dueAt < result.lastReviewedAt) fail('复习时间早于最近练习时间。');
    if (stage === 5 && (result.dueAt === null || !result.started || result.reviewCount < 1 || result.intervalDays <= 0)) fail('已通过词条缺少复习安排。');
    if (!result.started && (result.attempts > 0 || stage !== (mode === 'speed' ? 3 : 1))) fail('未开始词条的进度不一致。');
    return result;
  }
  function validateState(input) {
    assertPlain(input, '备份');
    if (input.version !== VERSION) fail('备份版本不支持，请选择本网站导出的第 2 版完整备份。');
    const output = createState();
    output.revision = number(input.revision, '保存版本', 0, Number.MAX_SAFE_INTEGER, true);
    assertPlain(input.settings, '设置');
    output.settings = {
      mode: checkedMode(input.settings.mode),
      speedStyle: checkedSpeedStyle(input.settings.speedStyle),
      batchSize: number(input.settings.batchSize, '同时学习词数', 1, 100, true),
      voiceURI: string(input.settings.voiceURI, '语音设置', 2000, false),
      rate: number(input.settings.rate, '朗读速度', 0.5, 1.5, false)
    };
    if (!Array.isArray(input.decks) || input.decks.length > MAX_DECKS) fail('备份的词表列表无效。');
    const ids = new Set(), allWordIds = new Set();
    let total = 0;
    output.decks = input.decks.map(source => {
      assertPlain(source, '词表');
      const deckId = id(source.id, '词表 ID');
      if (ids.has(deckId)) fail('备份包含重复词表 ID。');
      ids.add(deckId);
      if (!Array.isArray(source.words) || source.words.length > MAX_WORDS) fail('备份的词条列表无效。');
      total += source.words.length;
      if (total > MAX_WORDS) fail('备份最多包含 5000 个词条。');
      const wordIds = new Set(), wordKeys = new Set();
      const words = source.words.map(item => {
        const word = cleanWord(item, true);
        if (wordIds.has(word.id) || allWordIds.has(word.id)) fail('备份包含重复词条 ID。');
        const key = wordKey(word);
        if (wordKeys.has(key)) fail('备份词表包含重复法语词条。');
        wordIds.add(word.id); allWordIds.add(word.id); wordKeys.add(key);
        return word;
      });
      const deck = { id: deckId, name: string(source.name, '词表名称', 200, true), createdAt: time(source.createdAt, '词表创建时间', false), updatedAt: time(source.updatedAt, '词表更新时间', false), words, progress: {} };
      if (deck.updatedAt < deck.createdAt) fail('词表更新时间早于创建时间。');
      assertPlain(source.progress, '学习进度');
      for (const mode of MODES) {
        const src = source.progress[mode];
        assertPlain(src, '模式进度'); assertPlain(src.words, '词条进度列表');
        if (Object.keys(src.words).length !== words.length) fail('备份的词条和进度数量不一致。');
        const clean = { words: {}, recent: [], step: number(src.step, '练习题数', 0, Number.MAX_SAFE_INTEGER, true) };
        for (const key of Object.keys(src.words)) {
          if (!wordIds.has(key)) fail('备份包含不属于此词表的进度。');
          clean.words[key] = validateWordState(src.words[key], mode);
        }
        if (!Array.isArray(src.recent) || src.recent.length > 30 || src.recent.some(key => typeof key !== 'string' || !wordIds.has(key))) fail('最近练习记录无效。');
        clean.recent = src.recent.slice();
        deck.progress[mode] = clean;
      }
      return deck;
    });
    if (input.activeDeckId !== null && (!ids.has(input.activeDeckId) || typeof input.activeDeckId !== 'string')) fail('当前词表不存在。');
    output.activeDeckId = input.activeDeckId;
    const studyDeckIds = input.settings.studyDeckIds === undefined ? (output.activeDeckId ? [output.activeDeckId] : []) : input.settings.studyDeckIds;
    if (!Array.isArray(studyDeckIds) || studyDeckIds.length > MAX_DECKS || studyDeckIds.some(deckId => typeof deckId !== 'string' || !ids.has(deckId)) || new Set(studyDeckIds).size !== studyDeckIds.length) fail('学习词表选择无效，请选择现有词表且不要重复。');
    output.settings.studyDeckIds = studyDeckIds.slice();
    return output;
  }
  function exportBackup(state) { return validateState(state); }
  function importBackup(input) {
    if (typeof input === 'string') {
      if (input.length > 20000000) fail('备份文件过大。');
      try { input = JSON.parse(input); } catch (_) { fail('备份不是有效的 JSON 文件。'); }
    }
    return validateState(input);
  }
  function migrateLegacy(raw, now) {
    now = clock(now);
    assertPlain(raw, '旧版数据');
    const read = (key, fallback) => {
      if (raw[key] === undefined || raw[key] === null) return fallback;
      if (typeof raw[key] === 'string') {
        try { return JSON.parse(raw[key]); } catch (_) { fail('旧版数据无法读取：' + key); }
      }
      return raw[key];
    };
    const vocabulary = read('UNIVERSAL_FR_CURRENT_VOCAB_V1', raw.words || raw.vocab || []);
    if (!Array.isArray(vocabulary) || !vocabulary.length) return null;
    const state = createState(now);
    const entries = vocabulary.map(word => {
      assertPlain(word, '旧版词条');
      return Object.assign({}, word, { needsConfirmation: word.hasGender === true, exampleZh: word.exampleZh || word.example_zh || '', source: word.source || '从旧版迁移；请核对原例句和阴性形式' });
    });
    const deck = createDeck(state, '从旧版迁移的词表', entries, now);
    const config = read('UNIVERSAL_FR_VOCAB_CONFIG_V1', raw.config || {});
    if (plain(config) && MODES.includes(config.currentMode)) state.settings.mode = config.currentMode;
    for (const mode of MODES) {
      const old = read(mode === 'learn' ? 'UNIVERSAL_FR_PROGRESS_LEARN_V1' : 'UNIVERSAL_FR_PROGRESS_SPEED_V1', mode === 'learn' ? raw.learn || {} : raw.speed || {});
      if (!plain(old) || !plain(old.words)) continue;
      vocabulary.forEach((word, index) => {
        const prior = Object.prototype.hasOwnProperty.call(old.words, word.id) ? old.words[word.id] : null;
        if (!plain(prior) || !Number.isInteger(prior.stage) || prior.stage < (mode === 'speed' ? 3 : 1) || prior.stage > 5) return;
        const status = deck.progress[mode].words[deck.words[index].id];
        status.stage = prior.stage;
        status.started = prior.stage !== (mode === 'speed' ? 3 : 1);
        if (prior.stage === 5) {
          status.lastReviewedAt = now;
          status.dueAt = now;
          status.reviewCount = 1;
          status.intervalDays = 1;
        }
      });
    }
    return validateState(state);
  }
  return { VERSION, DAY, MAX_WORDS, REVIEW_DAYS: REVIEW_DAYS.slice(), createState, createDeck, mergeDeck, ensureProgress, pickNext, pickNextAcross, selectedDecks, studyStats, commitAnswer, stats, wordKey, wordStatus, validateWord:input=>cleanWord(input,true), validateState, exportBackup, importBackup, migrateLegacy };
}));
