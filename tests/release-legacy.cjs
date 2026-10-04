/* Release-only compatibility checks. All fixtures live in fresh disposable
   browser contexts; the user's profile and learning records are never opened. */
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {launchBrowser}=require('./runtime.cjs');
const paths = require('./paths.cjs');
const releaseConfig = paths.releaseConfig;
const releaseFile = paths.releaseFile;
const sourceRoot = paths.sourceRoot;
const resultRoot = path.join(paths.runRoot,'legacy-compatibility');
const experimentFile = path.join(resultRoot,'synthetic-isolated-mode.html');
fs.mkdirSync(resultRoot, {recursive:true});
const C = require(path.join(sourceRoot, 'legacy-core.js'));
const P = require(path.join(sourceRoot, 'legacy-parser.js'));
const now = Date.UTC(2026, 9, 1, 8);
const seed = C.createState(now);
const parsed = P.parseRows([['法语','中文','词性'],['livre','书','n.m.'],['lire','阅读','v.']], {header:'auto'});
assert.equal(parsed.entries.length, 2);
const deck = C.createDeck(seed, 'Synthetic legacy compatibility fixture', parsed.entries, now);
Object.assign(deck.progress.learn.words[deck.words[0].id], {stage:5, attempts:4, mistakes:1, started:true, lastReviewedAt:now, dueAt:now+86400000, intervalDays:1, reviewCount:1, eligibleStep:4});
deck.progress.learn.step=4;
deck.progress.learn.recent=[deck.words[0].id];
Object.assign(deck.progress.speed.words[deck.words[1].id], {stage:4, attempts:2, mistakes:1, started:true, lastReviewedAt:now, eligibleStep:2});
deck.progress.speed.step=2;
deck.progress.speed.recent=[deck.words[1].id];
seed.settings.voiceURI='Synthetic legacy French voice';
seed.settings.rate=1.1;
const fixture = C.validateState(seed);
const checks = [], errors = [], cases = [];
const pass = name => {checks.push(name);console.log('PASS', name);};
let browser;
async function waitForApp(page) {
  await page.waitForFunction(() => window.VocabApp && window.VocabCarnetProduct, {timeout:30000});
  await page.evaluate(() => VocabCarnetProduct.ready);
}
function recordsFor(kind) {
  const records = {'FR_VOCAB_INTERFACE_LANGUAGE':'fr'};
  const legacy = structuredClone(fixture);
  if (kind === 'blocks-v1') {
    legacy.storageFormat='blocks-v1';
    legacy.decks=legacy.decks.map(item => {
      const {words,...index}=item;
      const wordRef='FR_VOCAB_APP_V2_WORDS_'+item.id;
      records[wordRef]=JSON.stringify(words);
      return {...index,wordRef};
    });
  }
  records.FR_VOCAB_APP_V2=JSON.stringify(legacy);
  return records;
}
async function seedBeforeStartup(context, records) {
  await context.addInitScript(values => {
    // The guard also proves that a reload uses the new persistent save rather
    // than reseeding the migration fixture on every document load.
    if (!localStorage.getItem('RELEASE_LEGACY_FIXTURE_SEEDED')) {
      for (const [key,value] of Object.entries(values)) localStorage.setItem(key,value);
      localStorage.setItem('RELEASE_LEGACY_FIXTURE_SEEDED','1');
    }
    const open=indexedDB.open.bind(indexedDB);
    window.releaseDatabaseOpens=[];
    indexedDB.open=function(name,...args){window.releaseDatabaseOpens.push(name);return open(name,...args);};
  }, records);
}
async function testMigration(kind) {
  const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const records=recordsFor(kind);
  await seedBeforeStartup(context, records);
  const page=await context.newPage();
  page.on('pageerror', error=>errors.push(kind+': '+error.message));
  await page.goto(pathToFileURL(releaseFile).href);
  await waitForApp(page);
  const initial=await page.evaluate(() => ({release:window.VOCAB_RELEASE,preview:window.CARNET_PREVIEW,state:VocabApp.getState(),startup:VocabCarnetProduct.getStartup(),keys:[VocabData.KEY,VocabData.DB_NAME]}));
  assert.equal(initial.release,releaseConfig.version);
  assert.equal(initial.preview,false);
  assert.equal(initial.startup.persistent,true);
  assert.deepEqual(initial.keys,['FR_VOCAB_APP_V4','FR_VOCAB_DATA_V4']);
  assert.equal(initial.state.version,4);
  assert.equal(initial.state.migration.from,2);
  assert.deepEqual(initial.state.migration.original,fixture);
  assert.deepEqual(initial.state.decks,fixture.decks);
  assert.equal(initial.state.activeDeckId,fixture.activeDeckId);
  assert.deepEqual(initial.state.settings.studyDeckIds,fixture.settings.studyDeckIds);
  assert.equal(initial.state.settings.language,'fr');
  assert.equal(initial.state.settings.voiceURI,fixture.settings.voiceURI);
  assert.equal(initial.state.settings.rate,fixture.settings.rate);
  assert.deepEqual(initial.state.events,[]);
  pass(kind+': automatic V2 load preserves complete original, dual-mode progress, scope and French preference');
  assert.equal(await page.evaluate(() => VocabCarnetProduct.setAppearance({design:'classic',mode:'dark',motion:'reduced'})),true);
  const saved=await page.evaluate(() => VocabApp.getState());
  assert.equal(saved.revision,1);
  await page.reload();
  await waitForApp(page);
  const after=await page.evaluate(() => VocabApp.getState());
  assert.deepEqual(after,saved);
  const dbState=await page.evaluate(async () => {
    const data=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('FR_VOCAB_DATA_V4',1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('data'),read=tx.objectStore('data').get('state');read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>reject(read.error);};
    });
    return data.storageFormat==='history-blocks-v1'?data.state:data;
  });
  assert.deepEqual(dbState,saved);
  const retained=await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),Object.keys(records));
  assert.deepEqual(retained,records);
  await page.evaluate(() => AudioKit.storageStatus());
  const databases=await page.evaluate(async()=>({names:(await indexedDB.databases()).map(item=>item.name),opened:window.releaseDatabaseOpens}));
  assert.ok(databases.names.includes('FR_VOCAB_MEDIA_V4'));
  assert.ok(databases.names.includes('FR_VOCAB_DATA_V4'));
  assert.ok(databases.opened.every(name=>!name.includes('ATELIER')));
  pass(kind+': original save/reload uses formal data/media databases and leaves V2 index/blocks unchanged');
  cases.push({kind,words:after.decks[0].words.length,revision:after.revision,language:after.settings.language,retainedLegacyKeys:Object.keys(records),databases});
  await context.close();
}
async function testExperimentIsolation() {
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await seedBeforeStartup(context,{...recordsFor('plain'),FR_VOCAB_APP_V4:'{"marker":"formal fallback must remain untouched"}'});
  const page=await context.newPage();page.on('pageerror',error=>errors.push('isolation: '+error.message));
  await page.goto(pathToFileURL(experimentFile).href);
  await waitForApp(page);
  assert.equal(await page.evaluate(()=>window.VOCAB_RELEASE),undefined);
  assert.equal(await page.evaluate(()=>VocabApp.getState().decks.length),0);
  // Exercise the updated source modules without the release flag, not only
  // the unchanged historical experimental bundle.
  await page.addScriptTag({content:fs.readFileSync(path.join(sourceRoot,'data.js'),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(path.join(sourceRoot,'audio.js'),'utf8')});
  const isolated=await page.evaluate(async()=>({keys:[VocabData.KEY,VocabData.DB_NAME],load:await VocabData.load(),media:await AudioKit.storageStatus(),opened:window.releaseDatabaseOpens,formal:localStorage.getItem('FR_VOCAB_APP_V4')}));
  assert.deepEqual(isolated.keys,['FR_VOCAB_ATELIER_APP_V4','FR_VOCAB_ATELIER_DATA_V4']);
  assert.equal(isolated.load.state.decks.length,0);
  assert.equal(isolated.load.state.migration,null);
  assert.equal(isolated.formal,'{"marker":"formal fallback must remain untouched"}');
  assert.ok(isolated.opened.includes('FR_VOCAB_ATELIER_DATA_V4'));
  assert.ok(isolated.opened.includes('FR_VOCAB_ATELIER_MEDIA_V4'));
  assert.ok(isolated.opened.every(name=>name.includes('ATELIER')));
  pass('no release flag: updated data/audio source retains ATELIER isolation and ignores formal V2/V4 records');
  cases.push({kind:'experiment-isolation',keys:isolated.keys,opened:isolated.opened});
  await context.close();
}
(async()=>{
  assert.ok(fs.existsSync(releaseFile),'Build the formal release before this check: '+releaseFile);
  // Generate an experiment-mode fixture from this public build; never require private history.
  const releaseHtml=fs.readFileSync(releaseFile,'utf8');
  assert.match(releaseHtml,/window\.VOCAB_RELEASE\s*=\s*[\"'][^\"']+[\"'];/);
  fs.writeFileSync(experimentFile,releaseHtml.replace(/window\.VOCAB_RELEASE\s*=\s*[\"'][^\"']+[\"'];/,'').replace(/\bwindow\.CARNET_PREVIEW=true;/,'window.CARNET_PREVIEW=false;'));
  browser=await launchBrowser('Chromium');
  await testMigration('plain');
  await testMigration('blocks-v1');
  await testExperimentIsolation();
  assert.deepEqual(errors,[]);pass('all release compatibility paths produce zero browser page errors');
  fs.writeFileSync(path.join(resultRoot,'release-legacy-results.json'),JSON.stringify({releaseFile,checks:checks.length,passed:checks,cases,errors,storage:'Only synthetic records in new disposable Chromium contexts; no user profile read or changed.'},null,2));
  console.log('Results:',resultRoot);
})().catch(error=>{fs.writeFileSync(path.join(resultRoot,'release-legacy-failure.json'),JSON.stringify({releaseFile,checks,cases,errors,error:error.stack},null,2));console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
