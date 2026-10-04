/* Node-only checks for portable paths and browser configuration. No browser or user data. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const scratch=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vocab-portability-')));
const checks=[];
function pass(name){checks.push(name);console.log('PASS',name)}
function probe(moduleFile,expression,extra={}){
  const env={...process.env};
  for(const key of ['CARNET_RELEASE_HTML','VOCAB_RELEASE_FILE','CARNET_PREVIOUS_RELEASE','CARNET_PLAYWRIGHT','CARNET_CHROME','CARNET_WEBKIT_CACHE'])delete env[key];
  Object.assign(env,{CARNET_RESULTS:path.join(scratch,'results')},extra);
  const script='const value=require('+JSON.stringify(moduleFile)+');console.log(JSON.stringify('+expression+'))';
  const output=execFileSync(process.execPath,['-e',script],{cwd:os.tmpdir(),env,encoding:'utf8'});
  return JSON.parse(output.trim().split('\n').at(-1));
}
try{
  const current=probe(path.join(__dirname,'paths.cjs'),'({layout:value.layout,source:value.sourceRoot,config:value.releaseConfig,release:value.releaseFile,previous:value.previousRelease})');
  assert.ok(fs.existsSync(path.join(current.source,'data.js')));assert.equal(current.previous,null);assert.equal(path.basename(current.release),path.basename(current.config.output||'不背法语-'+current.config.version+'.html'));
  pass('Current repository resolves its source/config/release from a different working directory');
  const repo=path.join(scratch,'public-project'),tests=path.join(repo,'tests');fs.mkdirSync(tests,{recursive:true});fs.mkdirSync(path.join(repo,'src'));
  fs.copyFileSync(path.join(__dirname,'paths.cjs'),path.join(tests,'paths.cjs'));
  const config={version:'8.9.10',previousVersion:'8.9.9'};fs.writeFileSync(path.join(repo,'release.json'),JSON.stringify(config));
  let result=probe(path.join(tests,'paths.cjs'),'({layout:value.layout,source:value.sourceRoot,release:value.releaseFile,previous:value.previousRelease})');
  assert.equal(result.layout,'public');assert.equal(result.source,path.join(repo,'src'));assert.equal(result.release,path.join(repo,'不背法语-8.9.10.html'));assert.equal(result.previous,null);
  pass('Flat public src/tests/release.json layout has no dependency on experimental or historical folders');
  fs.writeFileSync(path.join(repo,'release.json'),JSON.stringify({...config,output:'dist/vocabulary.html'}));
  result=probe(path.join(tests,'paths.cjs'),'value.releaseFile');assert.equal(result,path.join(repo,'dist/vocabulary.html'));
  const override=path.join(scratch,'custom-release.html');result=probe(path.join(tests,'paths.cjs'),'value.releaseFile',{CARNET_RELEASE_HTML:override});assert.equal(result,override);
  pass('Config output and explicit release override resolve consistently');
  const old=path.join(scratch,'old-public-release.html');fs.writeFileSync(old,'synthetic public release');
  result=probe(path.join(tests,'paths.cjs'),'value.previousRelease',{CARNET_PREVIOUS_RELEASE:old});assert.equal(result,old);
  result=probe(path.join(tests,'paths.cjs'),'({file:value.previousRelease,requested:value.previousReleaseRequested})',{CARNET_PREVIOUS_RELEASE:old+'.missing'});assert.equal(result.file,null);assert.equal(result.requested,old+'.missing');
  pass('Optional previous release is explicit; missing history is distinguishable from tested coverage');
  fs.copyFileSync(path.join(__dirname,'runtime.cjs'),path.join(tests,'runtime.cjs'));
  const mock=path.join(repo,'node_modules','playwright');fs.mkdirSync(mock,{recursive:true});
  fs.writeFileSync(path.join(mock,'index.js'),"exports.chromium={launch:async value=>value};exports.webkit={launch:async value=>value,executablePath:()=>require('node:path').join(require('node:os').tmpdir(),'browser-cache','webkit-1234','pw_run.sh')};");
  result=probe(path.join(tests,'runtime.cjs'),"({chromium:value.launchOptions('Chromium'),webkit:value.launchOptions('WebKit')})");assert.equal(result.chromium.headless,true);assert.equal(result.webkit.headless,true);assert.equal(result.chromium.executablePath,undefined);assert.equal(result.webkit.executablePath,undefined);
  pass('Default runtime loads local playwright and lets Playwright select both installed browsers');
  const chrome=path.join(scratch,'custom-chrome'),cache=path.join(scratch,'webkit-cache');
  result=probe(path.join(tests,'runtime.cjs'),"({chromium:value.launchOptions('Chromium'),webkit:value.launchOptions('WebKit')})",{CARNET_PLAYWRIGHT:path.join(mock,'index.js'),CARNET_CHROME:chrome,CARNET_WEBKIT_CACHE:cache});
  assert.equal(result.chromium.executablePath,chrome);assert.equal(result.webkit.executablePath,path.join(cache,'webkit-1234','pw_run.sh'));
  pass('Runtime overrides work without changing the other browser cache');
  for(const name of ['release-review','release-legacy','product-polish-review','appearance-morph-review','verdure-theme-review','study-controls-review']){
    const text=fs.readFileSync(path.join(__dirname,name+'.cjs'),'utf8');assert.doesNotMatch(text,/\/Users\/|\/Applications\//);assert.match(text,/require\('\.\/runtime\.cjs'\)/);assert.match(text,/paths\.releaseFile/);
  }
  pass('All six current release scripts use portable runtime and release paths');
  console.log(JSON.stringify({checks:checks.length,passed:checks,browserStarted:false}));
}finally{fs.rmSync(scratch,{recursive:true,force:true})}
