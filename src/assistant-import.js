/* Local adapter for French Assistant CSV exports. No network or lexical inference. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./legacy-parser.js'));
  else root.VocabAssistantImport = factory(root.VocabParser);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';
  const normalize = value => P.normalize(value);
  const names = {word:'单词', definition:'释义', phonetic:'音标', notes:'笔记', stars:'星标', ordinal:'#'};
  function header(rows) {
    if (!Array.isArray(rows)) return null;
    const index = rows.findIndex(row => Array.isArray(row) && row.some(cell => normalize(cell)));
    if (index < 0) return null;
    const values = rows[index].map(cell => normalize(cell).replace(/^\uFEFF/, ''));
    return {index, values};
  }
  function detect(rows) {
    const h = header(rows); if (!h) return false;
    const has = name => h.values.includes(name);
    return has('单词') && has('释义') && (has('#') || (has('星标') && has('笔记')));
  }
  const posPattern = /(?:^|\s)(n\.\s*[mf](?:\.(?:\s*pl\.)?)?|n\.|[mf]\.|a\.\s*indéf\.|adj\.|adv\.|a\.|v\.\s*(?:impers\.|pr(?:on)?\.|t\.?(?:\s*(?:dir|indir)\.)?|i\.?)|v\.|vt\.|vi\.|prép\.|ph\.|loc\.)(?=\s|[\d\p{Script=Han}①-⑳⑴-⒇[（(])/iu;
  function posName(raw) {
    const s = raw.toLowerCase().replace(/\s/g, '');
    if (/^(?:n\.)?m/.test(s)) return 'n.m.';
    if (/^(?:n\.)?f/.test(s)) return 'n.f.';
    if (/^(?:a\.|adj\.)$/.test(s)) return 'adj.';
    if (s === 'ph.') return 'loc.';
    if (/^(?:vt|v\.t)/.test(s)) return 'v.t.';
    if (/^(?:vi\.?$|v\.i\.?$)/.test(s)) return 'v.i.';
    return raw.replace(/\s+/g, '').trim();
  }
  // Take a literal initial dictionary sense, stopping before examples or the
  // next numbered sense. The complete dictionary text always stays attached.
  function summarize(definition) {
    const raw = normalize(definition), oneLine = raw.replace(/\s+/g, ' ');
    let body = oneLine, pos = '', foundPos = false;
    const match = body.match(posPattern);
    if (match && match.index < 240) {
      const after = body.slice(match.index + match[0].length).trim();
      if (/\p{Script=Han}/u.test(after)) {
        body = after; pos = posName(match[1]); foundPos = true;
      }
    }
    // A plain translation without a recognized dictionary prefix is retained
    // verbatim, including numbers, abbreviations and meaningful punctuation.
    if (!foundPos) return {meaning:raw,pos:'',summarized:false,fallback:raw.length>160};
    // Exported conjugation instructions are dictionary notes, not the meaning.
    body = body.replace(/^\[(?:助动词|词尾)[^\]]*\]\s*/, '');
    const numbered = /^(?:\d{1,2}[.．、)]?\s*|[①-⑳⑴-⒇]\s*)/.test(body);
    body = body.replace(/^(?:\d{1,2}[.．、)]?\s*|[①-⑳⑴-⒇]\s*)/, '');
    const boundary = body.search(/\s+常见用法\s*/);
    if (boundary >= 0) body = body.slice(0, boundary);
    // Tiny plain translations (including QN, French abbreviations, or numbers)
    // need no heuristics at all.
    if (!foundPos && body.length <= 120) return {meaning:body, pos, summarized:body !== oneLine, fallback:false};
    let end = body.length, hanSeen = false;
    const closers = {'[':']','【':'】','(':')','（':'）','〈':'〉','〔':'〕'};
    let stack = [];
    for (let i=0; i<body.length; i++) {
      const ch=body[i], prev=body[i-1] || '';
      if (closers[ch]) {const close=body.indexOf(closers[ch],i+1),fragment=body.slice(i+1,close);if(close>i && close-i<140 && !fragment.includes(ch) && !/\s+[2-9]\d?\./.test(fragment))stack.push(closers[ch]);continue;}
      if (stack.length) {if(ch===stack[stack.length-1])stack.pop();if(/\p{Script=Han}/u.test(ch))hanSeen=true;continue;}
      if (/\p{Script=Han}/u.test(ch)) hanSeen=true;
      if (!hanSeen) continue;
      if (ch==='：' || ch===':') {end=i;break;}
      if (/[①-⑳⑴-⒇]/u.test(ch) || (numbered && /\d/.test(ch) && /\s/.test(prev) && /^\d{1,2}(?:[.．、)]\s*|\s+|(?=[\p{Script=Han}（(\[]))/u.test(body.slice(i)))) {end=i;break;}
      if ((/[A-Za-zÀ-ɏ~]/u.test(ch) && /[\s；;，,：:]/.test(prev)) || (ch==='~' && i>0)) {end=i;break;}
      if (ch==='—' && /\s/.test(prev)) {end=i;break;}
    }
    let meaning=body.slice(0,end).replace(/[\s；;，,：:]+$/u,'').trim();
    if (!meaning || !/\p{Script=Han}/u.test(meaning)) meaning=body;
    // Do not guess a meaning for formats that cannot be split safely. Keep the
    // original and flag it for preview editing instead of cutting mid-sentence.
    const fallback=meaning.length>160;
    return {meaning: fallback ? raw : meaning, pos, summarized:meaning !== oneLine, fallback};
  }
  function parse(rows) {
    if (!detect(rows)) return null;
    const h=header(rows), map={}, entries=[], errors=[], warnings=[], seen=new Map();
    if(rows.slice(h.index+1).filter(row=>Array.isArray(row)&&row.some(v=>normalize(v))).length>5000)return {entries,errors:[{row:0,message:'每次最多导入 5000 个词条。'}],warnings,format:'eudic',summary:{total:0,summarized:0,fallback:0}};
    const sourceRow=index => rows.sourceRows ? rows.sourceRows[index] : index+1;
    for (const [key,name] of Object.entries(names)) {
      const positions=h.values.map((n,i)=>n===name?i:-1).filter(i=>i>=0);
      if (positions.length>1) errors.push({row:sourceRow(h.index),message:'法语助手表头「'+name+'」重复，请只保留一列。'});
      map[key]=positions[0];
    }
    h.values.forEach(name=>{if(name&&!Object.values(names).includes(name))warnings.push({row:sourceRow(h.index),message:'未识别法语助手列「'+name+'」，该列未导入。'});});
    if(errors.length)return {entries,errors,warnings,format:'eudic',summary:{total:0,summarized:0,fallback:0}};
    let summarized=0, fallback=0;
    rows.forEach((row,index)=>{
      if(index<=h.index || !Array.isArray(row) || !row.some(v=>normalize(v)))return;
      const source=sourceRow(index), raw=key=>map[key]===undefined||row[map[key]]==null?'':String(row[map[key]]), value=key=>normalize(raw(key));
      const french=value('word'), definition=raw('definition'), phonetic=value('phonetic'), notes=raw('notes'), stars=raw('stars'), ordinal=raw('ordinal');
      const lengths={french:2000,definition:100000,phonetic:2000,notes:100000,stars:100,ordinal:100};
      const fields={french,definition,phonetic,notes,stars,ordinal};
      if(Object.entries(lengths).some(([key,max])=>fields[key].length>max)) {errors.push({row:source,message:'词条或原始词典字段过长，请拆分后导入；原文未截断。'});return;}
      if(row.length>h.values.length && row.slice(h.values.length).some(v=>normalize(v))) {errors.push({row:source,message:'这一行比表头多出字段；含逗号或换行的内容需要用双引号包住。'});return;}
      if(!french||!normalize(definition)) {errors.push({row:source,message:!french?'法语不能为空。':'中文释义不能为空。'});return;}
      const brief=summarize(definition);
      const entry={id:'',raw:french,french,meaning:brief.meaning,pos:brief.pos,masc:'',fem:'',hasGender:false,spell:french,phonetic,usage:'',example:'',exampleZh:'',source:'法语助手生词本',sourceRow:source,needsConfirmation:brief.fallback,warnings:[],importedDictionary:{kind:'eudic',definition,notes,stars,ordinal}};
      if(brief.summarized)summarized++;
      if(brief.fallback){fallback++;entry.warnings.push('词典原文无法可靠拆出简短释义，已完整保留；请在预览中编辑学习释义并确认。');}
      if(/[()（）]/.test(french)){entry.needsConfirmation=true;entry.warnings.push('词头含括号，请核对是否为完整拼写目标；未猜测或删改词形。');}
      const validation=P.validateEntry(entry);
      if(!validation.valid){errors.push({row:source,message:validation.errors.join(' ')});return;}
      const key=P.wordKey(entry);
      if(seen.has(key))errors.push({row:source,message:'与第 '+seen.get(key)+' 行是同一法语词条；请合并释义或删除重复行后再导入。'});
      else seen.set(key,source);
      entry.warnings.forEach(message=>warnings.push({row:source,message}));
      entries.push(entry);
    });
    return {entries,errors,warnings,format:'eudic',summary:{total:entries.length,summarized,fallback}};
  }
  return Object.freeze({detect,parse,summarize});
});
