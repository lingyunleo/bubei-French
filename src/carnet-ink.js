/* Original centre-line handwriting for one phrase: Un peu, chaque jour.
   Hand-authored pen movements, not font outlines. No font or network dependency.
   Coordinates: 1200 × 320, top-left origin, y down. Transparent canvas output.
   The drawing and nib use the same flattened curves and arc-length parameter.
   The scene owns the ink bottle and the approach before t=.22. */
(() => {
 'use strict';
 const WIDTH=1200,HEIGHT=320,BASELINE=193,START=.22,END=.88;
 const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
 const mix=(a,b,t)=>a+(b-a)*t;
 const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
 const glyphs={
  U:{advance:88,lines:[[['M',4,-80],['C',10,-92,24,-96,26,-88],['C',23,-65,10,-29,15,-9],['C',19,9,43,9,56,-10],['C',64,-31,68,-66,76,-88],['C',70,-60,60,-29,61,-10],['C',61,4,74,3,86,-9]]]},
  n:{advance:70,lines:[[['M',0,-1],['C',8,-12,12,-41,17,-53],['C',13,-37,8,-15,5,-3],['C',14,-31,28,-57,43,-54],['C',62,-50,43,-19,45,-7],['C',48,5,58,0,68,-9]]]},
  p:{advance:68,lines:[[['M',0,-9],['C',8,-24,13,-43,16,-53],['C',13,-32,4,9,-1,36],['C',-3,45,-8,46,-7,36],['C',-6,19,9,-29,22,-48],['C',32,-61,54,-55,54,-34],['C',54,-14,38,2,22,-5],['C',15,-9,17,-19,22,-24],['C',21,-11,39,7,66,-11]]]},
  e:{advance:50,lines:[[['M',0,-7],['C',9,-18,30,-28,33,-42],['C',35,-57,13,-51,8,-36],['C',-1,-18,2,2,22,0],['C',33,-1,42,-8,49,-16]]]},
  u:{advance:68,lines:[[['M',7,-51],['C',4,-33,-2,-12,1,-4],['C',6,12,25,-3,36,-22],['C',41,-33,44,-44,46,-54],['C',38,-30,34,-12,38,-4],['C',43,4,53,1,64,-9]]]},
  ',':{advance:20,lines:[[['M',6,-6],['C',12,-1,7,11,0,16]]]},
  c:{advance:54,lines:[[['M',45,-45],['C',31,-62,6,-45,2,-22],['C',-2,-4,14,5,31,-1],['C',41,-4,47,-9,53,-14]]]},
  h:{advance:70,lines:[[['M',1,-3],['C',9,-27,20,-67,28,-89],['C',34,-106,22,-101,16,-80],['C',12,-64,4,-15,0,-3],['C',10,-28,25,-58,43,-52],['C',61,-47,39,-17,44,-6],['C',48,4,59,-1,67,-10]]]},
  a:{advance:63,lines:[[['M',39,-45],['C',25,-60,4,-42,2,-18],['C',0,2,17,5,31,-10],['C',40,-22,43,-39,45,-50],['C',39,-29,34,-13,40,-4],['C',45,3,53,-2,61,-10]]]},
  q:{advance:67,lines:[[['M',43,-45],['C',26,-63,5,-43,3,-22],['C',0,-4,17,3,32,-13],['C',40,-25,45,-44,48,-53],['C',43,-24,34,11,33,31],['C',33,49,49,43,50,26],['C',51,13,42,4,42,4],['C',49,7,54,2,64,-9]]]},
  j:{advance:42,lines:[[['M',18,-52],['C',15,-28,12,-1,4,25],['C',-4,51,-21,45,-13,26],['C',-5,10,11,1,32,-9]],[['M',24,-75],['L',24.7,-75.8]]]},
  o:{advance:62,lines:[[['M',44,-40],['C',36,-62,9,-54,3,-28],['C',-3,-5,15,6,32,-9],['C',46,-23,48,-48,33,-51],['C',23,-52,22,-42,31,-35],['C',43,-26,52,-26,59,-32]]]},
  r:{advance:60,lines:[[['M',0,-5],['C',6,-21,10,-38,13,-51],['C',11,-37,8,-17,7,-4],['C',12,-25,22,-51,35,-50],['C',45,-49,47,-42,45,-35]]]},
  '.':{advance:10,lines:[[['M',6,-.8],['L',6.4,.2]]]}
 };
 const phrase='Un peu, chaque jour.';
 const strokes=[];let cursor=50;
 // Flatten a cubic by its control-polygon excess. The result is independent of
 // DOM/SVG implementations and is stable when sampled in reverse order.
 function flatten(a,b,c,d,out,depth=0){
  if(depth>=11||distance(a,b)+distance(b,c)+distance(c,d)-distance(a,d)<.07){out.push(d);return;}
  const mid=(p,q)=>({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
  const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);
  flatten(a,ab,abc,center,out,depth+1);flatten(center,bcd,cd,d,out,depth+1);
 }
 function makeStroke(commands,character,part){
  const points=[];let at=null;const absolute=commands.map(command=>{
   const c=command.slice();for(let i=1;i<c.length;i+=2){c[i]+=cursor;c[i+1]+=BASELINE;}return c;
  });
  for(const c of absolute){
   if(c[0]==='M'){at={x:c[1],y:c[2]};points.push(at);}
   else if(c[0]==='L'){at={x:c[1],y:c[2]};points.push(at);}
   else{const end={x:c[5],y:c[6]};flatten(at,{x:c[1],y:c[2]},{x:c[3],y:c[4]},end,points);at=end;}
  }
  let length=0;points[0]={...points[0],s:0};
  for(let i=1;i<points.length;i++){length+=distance(points[i-1],points[i]);points[i]={...points[i],s:length};}
  return {d:absolute.map(c=>c[0]+c.slice(1).join(' ')).join(' '),character,part,points,length,draw:true,lift:false};
 }
 for(const character of phrase){
  if(character===' '){cursor+=48;continue;}
  const glyph=glyphs[character];glyph.lines.forEach((line,i)=>strokes.push(makeStroke(line,character,i?'dot':'body')));cursor+=glyph.advance;
 }
 const itinerary=[];let weight=0,inkLength=0,previous=null;
 for(let index=0;index<strokes.length;index++){
  const stroke=strokes[index],first=stroke.points[0];
  if(previous){
   const gap=distance(previous,first),travel={draw:false,lift:true,from:previous,to:first,length:gap,weight:12+Math.min(45,gap*.4),strokeIndex:index,inkBefore:inkLength};
   travel.d='M'+previous.x+' '+previous.y+' L'+first.x+' '+first.y;itinerary.push(travel);weight+=travel.weight;
  }
  stroke.strokeIndex=index;stroke.inkBefore=inkLength;stroke.weight=Math.max(10,stroke.length);itinerary.push(stroke);weight+=stroke.weight;inkLength+=stroke.length;previous=stroke.points.at(-1);
 }
 let elapsed=START;
 itinerary.forEach(segment=>{segment.duration=(END-START)*segment.weight/weight;segment.start=elapsed;elapsed+=segment.duration;segment.end=elapsed;});
 const first=strokes[0].points[0],last=strokes.at(-1).points.at(-1);
 const allPoints=strokes.flatMap(s=>s.points),bounds=Object.freeze({left:Math.min(...allPoints.map(p=>p.x)),right:Math.max(...allPoints.map(p=>p.x)),top:Math.min(...allPoints.map(p=>p.y)),bottom:Math.max(...allPoints.map(p=>p.y))});
 function onStroke(stroke,fraction){
  const target=stroke.length*clamp(fraction),points=stroke.points;let low=1,high=points.length-1;
  while(low<high){const middle=(low+high)>>1;if(points[middle].s<target)low=middle+1;else high=middle;}
  const b=points[low],a=points[low-1],part=(target-a.s)/(b.s-a.s||1);
  return {x:mix(a.x,b.x,part),y:mix(a.y,b.y,part),angle:Math.atan2(b.y-a.y,b.x-a.x),distance:target,pointIndex:low};
 }
 function current(t){return itinerary.find(segment=>t<segment.end)||itinerary.at(-1);}
 function sample(value){
  const t=clamp(Number.isFinite(Number(value))?Number(value):0),progress=clamp((t-START)/(END-START));
  if(t<START)return {x:first.x,y:first.y,down:false,wet:0,done:false,written:false,phase:t<.12?'dip':'transfer',t,progress:0,strokeIndex:-1,strokeProgress:0,distance:0,angle:0,liftHeight:1};
  if(t>=END)return {x:last.x,y:last.y,down:false,wet:1-clamp((t-END)/(1-END)),done:t>=1,written:true,phase:'dry',t,progress:1,strokeIndex:strokes.length-1,strokeProgress:1,distance:inkLength,angle:0,liftHeight:clamp((t-END)/.04)};
  const segment=current(t),u=clamp((t-segment.start)/segment.duration);
  if(segment.lift){const e=u*u*(3-2*u);return {x:mix(segment.from.x,segment.to.x,e),y:mix(segment.from.y,segment.to.y,e),down:false,wet:1,done:false,written:false,phase:'write',t,progress,strokeIndex:segment.strokeIndex,strokeProgress:0,distance:segment.inkBefore,angle:Math.atan2(segment.to.y-segment.from.y,segment.to.x-segment.from.x),liftHeight:Math.sin(Math.PI*u)};}
  return {...onStroke(segment,u),down:true,wet:1,done:false,written:false,phase:'write',t,progress,strokeIndex:segment.strokeIndex,strokeProgress:u,distance:segment.inkBefore+segment.length*u,liftHeight:0};
 }
 function pressure(a,b){const dy=(b.y-a.y)/(distance(a,b)||1);return .62+.72*clamp((dy+.2)/1.2);}
 function trace(ctx,stroke,u,lineWidth){
  const limit=stroke.length*clamp(u),p=stroke.points;if(limit<=0)return;
  // Variable pressure follows the centre line; downstrokes are slightly fuller.
  for(let i=1;i<p.length&&p[i-1].s<limit;i++){
   const a=p[i-1],end=p[i],f=clamp((limit-a.s)/(end.s-a.s||1)),b={x:mix(a.x,end.x,f),y:mix(a.y,end.y,f)};
   ctx.lineWidth=lineWidth*(stroke.part==='dot'||stroke.character==='.'?1.2:pressure(a,b));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
 }
 function draw(ctx,value,options={}){
  const result=sample(value),width=options.width??ctx.canvas.width,height=options.height??ctx.canvas.height;
  const sx=width/WIDTH,sy=height/HEIGHT,scale=options.fit==='stretch'?null:Math.min(sx,sy),xScale=scale??sx,yScale=scale??sy;
  const ox=options.offsetX??(width-WIDTH*xScale)/2,oy=options.offsetY??(height-HEIGHT*yScale)/2;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.translate(ox,oy);ctx.scale(xScale,yScale);
  ctx.strokeStyle=options.color||'#263a33';ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=options.opacity??1;
  const lineWidth=options.lineWidth??2.7;
  for(const stroke of strokes){if(result.t<=stroke.start)break;trace(ctx,stroke,clamp((result.t-stroke.start)/stroke.duration),lineWidth);}
  // A tiny, restrained wet edge is optional; no glow, paper fill or extra trail.
  if(options.wetColor&&result.down){ctx.fillStyle=options.wetColor;ctx.globalAlpha=.3;ctx.beginPath();ctx.arc(result.x,result.y,lineWidth*.28,0,Math.PI*2);ctx.fill();}
  ctx.restore();return {...result,canvasX:ox+result.x*xScale,canvasY:oy+result.y*yScale};
 }
 function getStrokes(){return itinerary.map(s=>({d:s.d,path:s.d,draw:s.draw,lift:s.lift,duration:s.duration,start:s.start,end:s.end,length:s.length,strokeIndex:s.strokeIndex,character:s.character||'',part:s.part||'travel'}));}
 window.VocabCarnetInk=Object.freeze({getStrokes,sample,draw,width:WIDTH,height:HEIGHT,phrase,bounds,firstPoint:Object.freeze({x:first.x,y:first.y}),lastPoint:Object.freeze({x:last.x,y:last.y})});
})();
