/* Compare a prepared list to a local Assistant export. No semantic inference. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./legacy-parser.js'));
  else root.VocabImportAudit=factory(root.VocabParser);
})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const MAX_ROWS=5000;
  const key=value=>P.compare(value||'');
  const placeholderKey=value=>key(value).replace(/\s+(?:qn|qqn|qch|qqch|quelqu’un|quelqu'un|quelque chose)\.?$/u,'');
  const raw=value=>String(value??'').replace(/\r\n?/g,'\n');
  function parseSource(text){
    const result={rows:[],errors:[]};
    try{
      if(typeof text!=='string'||text.length>12*1024*1024)throw new Error('请选择不超过 12 MB 的原始法语助手 CSV。');
      const rows=P.parseDelimited(text,'csv'),headerIndex=rows.findIndex(row=>row.some(cell=>String(cell).trim()));
      if(headerIndex<0)throw new Error('原始 CSV 为空。');
      const header=rows[headerIndex].map(cell=>String(cell).trim().replace(/^\uFEFF/,''));
      for(const name of ['#','单词','释义','笔记']){
        if(header.filter(v=>v===name).length!==1)throw new Error('请使用法语助手原始 CSV，需含且仅含一个「'+name+'」列。');
      }
      const cols=Object.fromEntries(['#','单词','释义','笔记'].map(name=>[name,header.indexOf(name)])),ids=new Set();
      for(let i=headerIndex+1;i<rows.length;i++){
        const row=rows[i];if(!row.some(cell=>String(cell).trim()))continue;
        if(result.rows.length>=MAX_ROWS)throw new Error('原始 CSV 每次最多核对 5000 条。');
        if(row.length!==header.length)throw new Error('原始 CSV 第 '+(rows.sourceRows?.[i]||i+1)+' 行列数与表头不同，请检查文件。');
        const item={id:String(row[cols['#']]).trim(),headword:String(row[cols['单词']]).trim(),originalMeaning:raw(row[cols['释义']]),originalNotes:raw(row[cols['笔记']])};
        if(!item.id||!item.headword)throw new Error('原始 CSV 的序号和单词不能为空。');
        if(ids.has(item.id))throw new Error('原始 CSV 序号重复：'+item.id+'。请使用同一次导出的原文件。');
        if(item.headword.length>2000||item.originalMeaning.length>100000||item.originalNotes.length>100000)throw new Error('原始 CSV 中有字段过长，未截断原文，请拆分文件。');
        ids.add(item.id);result.rows.push(item);
      }
      if(!result.rows.length)throw new Error('原始 CSV 没有词条。');
    }catch(error){result.rows=[];result.errors.push(error.message);}
    return result;
  }
  function sourceIds(entry){
    // Ordinals are metadata, never a reason to trust a different headword.
    const ids=[];const text=String(entry.source||'');
    const re=/原(?:始)?序号\s*[:：#]?\s*(\d+(?:\s*(?:[,，、/和及与]|[-–—~～至])\s*\d+)*)/gu;let m;
    while((m=re.exec(text)))ids.push(...m[1].match(/\d+/g));
    if(entry.importedDictionary?.ordinal)ids.push(String(entry.importedDictionary.ordinal).trim());
    return [...new Set(ids)];
  }
  function compare(entries,reference){
    if(!Array.isArray(entries)||entries.length>MAX_ROWS)throw new Error('每次最多核对 5000 个词条。');
    if(!reference||reference.errors?.length||!Array.isArray(reference.rows)||!reference.rows.length)throw new Error('请先选择有效的原始 CSV。');
    const rows=reference.rows,byHead=new Map(),byId=new Map();
    rows.forEach((row,index)=>{const k=key(row.headword);if(!byHead.has(k))byHead.set(k,[]);byHead.get(k).push(index);byId.set(row.id,index);});
    const report={sourceCount:rows.length,entryCount:entries.length,matchedCount:0,missing:[],extra:[],ambiguous:[],differences:[],matches:[]};
    const candidates=[];
    const uncertain=(index,entry,reason)=>report.ambiguous.push({index,headword:String(entry.french||''),reason});
    entries.forEach((entry,index)=>{
      const head=key(entry.french),exact=byHead.get(head)||[],ids=sourceIds(entry);
      if(!head){uncertain(index,entry,'词头为空');return;}
      let chosen;
      if(ids.length>1){uncertain(index,entry,'来源含多个原序号，请逐项核对，未自动回填');return;}
      if(ids.length===1&&!byId.has(ids[0])){uncertain(index,entry,'来源序号不在这份原始 CSV 中，请核对是否选错文件');return;}
      if(ids.length===1&&byId.has(ids[0])){
        chosen=byId.get(ids[0]);const sourceHead=key(rows[chosen].headword);
        if(sourceHead!==head&&!(placeholderKey(sourceHead)===head&&sourceHead!==head)){
          uncertain(index,entry,'来源序号对应另一词头，请核对文件或序号');return;
        }
        if(exact.length&& !exact.includes(chosen)){uncertain(index,entry,'词头与原序号匹配结果不同');return;}
      }else if(exact.length===1){chosen=exact[0];}
      else if(exact.length>1){uncertain(index,entry,'原文件中同词头对应多条记录，需明确原序号');return;}
      else{report.extra.push({index,headword:String(entry.french||'')});return;}
      candidates.push({index,sourceIndex:chosen});
    });
    const counts=new Map();candidates.forEach(m=>counts.set(m.sourceIndex,(counts.get(m.sourceIndex)||0)+1));
    for(const match of candidates){
      const entry=entries[match.index];
      if(counts.get(match.sourceIndex)>1){uncertain(match.index,entry,'多条导入词对应同一原始记录，请合并或修正');continue;}
      report.matches.push(match);
      const source=rows[match.sourceIndex],fields=['originalMeaning','originalNotes'].filter(field=>typeof entry[field]!=='string'||raw(entry[field])!==source[field]);
      if(fields.length)report.differences.push({index:match.index,headword:String(entry.french||''),fields});
    }
    const matched=new Set(report.matches.map(m=>m.sourceIndex));
    report.matchedCount=report.matches.length;
    report.missing=rows.filter((_,index)=>!matched.has(index)).map(({id,headword})=>({id,headword}));
    return report;
  }
  function restoreOriginals(entries,reference,report){
    // Recompute so an edited preview or a stale report cannot attach a wrong source.
    const current=compare(entries,reference),out=entries.map(entry=>({...entry}));
    for(const {index,sourceIndex} of current.matches){
      out[index].originalMeaning=reference.rows[sourceIndex].originalMeaning;
      out[index].originalNotes=reference.rows[sourceIndex].originalNotes;
    }
    return out;
  }
  return Object.freeze({parseSource,compare,restoreOriginals});
});
