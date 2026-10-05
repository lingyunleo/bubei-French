/* Audio backup compatibility and size guards on the actual standalone release.
   Uses native Chromium IndexedDB in disposable contexts and generated PCM WAVs. */
const {launchBrowser}=require('./runtime.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const paths=require('./paths.cjs'),file=paths.releaseFile,out=path.join(paths.runRoot,'audio-backup');
fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],requests=[];
let browser;
const pass=name=>{checks.push(name);console.log('PASS',name)};
const sorted=records=>[...records].sort((a,b)=>a.id.localeCompare(b.id));

async function fresh(){
  const context=await browser.newContext({reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    // Each file is valid mono 16-bit PCM. The sample marker makes tiny recordings
    // distinct without checking in recordings or depending on a user's files.
    window.__audioBackupRecord=(id,marker=0,size=52)=>{
      const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
      const ascii=(offset,text)=>[...text].forEach((c,i)=>bytes[offset+i]=c.charCodeAt(0));
      ascii(0,'RIFF');view.setUint32(4,size-8,true);ascii(8,'WAVE');ascii(12,'fmt ');
      view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
      view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
      ascii(36,'data');view.setUint32(40,size-44,true);view.setUint32(44,marker,true);
      let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
      return {id,name:id+'.wav',type:'audio/wav',data:btoa(binary),addedAt:1700000000000+marker,
        source:'Project-generated PCM WAV',author:'Synthetic test fixture',license:'CC0 synthetic audio',
        sourceUrl:'https://example.org/synthetic-audio',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
        text:'Bonjour '+marker,translation:'Synthetic example '+marker};
    };
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url())});
  await page.goto(pathToFileURL(file).href);
  await ready(page);
  assert.equal(await page.evaluate(()=>VocabApp.getState().decks.length),0);
  return {page,context};
}
async function ready(page){
  await page.waitForFunction(()=>window.AudioKit&&window.VocabApp&&window.VocabCarnetProduct);
  await page.evaluate(()=>VocabCarnetProduct.ready);
  await page.waitForFunction(()=>document.querySelector('.carnet-loading')?.hidden);
}
async function rejectRestore(page,records,pattern){
  const before=await page.evaluate(()=>AudioKit.exportMedia());
  const error=await page.evaluate(async records=>{
    try{await AudioKit.restoreMedia(records);return null}catch(error){return error.message}
  },records);
  assert.match(error,pattern);
  assert.deepEqual(await page.evaluate(()=>AudioKit.exportMedia()),before,'Failed validation must leave existing recordings unchanged');
}

(async()=>{
  assert.ok(fs.existsSync(file),'Build the standalone release candidate before running this review.');
  browser=await launchBrowser('Chromium');
  const source=await fresh();
  const seeded=await source.page.evaluate(async()=>{
    const records=Array.from({length:2001},(_,i)=>__audioBackupRecord('synthetic-audio-'+String(i).padStart(4,'0'),i));
    const audioContext=new AudioContext({sampleRate:8000});
    try{
      const bytes=Uint8Array.from(atob(records[0].data),c=>c.charCodeAt(0));
      const decoded=await audioContext.decodeAudioData(bytes.buffer);
      if(decoded.numberOfChannels!==1||decoded.length!==4)throw new Error('Synthetic WAV did not decode as expected');
    }finally{await audioContext.close()}
    const result=await AudioKit.restoreMedia(records);
    return {result,records,status:await AudioKit.storageStatus()};
  });
  assert.equal(seeded.result.count,2001);assert.equal(seeded.result.addedIds.length,2001);
  assert.equal(seeded.status.available,true);assert.equal(seeded.status.count,2001);assert.equal(seeded.status.bytes,2001*52);
  for(const record of seeded.records)assert.equal(seeded.result.mapping[record.id],record.id);
  await source.page.reload();await ready(source.page);
  const exported=await source.page.evaluate(()=>AudioKit.exportMedia());
  assert.deepEqual(sorted(exported),sorted(seeded.records));
  pass('2001 distinct valid WAVs persist in native IndexedDB and export all IDs, bytes and source/license metadata after reload');

  const target=await fresh();
  const restored=await target.page.evaluate(records=>AudioKit.restoreMedia(records),exported);
  assert.equal(restored.count,2001);assert.equal(restored.addedIds.length,2001);
  for(const record of exported)assert.equal(restored.mapping[record.id],record.id);
  assert.deepEqual(sorted(await target.page.evaluate(()=>AudioKit.exportMedia())),sorted(exported));
  const repeated=await target.page.evaluate(records=>AudioKit.restoreMedia(records),exported);
  assert.equal(repeated.count,2001);assert.deepEqual(repeated.addedIds,[]);
  assert.equal((await target.page.evaluate(()=>AudioKit.storageStatus())).count,2001);
  pass('An exported 2001-record backup restores completely into a fresh browser context; restoring it again reuses every recording');
  await source.context.close();await target.context.close();

  const guards=await fresh(),page=guards.page;
  const original=await page.evaluate(()=>__audioBackupRecord('original',123));
  await page.evaluate(record=>AudioKit.restoreMedia([record]),original);
  const collision=await page.evaluate(async()=>{
    const record=__audioBackupRecord('original',456),result=await AudioKit.restoreMedia([record]);
    return {record,result};
  });
  const collisionId=collision.result.mapping.original;
  assert.notEqual(collisionId,'original');assert.deepEqual(collision.result.addedIds,[collisionId]);
  assert.deepEqual(sorted(await page.evaluate(()=>AudioKit.exportMedia())),sorted([original,{...collision.record,id:collisionId}]));
  pass('An existing ID with different audio gets a new ID and mapping without replacing the original recording');

  const valid=await page.evaluate(()=>__audioBackupRecord('valid-before-invalid',789));
  const builtinId=await page.evaluate(()=>VocabBuiltinMedia[0].id);
  await rejectRestore(page,{},/音频备份格式无效/);
  for(const [records,pattern] of [
    [[valid,{...valid}],/无效、重复或保留/],
    [[valid,{...valid,id:'invalid id'}],/无效、重复或保留/],
    [[valid,{...valid,id:builtinId}],/无效、重复或保留/],
    [[valid,{...valid,id:'bad-type',type:'text/plain'}],/音频格式无效或过大/],
    [[valid,{...valid,id:'bad-base64',data:'!not-base64'}],/音频格式无效或过大/],
    [[valid,{...valid,id:'bad-content',data:Buffer.from('This is plain text, not audio.').toString('base64')}],/不是可识别的音频/],
    [[valid,{...valid,id:'bad-source',sourceUrl:'http://example.org/audio'}],/HTTPS/],
    [[valid,{...valid,id:'bad-license',licenseUrl:'https://name:password@example.org/license'}],/HTTPS/],
  ])await rejectRestore(page,records,pattern);
  const rights=await page.evaluate(async()=>{
    try{await AudioKit.cacheAudio({type:'human',audioUrl:'https://example.org/audio.wav'});return null}catch(error){return error.message}
  });
  assert.match(rights,/来源及许可/);
  pass('Array shape, duplicate/invalid/reserved IDs, MIME, base64, audio signature, source/license URLs and cache rights remain checked; rejected batches write nothing');
  await guards.context.close();

  const limits=await fresh();
  const boundaries=await limits.page.evaluate(async()=>{
    const {MAX_FILE,MAX_TOTAL}=AudioKit;
    const exact=__audioBackupRecord('exact-file-limit',800,MAX_FILE);
    const saved=await AudioKit.restoreMedia([exact]);
    const before=await AudioKit.storageStatus(),failures={};
    async function reject(name,records){
      try{await AudioKit.restoreMedia(records);failures[name]=null}catch(error){failures[name]=error.message}
      const after=await AudioKit.storageStatus();
      if(after.count!==before.count||after.bytes!==before.bytes)throw new Error(name+' changed audio storage after rejection');
    }
    // One decoded byte past the cap fits the existing encoded-size allowance,
    // so this specifically exercises the decoded-file guard.
    const above=__audioBackupRecord('above-file-limit',801,MAX_FILE+1);
    await reject('decodedFile',[above]);
    await reject('encodedFile',[{...above,data:above.data+'AAAA'}]);
    // Repeated bytes keep fixture generation small. The batch is rejected before
    // deduplication because its decoded total exceeds the restore limit.
    const overTotal=Array.from({length:MAX_TOTAL/MAX_FILE},(_,i)=>({...exact,id:'total-'+i}));
    overTotal.push(__audioBackupRecord('over-total',802));
    await reject('decodedTotal',overTotal);
    return {MAX_FILE,MAX_TOTAL,saved,before,failures};
  });
  assert.equal(boundaries.MAX_FILE,15*1024*1024);assert.equal(boundaries.MAX_TOTAL,150*1024*1024);
  assert.deepEqual(boundaries.saved.addedIds,['exact-file-limit']);
  assert.equal(boundaries.before.bytes,boundaries.MAX_FILE);
  assert.match(boundaries.failures.decodedFile,/单个音频不能超过 15 MB/);
  assert.match(boundaries.failures.encodedFile,/音频格式无效或过大/);
  assert.match(boundaries.failures.decodedTotal,/音频备份不能超过 150 MB/);
  pass('The exact 15 MiB file limit remains accepted; oversized encoded files, decoded files and a batch above 150 MiB remain rejected without writes');
  await limits.context.close();

  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  const report={release:file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),browser:browser.version(),checkedAt:new Date().toISOString(),checks,errors,requests,
    method:'Formal standalone HTML; fresh isolated Chromium contexts; native IndexedDB and audio decoding; dynamically generated synthetic PCM WAVs only.'};
  fs.writeFileSync(path.join(out,'audio-backup-review.json'),JSON.stringify(report,null,2));
  await browser.close();console.log('DONE',checks.length,out);
})().catch(async error=>{
  fs.writeFileSync(path.join(out,'audio-backup-review-failed.json'),JSON.stringify({release:file,checks,errors,requests,error:error.stack},null,2));
  console.error(error);await browser?.close();process.exitCode=1;
});
