/* Validate restored summaries and exercise real learning flows with synthetic data. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {sourceRoot} = require('./paths.cjs');
const Data = require(path.join(sourceRoot, 'data.js'));
const Engine = require(path.join(sourceRoot, 'engine.js'));
const now = Date.UTC(2026, 0, 1);
const copy = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function test(name, run) { run(); checks++; console.log('PASS', name); }
function fixture() {
  let state = Data.importEntries(Data.fresh(), [
    {french:'bonjour', meaning:'你好', pos:'interj.'},
    {french:'merci', meaning:'谢谢', pos:'interj.'},
  ], {name:'Synthetic test words', mode:'new'}).state;
  state.settings.studyDeckIds = [state.decks[0].id];
  state.settings.listening = false;
  return state;
}
function answer(state, typed) {
  const result = Engine.answer(state, {typed}, now);
  assert.equal(result.ok, true);
  Engine.next(state, now);
  Data.validate(state);
  return result;
}
let completed;
test('A corrected word is revisited in a later round; only an independent pass completes it', () => {
  const state = fixture();
  Engine.start(state, 'spelling', {limit:2}, now);
  const id = state.session.current.wordId;
  answer(state, 'bonjor');
  assert.equal(state.session.current.wordId, id);
  assert.equal(state.session.current.correction, true);
  answer(state, 'bonjour');
  assert.equal(state.session.completedIds.includes(id), false);
  answer(state, 'merci');
  assert.equal(state.session.round, 2);
  assert.equal(state.session.current.wordId, id);
  assert.equal(state.session.current.correction, false);
  answer(state, 'bonjour');
  assert.equal(state.session.done, true);
  assert.equal(state.session.summary.completed, 2);
  assert.equal(state.session.summary.rounds, 2);
  completed = state;
});
test('Valid current, last and undo summaries survive backup export and restore validation', () => {
  const state = Data.validate(Data.exportBackup(completed).state);
  Engine.finish(state);
  assert.equal(Data.validate(state).lastSummary.completed, 2);
  assert.ok(completed.session.undo.session);
  assert.ok(Data.validate(completed).session.undo);
});
for (const placement of ['current', 'last', 'undo']) {
  for (const [field, bad] of [['completed','two'], ['answers',-1], ['total',2.5], ['rounds',0], ['wordIds',['unrelated']], ['completedIds',null]]) {
    test(`${placement} summary rejects invalid ${field}`, () => {
      const state = copy(completed), summary = copy(state.session.summary);
      summary[field] = bad;
      if (placement === 'current') state.session.summary = summary;
      else if (placement === 'last') {state.lastSummary = summary; state.session = null;}
      else state.session.undo.session.summary = summary;
      assert.throws(() => Data.validate(state), /学习任务记录无效/);
    });
  }
}
test('Displayed summary is derived from actual session counters', () => {
  const state = copy(completed);
  state.session.summary.answers = 123;
  assert.equal(Engine.current(state).summary.answers, state.session.answers);
  Engine.finish(state);
  assert.notEqual(state.lastSummary.answers, 123);
});
test('Historical last summary remains valid after its word list is removed', () => {
  const state = copy(completed);
  Engine.finish(state);
  state.decks = []; state.cards = {}; state.skills = {}; state.contexts = {}; state.aliases = {};
  state.settings.studyDeckIds = []; state.activeDeckId = null; state.events = [];
  assert.equal(Data.validate(state).lastSummary.completed, 2);
});
test('Undo restores the prior attempt and permits an independent answer', () => {
  const state = fixture();
  Engine.start(state, 'spelling', {limit:1}, now);
  Engine.answer(state, {typed:'bonjor'}, now);
  assert.equal(Engine.undo(state).ok, true);
  assert.equal(state.events.length, 0);
  assert.equal(state.session.answers, 0);
  assert.equal(answer(state, 'bonjour').independent, true);
  assert.equal(state.session.done, true);
});
console.log(`${checks} runtime validation checks passed.`);
