/* Audio controls and Escape regression checks against the built single HTML.
   Native media plays self-generated PCM WAV files; no media ended event is
   simulated. Only speech synthesis is a controlled CI substitute, so these
   checks do not make any claim about audible speech or installed voices. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {launchBrowser} = require('./runtime.cjs');
const paths = require('./paths.cjs');

const file = paths.releaseFile;
const out = path.join(paths.runRoot, 'audio-interaction');
fs.mkdirSync(out, {recursive: true});
const report = {
  file,
  sha256: fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null,
  checkedAt: new Date().toISOString(), browsers: [], checks: [], errors: [], screenshots: [], fixtureNotes: [],
  method: 'Disposable Chromium and WebKit contexts; original synthetic vocabulary and generated 1 s / 12 s silent PCM WAV files. Native HTMLAudioElement playback and ended events are observed by call-through instrumentation. Speech synthesis alone is a deterministic substitute. A WebKit build unable to persist Blob/File may load the same generated WAV bytes from an intercepted test HTTPS response; that limitation is recorded. UI mouse, keyboard and downloads use Playwright.',
  limitations: [
    'Silent WAV playback verifies the native media lifecycle, not audible quality. TTS is a controlled substitute, not real speech.',
    '390 px touch emulation is not a physical phone; mobile software-keyboard movement is not tested.',
    'Chromium uses browser-protocol composition input where available. WebKit uses explicitly synthetic composition events only to verify the key-handler guard.',
    'Chromium verifies Tab navigation to the stop button. WebKit focuses the native button before real Enter/Space events because this macOS runner skips buttons in its default Tab navigation.',
  ],
};
let browser;
const pass = (engine, name) => { report.checks.push({engine, name}); console.log('PASS', engine, name); };
const current = page => page.evaluate(() => VocabEngine.current(VocabApp.getState()));
const state = page => page.evaluate(() => VocabApp.getState());

function instrumentation() {
  const audit = window.__interactionAudit = {media: [], events: [], speech: [], keys: []};
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    const id = audit.media.length;
    audit.media.push(this);
    audit.events.push({name: 'play-call', id, at: performance.now()});
    for (const name of ['playing', 'ended', 'pause', 'error']) {
      this.addEventListener(name, () => audit.events.push({name, id, at: performance.now(), currentTime: this.currentTime, duration: this.duration, error: this.error?.code || null}));
    }
    return nativePlay.apply(this, args);
  };
  document.addEventListener('keydown', event => audit.keys.push({key: event.key, composing: event.isComposing, trusted: event.isTrusted}), true);
  // This deliberately replaces speech only. Media playback above remains native.
  let active = null;
  class TestUtterance extends EventTarget { constructor(text) { super(); this.text = text; } }
  const synthesis = {
    speaking: false, pending: false,
    getVoices: () => [{name: 'Controlled French test voice', lang: 'fr-FR', voiceURI: 'test-fr', localService: true}],
    addEventListener() {}, removeEventListener() {},
    cancel() {
      if (active) { clearTimeout(active.timer); audit.speech.push({name: 'cancel', text: active.utterance.text, at: performance.now()}); }
      active = null; this.speaking = false;
    },
    speak(utterance) {
      this.cancel(); this.speaking = true;
      const item = active = {utterance};
      audit.speech.push({name: 'speak', text: utterance.text, at: performance.now()});
      queueMicrotask(() => { if (active === item) utterance.onstart?.(new Event('start')); });
      item.timer = setTimeout(() => {
        if (active !== item) return;
        active = null; this.speaking = false;
        audit.speech.push({name: 'end', text: utterance.text, at: performance.now()});
        utterance.onend?.(new Event('end'));
      }, 900);
    },
  };
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {configurable: true, value: TestUtterance});
  Object.defineProperty(window, 'speechSynthesis', {configurable: true, value: synthesis});
}

async function ready(page) {
  await page.waitForFunction(() => window.VocabApp && window.VocabCarnetProduct && window.VocabCarnetReview);
  await page.evaluate(() => VocabCarnetProduct.ready);
  await page.waitForFunction(() => document.querySelector('.carnet-loading')?.hidden);
}
async function show(page, view) {
  await page.evaluate(view => VocabCarnetReview.show(view), view);
  await page.waitForFunction(view => document.body.dataset.carnetView === 'app' && VocabApp.getView() === view, view);
}
async function fresh(engine, viewport = {width: 1280, height: 900}, portableFile = null) {
  const context = await browser.newContext({viewport, reducedMotion: 'reduce', hasTouch: viewport.width === 390, isMobile: viewport.width === 390, acceptDownloads: true});
  await context.addInitScript(instrumentation);
  // These responses are used only if WebKit's file-origin Blob storage probe
  // identifies its known runner limitation. The media element and decoder stay native.
  await context.route('https://audio-interaction.invalid/*.wav', async route => {
    const seconds = route.request().url().endsWith('/short.wav') ? 1 : 12;
    const samples = 8000 * seconds, bytes = Buffer.alloc(44 + samples * 2);
    bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8); bytes.write('fmt ', 12);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24);
    bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
    await route.fulfill({status: 200, contentType: 'audio/wav', body: bytes});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(engine + ': ' + error.message));
  await page.goto(pathToFileURL(portableFile || file).href);
  await ready(page);
  if (!portableFile) {
    const fixture = await page.evaluate(async allowWebKitFallback => {
      const old = VocabApp.getState();
      const entries = [
        {french: 'observer', meaning: '观察', pos: 'v.', example: 'Je veux observer les nuages.', exampleZh: '我想观察云。'},
        {french: 'dessiner', meaning: '画画', pos: 'v.'},
        {french: 'marcher', meaning: '行走', pos: 'v.'},
        {french: 'écouter', meaning: '倾听', pos: 'v.'},
        {french: 'chercher', meaning: '寻找', pos: 'v.'},
        {french: 'chanter', meaning: '唱歌', pos: 'v.'},
      ];
      const next = VocabData.importEntries(VocabData.fresh(), entries, {mode: 'new', name: 'Audio and keyboard synthetic fixture'}).state;
      const wav = seconds => {
        const rate = 8000, samples = rate * seconds, bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
        const ascii = (offset, value) => [...value].forEach((char, index) => bytes[offset + index] = char.charCodeAt(0));
        ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        ascii(36, 'data'); view.setUint32(40, samples * 2, true);
        return new File([bytes], 'generated-' + seconds + 's-silence.wav', {type: 'audio/wav'});
      };
      const word = next.decks[0].words[0];
      let shortAudio = '', longAudio = '', storageLimitation = null;
      try {
        shortAudio = await AudioKit.importAudio(wav(1));
        longAudio = await AudioKit.importAudio(wav(12));
      } catch (error) {
        if (!allowWebKitFallback) throw error;
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('AUDIO_INTERACTION_STORAGE_PROBE', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('probe');
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        const probe = value => new Promise(resolve => {
          const transaction = db.transaction('probe', 'readwrite');
          const request = transaction.objectStore('probe').put(value, 'value');
          let failure = null;
          request.addEventListener('error', () => { failure = {name: request.error?.name, message: request.error?.message}; });
          transaction.oncomplete = () => resolve({ok: true});
          transaction.onabort = () => resolve({ok: false, ...failure});
        });
        const textResult = await probe('small text'), blobResult = await probe(wav(1));
        db.close(); indexedDB.deleteDatabase('AUDIO_INTERACTION_STORAGE_PROBE');
        if (!textResult.ok || blobResult.name !== 'UnknownError' || !/Blob\/File/.test(blobResult.message || '')) throw error;
        storageLimitation = {importError: error.message, textResult, blobResult};
        shortAudio = longAudio = '';
      }
      next.contexts[word.id] = [['short-wav', shortAudio, 'short'], ['long-wav', longAudio, 'long']].map(([id, audioId, name]) => ({
        id, audioId, text: 'Je veux observer les nuages.', translation: '我想观察云。',
        source: 'Self-authored regression fixture with generated silent PCM WAV', author: 'Project test', license: 'MIT',
        sourceUrl: '', licenseUrl: '', audioUrl: storageLimitation ? 'https://audio-interaction.invalid/' + name + '.wav' : '', type: 'human', origin: 'custom', favorite: true,
      }));
      Object.assign(next.settings, {onboardingComplete: true, showShortcutHints: true, autoWord: false, autoExample: false, listening: false, dailyGoalEnabled: false, language: 'zh', rate: 1});
      VocabEngine.ensureState(next);
      const saved = await VocabData.save(next, {expectedRevision: old.revision, snapshot: true});
      if (!saved.persistent) throw new Error('Synthetic fixture must persist in this disposable context.');
      return {storageLimitation};
    }, engine.startsWith('WebKit'));
    if (fixture.storageLimitation) {
      report.fixtureNotes.push({engine, ...fixture.storageLimitation});
      if (!report.limitations.some(note => note.startsWith('WebKit Blob/File'))) report.limitations.push('WebKit Blob/File persistence fails in this file-origin test runner. Its native audio checks use intercepted HTTPS responses containing the generated WAV; imported local recordings and embedded portable recordings are verified in Chromium only. No IndexedDB, AudioKit or native Audio implementation is replaced.');
    }
    await page.reload(); await ready(page);
  }
  await show(page, 'today');
  return {context, page};
}
async function closeModal(page) {
  await page.locator('#modal-close').click();
  await page.waitForFunction(() => !document.getElementById('modal').open);
  await page.waitForFunction(() => document.getElementById('audio-status').parentElement === document.body);
}
async function wordModal(page) {
  await show(page, 'library');
  const id = await page.evaluate(() => VocabApp.getState().decks[0].words[0].id);
  await page.locator('.word-row[data-id="' + id + '"]').click();
  await page.waitForFunction(() => document.getElementById('modal').open);
}
async function nativePlay(page, selector) {
  const count = await page.evaluate(() => __interactionAudit.media.length);
  await page.locator(selector).click();
  await page.waitForFunction(count => {
    const media = __interactionAudit.media[count];
    return media instanceof HTMLAudioElement && !media.paused && media.currentTime > 0.05 && media.readyState >= 2;
  }, count);
  return count;
}
async function stopped(page, id) {
  await page.waitForFunction(id => __interactionAudit.media[id].paused && !document.getElementById('audio-status').classList.contains('visible'), id);
  assert.equal(await page.evaluate(id => __interactionAudit.events.some(event => event.id === id && event.name === 'ended'), id), false, 'Stop must occur before the 12 s recording naturally ends');
}
async function controlStructure(page, inside) {
  assert.equal(await page.locator('#audio-status').count(), 1, 'There must be one shared stop control');
  const result = await page.locator('#audio-status').evaluate(element => ({
    tag: element.tagName, type: element.getAttribute('type'), role: element.getAttribute('role'),
    parent: element.parentElement.id, body: element.parentElement === document.body,
    inModalBody: !!element.closest('#modal-body'), beforeFooter: !!(element.compareDocumentPosition(document.getElementById('modal-footer')) & Node.DOCUMENT_POSITION_FOLLOWING),
  }));
  assert.equal(result.tag, 'BUTTON'); assert.equal(result.type, 'button');
  assert.ok(result.role !== 'status', 'A status role must not replace the native button role');
  if (inside) { assert.equal(result.parent, 'modal'); assert.equal(result.inModalBody, false); assert.equal(result.beforeFooter, true); }
  else assert.equal(result.body, true);
}
async function geometry(page, inside) {
  const result = await page.evaluate(inside => {
    const element = document.getElementById('audio-status'), rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const selectors = inside ? '#modal-footer button' : '.mobile-nav button,.study-actions button,.settings-savebar button';
    const overlap = [...document.querySelectorAll(selectors)].filter(button => {
      const b = button.getBoundingClientRect();
      return b.width && b.height && getComputedStyle(button).visibility !== 'hidden' && rect.left < b.right && rect.right > b.left && rect.top < b.bottom && rect.bottom > b.top;
    }).map(button => button.textContent.trim());
    return {rect: rect.toJSON(), width: innerWidth, height: innerHeight, hit: hit === element || element.contains(hit), overlap, overflow: document.documentElement.scrollWidth > innerWidth};
  }, inside);
  assert.ok(result.rect.width > 0 && result.rect.height > 0, JSON.stringify(result));
  assert.ok(result.rect.left >= 0 && result.rect.right <= result.width + 1 && result.rect.top >= 0 && result.rect.bottom <= result.height + 1, JSON.stringify(result));
  assert.equal(result.hit, true, 'The stop button must receive a real pointer hit');
  assert.deepEqual(result.overlap, [], 'The stop control must not cover footer or bottom navigation actions');
  assert.equal(result.overflow, false);
}
async function screenshot(page, name) {
  const target = path.join(out, name + '.png'); await page.screenshot({path: target}); report.screenshots.push(target);
}
async function begin(page, kind = 'spelling', index = 0) {
  await page.evaluate(({kind, index}) => VocabApp.begin(kind, {replace: true, limit: 1, ignoreGoal: true, wordIds: [VocabApp.getState().decks[0].words[index].id]}), {kind, index});
  await page.waitForFunction(() => VocabApp.getView() === 'study');
}
async function learningSnapshot(page) {
  return page.evaluate(() => {
    const state = VocabApp.getState();
    return {sessionId: state.session.id, question: state.session.current, events: state.events, cards: state.cards, skills: state.skills};
  });
}
async function audioChecks(engine, page) {
  await wordModal(page); await controlStructure(page, true);
  const selector = '#modal [data-action=play-context][data-context=long-wav]';
  let id = await nativePlay(page, selector);
  await geometry(page, true); await screenshot(page, engine + '-modal-stop');
  await page.locator('#audio-status').click(); await stopped(page, id);
  for (const key of ['Enter', 'Space']) {
    id = await nativePlay(page, selector);
    if (engine === 'Chromium') {
      // Chromium's Tab traversal includes buttons; macOS WebKit's default
      // keyboard-navigation preference can skip all buttons on the page.
      let reached = false;
      for (let count = 0; count < 30; count++) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(() => document.activeElement.id === 'audio-status');
        if (reached) break;
      }
      assert.equal(reached, true, 'The stop button must be keyboard reachable inside the modal');
    } else {
      await page.locator('#audio-status').focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'audio-status');
    }
    await page.keyboard.press(key); await stopped(page, id);
  }
  id = await nativePlay(page, selector); await closeModal(page); await stopped(page, id); await controlStructure(page, false);
  pass(engine, 'Native modal WAV stops through mouse, ' + (engine === 'Chromium' ? 'Tab + Enter, Tab + Space' : 'focused-button Enter/Space') + ' and modal close; a single native button moves between dialog and body');

  await show(page, 'contexts');
  id = await nativePlay(page, '#app [data-action=play-context][data-context=long-wav]');
  await controlStructure(page, false); await geometry(page, false);
  await page.locator('#audio-status').click(); await stopped(page, id);
  pass(engine, 'Example playback and stop remain usable outside a dialog');

  await wordModal(page);
  const first = await nativePlay(page, '#modal [data-action=loop-context][data-context=short-wav]');
  await page.waitForFunction(id => __interactionAudit.events.some(event => event.id === id && event.name === 'ended'), first);
  const before = await page.evaluate(() => ({plays: __interactionAudit.media.length, speech: __interactionAudit.speech.filter(event => event.name === 'speak').length}));
  assert.equal(before.plays, first + 1, 'Interrupt the first loop gap before another recording has started');
  await page.locator('#modal [data-action=say-specific]').click();
  await page.waitForFunction(before => __interactionAudit.speech.filter(event => event.name === 'speak').length > before, before.speech);
  assert.equal(await page.locator('#modal [data-action=loop-context][data-context=short-wav]').getAttribute('aria-pressed'), 'false');
  // Observe past the old 450 ms restart deadline and the controlled word's end.
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({plays: __interactionAudit.media.length, speech: __interactionAudit.speech, events: __interactionAudit.events}));
  const endedAt = after.events.find(event => event.id === first && event.name === 'ended').at;
  const wordAt = after.speech.filter(event => event.name === 'speak')[before.speech].at;
  assert.ok(wordAt >= endedAt && wordAt - endedAt < 450, 'Word playback must start during the actual 450 ms loop gap');
  assert.equal(after.plays, before.plays, 'The old example must not restart after word playback interrupts its loop gap');
  assert.ok(after.speech.some(event => event.name === 'end' && event.text === 'observer'), 'Controlled word speech should finish without being cancelled by the old loop');
  report.browsers.find(item => item.engine === engine).loopEvidence = after;
  await closeModal(page);
  pass(engine, 'A real 1 s WAV ended event starts the loop gap; playing the word clears the loop and prevents its delayed restart (controlled TTS)');
}
async function portableCheck(engine, page) {
  await show(page, 'settings');
  // Keep a real dialog open during export so serialization sees the relocated control.
  await page.locator('[data-action=help]:visible').first().click();
  await page.waitForFunction(() => document.getElementById('modal').open);
  await controlStructure(page, true);
  const downloadPromise = page.waitForEvent('download');
  // The existing export action is behind the modal, so invoke that actual UI
  // action without dismissing the dialog; no export implementation is replaced.
  await page.locator('#app [data-action=portable]').evaluate(button => button.click());
  const download = await downloadPromise;
  const portable = path.join(out, engine + '-portable.html'); await download.saveAs(portable);
  assert.equal((fs.readFileSync(portable, 'utf8').match(/id="audio-status"/g) || []).length, 1);
  await closeModal(page);
  const opened = await fresh(engine + '-portable', {width: 1280, height: 900}, portable);
  try {
    await controlStructure(opened.page, false);
    await wordModal(opened.page); await controlStructure(opened.page, true);
    const id = await nativePlay(opened.page, '#modal [data-action=play-context][data-context=long-wav]');
    await opened.page.locator('#audio-status').click(); await stopped(opened.page, id);
    await closeModal(opened.page); await controlStructure(opened.page, false);
  } finally { await opened.context.close(); }
  pass(engine, 'Portable export while the stop button is inside a dialog reopens with one working native stop control and ' + (report.fixtureNotes.some(note => note.engine === engine) ? 'test HTTPS WAV (WebKit local Blob persistence unavailable)' : 'embedded WAV'));
}
async function spellingChecks(engine, page, context) {
  await show(page, 'today'); await begin(page);
  const input = page.locator('#spell-input'), typed = 'ébauche qwe ps z';
  await input.fill(typed);
  const before = await learningSnapshot(page);
  await input.press('Escape');
  await page.waitForFunction(() => VocabApp.getView() === 'today');
  assert.equal((await state(page)).session.draft.typed, typed);
  assert.deepEqual(await learningSnapshot(page), before, 'Pause must not answer, advance or change learning records');
  await page.reload(); await ready(page); await show(page, 'today');
  await page.locator('[data-action=resume]').click(); await page.waitForFunction(() => VocabApp.getView() === 'study');
  assert.equal(await input.inputValue(), typed); assert.deepEqual(await learningSnapshot(page), before);
  pass(engine, 'Escape from a focused spelling input saves the draft and returns to Today; reload and Resume retain the same question, text and learning records');

  await page.locator('[data-action=study-options]').click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('modal').open);
  assert.equal(await page.evaluate(() => VocabApp.getView()), 'study'); assert.equal(await input.inputValue(), typed);
  assert.deepEqual(await learningSnapshot(page), before);
  pass(engine, 'Escape with a study dialog open closes only the dialog and preserves the spelling question');

  await input.focus();
  if (engine === 'Chromium') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition', {text: 'é', selectionStart: 1, selectionEnd: 1});
    const count = await page.evaluate(() => __interactionAudit.keys.length);
    await page.keyboard.press('Escape');
    const escape = await page.evaluate(count => __interactionAudit.keys.slice(count).find(event => event.key === 'Escape'), count);
    assert.ok(escape?.trusted && escape.composing, 'Browser protocol composition must produce a trusted composing Escape');
    assert.equal(await page.evaluate(() => VocabApp.getView()), 'study');
    await cdp.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0});
    await cdp.detach();
  } else {
    await input.evaluate(element => {
      element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: 'é'}));
      element.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Escape', isComposing: true}));
      element.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: ''}));
    });
    assert.equal(await page.evaluate(() => VocabApp.getView()), 'study');
  }
  assert.deepEqual(await learningSnapshot(page), before);
  pass(engine, engine === 'Chromium' ? 'Trusted Escape during browser-protocol IME composition does not leave study' : 'Synthetic composing Escape verifies the guard without leaving study (not a real WebKit IME test)');

  await input.fill('');
  const speechBefore = await page.evaluate(() => __interactionAudit.speech.filter(event => event.name === 'speak').length);
  await input.pressSequentially('qwepsz');
  assert.equal(await input.inputValue(), 'qwepsz');
  assert.equal((await current(page)).answered, false);
  assert.equal(await page.evaluate(() => __interactionAudit.speech.filter(event => event.name === 'speak').length), speechBefore);
  await input.fill((await current(page)).word.spell); await input.press('Enter');
  await page.waitForFunction(() => VocabEngine.current(VocabApp.getState()).answered);
  assert.equal((await current(page)).feedback.correct, true);
  pass(engine, 'Letters Q/W/E/P/S/Z remain ordinary spelling input; Enter still submits a correct answer');

  for (const [index, key, rating] of [[1, 'q', 3], [2, 'w', 2], [3, 'e', 1]]) {
    await begin(page, 'learn', index);
    await page.locator('[data-action=study-options]').click(); await page.locator('[data-action=skip-and-close]').click();
    await page.waitForFunction(() => VocabEngine.current(VocabApp.getState()).kind === 'recall');
    await page.locator('[data-action=reveal]').click();
    await page.waitForFunction(() => VocabEngine.current(VocabApp.getState()).revealed);
    await page.evaluate(() => document.activeElement?.blur());
    const count = (await state(page)).events.length;
    await page.keyboard.press(key); await page.waitForFunction(count => VocabApp.getState().events.length > count, count);
    assert.equal((await state(page)).events.at(-1).rating, rating);
  }
  await begin(page, 'learn', 0);
  await page.locator('[data-action=study-options]').click(); await page.locator('[data-action=skip-and-close]').click();
  await page.waitForFunction(() => VocabEngine.current(VocabApp.getState()).kind === 'recall');
  await page.locator('[data-action=reveal]').click();
  await page.waitForFunction(() => VocabEngine.current(VocabApp.getState()).revealed);
  await page.evaluate(() => document.activeElement?.blur());
  const count = await page.evaluate(() => __interactionAudit.speech.filter(event => event.name === 'speak').length);
  await page.keyboard.press('p'); await page.waitForFunction(count => __interactionAudit.speech.filter(event => event.name === 'speak').length > count, count);
  const media = await page.evaluate(() => __interactionAudit.media.length);
  await page.keyboard.press('s'); await page.waitForFunction(count => __interactionAudit.media.length > count, media);
  await page.locator('#audio-status').click();
  pass(engine, 'Outside text fields Q/W/E still grade recall, P speaks the word (controlled TTS), and S starts native example audio');
}
async function mobileChecks(engine) {
  const {context, page} = await fresh(engine + '-390', {width: 390, height: 844});
  try {
    for (const design of ['classic', 'atelier', 'verdure']) {
      await page.evaluate(design => VocabCarnetProduct.setAppearance({design, mode: 'light', motion: 'reduced'}), design);
      await wordModal(page);
      let id = await nativePlay(page, '#modal [data-action=play-context][data-context=long-wav]');
      await geometry(page, true); await screenshot(page, engine + '-390-' + design + '-modal');
      await page.locator('#audio-status').click(); await stopped(page, id); await closeModal(page);
      await show(page, 'contexts');
      id = await nativePlay(page, '#app [data-action=play-context][data-context=long-wav]');
      await geometry(page, false); await screenshot(page, engine + '-390-' + design + '-outside');
      await page.locator('#audio-status').click(); await stopped(page, id);
    }
    pass(engine, '390 px touch viewport: all three themes keep the stop button inside the screen, pointer reachable, and clear of modal footer and bottom navigation actions');
  } finally { await context.close(); }
}

(async () => {
  assert.ok(fs.existsSync(file), 'Build the standalone release candidate before this review.');
  for (const engine of ['Chromium', 'WebKit']) {
    browser = await launchBrowser(engine);
    report.browsers.push({engine, version: browser.version()});
    const {context, page} = await fresh(engine);
    try {
      await audioChecks(engine, page);
      await portableCheck(engine, page);
      await spellingChecks(engine, page, context);
    } finally { await context.close(); }
    await mobileChecks(engine);
    await browser.close(); browser = null;
  }
  assert.deepEqual(report.errors, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({passed: report.checks.length, output: out}));
})().catch(async error => {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({...report, error: error.stack}, null, 2));
  console.error(error); await browser?.close(); process.exitCode = 1;
});
