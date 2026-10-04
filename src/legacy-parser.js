(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VocabParser = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalize(value) {
    return value == null ? '' : String(value).normalize('NFC').trim();
  }

  function compare(value) {
    return normalize(value).toLocaleLowerCase('fr').replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ');
  }

  function readDelimited(text, delimiter) {
    var rows = [], sourceRows = [], row = [], field = '', quoted = false, closed = false;
    var line = 1, rowLine = 1, endedWithNewline = false;
    function error(message) { throw new Error('第 ' + line + ' 行：' + message); }
    function finishField() { row.push(field); field = ''; closed = false; }
    function finishRow() { finishField(); rows.push(row); sourceRows.push(rowLine); row = []; }
    for (var i = 0; i < text.length; i++) {
      var character = text[i], newline = character === '\n' || character === '\r';
      endedWithNewline = false;
      if (quoted) {
        if (character === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closed = true; }
        } else if (newline) {
          field += '\n';
          if (character === '\r' && text[i + 1] === '\n') i++;
          line++;
        } else field += character;
        continue;
      }
      if (character === delimiter) { finishField(); continue; }
      if (newline) {
        finishRow();
        if (character === '\r' && text[i + 1] === '\n') i++;
        line++; rowLine = line; endedWithNewline = true;
        continue;
      }
      if (closed) {
        if (character === ' ' || character === '\t') continue;
        error('带引号字段结束后只能接分隔符或换行；字段内部的双引号请写成两个双引号。');
      }
      if (character === '"') {
        if (field.trim()) error('字段内部的双引号需要转义，并用双引号包住整个字段。');
        field = ''; quoted = true;
      } else field += character;
    }
    if (quoted) error('双引号没有闭合，请检查这一条记录。');
    if (text.length && !endedWithNewline) finishRow();
    Object.defineProperty(rows, 'sourceRows', { value: sourceRows, enumerable: false });
    Object.defineProperty(rows, 'delimiter', { value: delimiter, enumerable: false });
    return rows;
  }

  function parseDelimited(value, delimiter) {
    var text = value == null ? '' : String(value).replace(/^\uFEFF/, '');
    delimiter = delimiter == null ? 'auto' : delimiter;
    if (delimiter === 'tab' || delimiter === 'tsv') delimiter = '\t';
    if (delimiter === 'comma' || delimiter === 'csv') delimiter = ',';
    if (delimiter === 'semicolon') delimiter = ';';
    if (delimiter !== 'auto') {
      if (['\t', ',', ';'].indexOf(delimiter) < 0) throw new Error('请选择制表符、逗号或分号作为分隔符。');
      return readDelimited(text, delimiter);
    }
    if (!text) return readDelimited('', '\t');
    var candidates = [];
    ['\t', ';', ','].forEach(function (candidate, priority) {
      try {
        var rows = readDelimited(text, candidate);
        var sample = rows.filter(function (row) { return row.some(function (cell) { return normalize(cell); }); }).slice(0, 50);
        var widths = Object.create(null);
        sample.forEach(function (row) { widths[row.length] = (widths[row.length] || 0) + 1; });
        var mode = Object.keys(widths).sort(function (a, b) { return widths[b] - widths[a]; })[0] || '1';
        var multicolumn = sample.filter(function (row) { return row.length > 1; }).length;
        var score = multicolumn ? 1000 * multicolumn / Math.max(sample.length, 1) + 100 * widths[mode] / sample.length : 0;
        score += (2 - priority) * 5;
        if (Number(mode) > 20) score -= 100;
        if (sample.length && headerMap(sample[0]).french !== undefined && headerMap(sample[0]).meaning !== undefined) score += 200;
        if (candidate !== '\t' && sample.some(function (row) { return row.some(function (cell) { return cell.indexOf('\t') !== -1; }); })) score -= 500;
        candidates.push({ score: score, rows: rows });
      } catch (error) { /* A quote valid for one delimiter may be invalid for another. */ }
    });
    candidates.sort(function (a, b) { return b.score - a.score; });
    if (!candidates.length) return readDelimited(text, ',');
    return candidates[0].rows;
  }

  var headerAliases = {
    french: ['法语', '法语词条', '单词', '词条', '词汇', 'french', 'français', 'francais', 'mot', 'word', 'vocabulaire'],
    meaning: ['中文', '中文释义', '释义', '含义', '意思', '中文意思', 'meaning', 'chinese', 'translation', 'traduction', 'sens'],
    pos: ['词性', 'pos', 'partofspeech', 'nature', '类别'],
    masc: ['阳性', '阳性完整形式', 'masc', 'masculin', 'masculine'],
    fem: ['阴性', '阴性完整形式', 'fem', 'féminin', 'feminin', 'feminine'],
    phonetic: ['音标', '发音', 'phonetic', 'phonetics', 'ipa', 'prononciation'],
    usage: ['用法', '备注', 'usage', 'note', 'notes'],
    example: ['例句', '法语例句', 'example', 'exemple'],
    exampleZh: ['例句译文', '例句翻译', '中文例句', 'examplezh', 'example_zh', 'exampletranslation'],
    source: ['来源', '例句来源', 'source'],
    aliases: ['可接受答案', '其他答案', 'aliases', 'acceptedanswers'],
    fullMeaning: ['完整释义', '完整中文释义', '详细释义', 'fullmeaning', 'full definition', 'complete meaning'],
    fullUsage: ['完整用法', '完整用法说明', '详细用法', 'fullusage', 'full usage notes', 'complete usage'],
    originalMeaning: ['原始释义', '原文释义', '原始中文释义', 'originalmeaning', 'original definition', 'raw meaning', 'raw definition'],
    originalNotes: ['原始笔记', '原文笔记', 'originalnotes', 'raw notes']
  };
  var detailFields = {
    fullMeaning: {label:'完整释义',max:50000}, fullUsage: {label:'完整用法',max:50000},
    originalMeaning: {label:'原始释义',max:100000}, originalNotes: {label:'原始笔记',max:100000}
  };
  function detailErrors(entry) {
    var errors = [];
    Object.keys(detailFields).forEach(function (field) {
      if (entry[field] === undefined) return;
      var spec = detailFields[field];
      if (typeof entry[field] !== 'string') errors.push(spec.label + '必须是纯文本。');
      else if (entry[field].length > spec.max) errors.push(spec.label + '最多 ' + spec.max + ' 个字符；内容未截断。');
    });
    return errors;
  }
  var headerLookup = Object.create(null);
  function headerName(value) { return compare(value).replace(/[\s_-]/g, ''); }
  Object.keys(headerAliases).forEach(function (key) {
    headerAliases[key].forEach(function (alias) { headerLookup[headerName(alias)] = key; });
  });
  function headerMap(row) {
    var result = Object.create(null);
    row.forEach(function (cell, index) {
      var field = headerLookup[headerName(cell)];
      if (field && result[field] === undefined) result[field] = index;
    });
    return result;
  }

  function normalizePos(value) {
    var compact = compare(value).replace(/\s+/g, '').replace(/\.$/, '');
    var aliases = {
      'n.m': 'n.m.', 'nm': 'n.m.', 'n.m.pl': 'n.m.pl.', 'nmpl': 'n.m.pl.',
      'n.f': 'n.f.', 'nf': 'n.f.', 'n.f.pl': 'n.f.pl.', 'nfpl': 'n.f.pl.',
      'n.m.&n.f': 'n.m./n.f.', 'n.m./n.f': 'n.m./n.f.', 'n.m.etn.f': 'n.m./n.f.', 'n.m./f': 'n.m./n.f.',
      'n': 'n.', 'nom': 'n.', 'm': 'n.m.', 'f': 'n.f.', '名词': 'n.',
      '阳性名词': 'n.m.', '阴性名词': 'n.f.', 'adj': 'adj.', 'adjectif': 'adj.', '形容词': 'adj.',
      'adv': 'adv.', 'adverbe': 'adv.', '副词': 'adv.', 'v': 'v.', 'verbe': 'v.', '动词': 'v.',
      'v.t': 'v.t.', 'vt': 'v.t.', 'v.i': 'v.i.', 'vi': 'v.i.', 'v.pr': 'v.pr.', 'v.pron': 'v.pr.',
      'pron': 'pron.', 'pronom': 'pron.', '代词': 'pron.', 'prép': 'prép.', 'prep': 'prép.', 'préposition': 'prép.', '介词': 'prép.',
      'conj': 'conj.', 'conjonction': 'conj.', '连词': 'conj.', 'interj': 'interj.', '感叹词': 'interj.',
      'loc': 'loc.', 'locution': 'loc.', 'loc.adv': 'loc.adv.', 'loc.prép': 'loc.prép.', 'loc.nom': 'loc.nom.',
      'art': 'art.', 'article': 'art.', '冠词': 'art.', 'num': 'num.', '数词': 'num.'
    };
    return aliases[compact] || normalize(value);
  }
  function extractPos(raw) {
    var patterns = '(?:n\\.\\s*m\\.\\s*(?:&|/|et)\\s*(?:n\\.\\s*)?f\\.?|n\\.\\s*[mf]\\.?(?:\\s*pl\\.?)?|v\\.\\s*(?:pron|pr|t|i)\\.?|loc\\.\\s*(?:adv|prép|nom)\\.?|adj\\.?|adv\\.?|pron\\.?|prép\\.?|prep\\.?|conj\\.?|interj\\.?|art\\.?|num\\.?|loc\\.?|n\\.|v\\.)';
    var suffix = new RegExp('(?:\\s+|\\s*\\()(' + patterns + ')\\)?$', 'i');
    var match = raw.match(suffix);
    if (match) return { french: normalize(raw.slice(0, match.index)), pos: normalizePos(match[1]) };
    var prefix = new RegExp('^(' + patterns + ')\\s+', 'i');
    match = raw.match(prefix);
    if (match) return { french: normalize(raw.slice(match[0].length)), pos: normalizePos(match[1]) };
    return { french: raw, pos: '' };
  }

  var shortEndings = ['e', 'ne', 'le', 'se', 'trice', 'ive', 'euse', 'ère', 'ète', 've', 'que', 'che', 'ce', 'sse', 'nne', 'lle'];
  var irregular = {
    beau: 'belle', nouveau: 'nouvelle', vieux: 'vieille', fou: 'folle', mou: 'molle',
    blanc: 'blanche', sec: 'sèche', public: 'publique', turc: 'turque', grec: 'grecque',
    frais: 'fraîche', long: 'longue', doux: 'douce', faux: 'fausse', roux: 'rousse',
    bref: 'brève', neuf: 'neuve', malin: 'maligne', bénin: 'bénigne', gentil: 'gentille',
    favori: 'favorite', copain: 'copine', héros: 'héroïne', prince: 'princesse', roi: 'reine',
    homme: 'femme', père: 'mère', frère: 'sœur', fils: 'fille', oncle: 'tante', neveu: 'nièce',
    monsieur: 'madame', garçon: 'fille', époux: 'épouse'
  };
  function inferFeminine(base, suffix) {
    var lower = compare(base), ending = compare(suffix).replace(/^-/, '');
    if (irregular[lower] && (shortEndings.indexOf(ending) !== -1 || ending === irregular[lower])) return irregular[lower];
    if (ending === 'e') return /e$/i.test(base) ? base : base + 'e';
    if (ending === 'ne' && /n$/i.test(base)) return base + 'ne';
    if (ending === 'le' && /l$/i.test(base)) return base + 'le';
    if (ending === 'se' && /x$/i.test(base)) return base.slice(0, -1) + 'se';
    if (ending === 'se' && /s$/i.test(base)) return base + 'se';
    if (ending === 'trice' && /teur$/i.test(base)) return base.slice(0, -4) + 'trice';
    if (ending === 'ive' && /if$/i.test(base)) return base.slice(0, -2) + 'ive';
    if (ending === 'euse' && /(?:eur|eux)$/i.test(base)) return base.slice(0, -3) + 'euse';
    if (ending === 'ère' && /er$/i.test(base)) return base.slice(0, -2) + 'ère';
    if (ending === 'ète' && /et$/i.test(base)) return base.slice(0, -2) + 'ète';
    return '';
  }
  function genderForms(french) {
    var pair = french.match(/^([\p{L}\p{M}'’ʼ-]+)\s*(?:,\s*|\(\s*)(-?[\p{L}\p{M}'’ʼ-]+)\)?$/u);
    if (!pair) return null;
    var base = pair[1], second = pair[2], lower = compare(second), complete = false;
    if (irregular[compare(base)] === lower) complete = true;
    if (second.length > 3 && shortEndings.indexOf(lower) === -1) {
      shortEndings.forEach(function (ending) { if (compare(inferFeminine(base, ending)) === lower) complete = true; });
    }
    if (complete) return { masc: base, fem: second, needsConfirmation: false, warning: '' };
    var inferred = inferFeminine(base, second);
    if (inferred) return { masc: base, fem: inferred, needsConfirmation: true, warning: '阴性「' + inferred + '」由缩写推断，请核对并确认后再导入。' };
    // Unknown parenthetical content is usually a grammar note, not a gender suffix.
    if (french.indexOf(',') === -1) return null;
    return { masc: base, fem: '', needsConfirmation: true, warning: '无法确定逗号或括号后的内容是不是阴性缩写。请填写完整阴性，或改为单独词条；未拆分原词条。' };
  }

  function validateEntry(entry) {
    var errors = [];
    if (!entry || typeof entry !== 'object') return { valid: false, errors: ['词条格式不正确。'] };
    errors = errors.concat(detailErrors(entry));
    if (entry.practiceGender !== undefined && typeof entry.practiceGender !== 'boolean') errors.push('双词形练习标记必须是布尔值。');
    if (entry.practiceGender === true && !entry.hasGender) errors.push('双词形练习需要先提供阴阳性参考词形。');
    if (!normalize(entry.french)) errors.push('法语不能为空。');
    if (!normalize(entry.meaning)) errors.push('中文释义不能为空。');
    if (entry.hasGender) {
      if (!normalize(entry.masc)) errors.push('请填写完整阳性形式。');
      if (!normalize(entry.fem)) errors.push('请填写完整阴性形式。');
      else if (shortEndings.indexOf(compare(entry.fem).replace(/^-/, '')) !== -1) errors.push('阴性必须是完整单词，不能只填写词尾缩写。');
    }
    if ((!entry.hasGender || entry.practiceGender === false) && !normalize(entry.spell || entry.french)) errors.push('拼写答案不能为空。');
    return { valid: errors.length === 0, errors: errors };
  }

  // This only classifies new source notes. Persisted confirmation decisions are
  // never reinterpreted when opening a backup. An explicitly labelled original
  // quotation can contain several semicolon-separated observations; a new
  // target warning or standalone pending warning starts a separate decision.
  function classifySourceWarning(source) {
    var needsConfirmation = false, informational = false, originalScope = false;
    var pending = /待\s*(?:核对|确认|校对)/;
    var original = /(?:原文|原材料|原资料|原词典|原释义|原音标|原例句|原笔记|历史资料|来源资料)\s*待\s*(?:核对|确认|校对)/;
    var target = /(?:学习(?:项|目标|内容|释义|词形|拼写)?|目标(?:形式|词形|拼写)?|词头|词义|拼写|阴性|阳性|音标|词性|重点释义)\s*待\s*(?:核对|确认|校对)/;
    normalize(source).split(/[;；\n]+/).forEach(function (part) {
      if (!pending.test(part)) return;
      if (target.test(part.replace(original, '原资料说明'))) { needsConfirmation = true; originalScope = false; }
      else if (original.test(part)) { informational = true; originalScope = true; }
      else if (/^\s*待\s*(?:核对|确认|校对)/.test(part)) { needsConfirmation = true; originalScope = false; }
      else if (originalScope) informational = true;
      else needsConfirmation = true;
    });
    return {needsConfirmation:needsConfirmation, informational:informational};
  }

  function parseRows(rows, options) {
    options = options || {};
    var entries = [], errors = [], warnings = [];
    if (!Array.isArray(rows)) throw new Error('词表需要按行、按列提供。');
    var header = options.header || 'auto';
    if (['auto', 'yes', 'no'].indexOf(header) < 0) throw new Error('表头选项需要是 auto、yes 或 no。');
    var indexed = rows.map(function (row, index) {
      return { values: Array.isArray(row) ? row.map(normalize) : [], raw: Array.isArray(row) ? row : [], row: rows.sourceRows ? rows.sourceRows[index] : index + 1 };
    }).filter(function (record) { return record.values.some(Boolean); });
    if (!indexed.length) return { entries: entries, errors: errors, warnings: warnings };
    var headerWidth = indexed[0].values.length, map = headerMap(indexed[0].values);
    var useHeader = header === 'yes' || (header === 'auto' && map.french !== undefined && map.meaning !== undefined);
    if (useHeader) {
      if (map.french === undefined || map.meaning === undefined) {
        return { entries: [], errors: [{ row: indexed[0].row, message: '表头必须包含「法语」和「中文」两列。' }], warnings: [] };
      }
      var seenHeaders = Object.create(null);
      indexed[0].values.forEach(function (name) {
        var key = headerLookup[headerName(name)];
        if (key && seenHeaders[key]) errors.push({ row: indexed[0].row, message: '表头「' + name + '」重复，请每个字段只保留一列。' });
        if (key) seenHeaders[key] = true;
        else if (name) warnings.push({ row: indexed[0].row, message: '未识别表头「' + name + '」，此列不会作为学习内容。' });
      });
      if (errors.length) return { entries: [], errors: errors, warnings: warnings };
      indexed.shift();
    } else map = { french: 0, meaning: 1 };
    var seenWords = Object.create(null);
    indexed.forEach(function (record) {
      var values = record.values;
      if (useHeader && values.slice(headerWidth).some(Boolean)) {
        errors.push({ row: record.row, message: '这一行比表头多出字段；含逗号或换行的内容需要用双引号包住。请检查后再导入，内容未截断。' });
        return;
      }
      if (!useHeader && values.slice(2).some(Boolean)) {
        errors.push({ row: record.row, message: '无表头词表只能有「法语、中文」两列。若需要词性、例句等字段，请增加表头；含逗号的 CSV 字段请用双引号包住。' });
        return;
      }
      function value(field) { return map[field] === undefined ? '' : normalize(values[map[field]]); }
      var raw = value('french'), meaning = value('meaning');
      if (!raw || !meaning) {
        errors.push({ row: record.row, message: !raw && !meaning ? '法语和中文释义不能为空。' : (!raw ? '法语不能为空。' : '中文释义不能为空。') });
        return;
      }
      var parts = extractPos(raw), explicitMasc = value('masc'), explicitFem = value('fem');
      if (!parts.french) { errors.push({ row: record.row, message: '去掉词性后没有法语词条，请补充完整单词。' }); return; }
      var entry = {
        id: '', raw: raw, french: parts.french, meaning: meaning, pos: normalizePos(value('pos') || parts.pos),
        masc: '', fem: '', hasGender: false, practiceGender: false, spell: parts.french,
        phonetic: value('phonetic'), usage: value('usage'), example: value('example'),
        exampleZh: value('exampleZh'), source: value('source'), needsConfirmation: false,
        sourceRow: record.row, warnings: []
      };
      // Optional long-form columns preserve literal cell text. An absent header
      // leaves the property absent so old imports cannot erase saved details.
      Object.keys(detailFields).forEach(function (field) {
        if (map[field] !== undefined) entry[field] = record.raw[map[field]] == null ? '' : record.raw[map[field]];
      });
      var invalidDetails = detailErrors(entry);
      if (invalidDetails.length) { errors.push({row:record.row,message:invalidDetails.join(' ')}); return; }
      var forms = genderForms(parts.french);
      if (explicitMasc || explicitFem) {
        entry.hasGender = true; entry.masc = explicitMasc || (genderForms(parts.french) || {}).masc || parts.french;
        entry.fem = explicitFem;
        entry.practiceGender = !!forms;
        if (entry.practiceGender) entry.spell = entry.masc;
        var validation = validateEntry(entry);
        if (!validation.valid) {
          entry.needsConfirmation = true;
          entry.warnings.push(validation.errors.join(' '));
        }
      } else {
        if (forms) {
          entry.hasGender = true; entry.practiceGender = true; entry.masc = forms.masc; entry.fem = forms.fem; entry.spell = forms.masc;
          entry.needsConfirmation = forms.needsConfirmation;
          if (forms.warning) entry.warnings.push(forms.warning);
        }
      }
      if (!entry.practiceGender && /[()（）]/.test(parts.french)) {
        entry.needsConfirmation = true;
        entry.warnings.push('法语词条含括号：请把单形拼写答案改为要练习的完整表达，语法说明可移入用法。原内容已保留，未自动删除。');
      }
      var sourceWarning = classifySourceWarning(entry.source);
      if (sourceWarning.needsConfirmation) {
        entry.needsConfirmation = true;
        entry.warnings.push('来源注明待核对，请确认词义和拼写后再导入。');
      }
      if (sourceWarning.informational) entry.warnings.push('原资料含待核对说明，已保留供查阅；该说明不暂停当前词头练习。');
      if (value('aliases')) entry.warnings.push('「可接受答案」尚未加入自动判题；请将确实需要的不同答案分别整理成词条。');
      if (value('pos') && parts.pos && normalizePos(value('pos')) !== parts.pos) entry.warnings.push('词性列与法语字段末尾的词性不同，已采用词性列。');
      var key = wordKey(entry);
      if (seenWords[key]) entry.warnings.push('与第 ' + seenWords[key] + ' 行是同一法语词条；请检查是否需要合并释义。');
      else seenWords[key] = record.row;
      entry.warnings.forEach(function (message) { warnings.push({ row: record.row, message: message }); });
      entries.push(entry);
    });
    return { entries: entries, errors: errors, warnings: warnings };
  }

  function wordKey(entry) {
    if (!entry || typeof entry !== 'object') return '';
    var canonical = normalize(entry.french || entry.spell || entry.masc);
    var parts = extractPos(canonical), forms = genderForms(parts.french);
    return compare(forms && forms.fem ? forms.masc : parts.french);
  }

  return { normalize: normalize, compare: compare, parseDelimited: parseDelimited, parseRows: parseRows, validateEntry: validateEntry, wordKey: wordKey, classifySourceWarning: classifySourceWarning };
}));
