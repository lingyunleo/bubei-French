/* VocabEngine 4.6 — application learning workflow. Scheduler: ts-fsrs 5.4.2 (MIT).
 * Core FSRS ratings are recorded only for independent meaning recall. Choice,
 * spelling and listening practice have separate events. All dates serialize as ms.
 * Legacy bootstrap policy: retain earliest valid due date across modes; at first
 * real recall, estimate 90%-stability from the corresponding legacy interval and
 * use FSRS default Good difficulty. This is marked as an estimate, not history.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/fsrs.umd.js'), require('./history.js'));
  else root.VocabEngine = factory(root.FSRS, root.VocabHistory);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (FSRS,H) {
  'use strict';
  const DAY = 86400000;
  const VERSION = 4;
  const DEFAULTS = { dailyGoal: 20, dailyGoalEnabled: true, newBatch: 10, reviewBatch: 20, studyDeckIds: [], retention: 0.9, listening: false };
  const BAD_IDS = new Set(['__proto__', 'constructor', 'prototype']);
  let sequence = 0;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + (++sequence).toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function time(now) { const t = now === undefined ? Date.now() : Number(now); if (!Number.isFinite(t) || t < 0 || t > 8640000000000000) throw new Error('Invalid time'); return t; }
  function validTime(t) { return typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= 8640000000000000; }
  function safeId(id) { return typeof id === 'string' && id && !BAD_IDS.has(id); }
  function clamp(n, lo, hi, fallback) { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; }
  function normalize(value) { return String(value || '').normalize('NFC').toLocaleLowerCase('fr').replace(/[’‘ʼ]/g, "'").replace(/[‐‑]/g, '-').replace(/\s+/g, ' ').trim(); }
  function noAccent(value) { return normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function usesGenderPractice(word) { return !!(word && word.hasGender && word.masc && word.fem && word.practiceGender !== false); }
  function contentVersion(word, aliases) {
    const text = value => String(value == null ? '' : value).normalize('NFC');
    const fields = ['french', 'meaning', 'pos', 'masc', 'fem', 'spell'].map(key => text(word[key]));
    fields.push(usesGenderPractice(word), [...new Set((aliases || []).map(text))].sort());
    const payload = JSON.stringify(fields);
    // A stable content identifier, not a security signature. Dates and property
    // insertion order must not make identical answer content look different.
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < payload.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(payload.charCodeAt(i))) * 0x100000001b3n);
    return 'cv1:' + hash.toString(16).padStart(16, '0');
  }
  function dayKey(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nextDay(t) { const d = new Date(t); d.setDate(d.getDate() + 1); return d.getTime(); }
  function createState(now) { return { version: VERSION, revision: 0, createdAt: time(now), settings: clone(DEFAULTS), decks: [], cards: {}, skills: {}, aliases: {}, events: [], session: null }; }
  function allWords(state) {
    const result = []; const used = new Set();
    for (const deck of state.decks || []) for (const word of deck.words || []) {
      if (safeId(word.id) && !used.has(word.id)) { result.push({word, deck, deckId: deck.id}); used.add(word.id); }
    }
    return result;
  }
  function find(state, id) { return allWords(state).find(x => x.word.id === id) || null; }
  function selected(state) {
    const ids = Array.isArray(state.settings.studyDeckIds) ? state.settings.studyDeckIds : [];
    return allWords(state).filter(x => ids.includes(x.deckId) && !x.word.needsConfirmation);
  }
  function sessionMatchesScope(state) {
    const session = state && state.session;
    if (!session || !Array.isArray(session.wordIds)) return false;
    const current = state.settings && state.settings.studyDeckIds;
    if (!Array.isArray(current) || current.some(id => !safeId(id))) return false;
    const selectedIds = new Set(current), byWord = new Map(allWords(state).map(x => [x.word.id, x.deckId]));
    // Even an apparently matching saved scope must not resume words from a
    // removed/unselected deck. Empty selections never mean "all decks".
    if (session.wordIds.some(id => !byWord.has(id) || !selectedIds.has(byWord.get(id)))) return false;
    let scope = session.scopeDeckIds;
    if (scope === undefined || scope === null) {
      // Older saves have no explicit scope. A batch cannot prove that other
      // decks were selected, so resume only if its inferred deck set matches
      // the current selection exactly; otherwise preserve results and rebuild.
      scope = session.wordIds.map(id => byWord.get(id));
    }
    if (!Array.isArray(scope) || scope.some(id => !safeId(id))) return false;
    const savedIds = new Set(scope);
    return savedIds.size === selectedIds.size && [...savedIds].every(id => selectedIds.has(id));
  }
  function oldStatus(deck, wordId) {
    const raw = {}, schedules = []; let started = false;
    for (const mode of ['learn', 'speed']) {
      const old = deck.progress && deck.progress[mode] && deck.progress[mode].words && deck.progress[mode].words[wordId];
      if (!old || typeof old !== 'object') continue;
      raw[mode] = clone(old); started = started || old.started === true || Number(old.attempts) > 0;
      if (validTime(old.dueAt)) schedules.push({mode, dueAt: old.dueAt, intervalDays: clamp(old.intervalDays, 1, 36500, 1), lastReviewedAt: validTime(old.lastReviewedAt) && old.lastReviewedAt <= old.dueAt ? old.lastReviewedAt : null, reviewCount: Math.max(0, Number(old.reviewCount) || 0)});
    }
    schedules.sort((a, b) => a.dueAt - b.dueAt);
    return {raw, started, schedule: schedules[0] || null};
  }
  function validateRuntime(state) {
    const known = new Set(allWords(state).map(x => x.word.id));
    const issue = () => { throw new Error('学习任务记录无效，请保留原备份并重新导入。'); };
    // Backups are untrusted input, including cached summaries and undo snapshots.
    function summary(value) {
      if (value == null) return;
      if (typeof value !== 'object' || Array.isArray(value) || !['learn','review','spelling','dictation'].includes(value.kind)) issue();
      for (const key of ['total','completed','deferred','answers']) if (!Number.isSafeInteger(value[key]) || value[key] < 0) issue();
      for (const key of ['wordIds','completedIds','failedIds','mistakeIds']) if (!Array.isArray(value[key]) || value[key].some(id => !safeId(id)) || new Set(value[key]).size !== value[key].length) issue();
      const ids = new Set(value.wordIds);
      for (const key of ['completedIds','failedIds','mistakeIds']) if (value[key].some(id => !ids.has(id))) issue();
      if (value.total !== value.wordIds.length || value.completed !== value.completedIds.length || value.deferred !== value.failedIds.length) issue();
      if (value.rounds !== undefined && (!Number.isSafeInteger(value.rounds) || value.rounds < 1)) issue();
    }
    function session(s, isUndo) {
      if (!s || typeof s !== 'object' || !safeId(s.id) || !['learn','review','spelling','dictation'].includes(s.kind) || !Number.isInteger(s.step) || s.step < 0 || !Number.isInteger(s.answers) || s.answers < 0 || typeof s.done !== 'boolean') issue();
      for (const key of ['wordIds','completedIds','failedIds','mistakeIds']) if (!Array.isArray(s[key]) || s[key].some(id => !known.has(id)) || new Set(s[key]).size !== s[key].length) issue();
      const batch = new Set(s.wordIds);
      for (const key of ['completedIds','failedIds','mistakeIds']) if (s[key].some(id => !batch.has(id))) issue();
      if (!Array.isArray(s.queue) || !s.failures || typeof s.failures !== 'object') issue();
      if (s.round !== undefined || s.roundWordIds !== undefined || s.retryIds !== undefined) {
        if (!['spelling','dictation'].includes(s.kind) || !Number.isSafeInteger(s.round) || s.round < 1) issue();
        for (const key of ['roundWordIds','retryIds']) if (!Array.isArray(s[key]) || s[key].some(id => !batch.has(id)) || new Set(s[key]).size !== s[key].length) issue();
        if (s.retryIds.some(id => s.completedIds.includes(id))) issue();
      }
      for (const [id,n] of Object.entries(s.failures)) if (!batch.has(id) || !Number.isSafeInteger(n) || n < 0 || (!['spelling','dictation'].includes(s.kind) && n > 3)) issue();
      function entry(e, active) {
        if (!e || !batch.has(e.wordId) || !['choice','listening-choice','recall','exposure','spelling','dictation'].includes(e.task) || !Number.isInteger(e.readyAfter) || e.readyAfter < 0) issue();
        if (e.correction !== undefined && typeof e.correction !== 'boolean') issue();
        if (active && (!safeId(e.token) || !['question','revealed','answered'].includes(e.phase) || typeof e.revealed !== 'boolean' || typeof e.answered !== 'boolean' || typeof e.assisted !== 'boolean' || !Array.isArray(e.choices))) issue();
        if (active && e.choices.some(x => !x || typeof x.id !== 'string' || typeof x.text !== 'string')) issue();
      }
      for (const e of s.queue) entry(e, false);
      if (s.current) entry(s.current, true);
      if (!s.done && !s.current) issue();
      summary(s.summary);
      if (s.undo && !isUndo) {
        if (!known.has(s.undo.wordId) || !Number.isInteger(s.undo.eventsLength) || s.undo.eventsLength < 0 || s.undo.eventsLength > state.events.length) issue();
        session(s.undo.session, true);
      }
    }
    if (state.session !== null && state.session !== undefined) session(state.session, false);
    summary(state.lastSummary);
    return state;
  }
  function ensureState(state, now) {
    time(now);
    if (!state || typeof state !== 'object' || !Array.isArray(state.decks)) throw new Error('Invalid vocabulary state');
    state.settings = Object.assign({}, clone(DEFAULTS), state.settings || {});
    for (const key of ['cards', 'skills', 'aliases']) if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
    if (!Array.isArray(state.events)) state.events = [];
    if (state.session === undefined) state.session = null;
    for (const {word, deck} of allWords(state)) if (!Object.prototype.hasOwnProperty.call(state.cards, word.id)) {
      const old = oldStatus(deck, word.id);
      state.cards[word.id] = { wordId: word.id, acquired: !!old.schedule, started: old.started || !!old.schedule, dueAt: old.schedule ? old.schedule.dueAt : null, fsrs: null, legacyPending: old.schedule, legacyRaw: old.raw, acquisitionStage: old.started ? 'recall' : 'choice' };
    }
    validateRuntime(state);
    const undoSession=state.session?.undo?.session;
    const needsUpgrade=session=>session&&!session.done&&['spelling','dictation'].includes(session.kind)&&(session.round===undefined||[session.current,...session.queue].some(e=>e&&['spelling','dictation'].includes(e.task)&&e.correction===undefined));
    // Only legacy session conversion needs full history. An independent pass
    // may predate the active tail, including inside an old undo snapshot.
    if(needsUpgrade(state.session)||needsUpgrade(undoSession)){
      const events=H.allEvents(state),offset=H.archivedCount(state);
      if(needsUpgrade(state.session))upgradePracticeSession(state.session,events);
      if(needsUpgrade(undoSession))upgradePracticeSession(undoSession,events.slice(0,offset+(state.session?.undo?.eventsLength||0)));
    }
    return state;
  }
  function upgradePracticeSession(session, events) {
    if (!session || session.done || !['spelling','dictation'].includes(session.kind)) return;
    const mistakes = new Set(session.mistakeIds);
    const independent = new Set((events || []).filter(e => e.sessionId === session.id && e.correct && !e.assisted && (e.independent === true || e.correction === false)).map(e => e.wordId));
    for (const entry of [session.current, ...session.queue]) {
      // Older entries have no correction field. Keep an already exposed word
      // as correction rather than misrepresenting it as independent recall.
      if (!entry || entry.correction !== undefined || !['spelling','dictation'].includes(entry.task)) continue;
      entry.correction = mistakes.has(entry.wordId) && !independent.has(entry.wordId);
      if (entry.correction) entry.readyAfter = Math.min(entry.readyAfter, session.step);
    }
    if (session.round !== undefined) return;
    session.round = 1;
    session.roundWordIds = session.wordIds.slice();
    session.retryIds = session.failedIds.slice();
    // An unfinished older group may have called a copied correction complete.
    // Keep real independent passes; revisit corrected-only words next round.
    session.completedIds = session.completedIds.filter(id => {
      if (!mistakes.has(id) || independent.has(id)) return true;
      addUnique(session.retryIds, id); return false;
    });
    session.failedIds = [];
    for (const entry of [session.current, ...session.queue]) if (entry?.correction && !session.completedIds.includes(entry.wordId)) addUnique(session.retryIds, entry.wordId);
    const c = session.current;
    if (c?.answered && c.feedback && ['spelling','dictation'].includes(c.task)) {
      const passed = c.feedback.correct && !c.assisted && !c.correction;
      if (passed) {
        addUnique(session.completedIds, c.wordId);
        session.retryIds = session.retryIds.filter(id => id !== c.wordId);
        c.feedback = {...c.feedback, independent:true, passed:true, next:'complete'};
      } else {
        session.completedIds = session.completedIds.filter(id => id !== c.wordId);
        addUnique(session.retryIds, c.wordId);
        c.feedback = {...c.feedback, independent:false, passed:false, next:c.feedback.correct && c.correction ? 'round-retry' : 'retry'};
      }
    }
    // A legacy delayed retry must remain reachable even in a one-word group.
    const queued = new Set();
    session.queue = session.queue.filter(entry => {
      if (entry.wordId === c?.wordId || session.completedIds.includes(entry.wordId) || queued.has(entry.wordId)) return false;
      queued.add(entry.wordId); entry.readyAfter = Math.min(entry.readyAfter, session.step); return true;
    });
    session.retryIds = session.retryIds.filter(id => !session.completedIds.includes(id));
  }
  function migrateLegacy(old, now) {
    const state = createState(now);
    state.decks = clone(old.decks || []);
    state.settings = Object.assign({}, state.settings, clone(old.settings || {}));
    state.activeDeckId = old.activeDeckId || (state.decks[0] || {}).id || null;
    if (!Array.isArray(old.settings && old.settings.studyDeckIds)) state.settings.studyDeckIds = state.activeDeckId ? [state.activeDeckId] : [];
    state.migration = {from: old.version || 2, at: time(now), original: clone(old)};
    return ensureState(state, now);
  }
  function scheduler(state) {
    if (!FSRS || !FSRS.fsrs) throw new Error('The bundled FSRS scheduler is unavailable');
    return FSRS.fsrs({ request_retention: clamp(state.settings.retention, 0.7, 0.99, 0.9), enable_fuzz: false, learning_steps: [], relearning_steps: [], enable_short_term: true });
  }
  function serializeCard(card) { const out = Object.assign({}, card); out.due = +card.due; if (card.last_review) out.last_review = +card.last_review; return out; }
  function hydrateCard(card) { const out = Object.assign({}, card, {due: new Date(card.due)}); if (validTime(card.last_review)) out.last_review = new Date(card.last_review); return out; }
  function bootstrap(state, record, now) {
    if (record.fsrs) return hydrateCard(record.fsrs);
    const old = record.legacyPending;
    if (!old) return FSRS.createEmptyCard(new Date(now));
    const interval = clamp(old.intervalDays, 1, 36500, 1);
    const last = old.lastReviewedAt === null ? Math.max(0, old.dueAt - interval * DAY) : old.lastReviewedAt;
    const card = FSRS.createEmptyCard(new Date(old.dueAt));
    const base = scheduler(state).next(FSRS.createEmptyCard(new Date(last)), new Date(last), FSRS.Rating.Good).card;
    Object.assign(card, {state: FSRS.State.Review, stability: interval, difficulty: base.difficulty, reps: Math.max(1, old.reviewCount), scheduled_days: interval, last_review: new Date(Math.min(last, now)), elapsed_days: Math.max(0, (now - last) / DAY)});
    record.initialization = {policy: 'legacy-interval-as-90pct-stability', at: now, estimated: true, intervalDays: interval, sourceMode: old.mode, inferredLastReview: old.lastReviewedAt === null};
    return card;
  }
  function scheduleRecall(state, wordId, rating, now, graduate) {
    const record = state.cards[wordId]; const model = scheduler(state);
    const result = model.next(bootstrap(state, record, now), new Date(now), rating);
    record.fsrs = serializeCard(result.card); record.dueAt = record.fsrs.due;
    record.acquired = true; record.started = true; record.acquisitionStage = 'complete';
    record.legacyPending = null;
    if (graduate) {
      // A single app-defined next-day check follows initial acquisition. The
      // model still retains the real first rating; no invented review is added.
      record.dueAt = nextDay(now); record.fsrs.due = record.dueAt;
      record.fsrs.scheduled_days = Math.max(1, Math.round((record.dueAt - now) / DAY));
      record.initialization = {policy: 'next-day-first-check', at: now, estimated: false};
    }
    return {dueAt: record.dueAt, fsrsLog: serializeLog(result.log)};
  }
  function serializeLog(log) { const out = Object.assign({}, log); for (const k of Object.keys(out)) if (out[k] instanceof Date) out[k] = +out[k]; return out; }
  function shuffle(items) { const out = items.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }
  function choices(state, wordId, deckIds) {
    const item = find(state, wordId); if (!item) return [];
    const meaning = normalize(item.word.meaning); const meanings = new Set([meaning]);
    const distractors = [];
    const choicePool = Array.isArray(deckIds) ? allWords(state).filter(x => deckIds.includes(x.deckId) && !x.word.needsConfirmation) : selected(state);
    for (const other of shuffle(choicePool)) if (other.word.id !== wordId && normalize(other.word.french) !== normalize(item.word.french)) {
      const m = normalize(other.word.meaning);
      if (m && !meanings.has(m) && !m.split(/[；;，,]/).some(x => meaning.split(/[；;，,]/).map(v => v.trim()).includes(x.trim()))) { meanings.add(m); distractors.push({id: other.word.id, text: other.word.meaning}); }
      if (distractors.length === 3) break;
    }
    // Fewer than two real distractors is not a meaningful multiple-choice task.
    return distractors.length >= 2 ? shuffle([{id: wordId, text: item.word.meaning}, ...distractors]) : [];
  }
  function stats(state, now) {
    now = time(now); ensureState(state, now);
    const rows = selected(state), today = dayKey(now); const selectedIds = new Set(rows.map(x => x.word.id));
    const start=new Date(now);start.setHours(0,0,0,0);
    const events = recentEvents(state,+start).filter(e => selectedIds.has(e.wordId) && !e.undone && validTime(e.time) && dayKey(e.time) === today);
    const unique = kind => new Set(events.filter(e => kind.includes(e.kind)).map(e => e.wordId)).size;
    const dueItems = rows.filter(x => state.cards[x.word.id].acquired && validTime(state.cards[x.word.id].dueAt) && state.cards[x.word.id].dueAt <= now).map(x => ({...x, dueAt: state.cards[x.word.id].dueAt})).sort((a, b) => a.dueAt - b.dueAt);
    const futureItems = rows.filter(x => state.cards[x.word.id].acquired && validTime(state.cards[x.word.id].dueAt) && state.cards[x.word.id].dueAt > now).map(x => ({...x, dueAt: state.cards[x.word.id].dueAt})).sort((a, b) => a.dueAt - b.dueAt);
    const acquired = rows.filter(x => state.cards[x.word.id].acquired).length;
    const learning = rows.filter(x => state.cards[x.word.id].started && !state.cards[x.word.id].acquired).length;
    const newToday = unique(['learn-acquired']), goalEnabled = state.settings.dailyGoalEnabled !== false;
    return {total: rows.length, acquired, learned: acquired, unlearned: rows.length - acquired, new: rows.length - acquired, learning, due: dueItems.length, dueItems, futureItems, nextDueAt: futureItems.length ? futureItems[0].dueAt : null, newToday, learnedToday: newToday, reviewedToday: unique(['review']), spellingToday: unique(['spelling', 'dictation']), answersToday: events.length, goalEnabled, remainingGoal: goalEnabled ? Math.max(0, Number(state.settings.dailyGoal) - newToday) : rows.length - acquired, session: state.session};
  }
  function weeklyActivity(state, now) {
    now = time(now);
    // Calendar days (rather than seven 24-hour intervals) also cover DST
    // changes correctly. Reading history must not initialize or mutate state.
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const days = Array.from({length: 7}, (_, index) => {
      const date = new Date(today); date.setDate(date.getDate() - 6 + index);
      return {key: dayKey(date.getTime()), date: date.getTime(), learned: 0, reviewed: 0, total: 0};
    });
    const buckets = new Map(days.map(day => [day.key, {day, learned: new Set(), reviewed: new Set()}]));
    // This chart describes all retained history, including unselected/deleted
    // decks. A distinct word is counted once per category per day. Reviews
    // count even when forgotten; retries, choices and spelling are not reviews.
    const events = state && Array.isArray(state.events) ? recentEvents(state,days[0].date) : [];
    for (const event of events) {
      if (!event || typeof event !== 'object' || Array.isArray(event) || event.undone === true || !safeId(event.wordId) || !event.wordId.trim() || !validTime(event.time) || event.time > now) continue;
      const category = event.kind === 'learn-acquired' ? 'learned' : event.kind === 'review' ? 'reviewed' : null;
      if (!category) continue;
      const bucket = buckets.get(dayKey(event.time));
      if (bucket) bucket[category].add(event.wordId);
    }
    for (const {day, learned, reviewed} of buckets.values()) {
      day.learned = learned.size; day.reviewed = reviewed.size; day.total = learned.size + reviewed.size;
    }
    return days;
  }
  function itemFor(state, wordId, task, readyAfter, extra) { return Object.assign({wordId, task, readyAfter: readyAfter || 0}, ['spelling','dictation'].includes(task) ? {correction: false} : {}, extra || {}); }
  function newCurrent(state, entry) {
    let task = entry.task; const isChoice = task === 'choice' || task === 'listening-choice';
    const opts = isChoice ? choices(state, entry.wordId, state.session && state.session.scopeDeckIds) : [];
    if (isChoice && !opts.length) task = 'exposure';
    return {...entry, task, token: uid('answer'), phase: 'question', revealed: false, answered: false, assisted: false, choices: opts, feedback: null};
  }
  function summaryOf(session) { return {kind: session.kind, total: session.wordIds.length, completed: session.completedIds.length, deferred: session.failedIds.length, answers: session.answers, wordIds: session.wordIds.slice(), completedIds: session.completedIds.slice(), failedIds: session.failedIds.slice(), mistakeIds: session.mistakeIds.slice(), ...(session.round ? {rounds: session.round} : {})}; }
  function finishQueue(state) {
    const s = state.session;
    // Not enough intervening words: defer remaining tasks rather than creating
    // a same-word loop. They remain unacquired or due for another session.
    for (const item of s.queue) if (!s.completedIds.includes(item.wordId) && !s.failedIds.includes(item.wordId)) s.failedIds.push(item.wordId);
    s.queue = []; s.current = null; s.done = true; s.summary = summaryOf(s); s.draft = {};
  }
  function advance(state) {
    const s = state.session; if (!s || s.done) return state;
    if (['spelling','dictation'].includes(s.kind) && !s.queue.length && s.completedIds.length < s.wordIds.length) {
      // All failed words wait until the rest of this round is finished. Their
      // next-round attempt starts afresh, after the on-the-spot correction.
      s.roundWordIds = s.wordIds.filter(id => !s.completedIds.includes(id) && !!find(state, id));
      s.round++;
      s.retryIds = [];
      s.queue = s.roundWordIds.map(id => itemFor(state, id, s.kind, s.step));
    }
    const index = s.queue.findIndex(e => e.readyAfter <= s.step && !!find(state, e.wordId));
    if (index < 0) { finishQueue(state); return state; }
    const entry = s.queue.splice(index, 1)[0]; s.current = newCurrent(state, entry); s.draft = {};
    return state;
  }
  function start(state, kind, options, now) {
    now = time(now); options = options || {}; kind = kind || 'learn'; ensureState(state, now);
    if (!['learn', 'review', 'spelling', 'dictation'].includes(kind)) throw new Error('Invalid session kind');
    if (state.session && !state.session.done && !options.replace && sessionMatchesScope(state)) return state;
    const prev = state.session, rows = selected(state); const st = stats(state, now);
    let ids = options.wordIds || options.ids;
    if (!ids && (options.scope === 'mistakes' || options.onlyMistakes)) ids = prev && prev.mistakeIds || state.lastSummary && state.lastSummary.mistakeIds || [];
    if (!ids && options.scope === 'batch') ids = prev && prev.wordIds || state.lastSummary && state.lastSummary.wordIds || [];
    const idSet = Array.isArray(ids) ? new Set(ids) : null;
    let pool = rows.filter(x => !idSet || idSet.has(x.word.id));
    if (kind === 'learn') pool = pool.filter(x => !state.cards[x.word.id].acquired).sort((a, b) => Number(state.cards[b.word.id].started) - Number(state.cards[a.word.id].started));
    if (kind === 'review') pool = pool.filter(x => state.cards[x.word.id].acquired && validTime(state.cards[x.word.id].dueAt) && state.cards[x.word.id].dueAt <= now).sort((a,b) => state.cards[a.word.id].dueAt - state.cards[b.word.id].dueAt);
    if ((kind === 'spelling' || kind === 'dictation') && !idSet && !options.scope && !options.onlyMistakes) {
      const skill = kind === 'spelling' ? 'spelling' : 'listening';
      const lastPractice = row => {
        const record = state.skills[row.word.id] && state.skills[row.word.id][skill];
        return record && validTime(record.lastPracticedAt) ? record.lastPracticedAt : -1;
      };
      // New practice reaches untouched words first, then the least recent practice.
      // Explicit batch/mistake selections retain their chosen pool and order.
      pool.sort((a, b) => lastPractice(a) - lastPractice(b));
    }
    let limit = Math.floor(clamp(options.limit || options.batchSize || (kind === 'learn' ? state.settings.newBatch : state.settings.reviewBatch), 1, 100, 10));
    if (kind === 'learn' && st.goalEnabled && !options.ignoreGoal) limit = Math.min(limit, st.remainingGoal);
    pool = pool.slice(0, limit);
    const firstTask = state.settings.listening === true ? 'listening-choice' : 'choice';
    state.session = {id: uid('session'), kind, startedAt: now, scopeDeckIds: state.settings.studyDeckIds.slice(), wordIds: pool.map(x => x.word.id), queue: pool.map(x => itemFor(state, x.word.id, kind === 'learn' ? state.cards[x.word.id].acquisitionStage === 'recall' ? 'recall' : firstTask : kind === 'review' ? 'recall' : kind, 0)), current: null, step: 0, completedIds: [], failedIds: [], mistakeIds: [], failures: {}, answers: 0, done: false, summary: null, draft: {}, undo: null};
    if (['spelling','dictation'].includes(kind)) Object.assign(state.session, {round:1, roundWordIds:state.session.wordIds.slice(), retryIds:[]});
    return advance(state);
  }
  function current(state) {
    const s = state.session; if (!s) return null;
    const progress = {completed: s.completedIds.length, total: s.wordIds.length, remaining: s.wordIds.length - s.completedIds.length, deferred: s.failedIds.length};
    if (['spelling','dictation'].includes(s.kind)) {
      progress.round = s.round || 1;
      progress.dots = s.wordIds.map(wordId => ({wordId, status:s.completedIds.includes(wordId) ? 'passed' : !s.done && wordId === s.current?.wordId ? 'current' : 'pending'}));
    }
    if (s.done) return {kind: 'summary', summary: summaryOf(s), sessionKind: s.kind, progress, total: s.wordIds.length};
    const c = s.current; if (!c) return null; const found = find(state, c.wordId); if (!found) return null;
    return {...found, round: s.round || null, kind: c.task === 'exposure' ? 'recall' : c.task, task: c.task, phase: c.phase, revealed: c.revealed, answered: c.answered, assisted: c.assisted, correction: !!c.correction, choices: c.choices, options: c.choices, feedback: c.feedback, position: s.completedIds.length + 1, total: s.wordIds.length, sessionKind: s.kind, progress, relearn: !!c.relearn, token: c.token};
  }
  function skipToRecall(state) {
    const s = state.session, c = s && s.current;
    if (!c || s.done || c.answered || c.revealed || !['choice','listening-choice','exposure'].includes(c.task)) return state;
    c.task = 'recall'; c.choices = []; c.phase = 'question';
    // Keep the same token and make no progress/event mutation. A real, revealed
    // self-rating still has to follow before anything is counted or scheduled.
    return state;
  }
  function reveal(state, kind) {
    const s = state.session, c = s && s.current; if (!c || s.done || c.answered) return state;
    kind = kind || 'answer';
    if (kind === 'word-audio') { if (c.task === 'spelling') c.assisted = true; return state; }
    if (kind === 'hint' || ['spelling','dictation','choice','listening-choice'].includes(c.task)) c.assisted = true;
    c.revealed = true; c.phase = 'revealed'; return state;
  }
  function detail(actual, expected, label, aliases) {
    const values = [expected, ...(aliases || [])].filter(x => typeof x === 'string' && x.trim());
    const a = normalize(actual); const match = values.find(v => normalize(v) === a);
    const accentOnly = !!a && !match && values.some(v => noAccent(v) === noAccent(a));
    return {label, actual: String(actual || ''), expected, correct: !!match, accentOnly, reason: !a ? 'empty' : match ? 'correct' : accentOnly ? 'accent' : 'text'};
  }
  function checkSpelling(word, typed, aliases) {
    let details;
    if (usesGenderPractice(word)) {
      const value = typed && typeof typed === 'object' ? typed : {masc: String(typed || '').split(/\s*[/;；]\s*/)[0], fem: String(typed || '').split(/\s*[/;；]\s*/)[1]};
      details = [detail(value.masc, word.masc, 'masc'), detail(value.fem, word.fem, 'fem')];
    } else details = [detail(typed && typeof typed === 'object' ? typed.typed || typed.value || '' : typed, word.spell || word.french, 'word', aliases)];
    const correct = details.every(x => x.correct), accentOnly = !correct && details.every(x => x.correct || x.accentOnly);
    return {correct, accentOnly, reason: correct ? 'correct' : details.some(x => x.reason === 'empty') ? 'empty' : accentOnly ? 'accent' : 'text', expected: details.map(x => x.expected).join(' / '), actual: details.map(x => x.actual).join(' / '), details};
  }
  function addUnique(array, id) { if (!array.includes(id)) array.push(id); }
  function queueRetry(state, c) {
    const s = state.session; s.failures[c.wordId] = (s.failures[c.wordId] || 0) + 1; addUnique(s.mistakeIds, c.wordId);
    if (s.failures[c.wordId] >= 3) addUnique(s.failedIds, c.wordId);
    else s.queue.push(itemFor(state, c.wordId, c.task === 'choice' || c.task === 'exposure' ? 'recall' : c.task, s.step + 3, {relearn: s.kind === 'review'}));
  }
  function rememberUndo(state) {
    const s = state.session, id = s.current.wordId, priorSession = clone(s); priorSession.undo = null;
    s.undo = {session: priorSession, wordId: id, card: clone(state.cards[id]), skill: clone(state.skills[id]), eventsLength: state.events.length};
  }
  function answer(state, input, now) {
    now = time(now); input = input || {}; const s = state.session, c = s && s.current;
    if (!s || s.done || !c) return {ok: false, reason: 'no-question'};
    if (c.answered || H.hasEvent(state,c.token)) return {ok: false, duplicate: true, reason: 'already-answered', feedback: c.feedback};
    const found = find(state, c.wordId); if (!found) return {ok: false, reason: 'missing-word'};
    if (c.task === 'recall' && !c.revealed) return {ok: false, reason: 'reveal-first'};
    const isChoice = c.task === 'choice' || c.task === 'listening-choice';
    if (isChoice && !c.revealed && !c.choices.some(x => x.id === input.choice)) return {ok: false, reason: 'choose-answer'};
    if (c.task === 'exposure' && !c.revealed) return {ok: false, reason: 'reveal-first'};
    if (c.task === 'recall' && ![1,2,3,4].includes(Number(input.rating))) return {ok: false, reason: 'choose-rating'};
    rememberUndo(state);
    let feedback, kind, rating = null, extra = {}; const assisted = c.assisted || input.assisted === true;
    const record = state.cards[c.wordId]; if (['choice','listening-choice','exposure','recall'].includes(c.task)) record.started = true;
    if (isChoice || c.task === 'exposure') {
      const correct = isChoice && input.choice === c.wordId && !assisted;
      kind = 'learn-choice'; record.acquisitionStage = 'recall';
      if (!correct && isChoice) { addUnique(s.mistakeIds, c.wordId); s.failures[c.wordId] = (s.failures[c.wordId] || 0) + 1; }
      s.queue.push(itemFor(state, c.wordId, 'recall', s.step + 3));
      feedback = {ok: true, correct, exposure: c.task === 'exposure', assisted, next: 'recall', expected: found.word.meaning};
    } else if (c.task === 'recall') {
      rating = assisted ? 1 : Number(input.rating); const correct = rating > 1;
      kind = s.kind === 'review' ? c.relearn ? 'relearn' : 'review' : correct ? 'learn-acquired' : 'learn-recall';
      if (s.kind === 'review' || correct) extra = scheduleRecall(state, c.wordId, rating, now, s.kind === 'learn' && correct && !record.acquired);
      else record.acquisitionStage = 'recall';
      if (correct) addUnique(s.completedIds, c.wordId); else queueRetry(state, c);
      feedback = {ok: true, correct, assisted, rating, dueAt: record.dueAt, deferred: s.failedIds.includes(c.wordId), next: correct ? 'complete' : 'relearn'};
    } else {
      const result = checkSpelling(found.word, input.typed !== undefined ? input.typed : input, state.aliases[c.wordId]);
      kind = c.task;
      const skill = state.skills[c.wordId] || (state.skills[c.wordId] = {});
      const key = c.task === 'dictation' ? 'listening' : 'spelling';
      const p = skill[key] || (skill[key] = {attempts: 0, correct: 0, mistakes: 0, assisted: 0, lastPracticedAt: null});
      p.attempts++; p.lastPracticedAt = now;
      const correction = c.correction === true, independent = result.correct && !assisted && !correction;
      if (independent) {
        p.correct++;
        addUnique(s.completedIds, c.wordId);
        s.retryIds = s.retryIds.filter(id => id !== c.wordId);
      } else {
        addUnique(s.retryIds, c.wordId);
        if (result.correct && correction) p.corrections = (p.corrections || 0) + 1;
        else {
          p.mistakes++; s.failures[c.wordId] = (s.failures[c.wordId] || 0) + 1;
          addUnique(s.mistakeIds, c.wordId);
        }
      }
      if (assisted) p.assisted++;
      // A correction advances to other words but is never a green dot. Even a
      // correct hinted answer must be retyped before that fresh later attempt.
      feedback = {...result, ok:true, assisted, correction, independent, passed:independent, round:s.round, deferred:false, next:independent ? 'complete' : result.correct && correction ? 'round-retry' : 'retry'};
      extra = {correction, independent, round:s.round};
    }
    const event = {id: c.token, sessionId: s.id, wordId: c.wordId, deckId: found.deckId, kind, time: now, rating, assisted, correct: feedback.correct, task: c.task, contentVersion: contentVersion(found.word, state.aliases[c.wordId]), ...extra};
    state.events.push(event); c.feedback = feedback; c.phase = 'answered'; c.answered = true; c.revealed = true; c.assisted = assisted; s.answers++; s.step++;
    return feedback;
  }
  function next(state, now) {
    time(now); const s = state.session; if (!s || s.done || !s.current || !s.current.answered) return state;
    const c = s.current;
    if (['spelling','dictation'].includes(c.task) && c.feedback && c.feedback.next === 'retry') {
      // Also remove an old v4.0 delayed retry if this answered session was
      // restored from a backup. Only this word is retried until it is correct.
      s.queue = s.queue.filter(item => item.wordId !== c.wordId);
      s.failedIds = s.failedIds.filter(id => id !== c.wordId);
      s.current = newCurrent(state, itemFor(state, c.wordId, c.task, s.step, {correction: true}));
      s.draft = {};
      return state;
    }
    return advance(state);
  }
  function undo(state) {
    const s = state.session, snapshot = s && s.undo; if (!snapshot) return {ok: false, reason: 'nothing-to-undo'};
    if (!sessionMatchesScope(state) || !sessionMatchesScope({...state, session: snapshot.session})) return {ok: false, reason: 'scope-changed'};
    state.cards[snapshot.wordId] = snapshot.card;
    if (snapshot.skill === undefined || snapshot.skill === null) delete state.skills[snapshot.wordId]; else state.skills[snapshot.wordId] = snapshot.skill;
    state.events = state.events.slice(0, snapshot.eventsLength); state.session = snapshot.session; state.session.undo = null;
    return {ok: true};
  }
  function finish(state) { if (state.session) state.lastSummary = summaryOf(state.session); state.session = null; return state; }
  function recentEvents(state,since=Date.now()-30*DAY){return H.recentEvents(state,since)}
  return {VERSION, FSRS_VERSION: '5.4.2', DAY, createState, migrateLegacy, ensureState, validateRuntime, allWords, selected, sessionMatchesScope, stats, weeklyActivity, recentEvents, start, current, skipToRecall, reveal, answer, next, undo, finish, clearSession: finish, choices, checkSpelling, usesGenderPractice, normalize, dayKey};
}));
