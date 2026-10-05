/* Validate restored learning records and exercise real flows with synthetic data. */
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
function practicedFixture(kind) {
  const state = fixture();
  Engine.start(state, kind, {limit:1}, now);
  const id = state.session.current.wordId;
  answer(state, 'bonjor');
  // The second answer also creates an undo snapshot with an existing skill record.
  Engine.answer(state, {typed:'bonjour'}, now + 1);
  return {state, id, key:kind === 'dictation' ? 'listening' : 'spelling'};
}
const skillError = /技能.*(?:无效|必须是对象)|数据包含无效数字/;
for (const kind of ['spelling','dictation']) {
  test(`${kind} backup preserves real practice counters and a usable undo record`, () => {
    const {state, id, key} = practicedFixture(kind);
    const restored = Data.migrate(JSON.stringify(Data.exportBackup(state)));
    assert.deepEqual(restored.skills, state.skills);
    assert.equal(restored.skills[id][key].corrections, 1);
    assert.equal(Engine.undo(restored).ok, true);
    assert.equal(restored.skills[id][key].attempts, 1);
    assert.equal(restored.skills[id][key].corrections, undefined);
    assert.equal(Engine.answer(restored, {typed:'bonjour'}, now + 2).ok, true);
    assert.equal(Data.validate(restored).skills[id][key].attempts, 2);
  });
  for (const placement of ['current','undo']) {
    function malformed(change) {
      const {state, id, key} = practicedFixture(kind);
      const skill = placement === 'current' ? state.skills[id] : state.session.undo.skill;
      change(skill, key);
      const original = structuredClone(state);
      assert.throws(() => Data.validate(state), skillError);
      assert.throws(() => Data.migrate({version:4, state}), skillError);
      assert.deepEqual(state, original, 'Rejected validation must not change the supplied state');
    }
    test(`${kind} ${placement} rejects every missing required counter without filling it`, () => {
      for (const field of ['attempts','correct','mistakes','assisted']) {
        malformed((skill, key) => {delete skill[key][field];});
      }
    });
    test(`${kind} ${placement} rejects malformed skill records`, () => {
      for (const bad of [null, [], 'record', 0, false]) malformed((skill, key) => {skill[key] = bad;});
    });
    test(`${kind} ${placement} rejects invalid required and optional counters`, () => {
      for (const field of ['attempts','correct','mistakes','assisted','corrections']) {
        for (const bad of ['1', null, true, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
          malformed((skill, key) => {skill[key][field] = bad;});
        }
      }
    });
    test(`${kind} ${placement} rejects invalid practice times`, () => {
      for (const bad of ['2026-01-01', false, -1, 0.5, NaN, Infinity, 8640000000000001]) {
        malformed((skill, key) => {skill[key].lastPracticedAt = bad;});
      }
    });
    test(`${kind} ${placement} accepts supported optional fields without adding history`, () => {
      for (const lastPracticedAt of [undefined, null, 0, now, 8640000000000000]) {
        for (const corrections of [undefined, 0, 1]) {
          const {state, id, key} = practicedFixture(kind);
          const skill = placement === 'current' ? state.skills[id] : state.session.undo.skill;
          skill[key] = {attempts:0, correct:0, mistakes:0, assisted:0};
          if (lastPracticedAt !== undefined) skill[key].lastPracticedAt = lastPracticedAt;
          if (corrections !== undefined) skill[key].corrections = corrections;
          const original = copy(state);
          const restored = Data.migrate(Data.exportBackup(state));
          assert.deepEqual(state, original);
          assert.deepEqual(placement === 'current' ? restored.skills[id] : restored.session.undo.skill, skill);
        }
      }
    });
  }
}
test('An older v4 backup without skills starts practice without fabricating prior attempts', () => {
  const state = fixture();
  delete state.skills;
  const restored = Data.migrate({version:4, state});
  assert.deepEqual(restored.skills, {});
  Engine.start(restored, 'spelling', {limit:1}, now);
  const id = restored.session.current.wordId;
  assert.equal(Engine.answer(restored, {typed:'bonjour'}, now).ok, true);
  assert.equal(Data.validate(restored).skills[id].spelling.attempts, 1);
});
test('Missing, null and empty undo skills remain compatible with an unpracticed word', () => {
  for (const prior of [undefined, null, {}]) {
    const {state, id} = practicedFixture('spelling');
    if (prior === undefined) delete state.session.undo.skill;
    else state.session.undo.skill = prior;
    const restored = Data.migrate(Data.exportBackup(state));
    assert.equal(Engine.undo(restored).ok, true);
    assert.equal(Engine.answer(restored, {typed:'bonjour'}, now + 2).ok, true);
    assert.equal(Data.validate(restored).skills[id].spelling.attempts, 1);
  }
});
test('Unknown skill metadata remains untouched', () => {
  const {state, id} = practicedFixture('spelling');
  state.skills[id].note = {text:'Synthetic metadata'};
  state.skills[id].spelling.note = 'Retain unrelated fields';
  assert.deepEqual(Data.migrate(Data.exportBackup(state)).skills, state.skills);
});
async function persistenceChecks() {
  // Disposable fallback storage: never open or modify a browser profile.
  const memory = new Map();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{
    getItem:key => memory.get(key) ?? null,
    setItem:(key, value) => memory.set(key, String(value)),
    removeItem:key => memory.delete(key),
  }});
  async function check(name, run) { await run(); checks++; console.log('PASS', name); }
  try {
    await Data.load();
    let saved;
    await check('Normal backups restore, answer, save and reload with exact skill counters', async () => {
      const {state, id, key} = practicedFixture('spelling');
      const backup = Data.exportBackup(state);
      saved = await Data.save(Data.migrate(backup), {expectedRevision:0, snapshot:true, recover:true});
      assert.equal(saved.persistent, true);
      const restored = (await Data.load()).state;
      Engine.next(restored, now + 2);
      assert.equal(Engine.answer(restored, {typed:'bonjour'}, now + 2).independent, true);
      saved = await Data.save(restored, {expectedRevision:restored.revision});
      assert.equal(saved.persistent, true);
      assert.equal((await Data.load()).state.skills[id][key].attempts, 3);
    });
    await check('Rejected skill saves and snapshot restores retain the stored data and revision', async () => {
      const id = saved.state.session.current.wordId;
      for (const placement of ['current','undo']) {
        const invalid = copy(saved.state);
        const skill = placement === 'current' ? invalid.skills[id] : invalid.session.undo.skill;
        delete skill.spelling.attempts;
        const original = copy(invalid), stored = memory.get(Data.KEY);
        await assert.rejects(Data.save(invalid, {expectedRevision:invalid.revision, snapshot:true, recover:true}), skillError);
        assert.equal(memory.get(Data.KEY), stored);
        assert.deepEqual(invalid, original);
        const snapshot = JSON.stringify({id:'previous', savedAt:now, state:invalid});
        memory.set(Data.KEY + '_SNAPSHOT', snapshot);
        await assert.rejects(Data.restoreSnapshot('previous', saved.state.revision), skillError);
        assert.equal(memory.get(Data.KEY), stored);
        assert.equal(memory.get(Data.KEY + '_SNAPSHOT'), snapshot);
        assert.equal((await Data.load()).state.revision, saved.state.revision);
      }
    });
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
  console.log(`${checks} runtime validation checks passed.`);
}
persistenceChecks().catch(error => { console.error(error); process.exitCode = 1; });
