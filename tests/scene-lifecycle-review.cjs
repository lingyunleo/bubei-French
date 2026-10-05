/* Node-only lifecycle checks for the real scene module. The DOM, image decoder,
 * clock and graphics driver are controlled doubles; this is not visual evidence. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/carnet-scene.js'),'utf8');
const checks=[];
const turn=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
class Element {
 constructor(tag='div'){this.tagName=tag;this.style={backgroundColor:''};this.dataset={};this.children=[];this.listeners=new Map();this.parentElement=null;this.width=1440;this.height=1000;}
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 dispatch(name){for(const fn of [...(this.listeners.get(name)||[])])fn({preventDefault(){}});}
 append(child){child.parentElement=this;this.children.push(child);}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
 setAttribute(){}
 getBoundingClientRect(){return {x:0,y:0,left:0,top:0,width:this.width,height:this.height};}
}
function driver(audit){
 class Vector {constructor(x=0,y=0,z=0){this.set(x,y,z)}set(x,y,z){Object.assign(this,{x,y,z});return this}copy(v){return this.set(v.x,v.y,v.z)}add(v){return this.set(this.x+v.x,this.y+v.y,this.z+v.z)}sub(v){return this.set(this.x-v.x,this.y-v.y,this.z-v.z)}multiplyScalar(n){return this.set(this.x*n,this.y*n,this.z*n)}distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z)}normalize(){return this}toArray(){return [this.x,this.y,this.z]}applyMatrix4(){return this}project(){return this}}
 class Object3D {constructor(){this.position=new Vector();this.up=new Vector();this.rotation={};this.quaternion={setFromUnitVectors(){}};this.userData={};this.children=[];this.color={set(){}};this.groundColor={set(){}};this.target={position:new Vector()};this.shadow={mapSize:{set(){}},camera:{}};}add(...items){this.children.push(...items)}lookAt(){}updateProjectionMatrix(){}updateMatrixWorld(){}}
 class Geometry {constructor(){const attr={count:0,setXYZ(){},getX(){return 0},getY(){return 0},getZ(){return 0}};this.attributes={position:attr,normal:attr}}rotateX(){return this}translate(){return this}setAttribute(){}setIndex(){}computeVertexNormals(){}dispose(){audit.resourceDisposals++}}
 class Material {constructor(value={}){Object.assign(this,value);this.color={set(){}};this.userData={};this.isMeshStandardMaterial=true;}dispose(){audit.resourceDisposals++}}
 class Texture {constructor(){this.userData={};this.repeat={set(){}}}dispose(){audit.resourceDisposals++}}
 class Renderer {constructor(){audit.constructed++;this.domElement=new Element('canvas');this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>8};audit.renderers.push(this);}setPixelRatio(){}setSize(){}compile(){audit.compiled++}render(){audit.rendered++}dispose(){audit.disposed++}forceContextLoss(){audit.contextLosses++}}
 class Mesh extends Object3D {constructor(geometry,material){super();this.geometry=geometry;this.material=material;}}
 class Shape {moveTo(){}lineTo(){}quadraticCurveTo(){}closePath(){}}
 const T={WebGLRenderer:Renderer,Vector3:Vector,Vector2:Vector,Mesh,Shape,CanvasTexture:Texture,Color:class{},Fog:class{},PMREMGenerator:class{fromEquirectangular(){return {texture:new Texture(),dispose(){}}}dispose(){}}};
 for(const key of ['Scene','Group','PerspectiveCamera','HemisphereLight','DirectionalLight','SpotLight'])T[key]=Object3D;
 for(const key of ['BoxGeometry','PlaneGeometry','CylinderGeometry','LatheGeometry','TorusGeometry','CircleGeometry','ExtrudeGeometry','BufferGeometry','Float32BufferAttribute'])T[key]=Geometry;
 for(const key of ['MeshStandardMaterial','MeshBasicMaterial','MeshPhysicalMaterial'])T[key]=Material;
 return T;
}
function harness({graphics=false,assets=true}={}){
 const frames=new Map(),allFrames=new Map(),timers=new Map(),images=[],warnings=[],audit={constructed:0,compiled:0,rendered:0,disposed:0,contextLosses:0,resourceDisposals:0,renderers:[]};let nextId=0,now=0;
 const window=new Element('window'),document=new Element('document');document.hidden=false;
 const host=new Element();host.style.backgroundColor='original';
 class Image extends Element {
  constructor(){super('img');this.complete=false;this.naturalWidth=0;this.decodeCalls=0;this.pendingDecode=null;images.push(this)}
  set src(value){this._src=value;this.complete=false;this.naturalWidth=0}
  get src(){return this._src||''}
  decode(){this.decodeCalls++;return this.pendingDecode?.promise||Promise.resolve()}
  load(){this.complete=true;this.naturalWidth=1600;this.dispatch('load')}
 }
 const context2D=()=>new Proxy({createImageData:()=>({data:new Uint8ClampedArray(0)}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get(target,key){return key in target?target[key]:()=>{}}});
 document.createElement=tag=>{if(tag==='img')return new Image();const element=new Element(tag);if(tag==='canvas')element.getContext=()=>context2D();return element;};
 document.querySelector=()=>host;
 if(graphics)window.THREE=driver(audit);
 if(assets){const variant={desktop:{room:{src:'room'},paper:{src:'paper'},book:{src:'book',width:1600,height:1000,rect:{x:800,y:150,width:450,height:650}}},mobile:{room:{src:'mobile-room'},paper:{src:'mobile-paper'},book:{src:'mobile-book'}}};window.VocabCarnetSceneAssets={'classic-light':variant,'verdure-dark':{desktop:{room:{src:'dark-room'},paper:{src:'dark-paper'},book:{src:'dark-book'}}}};}
 const requestAnimationFrame=fn=>{const id=++nextId;frames.set(id,fn);allFrames.set(id,fn);return id;};
 const runtime=vm.createContext({window,document,console:{warn:(...args)=>warnings.push(args.map(String).join(' '))},matchMedia:()=>new Element('media'),innerWidth:1440,innerHeight:1000,devicePixelRatio:1,requestAnimationFrame,cancelAnimationFrame:id=>frames.delete(id),setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source,runtime,{filename:'carnet-scene.js'});
 return {S:window.VocabCarnetScene,host,images,audit,warnings,frames,timers,document,
  async frame(){const pending=[...frames];frames.clear();for(const [,fn]of pending)fn(now);await turn();},
  async replay(ids){for(const id of ids)allFrames.get(id)?.(now);await turn();},
  async advance(ms){now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn()}await turn();},
 };
}
async function check(name,run){await run();checks.push(name);console.log('PASS',name);}
(async()=>{
 await check('Static readiness waits for both load and decode; repeated fallback shares the result',async()=>{
  const h=harness(),decode=deferred(),ready=h.S.mount(h.host);let settled=false;ready.then(()=>{settled=true});await h.frame();h.images[0].pendingDecode=decode;
  const fallback=h.S.useStaticFallback();assert.equal(h.S.useStaticFallback(),fallback);assert.equal(settled,false);h.images[0].load();await turn();assert.equal(settled,false);
  decode.resolve();await turn();assert.equal((await ready).backend,'static');assert.equal(await fallback,await ready);assert.equal(h.host.dataset.carnetBackend,'static');assert.equal(h.timers.size,0);h.S.destroy();
 });
 await check('Static load and decode failures produce a readable simplified backend',async()=>{
  for(const failure of ['load','decode']){const h=harness(),ready=h.S.mount(h.host);await h.frame();if(failure==='load')h.images[0].dispatch('error');else{const d=deferred();h.images[0].pendingDecode=d;h.images[0].load();d.reject(new Error('synthetic decoder failure'));}await turn();assert.equal((await ready).backend,'simplified');assert.equal(h.host.style.backgroundColor,'var(--bg)');assert.equal(h.images[0].style.display,'none');h.S.destroy();assert.equal(h.host.style.backgroundColor,'original');}
 });
 await check('Missing assets and bounded silent load/decode waits never report a blank static image as ready',async()=>{
  const missing=harness({assets:false});const noAsset=missing.S.mount(missing.host);await missing.frame();assert.equal((await noAsset).backend,'simplified');missing.S.destroy();
  for(const load of [false,true]){const h=harness(),ready=h.S.mount(h.host),decode=deferred();await h.frame();h.images[0].pendingDecode=decode;if(load)h.images[0].load();await h.advance(1999);let done=false;ready.then(()=>{done=true});await turn();assert.equal(done,false);await h.advance(1);assert.equal((await ready).backend,'simplified');decode.resolve();h.images[0].load();await turn();assert.equal(h.host.dataset.carnetBackend,'simplified');h.S.destroy();}
 });
 await check('Destroy before preparation cancels ready and ignores already queued callbacks',async()=>{
  const h=harness({graphics:true}),ready=h.S.mount(h.host),ids=[...h.frames.keys()];h.S.destroy();assert.equal((await ready).backend,'disposed');assert.equal(h.frames.size,0);await h.replay(ids);assert.equal(h.audit.constructed,0);assert.equal(h.host.children.length,0);assert.equal(h.host.dataset.carnetBackend,undefined);assert.equal((await h.S.useStaticFallback()).backend,'none');
 });
 await check('Destroy during image decode cancels fallback and cannot alter a replacement mount',async()=>{
  const h=harness(),old=h.S.mount(h.host),decode=deferred();await h.frame();h.images[0].pendingDecode=decode;h.images[0].load();const fallback=h.S.useStaticFallback();h.S.destroy();assert.equal((await old).backend,'disposed');assert.equal((await fallback).backend,'disposed');assert.equal(h.timers.size,0);
  const current=h.S.mount(h.host);await h.frame();h.images[1].load();await turn();assert.equal((await current).backend,'static');decode.resolve();await turn();assert.equal(h.host.dataset.carnetBackend,'static');assert.equal(h.host.children.length,1);h.S.destroy();
 });
 await check('A new static appearance supersedes the old decoder without releasing the old image',async()=>{
  const h=harness(),ready=h.S.mount(h.host),oldDecode=deferred(),newDecode=deferred();await h.frame();h.images[0].pendingDecode=oldDecode;h.images[0].load();h.S.setAppearance({design:'verdure',mode:'dark'});h.images[0].pendingDecode=newDecode;h.images[0].load();oldDecode.resolve();await turn();let done=false;ready.then(()=>{done=true});await turn();assert.equal(done,false);assert.equal(h.images[0].src,'dark-room');newDecode.resolve();await turn();assert.equal((await ready).backend,'static');h.S.destroy();
 });
 await check('Forced static fallback cancels an in-progress WebGL mount and its late continuation',async()=>{
  const h=harness({graphics:true}),progress=[];const ready=h.S.mount(h.host,{onProgress:value=>progress.push(value)});await h.frame();assert.equal(h.audit.constructed,1);assert.ok(progress.includes(.36));const ids=[...h.frames.keys()];const fallback=h.S.useStaticFallback();h.images[0].load();await turn();assert.equal((await ready).backend,'static');assert.equal(await fallback,await ready);assert.equal(h.audit.disposed,1);assert.equal(h.audit.compiled,0);await h.replay(ids);h.audit.renderers[0].domElement.dispatch('webglcontextrestored');await h.frame();assert.equal(h.audit.compiled,0);assert.equal(h.audit.rendered,0);assert.equal(h.host.dataset.carnetBackend,'static');assert.equal(progress.filter(x=>x===1).length,1);h.S.destroy();
 });
 await check('Normal WebGL settles only after its first render and keeps the original rendering path',async()=>{
  const h=harness({graphics:true}),ready=h.S.mount(h.host);let done=false;ready.then(()=>{done=true});await h.frame();assert.equal(done,false);assert.equal(h.audit.rendered,0);await h.frame();assert.equal((await ready).backend,'webgl');assert.equal(h.audit.compiled,1);assert.ok(h.audit.rendered>=1);assert.equal(h.images[0].decodeCalls,0);assert.equal(h.host.dataset.carnetBackend,'webgl');assert.deepEqual(h.warnings,[]);h.S.destroy();assert.equal(h.frames.size,0);
 });
 console.log(JSON.stringify({checks:checks.length,browserStarted:false,scope:'Lifecycle and cancellation only; graphics and browser paint require separate visual tests.'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
