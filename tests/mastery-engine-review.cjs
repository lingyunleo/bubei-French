/* Manual mastery regression checks. All fixtures are original synthetic words;
 * these tests use memory only and never read browser profiles or personal data. */
const assert = require('node:assert/strict');
const Engine = require('../src/engine.js');
const Data = require('../src/data.js');
const History = require('../src/history.js');
const now = Date.UTC(2026, 9, 6, 12);
const copy = value => JSON.parse(JSON.stringify(value));
let count = 0;
function test(name, run) { run(); count++; console.log('PASS', name); }
function fixture(size = 4, kind) {
  const entries = ['alpha', 'bêta', 'gamma', 'delta'].slice(0, size).map((french, index) => ({french, spell:french, meaning:'Synthetic meaning ' + index, pos:'n.'}));
  const imported = Data.importEntries(Data.fresh(), entries, {name:'Synthetic mastery checks'});
  const state = imported.state;
  state.settings.studyDeckIds = [imported.deckId];
  state.settings.listening = false;
  state.settings.dailyGoalEnabled = false;
  Engine.ensureState(state, now);
  if (kind === 'review') for (const card of Object.values(state.cards)) Object.assign(card, {acquired:true, started:true, dueAt:now - 1});
  if (kind) Engine.start(state, kind, {limit:size}, now);
  return state;
}
const ids = state => state.decks.flatMap(deck => deck.words.map(word => word.id));
const word = (state, id) => Engine.allWords(state).find(row => row.word.id === id).word;
function learning(state) {
  return copy({cards:Object.fromEntries(Object.entries(state.cards).map(([id, record]) => {
    const card = {...record}; delete card.manualMastered; delete card.manualMasteredAt; return [id, card];
  })), skills:state.skills, events:History.allEvents(state), words:state.decks.map(deck => deck.words), aliases:state.aliases, contexts:state.contexts});
}
function valid(state) { return Engine.ensureState(Data.validate(state), now); }
function restore(state) { return Engine.ensureState(Data.migrate(JSON.stringify(Data.exportBackup(state))), now); }
function passCurrent(state) {
  const current = Engine.current(state);
  if (['recall', 'exposure'].includes(current.task)) { Engine.reveal(state); Engine.answer(state, {rating:3}, now); }
  else if (['choice', 'listening-choice'].includes(current.task)) Engine.answer(state, {choice:current.word.id}, now);
  else Engine.answer(state, {typed:current.word.spell}, now);
  Engine.next(state, now);
}
function rejectsMutations(original, mutations) {
  for (const [label, mutate] of mutations) {
    const bad = copy(original); mutate(bad); const before = copy(bad);
    assert.throws(() => Data.validate(bad), undefined, label);
    assert.deepEqual(bad, before, 'Validation does not mutate its input');
  }
}

test('Idle mastery preserves original progress, aliases, contexts and real history', () => {
  let state = fixture(), id = ids(state)[0];
  state.aliases[id] = ['synthetic alternative'];
  const original = learning(state);
  assert.equal(Engine.markMastered(state, id, now), state);
  assert.equal(Engine.isManuallyMastered(state, id), true);
  assert.equal(state.cards[id].manualMasteredAt, now);
  assert.deepEqual(learning(state), original);
  assert.equal(Engine.stats(state, now).acquired, 1);
  assert.equal(Engine.stats(state, now).newToday, 0);
  assert.equal(Engine.stats(state, now).answersToday, 0);
  const saved = copy(state);
  Engine.markMastered(state, id, now + 1);
  assert.deepEqual(state, saved);
  state = valid(state);
  Engine.unmarkMastered(state, id, now + 2);
  assert.deepEqual(learning(state), original);
  assert.equal(Engine.stats(state, now).acquired, 0);
  assert.equal(Engine.isManuallyMastered(state, id), false);
});

test('All task, explicit group and mistake pools exclude mastered words', () => {
  for (const kind of ['learn', 'review', 'spelling', 'dictation']) {
    const state = fixture(4, kind), all = ids(state), id = all[0];
    Engine.markMastered(state, id, now);
    for (const options of [{}, {wordIds:all}, {scope:'batch', wordIds:all}, {scope:'mistakes', wordIds:all}]) {
      Engine.start(state, kind, {...options, replace:true, limit:100}, now);
      assert.equal(state.session.wordIds.includes(id), false);
      assert.equal(state.session.queue.some(entry => entry.wordId === id), false);
      assert.notEqual(state.session.current?.wordId, id);
      valid(state);
    }
  }
});

test('Mark removes duplicate retries and undo restores the exact current question and draft', () => {
  const state = fixture(4, 'learn'), id = state.session.current.wordId;
  state.session.draft = {typed:'partially typed', selection:{start:2, end:4}};
  state.session.queue.push({wordId:id, task:'recall', readyAfter:2}, {wordId:id, task:'recall', readyAfter:5});
  const session = copy(state.session), original = learning(state);
  Engine.markMastered(state, id, now);
  assert.notEqual(state.session.current?.wordId, id);
  assert.equal(state.session.queue.some(entry => entry.wordId === id), false);
  assert.equal(Engine.current(state).progress.completed, 1);
  assert.equal(Engine.current(state).progress.mastered, 1);
  assert.deepEqual(state.session.completedIds, []);
  assert.deepEqual(learning(state), original);
  assert.equal(state.session.undo.kind, 'manual-mastery');
  valid(state);
  assert.equal(Engine.undo(state).ok, true);
  assert.deepEqual(state.session, session);
  assert.deepEqual(learning(state), original);
});

test('The final word completes every session kind without fabricating an answer', () => {
  for (const kind of ['learn', 'review', 'spelling', 'dictation']) {
    const state = fixture(1, kind), id = ids(state)[0], session = copy(state.session);
    Engine.markMastered(state, id, now);
    const current = Engine.current(state);
    assert.equal(current.kind, 'summary');
    assert.equal(current.summary.completed, 1);
    assert.equal(current.summary.mastered, 1);
    assert.equal(current.summary.answers, 0);
    assert.deepEqual(current.summary.completedIds, []);
    assert.equal(state.session.current, null);
    valid(state);
    assert.equal(Engine.undo(state).ok, true);
    assert.deepEqual(state.session, session);
  }
});

test('Correction retries cannot resurrect mastery; undoing another answer retains mastery', () => {
  const state = fixture(2, 'spelling'), id = state.session.current.wordId;
  Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now);
  assert.equal(state.session.current.correction, true);
  const events = copy(state.events);
  Engine.markMastered(state, id, now);
  const other = Engine.current(state).word;
  Engine.answer(state, {typed:other.spell}, now);
  assert.equal(Engine.undo(state).ok, true);
  assert.equal(Engine.isManuallyMastered(state, id), true);
  assert.deepEqual(state.events, events);
  passCurrent(state);
  const current = Engine.current(state);
  assert.equal(current.kind, 'summary');
  assert.equal(current.summary.completed, 2);
  assert.equal(current.summary.completedIds.length, 1);
  assert.deepEqual(current.progress.dots.map(dot => dot.status).sort(), ['mastered', 'passed']);
  valid(state);
});

test('Cancel mastery reopens active and finished groups; undo restores manual completion', () => {
  for (const size of [1, 2]) {
    const state = fixture(size, 'dictation'), id = state.session.current.wordId;
    Engine.markMastered(state, id, now);
    const marked = copy(state);
    Engine.unmarkMastered(state, id, now + 1);
    assert.equal(Engine.isManuallyMastered(state, id), false);
    assert.equal(state.session.done, false);
    assert.ok([state.session.current, ...state.session.queue].some(entry => entry?.wordId === id));
    valid(state);
    assert.equal(Engine.undo(state).ok, true);
    assert.deepEqual(state.cards, marked.cards);
    assert.deepEqual({...state.session, undo:null}, {...marked.session, undo:null});
    valid(state);
  }
});

test('Due/future eligibility changes while daily and weekly genuine history remain exact', () => {
  const state = fixture(), id = ids(state)[0];
  Object.assign(state.cards[id], {acquired:true, started:true, dueAt:now - 1});
  state.events = ['learn-acquired', 'review', 'spelling'].map((kind, index) => ({id:'synthetic-event-' + index, wordId:id, kind, time:now}));
  const before = Engine.stats(state, now), week = Engine.weeklyActivity(state, now), card = copy(state.cards[id]);
  Engine.markMastered(state, id, now);
  const after = Engine.stats(state, now);
  assert.equal(before.due, 1); assert.equal(after.due, 0);
  for (const key of ['newToday', 'learnedToday', 'reviewedToday', 'spellingToday', 'answersToday']) assert.equal(after[key], before[key]);
  assert.deepEqual(Engine.weeklyActivity(state, now), week);
  Engine.unmarkMastered(state, id, now);
  assert.deepEqual(state.cards[id], card);
  assert.equal(Engine.stats(state, now).due, 1);
  state.cards[id].dueAt = now + 10000;
  Engine.markMastered(state, id, now);
  assert.equal(Engine.stats(state, now).futureItems.length, 0);
  Engine.unmarkMastered(state, id, now);
  assert.equal(Engine.stats(state, now).futureItems.length, 1);
});

test('Backup and portable embedded state preserve mastery, archived history and undo', () => {
  let state = fixture(2, 'spelling');
  for (let index = 0; index < 3200; index++) state.events.push({id:'archived-synthetic-' + index, wordId:ids(state)[0], kind:'spelling', time:now - index});
  Engine.markMastered(state, state.session.current.wordId, now);
  state = Data.validate(state);
  assert.ok(state.eventArchive.length);
  const before = learning(state), originalCards = copy(state.cards);
  state = restore(state);
  assert.deepEqual(state.cards, originalCards);
  assert.deepEqual(learning(state), before);
  assert.equal(Engine.undo(state).ok, true);
  assert.equal(ids(state).some(id => Engine.isManuallyMastered(state, id)), false);
  assert.equal(History.allEvents(state).length, 3200);
  valid(state);
});

test('Malformed card flags, times, session lists, summaries and undo are rejected', () => {
  const state = fixture(1, 'spelling'), id = ids(state)[0]; Engine.markMastered(state, id, now);
  rejectsMutations(state, [
    ['string flag', x => x.cards[id].manualMastered = 'yes'],
    ['missing time', x => delete x.cards[id].manualMasteredAt],
    ['negative time', x => x.cards[id].manualMasteredAt = -1],
    ['string time', x => x.cards[id].manualMasteredAt = '123'],
    ['orphan time', x => x.cards[id].manualMastered = false],
    ['duplicate ids', x => x.session.masteredIds = [id, id]],
    ['unknown id', x => x.session.masteredIds = ['missing']],
    ['summary count', x => x.session.summary.mastered = 9],
    ['summary completion', x => x.session.summary.completed = 0],
    ['undo flag', x => x.session.undo.card.manualMastered = 'true'],
    ['undo kind', x => x.session.undo.kind = 'unknown'],
  ]);
  const trash = Data.deleteWord(state, state.decks[0].id, id);
  trash.trash[0].attachments.cards[id].manualMastered = 'invalid';
  assert.throws(() => Data.validate(trash));
});

test('Word/deck recycle restores mastery and deck reset removes it with the original progress', () => {
  for (const kind of ['word', 'deck']) {
    let state = fixture(2), id = ids(state)[0], deckId = state.decks[0].id;
    Engine.markMastered(state, id, now);
    state = kind === 'word' ? Data.deleteWord(state, deckId, id) : Data.deleteDeck(state, deckId);
    assert.equal(state.cards[id], undefined);
    state = kind === 'word' ? Data.restoreWord(state, state.trash[0].id) : Data.restoreDeck(state, state.trash[0].id);
    assert.equal(Engine.isManuallyMastered(state, id), true);
    state = Data.resetDeckProgress(state, deckId); Engine.ensureState(state, now);
    assert.equal(Engine.isManuallyMastered(state, id), false);
    assert.equal(state.cards[id].acquired, false);
  }
});

test('Imported stale current and undo queues cannot revive a marked word', () => {
  const state = fixture(2, 'spelling'), id = ids(state)[0];
  Engine.answer(state, {typed:'wrong'}, now);
  Object.assign(state.cards[id], {manualMastered:true, manualMasteredAt:now});
  Engine.ensureState(state, now);
  assert.notEqual(state.session.current?.wordId, id);
  assert.equal(state.session.queue.some(entry => entry.wordId === id), false);
  const undo = state.session.undo;
  undo.wordId = ids(state).find(other => other !== id); undo.card = copy(state.cards[undo.wordId]);
  assert.equal(Engine.undo(state).ok, true);
  assert.notEqual(state.session.current?.wordId, id);
  assert.equal(Engine.isManuallyMastered(state, id), true);
  valid(state);
});

test('Mastery on a genuinely completed word never double-counts or loses a real answer', () => {
  const state = fixture(1, 'spelling'), id = ids(state)[0];
  Engine.answer(state, {typed:word(state, id).spell}, now);
  const original = learning(state);
  Engine.markMastered(state, id, now + 1);
  assert.equal(Engine.current(state).summary.completed, 1);
  assert.equal(Engine.current(state).summary.completedIds.length, 1);
  assert.equal(Engine.current(state).summary.mastered, 1);
  Engine.unmarkMastered(state, id, now + 2);
  assert.equal(state.session.done, true);
  assert.equal(Engine.current(state).summary.mastered, undefined);
  assert.deepEqual(learning(state), original);
});

test('Cancelled correction survives backup and remains assisted until a later round', () => {
  for (const kind of ['spelling', 'dictation']) {
    let state = fixture(2, kind), id = ids(state)[0];
    Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now);
    state.session.draft = {typed:'unfinished correction', selection:{start:4, end:4}};
    const current = copy(state.session.current), draft = copy(state.session.draft);
    Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now);
    state = restore(state); passCurrent(state);
    assert.deepEqual(state.session.current, current);
    assert.deepEqual(state.session.draft, draft);
    const result = Engine.answer(state, {typed:word(state, id).spell}, now);
    assert.equal(result.independent, false); assert.equal(result.passed, false);
    assert.equal(state.skills[id][kind === 'spelling' ? 'spelling' : 'listening'].correct, 0);
    Engine.next(state, now);
    assert.equal(state.session.round, 2); assert.equal(state.session.current.correction, false);
    valid(state);
  }
});

test('Repeated mark/cancel retains revealed assistance and the original question token', () => {
  for (const kind of ['spelling', 'dictation']) {
    const state = fixture(2, kind), id = ids(state)[0]; Engine.reveal(state);
    const current = copy(state.session.current);
    for (let index = 0; index < 3; index++) { Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now); }
    passCurrent(state);
    assert.deepEqual(state.session.current, current);
    const result = Engine.answer(state, {typed:word(state, id).spell}, now);
    assert.equal(result.independent, false); assert.equal(result.assisted, true);
    valid(state);
  }
});

test('Non-current corrected words retain their next-round retry instead of same-round credit', () => {
  for (const kind of ['spelling', 'dictation']) {
    const state = fixture(2, kind), id = ids(state)[0];
    Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now); passCurrent(state);
    assert.ok(state.session.retryIds.includes(id));
    Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now);
    assert.equal(state.session.queue.some(entry => entry.wordId === id), false);
    assert.ok(state.session.retryIds.includes(id));
    passCurrent(state);
    assert.equal(state.session.round, 2); assert.equal(state.session.current.wordId, id);
    assert.equal(state.session.current.correction, false); valid(state);
  }
});

test('Answered feedback resumes without a duplicate answer or skipping correction', () => {
  for (const kind of ['spelling', 'dictation']) {
    const state = fixture(2, kind), id = ids(state)[0]; Engine.answer(state, {typed:'wrong'}, now);
    const current = copy(state.session.current);
    Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now); passCurrent(state);
    assert.deepEqual(state.session.current, current);
    const length = state.events.length;
    assert.equal(Engine.answer(state, {typed:word(state, id).spell}, now).duplicate, true);
    assert.equal(state.events.length, length);
    Engine.next(state, now); assert.equal(state.session.current.correction, true);
    assert.equal(Engine.answer(state, {typed:word(state, id).spell}, now).independent, false);
    valid(state);
  }
});

test('Review queued and current relearning states keep the original event kind', () => {
  const state = fixture(4, 'review'), id = ids(state)[0];
  Engine.reveal(state); Engine.answer(state, {rating:1}, now); Engine.next(state, now);
  Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now);
  for (let index = 0; index < 5 && state.session.current?.wordId !== id; index++) passCurrent(state);
  assert.equal(state.session.current.relearn, true);
  const current = copy(state.session.current);
  Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now);
  assert.deepEqual(state.session.current, current);
  Engine.reveal(state); Engine.answer(state, {rating:3}, now);
  assert.equal(state.events.at(-1).kind, 'relearn'); valid(state);
});

test('After a genuinely later practice round cancellation creates a fresh independent attempt', () => {
  const state = fixture(2, 'spelling'), id = ids(state)[0];
  Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now); Engine.markMastered(state, id, now);
  Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now); passCurrent(state);
  assert.equal(state.session.round, 2);
  Engine.unmarkMastered(state, id, now); passCurrent(state);
  assert.equal(state.session.current.wordId, id);
  assert.equal(state.session.current.correction, false); assert.equal(state.session.current.assisted, false);
  assert.equal(Engine.answer(state, {typed:word(state, id).spell}, now).independent, true);
  valid(state);
});

test('Invalid paused tasks are rejected in both current state and undo state', () => {
  const state = fixture(2, 'spelling'), id = ids(state)[0]; Engine.reveal(state); Engine.markMastered(state, id, now);
  const mutations = [
    ['retry flag', x => x.session.masteryPauses[id].retry = 'true'],
    ['current id', x => x.session.masteryPauses[id].current.wordId = 'missing'],
    ['queued id', x => x.session.masteryPauses[id].queue = [{wordId:'missing', task:'spelling', readyAfter:0}]],
    ['round', x => x.session.masteryPauses[id].round = -1],
    ['draft', x => x.session.masteryPauses[id].draft = []],
    ['unknown metadata', x => x.session.masteryPauses[id].unknown = true],
    ['current token', x => x.session.masteryPauses[id].current.token = '__proto__'],
    ['assistance flag', x => x.session.masteryPauses[id].current.assisted = 'false'],
  ];
  rejectsMutations(state, mutations);
  Engine.unmarkMastered(state, id, now);
  rejectsMutations(state, [['undo pause', x => x.session.undo.session.masteryPauses[id].retry = 'yes']]);
  valid(state);
});

test('Missing words and invalid times fail before a valid existing session is changed', () => {
  const state = fixture(2, 'spelling'), saved = copy(state), id = ids(state)[0];
  for (const operation of [Engine.markMastered, Engine.unmarkMastered]) {
    for (const [target, time] of [['missing', now], ['__proto__', now], [id, -1], [id, Infinity]]) {
      assert.throws(() => operation(state, target, time)); assert.deepEqual(state, saved);
    }
  }
  assert.equal(Engine.isManuallyMastered(state, '__proto__'), false);
  Engine.unmarkMastered(state, id, now); assert.deepEqual(state, saved);
});

test('Unselected mastery never changes the active task or its real history and remains undoable', () => {
  let state = fixture(2, 'spelling');
  const extra = Data.importEntries(state, [{french:'epsilon', meaning:'Synthetic outside scope'}], {name:'Other synthetic deck'});
  state = extra.state; state.settings.studyDeckIds = [state.decks[0].id]; Engine.ensureState(state, now);
  Engine.start(state, 'spelling', {limit:2}, now);
  const id = state.decks[1].words[0].id, original = learning(state), session = copy(state.session);
  Engine.markMastered(state, id, now);
  assert.equal(Engine.stats(state, now).manualMastered, 0);
  assert.deepEqual({...state.session, undo:null}, session);
  assert.deepEqual(learning(state), original);
  assert.equal(Engine.undo(state).ok, true); assert.deepEqual(state.session, session);
});

test('Older unmarked backups keep data keys, field absence and genuine learning semantics', () => {
  const state = fixture(2), restored = restore(state);
  assert.deepEqual(restored.cards, state.cards);
  for (const card of Object.values(restored.cards)) assert.equal(Object.hasOwn(card, 'manualMastered'), false);
  for (const kind of ['learn', 'review', 'spelling', 'dictation']) {
    const s = fixture(4, kind);
    for (let step = 0; step < 30 && !s.session.done; step++) passCurrent(s);
    assert.equal(s.session.done, true);
    assert.equal(Object.hasOwn(s.session, 'masteredIds'), false);
    assert.equal(Object.hasOwn(s.session, 'masteryPauses'), false);
    assert.equal(s.session.summary.mastered, undefined);
    assert.ok(s.events.length > 0); valid(s);
  }
});

// Independently restate the eleven accepted correction/reveal/feedback/round
// checks in fresh states, with exact whole-question comparisons.
for (const kind of ['spelling', 'dictation']) {
  test(kind + ': correction question, selection draft and token restore exactly', () => {
    const state = fixture(2, kind), id = ids(state)[0];
    Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now);
    state.session.draft = {typed:'partial', selection:{start:1, end:3}};
    const current = copy(state.session.current), draft = copy(state.session.draft), events = copy(state.events);
    Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now);
    assert.deepEqual(state.events, events); passCurrent(state);
    assert.deepEqual(state.session.current, current); assert.deepEqual(state.session.draft, draft);
    const result = Engine.answer(state, {typed:word(state, id).spell}, now);
    assert.equal(result.independent, false); assert.equal(result.next, 'round-retry');
    assert.equal(state.skills[id][kind === 'dictation' ? 'listening' : 'spelling'].correct, 0);
    Engine.next(state, now); assert.equal(state.session.round, 2); valid(state);
  });
  test(kind + ': a revealed unanswered prompt retains assistance', () => {
    const state = fixture(2, kind), id = ids(state)[0]; Engine.reveal(state, 'hint');
    state.session.draft = {typed:'alpha'}; const current = copy(state.session.current);
    Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now); passCurrent(state);
    assert.deepEqual(state.session.current, current); assert.deepEqual(state.session.draft, {typed:'alpha'});
    const result = Engine.answer(state, {typed:word(state, id).spell}, now);
    assert.equal(result.independent, false); assert.equal(result.assisted, true);
    Engine.next(state, now); assert.equal(state.session.current.correction, true); valid(state);
  });
  test(kind + ': answered feedback restores without submitting the old token twice', () => {
    const state = fixture(2, kind), id = ids(state)[0]; Engine.answer(state, {typed:'wrong'}, now);
    const current = copy(state.session.current);
    Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now); passCurrent(state);
    assert.deepEqual(state.session.current, current);
    const before = state.events.length;
    assert.equal(Engine.answer(state, {typed:word(state, id).spell}, now).duplicate, true);
    assert.equal(state.events.length, before);
    Engine.next(state, now); assert.equal(state.session.current.correction, true); valid(state);
  });
  test(kind + ': a corrected waiting word stays in the next-round queue', () => {
    const state = fixture(2, kind), id = ids(state)[0];
    Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now); passCurrent(state);
    Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now);
    assert.equal(state.session.queue.some(entry => entry.wordId === id), false);
    assert.ok(state.session.retryIds.includes(id)); passCurrent(state);
    assert.equal(state.session.round, 2); assert.equal(state.session.current.wordId, id);
    assert.equal(state.session.current.correction, false); valid(state);
  });
  test(kind + ': the next round allows fresh independent practice', () => {
    const state = fixture(2, kind), id = ids(state)[0];
    Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now); Engine.markMastered(state, id, now);
    Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now); passCurrent(state);
    assert.equal(state.session.round, 2); Engine.unmarkMastered(state, id, now); passCurrent(state);
    assert.equal(state.session.current.wordId, id); assert.equal(state.session.current.correction, false);
    assert.equal(state.session.current.assisted, false);
    assert.equal(Engine.answer(state, {typed:word(state, id).spell}, now).independent, true); valid(state);
  });
}
test('review: the resumed relearning question keeps its exact context and real event type', () => {
  const state = fixture(4, 'review'), id = ids(state)[0];
  Engine.reveal(state); Engine.answer(state, {rating:1}, now); Engine.next(state, now);
  while (state.session.current.wordId !== id) passCurrent(state);
  assert.equal(state.session.current.relearn, true);
  const current = copy(state.session.current), before = state.events.length;
  Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now);
  assert.deepEqual(state.session.current, current); assert.equal(state.events.length, before);
  Engine.reveal(state); Engine.answer(state, {rating:3}, now);
  assert.equal(state.events.at(-1).kind, 'relearn'); valid(state);
});
test('Malformed new pause fields and missing mastery undo cards cannot be restored', () => {
  const state = fixture(2, 'spelling'), id = ids(state)[0];
  Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now); Engine.markMastered(state, id, now);
  rejectsMutations(state, [
    ['future paused round', x => x.session.masteryPauses[id].round = x.session.round + 1],
    ['missing practice round', x => x.session.masteryPauses[id].round = null],
    ['null undo card', x => x.session.undo.card = null],
    ['array undo card', x => x.session.undo.card = []],
    ['missing undo card', x => delete x.session.undo.card],
    ['string relearn', x => x.session.masteryPauses[id].current.relearn = 'false'],
    ['different task kind', x => x.session.masteryPauses[id].current.task = 'recall'],
    ['inconsistent phase', x => x.session.masteryPauses[id].current.phase = 'answered'],
    ['typed object', x => x.session.masteryPauses[id].draft.typed = {}],
    ['negative selection', x => x.session.masteryPauses[id].draft.selection = {start:-1, end:0}],
    ['reversed selection', x => x.session.masteryPauses[id].draft.selection = {start:2, end:1}],
    ['foreign focus target', x => x.session.masteryPauses[id].draft.selection = {id:'app', start:0, end:0}],
    ['invalid selection direction', x => x.session.masteryPauses[id].draft.selection = {start:0, end:0, direction:'up'}],
  ]);
  Engine.unmarkMastered(state, id, now);
  rejectsMutations(state, [['future round in undo', x => x.session.undo.session.masteryPauses[id].round = x.session.round + 1]]);
});

test('Cancelling and remarking a restored question preserves the latest draft and undo', () => {
  for (const kind of ['spelling', 'dictation']) {
    let state = fixture(2, kind), id = ids(state)[0];
    Engine.answer(state, {typed:'wrong'}, now); Engine.next(state, now);
    Engine.markMastered(state, id, now); Engine.unmarkMastered(state, id, now); passCurrent(state);
    assert.equal(state.session.current.wordId, id); assert.equal(state.session.current.correction, true);
    state.session.draft = {typed:'latest correction', selection:{id:'spell-input', start:4, end:7, direction:'backward'}};
    const current = copy(state.session.current), draft = copy(state.session.draft);
    Engine.markMastered(state, id, now); assert.equal(state.session.done, true);
    Engine.unmarkMastered(state, id, now);
    assert.deepEqual(state.session.current, current); assert.deepEqual(state.session.draft, draft);
    state = restore(state);
    assert.equal(Engine.undo(state).ok, true); assert.equal(state.session.done, true);
    assert.equal(Engine.isManuallyMastered(state, id), true);
    Engine.unmarkMastered(state, id, now);
    assert.deepEqual(state.session.current, current); assert.deepEqual(state.session.draft, draft);
    assert.equal(Engine.answer(state, {typed:word(state, id).spell}, now).independent, false);
    valid(state);
  }
});

test('Deferred meaning recall restores its original pending retry without inventing completion', () => {
  const state = fixture(1, 'review'), id = ids(state)[0];
  Engine.reveal(state); Engine.answer(state, {rating:1}, now); Engine.next(state, now);
  assert.equal(state.session.done, true); assert.ok(state.session.failedIds.includes(id));
  const original = learning(state);
  Engine.markMastered(state, id, now);
  assert.equal(Engine.current(state).summary.mastered, 1); assert.equal(state.session.failedIds.length, 0);
  Engine.unmarkMastered(state, id, now);
  assert.equal(state.session.done, true); assert.ok(state.session.failedIds.includes(id));
  assert.equal(Engine.current(state).summary.completed, 0); assert.deepEqual(learning(state), original);
  assert.equal(Engine.undo(state).ok, true); assert.equal(Engine.isManuallyMastered(state, id), true);
  valid(state);
});

test('Mastery summaries are validated in cached current, historical and undo placements', () => {
  const state = fixture(1, 'spelling'), id = ids(state)[0]; Engine.markMastered(state, id, now);
  const markedSummary = copy(state.session.summary);
  Engine.unmarkMastered(state, id, now);
  for (const placement of ['current', 'last', 'undo']) {
    for (const mutate of [summary => summary.mastered = '1', summary => summary.masteredIds.push(id), summary => summary.masteredIds = ['missing'], summary => summary.completed = 0]) {
      const bad = copy(state), summary = copy(markedSummary); mutate(summary);
      if (placement === 'current') bad.session.summary = summary;
      else if (placement === 'last') bad.lastSummary = summary;
      else bad.session.undo.session.summary = summary;
      assert.throws(() => Data.validate(bad));
    }
  }
  valid(state);
});
console.log('Manual mastery engine checks passed: ' + count);
