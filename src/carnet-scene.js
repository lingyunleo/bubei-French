/* Carnet de français — original procedural study, book and dip-pen shot.
   Three.js is bundled locally (MIT). All textures and meshes below are original.
   No asset is taken from the earlier sea/ruin experiment. No network requests.
   Scroll is absolute: no inertia, idle motion, or elapsed-time choreography. */
(() => {
 'use strict';
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
 const lerp=(a,b,t)=>a+(b-a)*t;
 const STATIC_READY_TIMEOUT_MS=2000;
 let instance=null,progress=0,appearance={design:'classic',mode:'light',motion:'standard'};
 const BOOK={x:1.02,z:-.68,width:3.20,depth:4.55,top:.385};
 const INK={x:-5.48,z:.932,y:.059,width:5.76,height:1.536,bottle:{x:-5.95,y:.90,z:.1}};
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 let configuredMotion=false;
 const reduced=()=>appearance.motion==='reduced'||(!configuredMotion&&media.matches);
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
 function seeded(seed=1){return()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646}}
 function create(host,options={}){
  const T=window.THREE;let scene,camera,renderer,root,wood,cloth,paper,coverTexture,pageTexture,inkTexture,pen,inkPlane,frontPivot,frontCover,bookGroup,topPage,bookBack,spine,spot,dayLight,ambient,windowLight,windowGlass,lampGlow,readShadow;
  let frame=0,disposed=false,suspended=false,width=1,height=1,readyResolve,settled=false,backend='pending',contextLost=false,actual=0,lastInk=-1,coverAngle=0,pageCurve=0,inkSample=null;
  let workEpoch=0,prepared=false,forcedStatic=false,fallbackPromise=null,imageRequest=null,presentation='pending';
  const resources=new Set(),flips=[],cleanup=[],webglCleanup=[],preparationFrames=new Map(),staticView=document.createElement('img'),originalBackground=host.style.backgroundColor;
  const ready=new Promise(resolve=>{readyResolve=resolve});
  const valid=epoch=>!disposed&&!forcedStatic&&epoch===workEpoch;
  const finish=result=>{if(!settled){settled=true;readyResolve(disposed?{backend:'disposed'}:result)}return result};
  function preparationFrame(){return new Promise(resolve=>{const id=requestAnimationFrame(()=>{preparationFrames.delete(id);resolve(true)});preparationFrames.set(id,()=>resolve(false))})}
  function cancelPreparation(){workEpoch++;for(const [id,cancel]of preparationFrames){cancelAnimationFrame(id);cancel()}preparationFrames.clear()}
  const track=x=>(resources.add(x),x);
  const report=v=>{if(!disposed)try{options.onProgress?.(v)}catch(_){}};
  staticView.className='carnet-scene-static';staticView.alt='';staticView.setAttribute('aria-hidden','true');Object.assign(staticView.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'cover',display:'none',pointerEvents:'none'});host.append(staticView);host.setAttribute('aria-hidden','true');
  const add=(el,event,fn,opts,list=cleanup)=>{el.addEventListener(event,fn,opts);list.push(()=>el.removeEventListener(event,fn,opts))};
  function texture(c){const t=track(new T.CanvasTexture(c));t.colorSpace=T.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);return t}
  function paperCanvas(w=1024,h=1024){const c=canvas(w,h),ctx=c.getContext('2d'),rand=seeded(7),d=ctx.createImageData(w,h);for(let i=0;i<d.data.length;i+=4){const n=(rand()-.5)*5;d.data[i]=247+n;d.data[i+1]=243+n;d.data[i+2]=232+n;d.data[i+3]=255}ctx.putImageData(d,0,0);ctx.strokeStyle='rgba(125,111,84,.026)';ctx.lineWidth=.6;for(let i=0;i<900;i++){const x=rand()*w,y=rand()*h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+3+rand()*8,y+(rand()-.5)*2);ctx.stroke()}return c}
  function woodCanvas(){const c=canvas(2048,1024),ctx=c.getContext('2d'),rand=seeded(19),d=ctx.createImageData(c.width,c.height);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;const wave=y+Math.sin(x*.002+y*.011)*12+Math.sin(x*.01)*3;const grain=Math.sin(wave*.62)*.6+Math.sin(wave*.19)*1.6+Math.sin(wave*.045)*2.0+(rand()-.5)*4;const plank=Math.floor(y/255);d.data[i]=137+grain*.8-plank%2*2;d.data[i+1]=118+grain*.65-plank%2*2;d.data[i+2]=93+grain*.48;d.data[i+3]=255}ctx.putImageData(d,0,0);ctx.strokeStyle='rgba(40,28,16,.25)';ctx.lineWidth=1;[256,512,768].forEach(y=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(2048,y);ctx.stroke()});for(let i=0;i<135;i++){const y=rand()*1024;ctx.strokeStyle=`rgba(58,37,21,${.03+rand()*.07})`;ctx.lineWidth=.4+rand()*.7;ctx.beginPath();for(let x=0;x<=2048;x+=32){const yy=y+Math.sin(x*.003+y)*7+Math.sin(x*.009+y*.1)*1.3;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy)}ctx.stroke()}return c}
  function clothCanvas(){const c=canvas(1024,1536),ctx=c.getContext('2d'),rand=seeded(91),d=ctx.createImageData(c.width,c.height);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4,n=(rand()-.5)*8+((x%4===0||y%4===0)?4:0);d.data[i]=50+n;d.data[i+1]=73+n;d.data[i+2]=64+n;d.data[i+3]=255}ctx.putImageData(d,0,0);ctx.strokeStyle='rgba(192,168,114,.58)';ctx.lineWidth=2;ctx.strokeRect(83,105,858,1324);ctx.strokeRect(94,116,836,1302);ctx.textAlign='center';ctx.fillStyle='#d5c398';ctx.font='500 37px Georgia,serif';ctx.letterSpacing='4px';ctx.fillText('VOCABULAIRE',512,345);ctx.letterSpacing='0px';ctx.font='normal 98px Georgia,serif';ctx.fillText('Carnet',512,634);ctx.font='italic 92px Georgia,serif';ctx.fillText('de français',512,744);ctx.strokeStyle='#bca775';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(377,832);ctx.lineTo(647,832);ctx.stroke();ctx.font='25px Georgia,serif';ctx.fillStyle='rgba(220,211,184,.72)';ctx.fillText('UN PEU, CHAQUE JOUR.',512,1190);return c}
  function pageCanvas(){const c=paperCanvas(1024,1536),ctx=c.getContext('2d');ctx.fillStyle='#35463b';ctx.textAlign='left';ctx.font='18px Georgia,serif';ctx.fillText('CARNET DE FRANÇAIS',124,155);ctx.strokeStyle='rgba(74,88,73,.2)';ctx.beginPath();ctx.moveTo(122,180);ctx.lineTo(900,180);ctx.stroke();ctx.font='50px Georgia,serif';ctx.fillText('J’aime lire quelques',124,470);ctx.fillText('pages chaque jour.',124,550);ctx.font='italic 28px Georgia,serif';ctx.fillStyle='#6c776b';ctx.fillText('un livre',124,768);ctx.font='20px Georgia,serif';ctx.fillText('01',840,1395);return c}
  function mat(color,extra={}){return track(new T.MeshStandardMaterial({color,roughness:.75,metalness:0,...extra}))}
  function mesh(g,m,parent=root){const o=new T.Mesh(track(g),m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
  function roundedBox(w,h,d){const r=Math.min(.045,w*.09,h*.18,d*.09),g=new T.BoxGeometry(w,h,d,4,4,4),p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),cx=clamp(x,-w/2+r,w/2-r),cy=clamp(y,-h/2+r,h/2-r),cz=clamp(z,-d/2+r,d/2-r),dx=x-cx,dy=y-cy,dz=z-cz,L=Math.hypot(dx,dy,dz)||1;p.setXYZ(i,cx+r*dx/L,cy+r*dy/L,cz+r*dz/L);n.setXYZ(i,dx/L,dy/L,dz/L)}return g}
  function box(w,h,d,m,x,y,z,parent=root){const o=mesh(roundedBox(w,h,d),m,parent);o.position.set(x,y,z);return o}
  function plane(w,h,m,x,y,z,parent=root){const o=mesh(new T.PlaneGeometry(w,h),m,parent);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);return o}
  function rod(a,b,r,m,parent=root){const aa=new T.Vector3(...a),bb=new T.Vector3(...b),o=mesh(new T.CylinderGeometry(r,r,aa.distanceTo(bb),18),m,parent);o.position.copy(aa).add(bb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),bb.sub(aa).normalize());return o}
  function shadow(x,z,w,d,opacity=.24,y=.013){const c=canvas(128,128),ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,8,64,64,64);g.addColorStop(0,`rgba(20,15,8,${opacity})`);g.addColorStop(.65,`rgba(20,15,8,${opacity*.65})`);g.addColorStop(1,'rgba(20,15,8,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const m=track(new T.MeshBasicMaterial({map:texture(c),transparent:true,depthWrite:false}));const o=plane(w,d,m,x,y,z);o.castShadow=false;return o}
  function buildEnvironment(){const c=canvas(1024,512),ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,512);g.addColorStop(0,'#d5d9cf');g.addColorStop(.5,'#9ba89c');g.addColorStop(1,'#423c2f');ctx.fillStyle=g;ctx.fillRect(0,0,1024,512);ctx.fillStyle='#fff8e4';ctx.fillRect(110,72,200,185);ctx.fillStyle='#e8eddc';ctx.fillRect(750,95,40,210);const env=texture(c);env.mapping=T.EquirectangularReflectionMapping;const generator=new T.PMREMGenerator(renderer);const target=generator.fromEquirectangular(env);scene.environment=target.texture;resources.add(target);generator.dispose();}
  function buildRoom(){
   wood=mat('#ffffff',{map:texture(woodCanvas()),roughness:.88});const wall=mat('#dedcd2',{roughness:1}),trim=mat('#cbc7bb'),darkwood=mat('#554b3e'),brass=mat('#9a8155',{metalness:.75,roughness:.4});
   box(15,.30,8.3,wood,0,-.165,0);box(14.5,.44,.18,darkwood,0,-.55,-3.8);for(const x of [-6.35,6.35])for(const z of [-3.05,3.05])box(.28,2.63,.28,darkwood,x,-1.6,z);
   const floorTex=texture(woodCanvas());floorTex.repeat.set(2.4,2.4);floorTex.wrapS=floorTex.wrapT=T.RepeatWrapping;const floorMat=mat('#c4b49e',{map:floorTex,roughness:.93});plane(28,25,floorMat,0,-2.88,2);
   box(25,11,.20,wall,0,2.5,-7.1);box(.20,11,15,wall,10.8,2.5,.3);box(.16,3.4,10,wall,-9,-1.2,-1.5);box(.16,2.8,10,wall,-9,6,-1.5);box(.16,4.1,2.6,wall,-9,2.5,-5.2);box(.16,4.1,1.5,wall,-9,2.5,2.75);
   // Side window remains in one physical place in all lighting modes.
   windowGlass=mat('#b8c9cb',{emissive:'#c1cdd1',emissiveIntensity:.24,roughness:.8});box(.04,4.1,5.1,windowGlass,-9.05,2.5,-.4);for(const z of [-2.98,-.4,2.18])box(.24,4.4,.09,trim,-8.88,2.5,z);for(const y of [.28,2.5,4.72])box(.24,.09,5.35,trim,-8.88,y,-.4);
   // Door jambs are near-camera geometry, never a flat opening photograph.
   box(.28,9.3,.32,darkwood,-8.6,1.76,7.2);box(.28,9.3,.32,darkwood,.10,1.76,7.2);box(8.98,.28,.32,darkwood,-4.25,6.45,7.2);
   // Quiet rear shelves with a restrained, non-interactive set of book spines.
   const shelf=mat('#a8a393',{roughness:.88});box(4.6,.12,.72,shelf,5,1.45,-6.59);box(4.6,.12,.72,shelf,5,3.2,-6.59);box(.13,3.7,.74,shelf,2.7,1.65,-6.59);box(.13,3.7,.74,shelf,7.3,1.65,-6.59);
   const bookColors=['#5d6b60','#bcb5a2','#8b8e80','#5e6058','#9f947e','#6d776c'];for(let j=0;j<2;j++)for(let i=0;i<9;i++){const h=.73+(i%4)*.11,b=box(.22+(i%3)*.025,h,.44,mat(bookColors[(i+j)%6]),3.12+i*.34,1.52+j*1.75+h/2,-6.47);b.rotation.z=i===7?-.13:0;}
   // A compact contemporary desk lamp, not a new decorative prop.
   const lampMat=mat('#3a4039',{metalness:.35,roughness:.48});const base=mesh(new T.CylinderGeometry(.64,.7,.09,64),lampMat);base.position.set(-4.55,.06,-2.48);rod([-4.55,.1,-2.48],[-4.55,2.75,-2.48],.045,brass);rod([-4.55,2.75,-2.48],[-3.98,3.08,-2.28],.045,brass);
   const shade=mesh(new T.CylinderGeometry(.36,.83,.67,64,1,true),track(new T.MeshStandardMaterial({color:'#40463e',metalness:.22,roughness:.5,side:T.DoubleSide})));shade.position.set(-3.98,2.93,-2.28);
   lampGlow=track(new T.MeshBasicMaterial({color:'#ffe3ad'}));const lightFace=mesh(new T.CircleGeometry(.75,64),lampGlow);lightFace.rotation.x=Math.PI/2;lightFace.position.set(-3.98,2.6,-2.28);lightFace.castShadow=false;
   spot=new T.SpotLight('#ffe2b2',40,17,Math.PI*.33,.78,1.7);spot.position.set(-3.98,2.62,-2.28);spot.target.position.set(-1.8,0,1.1);spot.castShadow=true;spot.shadow.mapSize.set(2048,2048);spot.shadow.bias=-.0002;spot.shadow.normalBias=.014;spot.shadow.radius=3;scene.add(spot,spot.target);
   dayLight=new T.DirectionalLight('#fff6e1',3.7);dayLight.position.set(-7,8,1.7);dayLight.target.position.set(0,0,0);dayLight.castShadow=true;dayLight.shadow.mapSize.set(2048,2048);Object.assign(dayLight.shadow.camera,{left:-12,right:12,top:10,bottom:-10,near:.2,far:35});dayLight.shadow.bias=-.00015;dayLight.shadow.normalBias=.010;dayLight.shadow.radius=4;scene.add(dayLight,dayLight.target);
   ambient=new T.HemisphereLight('#e5eee8','#685843',1.4);scene.add(ambient);windowLight=new T.DirectionalLight('#bdd7df',.5);windowLight.position.set(-10,3,0);scene.add(windowLight);
  }
  function buildPaperAndInk(){
   paper=mat('#ffffff',{map:texture(paperCanvas()),roughness:.92});box(6.2,.024,2.50,paper,-2.6,.026,1.7);shadow(-2.6,1.7,6.45,2.74,.17,.010);const c=canvas(1800,480);inkTexture=texture(c);inkTexture.userData.context=c.getContext('2d');
   const m=track(new T.MeshBasicMaterial({map:inkTexture,transparent:true,depthWrite:false,side:T.DoubleSide,opacity:1}));inkPlane=plane(INK.width,INK.height,m,INK.x+INK.width/2,INK.y,INK.z+INK.height/2);inkPlane.castShadow=false;inkPlane.renderOrder=3;
   // Molded dark green glass with actual neck, rim and a recessed ink surface.
   const glass=track(new T.MeshPhysicalMaterial({color:'#172c26',roughness:.19,metalness:.05,transmission:.12,thickness:.4,ior:1.46,clearcoat:.6}));const profile=[[.01,.025],[.37,.025],[.44,.09],[.45,.16],[.43,.60],[.33,.75],[.245,.80],[.245,.97]].map(([x,y])=>new T.Vector2(x,y));const bottle=mesh(new T.LatheGeometry(profile,64),glass);bottle.position.set(INK.bottle.x,0,INK.bottle.z);
   const rim=mesh(new T.TorusGeometry(.246,.035,16,64),glass);rim.rotation.x=Math.PI/2;rim.position.set(INK.bottle.x,.963,INK.bottle.z);
   const black=mat('#0a1511',{roughness:.18,metalness:.18});const ink=mesh(new T.CylinderGeometry(.214,.214,.013,64),black);ink.position.set(INK.bottle.x,.89,INK.bottle.z);const cap=mesh(new T.CylinderGeometry(.295,.295,.14,64),mat('#253128',{metalness:.35,roughness:.38}));cap.position.set(-5.35,.081,-.68);
   const label=canvas(512,320),ctx=label.getContext('2d');ctx.fillStyle='#d1cbb3';ctx.fillRect(0,0,512,320);ctx.fillStyle='#354638';ctx.textAlign='center';ctx.font='55px Georgia,serif';ctx.fillText('ENCRE',256,143);ctx.font='20px Georgia,serif';ctx.fillText('POUR LES MOTS',256,209);const labelMesh=mesh(new T.CylinderGeometry(.448,.448,.35,64,1,true,-.73,1.46),mat('#ffffff',{map:texture(label),roughness:1}));labelMesh.position.set(INK.bottle.x,.42,INK.bottle.z);shadow(INK.bottle.x,INK.bottle.z,1.3,1.2,.3);
   // The shaft is intentionally longer than the close-up frustum. Only the
   // working nib/section is visible; no whole pen floats unsupported on screen.
   pen=new T.Group();root.add(pen);const steel=mat('#bfc4bb',{metalness:.88,roughness:.23}),holder=mat('#242723',{roughness:.32,metalness:.08});const nib=new T.Shape();nib.moveTo(0,0);nib.lineTo(-.058,.18);nib.quadraticCurveTo(-.095,.28,-.068,.43);nib.lineTo(.068,.43);nib.quadraticCurveTo(.095,.28,.058,.18);nib.closePath();const nibMesh=mesh(new T.ExtrudeGeometry(nib,{depth:.019,bevelEnabled:true,bevelThickness:.004,bevelSize:.003,bevelSegments:2,steps:1}),steel,pen);nibMesh.position.z=-.008;
   box(.005,.255,.003,mat('#151b17'),0,.139,.016,pen);const vent=mesh(new T.CircleGeometry(.022,24),mat('#172219'),pen);vent.position.set(0,.29,.02);
   const collar=mesh(new T.CylinderGeometry(.077,.07,.23,32),steel,pen);collar.position.y=.50;const barrel=mesh(new T.CylinderGeometry(.047,.076,19,36),holder,pen);barrel.position.y=10.08;
   pen.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(.28,.93,.25).normalize());pen.visible=false;
  }
  function makePageGeometry(){const g=new T.PlaneGeometry(BOOK.width-.13,BOOK.depth-.18,48,32);g.rotateX(-Math.PI/2);g.translate((BOOK.width-.13)/2,0,0);return g}
  function buildBook(){
   bookGroup=new T.Group();bookGroup.position.set(BOOK.x,0,BOOK.z);root.add(bookGroup);cloth=mat('#34493f',{roughness:.9});coverTexture=texture(clothCanvas());const frontMat=mat('#ffffff',{map:coverTexture,roughness:.83});const edgeMat=mat('#33483e',{roughness:.87});
   bookBack=box(BOOK.width+.10,.07,BOOK.depth,edgeMat,BOOK.width/2,.045,0,bookGroup);shadow(BOOK.x+BOOK.width/2,BOOK.z,3.5,4.83,.33,.011);
   const pageEdgeTex=canvas(512,256),ctx=pageEdgeTex.getContext('2d');ctx.fillStyle='#dfdacb';ctx.fillRect(0,0,512,256);const rand=seeded(91);for(let i=0;i<74;i++){ctx.fillStyle=`rgba(143,137,118,${.08+rand()*.13})`;ctx.fillRect(0,i*3.5,512,.6+rand()*.9)}const edgePaper=mat('#fff9e9',{map:texture(pageEdgeTex),roughness:.96});box(BOOK.width-.11,.282,BOOK.depth-.15,edgePaper,(BOOK.width-.11)/2+.022,.225,0,bookGroup);
   const blank=texture(paperCanvas(1024,1536));pageTexture=texture(pageCanvas());const topMat=mat('#ffffff',{map:pageTexture,roughness:.92,side:T.DoubleSide});topMat.userData.blank=blank;topPage=mesh(makePageGeometry(),topMat,bookGroup);topPage.position.set(.02,BOOK.top,0);topPage.castShadow=false;
   // Cover geometry is offset from its hinge, never rotated about its center.
   frontPivot=new T.Group();frontPivot.position.set(-.027,.44,0);bookGroup.add(frontPivot);frontCover=box(BOOK.width+.11,.071,BOOK.depth,edgeMat,BOOK.width/2,0,0,frontPivot);
   const coverFace=plane(BOOK.width+.07,BOOK.depth-.02,frontMat,BOOK.width/2,.037,0,frontPivot);const inside=plane(BOOK.width-.02,BOOK.depth-.08,paper,BOOK.width/2,-.037,0,frontPivot);inside.rotation.x=Math.PI/2;
   // Cloth spine has a curved cross-section and stays attached to the back.
   const pos=[],uv=[],idx=[],sx=18,sz=16;for(let j=0;j<=sz;j++)for(let i=0;i<=sx;i++){const a=Math.PI*.5+i/sx*Math.PI;pos.push(-.027+Math.cos(a)*.24,.25+Math.sin(a)*.18,(j/sz-.5)*BOOK.depth);uv.push(i/sx,j/sz);if(i<sx&&j<sz){const q=j*(sx+1)+i;idx.push(q,q+1,q+sx+1,q+1,q+sx+2,q+sx+1)}}const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(pos,3));sg.setAttribute('uv',new T.Float32BufferAttribute(uv,2));sg.setIndex(idx);sg.computeVertexNormals();spine=mesh(sg,cloth,bookGroup);
   for(let k=0;k<3;k++){const matPage=mat('#fffdf2',{map:blank,roughness:.94,side:T.DoubleSide});const o=mesh(makePageGeometry(),matPage,bookGroup);o.userData.index=k;flips.push(o);}
   // Fixed, quiet flyleaf over the opened cover; its thickness is visible at the
   // desk edge only after opening. No page floats independently of the book.
   readShadow=shadow(BOOK.x-1.58,BOOK.z,3.48,4.78,.24,.012);
  }
  function setLighting(){if(!scene)return;const light=appearance.mode==='light',atelier=appearance.design==='atelier';scene.background=new T.Color(light?'#d5d5ca':'#17201d');scene.fog=new T.Fog(light?'#dddcd2':'#25302a',25,58);ambient.intensity=light?(atelier?1.15:1.45):.38;ambient.color.set(light?'#f1f2e6':'#acb7a3');ambient.groundColor.set(light?'#817361':'#343b2f');dayLight.intensity=light?(atelier?2.9:3.5):.13;dayLight.color.set(light?'#fff4db':'#79969f');windowLight.intensity=light?.45:.24;spot.intensity=light?(atelier?11:4):(atelier?48:36);windowGlass.emissiveIntensity=light?.35:.03;windowGlass.color.set(light?'#c4d6d3':'#304a4d');lampGlow.color.set(light?'#e8dec1':'#ffddb0');renderer.toneMappingExposure=light?(atelier?.93:1):.92;resources.forEach(r=>{if(r.isMeshStandardMaterial)r.envMapIntensity=r.metalness>.6?(light?.8:.35):(light?.28:.045);});}
  function cameraPose(p){const mobile=width/height<.85;
   const wide={eye:[-8.6,5.35,13.1],look:[-.65,.48,-.6],up:[0,1,0]},close={eye:[-2.60,mobile?16.7:6.65,mobile?4.9:4.6],look:[-2.6,.045,1.64],up:[0,1,0]},book={eye:[mobile?2.60:1.0,mobile?9.48:8.78,-.56],look:[mobile?2.60:1.0,.28,-.66],up:[0,0,-1]};
   if(p<=1){const t=smooth((p-.20)/.60);return {eye:wide.eye.map((x,i)=>lerp(x,close.eye[i],t)),look:wide.look.map((x,i)=>lerp(x,close.look[i],t)),up:[0,1,0],fov:lerp(43,mobile?48:42,t)}}
   if(p<=2)return {...close,fov:mobile?48:42};const t=smooth((p-2)/.94);return {eye:close.eye.map((x,i)=>lerp(x,book.eye[i],t)),look:close.look.map((x,i)=>lerp(x,book.look[i],t)),up:[0,lerp(1,0,t),lerp(0,-1,t)],fov:lerp(mobile?48:42,42,t)};
  }
  function bendPage(o,t,index){const g=o.geometry,a=g.attributes.position,w=BOOK.width-.13,cols=49,rows=33,bend=Math.sin(Math.PI*t)*.88,base=Math.PI*t;const xs=[0],ys=[0];for(let i=1;i<cols;i++){const u=(i-.5)/(cols-1),ang=base+bend*Math.sin(Math.PI*u);xs[i]=xs[i-1]+Math.cos(ang)*w/(cols-1);ys[i]=ys[i-1]+Math.sin(ang)*w/(cols-1)}const baseY=lerp(.413+index*.008,.115+index*.012,smooth(t));for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const u=i/(cols-1),v=j/(rows-1),q=j*cols+i,z=(v-.5)*(BOOK.depth-.18);a.setXYZ(q,.008+xs[i],baseY+ys[i]+Math.sin(Math.PI*t)*Math.sin(Math.PI*u)*Math.sin((v-.5)*Math.PI)*.10,z)}a.needsUpdate=true;g.computeVertexNormals();o.visible=true;o.position.set(0,0,0)}
  function inkPose(p){const q=clamp(p-1),sample=window.VocabCarnetInk?.sample?.(q)||{x:54,y:113,down:false,wet:0,phase:'dip'};inkSample=sample;
   if(inkTexture&&Math.abs(q-lastInk)>.000001){const ctx=inkTexture.userData.context;if(window.VocabCarnetInk?.draw)window.VocabCarnetInk.draw(ctx,q,{width:1800,height:480,color:'#21382d',lineWidth:2.7,wetColor:appearance.motion==='immersive'?'#647868':null});else ctx.clearRect(0,0,1800,480);inkTexture.needsUpdate=true;lastInk=q;}
   const dest={x:INK.x+sample.x/1200*INK.width,z:INK.z+sample.y/320*INK.height,y:INK.y+.002+(sample.down?0:(sample.liftHeight||0)*.14)};let pos;
   if(q<.12){const dip=smooth(q/.12);pos={x:INK.bottle.x,y:.98-Math.sin(dip*Math.PI)*.10,z:INK.bottle.z};}
   else if(q<.22){const t=smooth((q-.12)/.1);pos={x:lerp(INK.bottle.x,dest.x,t),y:lerp(.98,INK.y+.12,t)+Math.sin(Math.PI*t)*.35,z:lerp(INK.bottle.z,dest.z,t)};}
   else {pos=dest;if(q>.88)pos.y+=smooth((q-.88)/.12)*.72;}
   if(p<1||p>=2)pen.visible=false;else{pen.visible=true;pen.position.set(pos.x,pos.y,pos.z);}
  }
  function update(p){actual=p;const pose=cameraPose(p);camera.position.set(...pose.eye);camera.up.set(...pose.up).normalize();camera.lookAt(...pose.look);camera.fov=pose.fov;camera.aspect=width/height;camera.updateProjectionMatrix();camera.updateMatrixWorld();inkPose(p);
   const q=clamp(p-2),open=smooth(q/.45);coverAngle=Math.PI*open;frontPivot.rotation.z=coverAngle;frontPivot.position.y=lerp(.44,.09,smooth((open-.70)/.30));
   flips.forEach((o,i)=>bendPage(o,smooth((q-.45-i*.022)/(.235-i*.014)),i));pageCurve=Math.sin(Math.PI*smooth((q-.45)/.235))*.88;
   // The image is only a visual stand-in. At the reading stop the real DOM
   // takes over a clean, untextured text zone on the right-hand page.
   topPage.material.map=q>=.82?topPage.material.userData.blank:pageTexture;readShadow.visible=open>.83;
  }
  function staticAsset(){const assets=window.VocabCarnetSceneAssets;if(!assets)return null;const key=appearance.design+'-'+appearance.mode,kind=width/height<.85?'mobile':'desktop',stage=progress<1?'room':progress<2?'paper':'book';return assets[key]?.[kind]?.[stage]||assets['classic-'+appearance.mode]?.[kind]?.[stage]||assets['classic-light']?.[kind]?.[stage]||null}
  function paintStatic(result){if(disposed||presentation!=='static')return;backend=result.backend;host.dataset.carnetBackend=backend;staticView.style.display=backend==='static'?'block':'none';host.style.backgroundColor=backend==='simplified'?'var(--bg)':originalBackground;if(renderer)renderer.domElement.style.display='none'}
  function showStatic(){
   if(disposed)return Promise.resolve({backend:'disposed'});
   presentation='static';const asset=staticAsset();
   if(!asset?.src){const result={backend:'simplified',reason:'static-unavailable'};imageRequest?.cancel(result);imageRequest=null;paintStatic(result);return Promise.resolve(result)}
   if(imageRequest?.src===asset.src){paintStatic(imageRequest.result||{backend:'pending'});return imageRequest.promise}
   const previous=imageRequest;let resolve,timer=0,done=false;
   const request={src:asset.src,result:null,promise:new Promise(done=>{resolve=done}),cancel:null};imageRequest=request;
   const cleanupImage=()=>{clearTimeout(timer);staticView.removeEventListener('load',loaded);staticView.removeEventListener('error',failed)};
   const complete=result=>{if(done)return;done=true;cleanupImage();request.result=result;if(imageRequest===request)paintStatic(result);resolve(result)};
   request.cancel=result=>{if(done)return;done=true;cleanupImage();resolve(result)};
   const failed=()=>complete({backend:'simplified',reason:'static-load-failed'});
   const loaded=()=>{if(done||disposed||imageRequest!==request)return;if(!staticView.naturalWidth){failed();return}let decoded;try{decoded=staticView.decode?.()}catch(_){complete({backend:'simplified',reason:'static-decode-failed'});return}Promise.resolve(decoded).then(()=>{if(!done&&!disposed&&imageRequest===request)complete({backend:'static'})},()=>complete({backend:'simplified',reason:'static-decode-failed'}))};
   // A changed theme, orientation or chapter replaces the pending image. Older
   // callers follow its replacement, rather than releasing an obsolete view.
   previous?.cancel(request.promise);paintStatic({backend:'pending'});
   staticView.addEventListener('load',loaded);staticView.addEventListener('error',failed);
   timer=setTimeout(()=>complete({backend:'simplified',reason:'static-timeout'}),STATIC_READY_TIMEOUT_MS);
   staticView.src=asset.src;if(staticView.complete)loaded();
   return request.promise;
  }
  function disposeWebGL(){
   const release=fn=>{try{fn()}catch(error){console.warn('Carnet scene resource could not be released.',error)}};
   webglCleanup.splice(0).forEach(release);resources.forEach(r=>release(()=>r.dispose?.()));resources.clear();
   if(renderer){const old=renderer;renderer=null;release(()=>old.dispose());release(()=>old.forceContextLoss());old.domElement.remove()}
   scene=camera=root=wood=cloth=paper=coverTexture=pageTexture=inkTexture=pen=inkPlane=frontPivot=frontCover=bookGroup=topPage=bookBack=spine=spot=dayLight=ambient=windowLight=windowGlass=lampGlow=readShadow=null;flips.length=0;prepared=false;
  }
  function useStaticFallback(){
   if(disposed)return Promise.resolve({backend:'disposed'});
   if(fallbackPromise)return fallbackPromise;
   forcedStatic=true;cancelPreparation();cancelAnimationFrame(frame);frame=0;disposeWebGL();
   fallbackPromise=showStatic().then(result=>{if(disposed)return {backend:'disposed'};report(1);finish(result);return disposed?{backend:'disposed'}:result});
   return fallbackPromise;
  }
  function draw(initial=false){if(disposed)return {backend:'disposed'};if(!initial&&(suspended||document.hidden))return null;if(forcedStatic||contextLost)return showStatic();if(!prepared)return null;if(reduced()&&staticAsset())return showStatic();
   presentation='webgl';host.style.backgroundColor=originalBackground;renderer.domElement.style.display='block';staticView.style.display='none';backend='webgl';host.dataset.carnetBackend='webgl';const p=reduced()?(progress<1?0:progress<2?1.91:3):progress;update(p);renderer.render(scene,camera);return {backend:'webgl'};
  }
  function requestDraw(){if(!frame&&!disposed&&!suspended&&!document.hidden)frame=requestAnimationFrame(()=>{frame=0;try{draw()}catch(e){console.warn('Carnet scene could not render; using its photographed keyframe.',e);useStaticFallback()}})}
  function resize(){const r=host.getBoundingClientRect();width=Math.max(1,r.width||innerWidth);height=Math.max(1,r.height||innerHeight);if(renderer){renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.setSize(width,height,false);}if(presentation==='static')showStatic();requestDraw()}
  function screenPoint(v){const p=new T.Vector3(...v).applyMatrix4(bookGroup.matrixWorld).project(camera),r=host.getBoundingClientRect();return{x:r.left+(p.x+1)*width/2,y:r.top+(1-p.y)*height/2}}
  function getBookRect(){if(renderer&&scene&&backend==='webgl'){bookGroup.updateMatrixWorld(true);const quad=[[.16,BOOK.top+.004,-2.03],[3.02,BOOK.top+.004,-2.03],[3.02,BOOK.top+.004,2.03],[.16,BOOK.top+.004,2.03]].map(screenPoint);const xs=quad.map(p=>p.x),ys=quad.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;return{rightPage:{x,y,width:w,height:h,left:x,top:y,right:x+w,bottom:y+h,quad},stable:progress>=2.99,progress};}
   const asset=staticAsset(),r=host.getBoundingClientRect();if(asset?.rect){const scale=Math.max(width/asset.width,height/asset.height),ox=r.left+(width-asset.width*scale)/2,oy=r.top+(height-asset.height*scale)/2,a=asset.rect;return{rightPage:{x:ox+a.x*scale,y:oy+a.y*scale,width:a.width*scale,height:a.height*scale},stable:progress>=2,progress};}return{rightPage:{x:r.left+width*.53,y:r.top+height*.19,width:width*.30,height:height*.62},stable:progress>=2.99,progress};}
  function suspend(value){suspended=!!value;if(suspended){cancelAnimationFrame(frame);frame=0}else requestDraw()}
  function destroy(){if(disposed)return;disposed=true;finish({backend:'disposed'});cancelPreparation();cancelAnimationFrame(frame);frame=0;cleanup.forEach(fn=>fn());imageRequest?.cancel({backend:'disposed'});imageRequest=null;disposeWebGL();staticView.remove();host.style.backgroundColor=originalBackground;delete host.dataset.carnetBackend;}
  add(window,'resize',resize,{passive:true});add(document,'visibilitychange',()=>{if(!document.hidden)requestDraw();else{cancelAnimationFrame(frame);frame=0}});add(media,'change',requestDraw);
  const observer=window.ResizeObserver?new ResizeObserver(resize):null;observer?.observe(host);cleanup.push(()=>observer?.disconnect());resize();report(.04);
  const epoch=workEpoch;
  preparationFrame().then(async active=>{if(!active||!valid(epoch))return;try{if(!T)throw new Error('Bundled Three unavailable');renderer=new T.WebGLRenderer({alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!valid(epoch)){disposeWebGL();return}renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;Object.assign(renderer.domElement.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});renderer.domElement.className='carnet-scene-canvas';renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);add(renderer.domElement,'webglcontextlost',e=>{if(disposed||forcedStatic)return;e.preventDefault();contextLost=true;showStatic()},undefined,webglCleanup);add(renderer.domElement,'webglcontextrestored',()=>{if(disposed||forcedStatic)return;contextLost=false;requestDraw()},undefined,webglCleanup);
   scene=new T.Scene();camera=new T.PerspectiveCamera(43,width/height,.035,100);root=new T.Group();scene.add(root);buildEnvironment();buildRoom();report(.36);if(!valid(epoch)||!await preparationFrame()||!valid(epoch))return;buildPaperAndInk();report(.59);if(!valid(epoch))return;buildBook();setLighting();prepared=true;resize();update(progress);renderer.compile(scene,camera);report(.93);if(!valid(epoch))return;const result=await draw(true);if(!valid(epoch))return;report(1);finish(result);
  }catch(e){if(valid(epoch)){console.warn('Carnet scene could not prepare; using its photographed keyframe.',e);useStaticFallback()}}});
  return {host,ready,resize,suspend,destroy,useStaticFallback,setProgress(){requestDraw()},setAppearance(){setLighting();lastInk=-1;if(presentation==='static')showStatic();requestDraw()},getBookRect,capture(){if(renderer&&backend==='webgl'){draw();return renderer.domElement.toDataURL('image/png')}return backend==='static'?staticView.src:null},__getDebugState(){return {backend,progress,actual,coverAngle,pageCurve,camera:camera?.position.toArray(),target:cameraPose(actual).look,pen:pen?.position.toArray(),penVisible:pen?.visible,ink:inkSample,inkBounds:{...INK},book:BOOK,appearance:{...appearance},suspended,width,height}}};
 }
 const api={mount(host,options={}){if(typeof host==='string')host=document.querySelector(host);if(!host)return Promise.resolve({backend:'none'});if(instance?.host===host){instance.resize();return instance.ready}instance?.destroy();instance=create(host,options);api.ready=instance.ready;return instance.ready},useStaticFallback(){return instance?.useStaticFallback()||Promise.resolve({backend:'none'})},setProgress(p){const next=clamp(Number(p)||0,0,3);if(next===progress)return;progress=next;instance?.setProgress()},setAppearance(a={}){if(a.motion)configuredMotion=true;appearance={...appearance,...a};instance?.setAppearance()},resize(){instance?.resize()},suspend(value){instance?.suspend(value)},destroy(){instance?.destroy();instance=null;progress=0},getBookRect(){return instance?.getBookRect()||null},capture(){return instance?.capture()||null},__getDebugState(){return instance?.__getDebugState()||{backend:'none',progress,appearance}},ready:Promise.resolve({backend:'none'})};
 window.VocabCarnetScene=api;
})();
