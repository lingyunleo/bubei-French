/* Immutable event blocks keep old practice history out of hot save paths.
   Backups expand to the original v4 events array; no review history is discarded. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.VocabHistory=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BLOCK=500,KEEP=2000,MAX_EVENTS=1000000,MAX_BYTES=120000000;
  const trustedEvents=new WeakSet(),trustedBlocks=new WeakMap(),idsByBlock=new WeakMap(),blockCache=new Map(),BAD=new Set(['__proto__','constructor','prototype']);
  let scopedBlocks=null;
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  function fail(){throw new Error('学习历史无效或过大，请保留原备份并检查文件。')}
  function copyEvent(value){
    if(trustedEvents.has(value))return value;
    if(!plain(value))fail();let nodes=0,chars=0;const seen=new Set();
    function visit(v,depth){
      if(++nodes>1500||depth>12)fail();
      if(v===null||typeof v==='boolean')return v;
      if(typeof v==='string'){chars+=v.length;if(chars>60000)fail();return v}
      if(typeof v==='number'){if(!Number.isFinite(v))fail();return v}
      if(typeof v!=='object'||seen.has(v)||(!Array.isArray(v)&&!plain(v)))fail();
      seen.add(v);let out;
      if(Array.isArray(v)){if(v.length>1000)fail();out=v.map(x=>x===undefined?null:visit(x,depth+1))}
      else{out={};for(const key of Object.keys(v)){if(BAD.has(key)||key.length>200)fail();if(v[key]!==undefined)out[key]=visit(v[key],depth+1)}}
      seen.delete(v);return Object.freeze(out);
    }
    const out=visit(value,0);trustedEvents.add(out);return out;
  }
  function makeBlock(records){
    const data=JSON.stringify(records);if(data.length>300000)fail();
    let min=null,max=null;for(const event of records){if(Number.isFinite(event.time)){min=min===null?event.time:Math.min(min,event.time);max=max===null?event.time:Math.max(max,event.time)}}
    const block=Object.freeze({data,count:records.length,min,max});trustedBlocks.set(block,records);
    blockCache.set(data,block);if(blockCache.size>256)blockCache.delete(blockCache.keys().next().value);return block;
  }
  function readBlock(block){
    if(trustedBlocks.has(block))return {block,records:trustedBlocks.get(block)};
    if(!plain(block)||typeof block.data!=='string'||block.data.length>300000)fail();
    const cached=scopedBlocks?.get(block.data)||blockCache.get(block.data);
    if(cached){if(block.count!==cached.count||block.min!==cached.min||block.max!==cached.max)fail();return {block:cached,records:trustedBlocks.get(cached)}}
    let records;try{records=JSON.parse(block.data)}catch(_){fail()}
    if(!Array.isArray(records)||!records.length||records.length>BLOCK)fail();
    records=records.map(copyEvent);const clean=makeBlock(records);
    if(block.count!==clean.count||block.min!==clean.min||block.max!==clean.max)fail();
    return {block:clean,records};
  }
  function blockify(records){
    const blocks=[];let batch=[],bytes=2;
    for(const e of records){const size=JSON.stringify(e).length+1;if(batch.length&&(batch.length>=BLOCK||bytes+size>280000)){blocks.push(makeBlock(batch));batch=[];bytes=2}batch.push(e);bytes+=size}
    if(batch.length)blocks.push(makeBlock(batch));return blocks;
  }
  function normalize(state){
    if(state.eventArchive!==undefined&&!Array.isArray(state.eventArchive))fail();
    if(!Array.isArray(state.events)||state.events.length>MAX_EVENTS||(state.eventArchive||[]).length>100000)fail();
    const archive=(state.eventArchive||[]).map(block=>readBlock(block).block);
    let events=state.events.map(copyEvent),total=events.length+archive.reduce((n,b)=>n+b.count,0);
    if(total>MAX_EVENTS||archive.reduce((n,b)=>n+b.data.length,0)>MAX_BYTES)fail();
    // Undo's offset is relative to the active tail. Never archive records that
    // an unfinished answer may still undo, including restored older sessions.
    let take=events.length>KEEP+BLOCK?Math.floor((events.length-KEEP)/BLOCK)*BLOCK:0;
    const undo=state.session?.undo;
    if(undo)take=Math.min(take,Number.isInteger(undo.eventsLength)?undo.eventsLength:0);
    if(take>0){archive.push(...blockify(events.slice(0,take)));events=events.slice(take);if(undo)undo.eventsLength-=take}
    if(archive.reduce((n,b)=>n+b.data.length,0)>MAX_BYTES)fail();
    state.events=events;if(archive.length)state.eventArchive=archive;else delete state.eventArchive;
    return state;
  }
  // A save already has the validated archive in memory. Reuse those blocks
  // while checking the stored revision, even beyond the small general cache.
  function withKnownBlocks(state,fn){const previous=scopedBlocks;scopedBlocks=new Map((state.eventArchive||[]).filter(b=>trustedBlocks.has(b)).map(b=>[b.data,b]));try{return fn()}finally{scopedBlocks=previous}}
  function archivedCount(state){return (state.eventArchive||[]).reduce((n,b)=>n+b.count,0)}
  function allEvents(state){return (state.eventArchive||[]).flatMap(b=>readBlock(b).records).concat(state.events||[])}
  function recentEvents(state,since=Date.now()-30*86400000){
    const records=[];for(const b of state.eventArchive||[]){if(b.max===null||b.max<since)continue;for(const e of readBlock(b).records)if(Number.isFinite(e.time)&&e.time>=since)records.push(e)}
    for(const e of state.events||[])if(Number.isFinite(e?.time)&&e.time>=since)records.push(e);return records;
  }
  function hasEvent(state,id){if((state.events||[]).some(e=>e.id===id))return true;return (state.eventArchive||[]).some(b=>{const {block,records}=readBlock(b);let ids=idsByBlock.get(block);if(!ids){ids=new Set(records.map(e=>e.id));idsByBlock.set(block,ids)}return ids.has(id)})}
  function filterArchive(state,keep){
    const result=[];for(const block of state.eventArchive||[]){const before=readBlock(block).records,after=before.filter(keep);if(after.length===before.length)result.push(block);else if(after.length)result.push(...blockify(after))}
    if(result.length)state.eventArchive=result;else delete state.eventArchive;return state;
  }
  function expand(state){
    const count=archivedCount(state);if(state.session?.undo)state.session.undo.eventsLength+=count;
    state.events=allEvents(state);delete state.eventArchive;return state;
  }
  return Object.freeze({normalize,allEvents,recentEvents,hasEvent,filterArchive,expand,archivedCount,withKnownBlocks});
});
