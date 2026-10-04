/* CARNET chapters 4–7. Demo answers live only inside this module.
   The existing engine supplies spelling assessment, correction and round rules. */
(function (global) {
  'use strict';
  const E = global.VocabEngine;
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ACCENTS = ['à','â','æ','ç','é','è','ê','ë','î','ï','ô','œ','ù','û','ü','ÿ'];
  const SENTENCE = 'J’aime lire quelques pages chaque jour.';
  const SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 4 5.8 8H3v8h2.8l5.2 4V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
  const COPY = {
    demo:['演示，不计入学习进度','Demo · no study progress recorded','Démonstration · aucun progrès enregistré'],
    recallK:['04 / 07 · 回忆','04 / 07 · RECALL','04 / 07 · RAPPEL'],
    recallTitle:['先想一想，\n再揭晓。','Remember first.\nThen reveal.','Se souvenir.\nPuis découvrir.'],
    recallLead:['不急着看答案。让这个词在脑海里，多停留一会儿。','Give the word a moment in your mind before looking at the answer.','Laissez le mot revenir en mémoire avant de regarder la réponse.'],
    recallInstruction:['先试着回忆它的含义','Try to recall its meaning','Essayez de retrouver le sens'],
    reveal:['揭晓答案','Reveal the answer','Révéler la réponse'],
    meaning:['阅读；读','to read','parcourir un texte'],
    bookMeaning:['书','a book','un ouvrage composé de pages'],
    verb:['动词','verb','verbe'],
    noun:['阳性名词','masculine noun','nom masculin'],
    rateInstruction:['再按真实记忆，选择这一刻的感受。','Now choose how well you remembered.','Évaluez maintenant votre souvenir.'],
    know:['认识','Know','Connu'], hazy:['模糊','Hazy','Vague'], forgotten:['忘记了','Forgot','Oublié'],
    ratingKnown:['之后的复习会按你的记忆表现安排。','Future reviews follow your memory performance.','Les prochaines révisions suivront votre mémorisation.'],
    ratingHazy:['有些模糊，就早点巩固。','A hazy memory deserves an earlier review.','Un souvenir vague sera consolidé plus tôt.'],
    ratingForgot:['忘记也没关系，之后还会再练习。','It is fine to forget. You will practise it again.','Oublier est normal. Vous le reverrez.'],
    spellK:['05 / 07 · 书写','05 / 07 · WRITE','05 / 07 · ÉCRIRE'],
    spellTitle:['把它，\n亲手写出来。','Make the word\nyour own.','Écrivez-le,\npour vous.'],
    spellLead:['一次订正，让你看清；下一轮独立拼对，才真正通过。','A correction makes it clear. Passing means spelling it independently in a later round.','Corriger aide à comprendre. Validez le mot sans aide lors d’un nouveau tour.'],
    spellHint:['看释义，写出法语','Read the meaning and write the French word','Retrouvez le mot français à partir du sens'],
    spellCorrection:['照正确答案，再写一次','Type the correct spelling once more','Réécrivez la bonne orthographe'],
    spellInput:['输入法语','Your French answer','Votre réponse en français'],
    accents:['重音字符','Accented letters','Lettres accentuées'],
    check:['检查拼写','Check spelling','Vérifier'],
    seeAnswer:['查看答案','Show the answer','Voir la réponse'],
    yourAnswer:['你的拼写','Your spelling','Votre orthographe'],
    correctAnswer:['正确拼写','Correct spelling','Bonne orthographe'],
    empty:['未填写','Empty','Vide'],
    hintRead:['已查看答案。先重新拼写，再到下一轮独立复查。','Answer revealed. Rewrite it now, then recall it independently next round.','Réponse consultée. Réécrivez-la, puis retrouvez-la sans aide au prochain tour.'],
    wrong:['先记住正确写法，再重新拼写这个词。','Read the correct spelling, then type this word again.','Lisez la bonne orthographe, puis réécrivez ce mot.'],
    accentWrong:['注意重音符号。看清之后，再写一次。','Check the accents, then try again.','Vérifiez les accents, puis réessayez.'],
    corrected:['订正正确。本轮结束后，再独立拼写一次。','Corrected. Recall it independently in the next round.','Corrigé. Réécrivez-le sans aide au prochain tour.'],
    independent:['本轮首次独立拼对，已通过。','Correct on your first independent try this round. Passed.','Réussi sans aide du premier coup. Validé.'],
    retry:['重新拼写','Try again','Réécrire'], nextWord:['下一个词','Next word','Mot suivant'], nextRound:['进入下一轮','Start the next round','Passer au prochain tour'],
    spellDone:['两个词，都独立想起来了。','Both words, remembered independently.','Deux mots retrouvés sans aide.'],
    spellDoneBody:['刚才的练习只属于这段引导。真正的学习会从首页开始。','This was only a demonstration. Your learning starts from Today.','C’était une démonstration. Votre apprentissage commence dans Aujourd’hui.'],
    again:['再试一次演示','Try the demo again','Refaire la démonstration'],
    skip:['跳过演示，继续','Skip demo and continue','Passer la démonstration'],
    soundK:['06 / 07 · 听见','06 / 07 · LISTEN','06 / 07 · ÉCOUTER'],
    soundTitle:['让文字，\n也有声音。','A voice\nfor every word.','Une voix\npour chaque mot.'],
    soundLead:['听一个词，再听一句话。找一个让你愿意继续听下去的声音。','Hear a word, then a sentence. Choose a voice you enjoy listening to.','Écoutez un mot, puis une phrase. Choisissez une voix agréable.'],
    listenWord:['听单词','Hear the word','Écouter le mot'],listenSentence:['听例句','Hear the sentence','Écouter la phrase'],
    translation:['我喜欢每天读几页书。','I like to read a few pages every day.','Je lis avec plaisir quelques pages chaque jour.'],
    autoVoice:['自动选择法语声音','Choose a French voice automatically','Choisir automatiquement une voix française'],
    changeVoice:['更换声音','Change voice','Changer de voix'],closeVoice:['收起声音列表','Hide voices','Masquer les voix'],
    chooseVoice:['设备上的法语声音','French voices on this device','Voix françaises sur cet appareil'],
    voiceNote:['自动选择会优先使用设备提供的 Google français。声音名称与可用性由当前浏览器决定。','Automatic selection prefers Google français when available. Names and availability depend on your browser.','Le choix automatique privilégie Google français si disponible. Les voix dépendent du navigateur.'],
    voiceEmpty:['设备尚未提供法语声音。可以重试，或继续并稍后在设置中调整。','No French voice is available yet. Try again, or continue and adjust it in Settings later.','Aucune voix française n’est disponible. Réessayez ou ajustez-la plus tard dans les réglages.'],
    voiceWaiting:['正在读取设备声音…','Reading available voices…','Recherche des voix disponibles…'],
    voiceUnavailable:['之前选择的声音暂时不可用；试听将自动选择法语声音。','Your selected voice is unavailable; playback will choose a French voice automatically.','La voix choisie n’est pas disponible ; une voix française sera choisie automatiquement.'],
    loading:['正在准备朗读…','Preparing playback…','Préparation de la lecture…'],
    playing:['正在朗读','Playing','Lecture en cours'], played:['朗读结束','Playback finished','Lecture terminée'],
    soundReady:['点击按钮试听 · 不会自动播放','Press a button to listen · no automatic playback','Appuyez pour écouter · pas de lecture automatique'],
    soundError:['朗读未能启动。请检查设备的法语声音，再点击重试。','Playback could not start. Check your French voices, then try again.','La lecture n’a pas démarré. Vérifiez vos voix françaises, puis réessayez.'],
    soundUnsupported:['此浏览器暂不支持合成朗读。可以继续引导，或换用支持朗读的浏览器。','Speech synthesis is unavailable in this browser. Continue the guide, or use a browser with speech support.','La synthèse vocale n’est pas disponible dans ce navigateur. Continuez le guide ou utilisez un navigateur compatible.'],
    retrySound:['重试试听','Retry playback','Réessayer'],retryVoices:['重新检查声音','Refresh voices','Actualiser les voix'],
    synthesis:['浏览器合成朗读','Browser speech synthesis','Synthèse vocale du navigateur'],
    advanced:['自动朗读、语速与听音题型，之后可在设置中调整。','Autoplay, speed and listening questions are available in Settings.','Lecture automatique, vitesse et exercices audio sont disponibles dans les réglages.'],
    finishK:['07 / 07 · 启程','07 / 07 · BEGIN','07 / 07 · COMMENCER'],
    finishTitle:['这张书桌，\n留给今天。','A little space\nfor today.','Un petit espace\npour aujourd’hui.'],
    finishLead:['不需要一下子学很多。从熟悉的几个词开始，明天再来。','A few familiar words are enough for a beginning. Come back tomorrow.','Quelques mots suffisent pour commencer. Revenez demain.'],
    entryStarter:['使用入门词表','Use the starter deck','Utiliser la liste de départ'],
    entryImport:['导入我的词表','Import my vocabulary','Importer ma liste'],
    entryImportSub:['选择整理好的表格，在导入预览中核对。','Choose a prepared table and check the import preview.','Choisissez un tableau préparé et vérifiez l’aperçu.'],
    entryEnter:['先进入学习空间','Enter my learning space','Entrer dans mon espace'],
    entryEnterSub:['回到今日，保留已有词表与学习进度。','Open Today with your existing decks and progress.','Ouvrir Aujourd’hui en conservant vos listes et progrès.'],
    pace:['学习节奏','Learning pace','Rythme d’apprentissage'],
    free:['自由学习','At my own pace','À mon rythme'],
    goal:['每日小目标','A small daily goal','Un petit objectif quotidien'],
    dailyWords:['每日新词','New words per day','Nouveaux mots par jour'],
    batchWords:['每组新词','New words per group','Nouveaux mots par groupe'],
    paceNote:['每次按组学习新词。选择自由学习后，不设每日新词目标，仍会安排到期复习。','Learn new words in small groups. At your own pace, there is no daily new-word goal; due reviews are still scheduled.','Apprenez les nouveaux mots par petits groupes. À votre rythme, aucun objectif quotidien de nouveaux mots n’est fixé ; les révisions dues restent programmées.'],
    addStarter:['添加入门词表','Add the starter deck','Ajouter la liste de départ'],
    pickFile:['选择词表文件','Choose a vocabulary file','Choisir un fichier'],
    enter:['进入学习空间','Enter my learning space','Entrer dans mon espace'],
    saving:['正在准备学习空间…','Preparing your learning space…','Préparation de votre espace…'],
    finishFailed:['操作未完成，已保留你的选择。请重试。','The action did not finish. Your choices are kept; please try again.','L’opération n’a pas abouti. Vos choix sont conservés ; réessayez.'],
    retryFinish:['重试','Try again','Réessayer'],
    invalidGoal:['每日新词请输入 1–200 之间的整数。','For new words per day, enter a whole number from 1 to 200.','Pour les nouveaux mots par jour, saisissez un entier de 1 à 200.'],
    invalidBatch:['每组新词请输入 1–100 之间的整数。','For new words per group, enter a whole number from 1 to 100.','Pour les nouveaux mots par groupe, saisissez un entier de 1 à 100.'],
    hasBackup:['已有备份？','Already have a backup?','Déjà une sauvegarde ?'],
    restore:['恢复学习进度','Restore learning progress','Restaurer les progrès'],
    after:['之后可随时从设置中重看引导。','You can replay this guide from Settings.','Vous pourrez revoir ce guide dans les réglages.']
  };
  function mount(host, options = {}) {
    if (!(host instanceof Element)) throw new Error('A lesson host is required.');
    let chapter = null, disposed = false, composing = false;
    let prefs = {...(options.getSettings?.() || {})};
    let recall = {revealed:false,rating:null};
    let spelling = makeSpelling(), draft = '', lastMistake = null;
    let voiceURI = String(prefs.voiceURI || ''), voiceDirty = false, voicesOpen = false;
    let paceEnabled = prefs.dailyGoalEnabled !== false, paceDirty = false, goalDirty = false, batchDirty = false;
    let dailyGoal = String(prefs.dailyGoal ?? 20), newBatch = String(prefs.newBatch ?? 10), entry = options.replay ? 'enter' : 'starter';
    let audioRequest = 0, lastAudio = 'word', audioState = 'idle', audioError = '', audioVoice = '';
    let submitting = false, submitted = false, finishError = '', finishErrorField = '';
    const lang = () => /^fr/.test(document.documentElement.lang) ? 2 : /^en/.test(document.documentElement.lang) ? 1 : 0;
    const t = key => COPY[key]?.[lang()] || key;
    const tr = key => '<span data-lesson-text="'+key+'">'+escape(t(key))+'</span>';
    const $ = selector => host.querySelector(selector);
    const $$ = selector => Array.from(host.querySelectorAll(selector));
    const button = (key, action, extra = '') => '<button type="button" class="button" data-lesson-action="'+action+'" '+extra+'>'+tr(key)+'</button>';
    const shell = (number, key, content) => '<section class="carnet-lesson" data-lesson-chapter="'+number+'" aria-labelledby="carnet-lesson-title-'+number+'" hidden inert><div class="carnet-lesson-copy"><p class="chapter-kicker">'+tr(key+'K')+'</p><h2 id="carnet-lesson-title-'+number+'">'+tr(key+'Title')+'</h2><p class="carnet-lesson-lead">'+tr(key+'Lead')+'</p></div><div class="carnet-lesson-paper">'+content+'</div></section>';
    host.classList.add('carnet-lessons');
    host.classList.toggle('carnet-lessons-flow',!!options.flow);
    host.innerHTML = shell(4,'recall',
      '<div class="carnet-lesson-card-head"><span>CARNET / 01</span><span>'+tr('demo')+'</span></div><div class="carnet-recall-body"><p class="carnet-recall-instruction">'+tr('recallInstruction')+'</p><h3 class="carnet-lesson-word" lang="fr">lire</h3><div class="carnet-recall-answer" aria-live="polite"><div hidden data-recall-answer><p class="carnet-word-meta">/liʁ/ · '+tr('verb')+'</p><p class="carnet-word-meaning">'+tr('meaning')+'</p></div></div></div><div class="carnet-recall-actions">'+button('reveal','reveal')+'<div data-recall-ratings hidden><p class="carnet-lesson-note">'+tr('rateInstruction')+'</p><div class="carnet-lesson-ratings">'+['know','hazy','forgotten'].map((key,i)=>button(key,'rate','data-rating="'+[3,2,1][i]+'" aria-pressed="false"')).join('')+'</div></div><p class="carnet-recall-feedback" role="status"></p></div>') +
      shell(5,'spell', '<div class="carnet-lesson-card-head"><span data-spell-round></span><div class="carnet-lesson-dots" aria-label="'+escape(t('spellHint'))+'"></div></div><div data-spell-question><p class="carnet-lesson-note" data-spell-instruction></p><h3 class="carnet-spell-meaning"></h3><p class="carnet-word-meta" data-spell-pos></p><div class="carnet-spell-comparison" aria-live="polite" hidden></div><form class="carnet-spell-form" novalidate><label class="sr-only" for="carnet-lesson-answer">'+tr('spellInput')+'</label><input id="carnet-lesson-answer" name="answer" type="text" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="…"><div class="carnet-lesson-accents" role="group" aria-label="'+escape(t('accents'))+'">'+ACCENTS.map(c=>'<button type="button" data-lesson-action="accent" data-accent="'+c+'" lang="fr">'+c+'</button>').join('')+'</div><p class="carnet-spell-status" role="status"></p><div class="carnet-spell-actions"><button type="submit" class="button primary" data-spell-check>'+tr('check')+'</button>'+button('seeAnswer','answer')+'<button type="button" class="button primary" data-lesson-action="spell-next" hidden></button></div></form></div><div class="carnet-spell-done" hidden><div class="carnet-lesson-complete" aria-hidden="true">✓</div><h3>'+tr('spellDone')+'</h3><p>'+tr('spellDoneBody')+'</p>'+button('again','restart')+'</div><div class="carnet-lesson-foot"><small>'+tr('demo')+'</small><button type="button" class="text-button" data-lesson-action="continue">'+tr('skip')+'</button></div>') +
      shell(6,'sound', '<div class="carnet-lesson-card-head"><span>CARNET / 01</span><span>'+tr('synthesis')+'</span></div><div class="carnet-sound-word" data-sound-unit="word"><h3 class="carnet-lesson-word" lang="fr">lire</h3><p class="carnet-word-meta">/liʁ/ · '+tr('verb')+'</p><button type="button" class="button" data-lesson-action="play-word">'+SOUND+tr('listenWord')+'</button></div><div class="carnet-sound-sentence" data-sound-unit="sentence"><p class="carnet-lesson-sentence" lang="fr">J’aime <mark>lire</mark> quelques pages chaque jour.</p><p class="carnet-lesson-translation">'+tr('translation')+'</p><button type="button" class="button" data-lesson-action="play-sentence">'+SOUND+tr('listenSentence')+'</button></div><div class="carnet-audio-feedback" aria-live="polite"><p data-audio-status></p><button type="button" class="text-button" data-lesson-action="retry-audio" hidden>'+tr('retrySound')+'</button></div><div class="carnet-voice-summary"><span data-voice-summary></span><button type="button" class="text-button" data-lesson-action="voices" aria-expanded="false" aria-controls="carnet-voice-options">'+tr('changeVoice')+'</button></div><div id="carnet-voice-options" hidden><label for="carnet-lesson-voice">'+tr('chooseVoice')+'</label><select id="carnet-lesson-voice"></select><p class="carnet-lesson-note" data-voice-status aria-live="polite"></p><p class="carnet-lesson-note">'+tr('voiceNote')+'</p><button type="button" class="text-button" data-lesson-action="refresh-voices">'+tr('retryVoices')+'</button></div><p class="carnet-lesson-footnote">'+tr('advanced')+'</p>') +
      shell(7,'finish','<div class="carnet-lesson-card-head"><span>UN PEU, CHAQUE JOUR.</span><span>07</span></div><div class="carnet-entry-options" role="group" aria-label="'+escape(t('finishTitle'))+'">'+[
        ['starter','entryStarter',''],['import','entryImport','entryImportSub'],['enter','entryEnter','entryEnterSub']
      ].map(([value,title,sub],i)=>'<button type="button" class="carnet-entry-option" data-lesson-action="entry" data-entry="'+value+'" aria-pressed="false"><span class="carnet-entry-number">0'+(i+1)+'</span><span><strong>'+tr(title)+'</strong><small '+(value==='starter'?'data-starter-count':'')+'>'+(sub?tr(sub):'')+'</small></span><span class="carnet-entry-mark" aria-hidden="true">✓</span></button>').join('')+'</div><details class="carnet-pace"'+(options.replay?'':' open')+'><summary>'+tr('pace')+'<span data-pace-summary></span></summary><div class="carnet-pace-options"><label><input type="radio" name="carnet-pace" value="false">'+tr('free')+'</label><label><input type="radio" name="carnet-pace" value="true">'+tr('goal')+'</label></div><label class="carnet-goal-field" for="carnet-lesson-goal">'+tr('dailyWords')+'<input id="carnet-lesson-goal" type="number" inputmode="numeric" min="1" max="200" step="1" aria-describedby="carnet-pace-note carnet-finish-error" required></label><label class="carnet-batch-field" for="carnet-lesson-batch">'+tr('batchWords')+'<input id="carnet-lesson-batch" type="number" inputmode="numeric" min="1" max="100" step="1" aria-describedby="carnet-pace-note carnet-finish-error" required></label><p id="carnet-pace-note" class="carnet-lesson-note">'+tr('paceNote')+'</p></details><p id="carnet-finish-error" class="carnet-finish-error" role="alert" hidden></p><button type="button" class="button primary carnet-finish-button" data-lesson-action="finish"></button><p class="carnet-restore">'+tr('hasBackup')+' <button type="button" class="text-button" data-lesson-action="restore">'+tr('restore')+'</button></p><p class="carnet-lesson-footnote">'+tr('after')+'</p>');

    function makeSpelling() {
      const state = E.createState();
      state.decks = [{id:'carnet-demo-deck',name:'引导演示',words:[
        {id:'carnet-demo-lire',french:'lire',spell:'lire',meaning:'阅读；读',pos:'v.',phonetic:'/liʁ/'},
        {id:'carnet-demo-livre',french:'livre',spell:'livre',meaning:'书',pos:'n.m.',phonetic:'/livʁ/'}
      ]}];
      state.settings.studyDeckIds = ['carnet-demo-deck'];
      E.ensureState(state); E.start(state,'spelling',{limit:2,wordIds:['carnet-demo-lire','carnet-demo-livre']});
      return state;
    }
    // Identical prefix/suffix comparison convention to the real study renderer.
    function spellDiff(actual, expected) {
      const display = v => String(v || '').normalize('NFC').replace(/[’‘ʼ]/g,"'").replace(/[‐‑]/g,'-').replace(/\s+/g,' ').trim();
      const a=[...display(actual)], b=[...display(expected)], same=(x,y)=>x.toLocaleLowerCase('fr')===y.toLocaleLowerCase('fr');
      let left=0; while(left<a.length&&left<b.length&&same(a[left],b[left]))left++;
      let right=0; while(right<a.length-left&&right<b.length-left&&same(a[a.length-1-right],b[b.length-1-right]))right++;
      const paint=(v,tag)=>'<span class="carnet-diff-correct">'+escape(v.slice(0,left).join(''))+'</span>'+(v.length-left-right?'<'+tag+'>'+escape(v.slice(left,v.length-right).join(''))+'</'+tag+'>':'')+'<span class="carnet-diff-correct">'+escape(right?v.slice(-right).join(''):'')+'</span>';
      return {actual:paint(a,'del'),expected:paint(b,'mark')};
    }
    function updateRecall() {
      $('[data-recall-answer]').hidden = !recall.revealed;
      $('[data-recall-ratings]').hidden = !recall.revealed;
      $('[data-lesson-action="reveal"]').hidden = recall.revealed;
      $$('[data-rating]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.rating)===recall.rating)));
      $('.carnet-recall-feedback').textContent = recall.rating ? t({3:'ratingKnown',2:'ratingHazy',1:'ratingForgot'}[recall.rating]) : '';
    }
    function renderSpelling() {
      const current=E.current(spelling), done=current.kind==='summary', input=$('#carnet-lesson-answer');
      const feedback=current.feedback;
      $('[data-spell-question]').hidden=done; $('.carnet-spell-done').hidden=!done;
      const round=spelling.session.round;
      $('[data-spell-round]').textContent = ['第 '+round+' 轮 · 独立通过 '+spelling.session.completedIds.length+' / 2','Round '+round+' · Passed '+spelling.session.completedIds.length+' / 2','Tour '+round+' · Validés '+spelling.session.completedIds.length+' / 2'][lang()];
      $('.carnet-lesson-dots').innerHTML=spelling.session.wordIds.map((id,i)=>'<span class="carnet-lesson-dot '+(spelling.session.completedIds.includes(id)?'passed':current.word?.id===id?'current':'')+'" role="img" aria-label="'+escape(['第 '+(i+1)+' 词','Word '+(i+1),'Mot '+(i+1)][lang()])+' · '+(spelling.session.completedIds.includes(id)?['已通过','passed','validé'][lang()]:['未通过','pending','en attente'][lang()])+'"></span>').join('');
      if(done)return;
      $('[data-spell-instruction]').textContent=t(current.correction?'spellCorrection':'spellHint');
      $('.carnet-spell-meaning').textContent=t(current.word.french==='lire'?'meaning':'bookMeaning');
      $('[data-spell-pos]').textContent=t(current.word.french==='lire'?'verb':'noun');
      input.readOnly=!!feedback;
      input.setAttribute('aria-invalid',String(!!feedback&&!feedback.correct&&E.normalize(draft)!==E.normalize(feedback.expected)));
      $('[data-spell-check]').hidden=!!feedback;
      $('[data-lesson-action="answer"]').hidden=!!feedback;
      $('.carnet-lesson-accents').hidden=!!feedback;
      const next=$('[data-lesson-action="spell-next"]'); next.hidden=!feedback;
      let message='';
      if(feedback) {
        message=t(feedback.independent?'independent':feedback.correct?'corrected':feedback.assisted?'hintRead':feedback.accentOnly?'accentWrong':'wrong');
        const lastInRound=spelling.session.queue.length===0;
        next.textContent=t(feedback.next==='retry'?'retry':lastInRound&&spelling.session.completedIds.length<2?'nextRound':'nextWord');
      }
      $('.carnet-spell-status').textContent=message;
      $('.carnet-spell-status').classList.toggle('is-wrong',!!feedback&&!feedback.correct);
      const compare=$('.carnet-spell-comparison');
      compare.hidden=!feedback&&!current.correction;
      if(feedback||current.correction) {
        const previous=feedback&&!feedback.correct?feedback:lastMistake;
        if(previous && (!feedback||!feedback.independent)) {
          const diff=spellDiff(previous.actual,previous.expected);
          compare.innerHTML='<div><span>'+escape(t('yourAnswer'))+'</span><p lang="fr">'+(previous.actual?diff.actual:'<em>'+escape(t('empty'))+'</em>')+'</p></div><div><span>'+escape(t('correctAnswer'))+'</span><p lang="fr">'+diff.expected+'</p></div>';
        } else compare.hidden=true;
      }
    }
    function submitSpelling(showAnswer=false) {
      if((chapter!==5&&!options.flow)||composing||E.current(spelling).kind==='summary'||E.current(spelling).feedback)return;
      draft=$('#carnet-lesson-answer').value;
      if(showAnswer)E.reveal(spelling,'hint');
      const feedback=E.answer(spelling,{typed:showAnswer?'':draft});
      // Preserve the actual draft when the answer is requested, even though the
      // empty assisted engine submission guarantees correction and a later round.
      if(showAnswer)feedback.actual=draft;
      if(!feedback.correct)lastMistake={actual:draft,expected:feedback.expected};
      renderSpelling();
    }
    function advanceSpelling() {
      if(!E.current(spelling)?.feedback)return;
      const previous=E.current(spelling).word.id;
      E.next(spelling);
      draft=''; $('#carnet-lesson-answer').value='';
      if(E.current(spelling).word?.id!==previous||!E.current(spelling).correction)lastMistake=null;
      renderSpelling();
      if(E.current(spelling).kind!=='summary')$('#carnet-lesson-answer').focus({preventScroll:true});
    }
    function frenchVoices() {
      try{return Array.from(global.speechSynthesis?.getVoices?.()||[]).filter(v=>/^fr(?:[-_]|$)/i.test(v.lang||''));}catch(_){return [];}
    }
    function updateVoices() {
      if(disposed)return;
      const voices=frenchVoices(), select=$('#carnet-lesson-voice');
      const selected=voices.find(v=>v.voiceURI===voiceURI);
      const fragment=document.createDocumentFragment();
      const auto=document.createElement('option');auto.value='';auto.textContent=t('autoVoice');fragment.append(auto);
      if(voiceURI&&!selected){const missing=document.createElement('option');missing.value=voiceURI;missing.textContent=voiceURI+' · '+['暂不可用','unavailable','indisponible'][lang()];fragment.append(missing);}
      voices.forEach(voice=>{const item=document.createElement('option');item.value=voice.voiceURI;item.textContent=voice.name+' · '+voice.lang;fragment.append(item);});
      const wasFocused=document.activeElement===select;
      select.replaceChildren(fragment);select.value=voiceURI;
      if(wasFocused)select.focus({preventScroll:true});
      $('[data-voice-summary]').textContent=voiceURI?(selected?.name||voiceURI):t('autoVoice');
      $('[data-voice-status]').textContent=voiceURI&&!selected?t('voiceUnavailable'):!voices.length?t('voiceEmpty'):'';
      $('#carnet-voice-options').hidden=!voicesOpen;
      const trigger=$('[data-lesson-action="voices"]');trigger.setAttribute('aria-expanded',String(voicesOpen));trigger.textContent=t(voicesOpen?'closeVoice':'changeVoice');
    }
    function updateAudio() {
      $$('[data-sound-unit]').forEach(el=>el.classList.toggle('is-speaking',audioState==='playing'&&el.dataset.soundUnit===lastAudio));
      $$('[data-lesson-action="play-word"],[data-lesson-action="play-sentence"]').forEach(el=>{el.setAttribute('aria-busy',String(['loading','playing'].includes(audioState)&&el.dataset.lessonAction==='play-'+lastAudio));});
      const text=audioState==='loading'?t('loading'):audioState==='playing'?t('playing')+(audioVoice?' · '+audioVoice:''):audioState==='ended'?t('played'):audioState==='error'?t(audioError||'soundError'):t('soundReady');
      $('[data-audio-status]').textContent=text;
      $('[data-audio-status]').classList.toggle('is-error',audioState==='error');
      $('[data-lesson-action="retry-audio"]').hidden=audioState!=='error';
    }
    function stopAudio() {
      audioRequest++; global.AudioKit?.stop(); audioState='idle';audioError='';audioVoice='';updateAudio();
    }
    function soundFailureKey(){return !global.speechSynthesis||!global.SpeechSynthesisUtterance?'soundUnsupported':'soundError';}
    async function play(kind) {
      if((chapter!==6&&!options.flow)||disposed)return;
      if(chapter!==6)setChapter(6);
      const request=++audioRequest;
      global.AudioKit?.stop();lastAudio=kind;audioState='loading';audioError='';audioVoice='';updateAudio();
      try {
        const result=await global.AudioKit.speak(kind==='word'?'lire':SENTENCE,{voiceURI,rate:Number(prefs.rate)||.88,onStatus(status){
          if(disposed||request!==audioRequest||chapter!==6)return;
          audioState=status.state;audioError=status.state==='error'?soundFailureKey():'';audioVoice=status.voiceName||audioVoice;updateAudio();
        }});
        if(disposed||request!==audioRequest||chapter!==6)return;
        if(result?.state==='error'){audioState='error';audioError=soundFailureKey();updateAudio();}
      }catch(error){if(request===audioRequest&&!disposed){audioState='error';audioError=soundFailureKey();updateAudio();}}
    }
    function renderFinish() {
      $$('[data-entry]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.entry===entry)));
      const count=typeof options.starterCount==='function'?options.starterCount():options.starterCount ?? global.VocabSeed?.length ?? 0;
      $('[data-starter-count]').textContent=[count+' 个日常法语词，从熟悉的小事开始。',count+' everyday French words, for a gentle beginning.',count+' mots de français du quotidien, pour commencer simplement.'][lang()];
      $$('input[name="carnet-pace"]').forEach(input=>input.checked=input.value===String(paceEnabled));
      $('[data-pace-summary]').textContent=t(paceEnabled?'goal':'free');
      $('.carnet-goal-field').hidden=!paceEnabled;
      $('#carnet-lesson-goal').disabled=!paceEnabled;
      if(document.activeElement!==$('#carnet-lesson-goal'))$('#carnet-lesson-goal').value=dailyGoal;
      if(document.activeElement!==$('#carnet-lesson-batch'))$('#carnet-lesson-batch').value=newBatch;
      $('#carnet-lesson-goal').setAttribute('aria-invalid',String(finishErrorField==='goal'));
      $('#carnet-lesson-batch').setAttribute('aria-invalid',String(finishErrorField==='batch'));
      const finish=$('[data-lesson-action="finish"]');finish.disabled=submitting||submitted;
      finish.setAttribute('aria-busy',String(submitting));
      finish.textContent=t(submitting?'saving':finishError?'retryFinish':{starter:'addStarter',import:'pickFile',enter:'enter'}[entry]);
      $('.carnet-finish-error').hidden=!finishError;$('.carnet-finish-error').textContent=finishError;
      $$('[data-entry],input[name="carnet-pace"],[data-lesson-action="restore"]').forEach(b=>b.disabled=submitting||submitted);
      $('#carnet-lesson-goal').disabled=!paceEnabled||submitting||submitted;
      $('#carnet-lesson-batch').disabled=submitting||submitted;
    }
    async function finish(override) {
      if(submitting||submitted||disposed)return;
      const restoring=override==='restore';
      dailyGoal=$('#carnet-lesson-goal').value;
      newBatch=$('#carnet-lesson-batch').value;
      if(!restoring&&paceEnabled&&(!Number.isInteger(Number(dailyGoal))||Number(dailyGoal)<1||Number(dailyGoal)>200)) {
        finishError=t('invalidGoal');finishErrorField='goal';renderFinish();$('.carnet-pace').open=true;$('#carnet-lesson-goal').focus({preventScroll:true});return;
      }
      if(!restoring&&(!Number.isInteger(Number(newBatch))||Number(newBatch)<1||Number(newBatch)>100)) {
        finishError=t('invalidBatch');finishErrorField='batch';renderFinish();$('.carnet-pace').open=true;$('#carnet-lesson-batch').focus({preventScroll:true});return;
      }
      finishError='';finishErrorField='';submitting=true;renderFinish();
      const preferences={};
      if(voiceDirty)preferences.voiceURI=voiceURI;
      if(paceDirty)preferences.dailyGoalEnabled=paceEnabled;
      if(goalDirty&&Number.isInteger(Number(dailyGoal))&&Number(dailyGoal)>=1&&Number(dailyGoal)<=200)preferences.dailyGoal=Number(dailyGoal);
      if(batchDirty)preferences.newBatch=Number(newBatch);
      const payload={intent:override||entry,preferences:restoring?{}:preferences,replay:!!options.replay};
      try {
        if(typeof options.finish!=='function')throw new Error(t('finishFailed'));
        const result=await options.finish(payload);
        if(result===false||result?.ok===false||result?.cancelled) {
          finishError=result?.cancelled?'':result?.error||t('finishFailed');
        } else submitted=true;
      }catch(error){finishError=error?.message||t('finishFailed');}
      finally{submitting=false;if(!disposed)renderFinish();}
    }
    function setChapter(next) {
      if(disposed)return;
      next=[4,5,6,7].includes(Number(next))?Number(next):null;
      if(next===chapter&&host.dataset.chapter===String(next||''))return;
      if(chapter===6&&next!==6)stopAudio();
      chapter=next;
      $$('[data-lesson-chapter]').forEach(section=>{const active=Number(section.dataset.lessonChapter)===chapter;section.hidden=options.flow?false:!active;section.inert=options.flow?false:!active;section.dataset.active=String(active);});
      host.hidden=options.flow?false:chapter===null;host.dataset.chapter=chapter||'';
      if(chapter===6)updateVoices();
      if(chapter===7)renderFinish();
    }
    function setPreferences(next={},config={}) {
      // A completed guide is a committed transaction. A later replay starts
      // from the latest saved preferences, while unfinished drafts stay intact.
      if(config.replay!==undefined&&submitted){voiceDirty=false;paceDirty=false;goalDirty=false;batchDirty=false;finishError='';finishErrorField='';}
      prefs={...prefs,...next};
      if(!voiceDirty)voiceURI=String(prefs.voiceURI||'');
      if(!paceDirty)paceEnabled=prefs.dailyGoalEnabled!==false;
      if(!goalDirty)dailyGoal=String(prefs.dailyGoal??20);
      if(!batchDirty)newBatch=String(prefs.newBatch??10);
      if(config.replay!==undefined){options.replay=!!config.replay;if(options.replay)entry='enter';submitted=false;}
      updateVoices();renderFinish();
    }
    function syncLanguage() {
      $$('[data-lesson-text]').forEach(el=>el.textContent=t(el.dataset.lessonText));
      updateRecall();renderSpelling();updateVoices();updateAudio();renderFinish();
      $('.carnet-lesson-accents').setAttribute('aria-label',t('accents'));
      $('.carnet-lesson-dots').setAttribute('aria-label',t('spellHint'));
      $('.carnet-entry-options').setAttribute('aria-label',t('finishTitle'));
    }
    function showError(message){finishError=String(message||t('finishFailed'));finishErrorField='';submitted=false;renderFinish();}
    function getState() {return clone({chapter,recall,spelling,draft,voiceURI,voiceDirty,voicesOpen,paceEnabled,dailyGoal,newBatch,paceDirty,goalDirty,batchDirty,entry,submitting,submitted,audioState,finishError});}
    function handleClick(event) {
      const target=event.target.closest('[data-lesson-action]');
      if(!target||!host.contains(target)||target.disabled)return;
      const action=target.dataset.lessonAction;
      switch(action) {
        case 'reveal':recall.revealed=true;updateRecall();break;
        case 'rate':if(recall.revealed){recall.rating=Number(target.dataset.rating);updateRecall();}break;
        case 'answer':submitSpelling(true);break;
        case 'spell-next':advanceSpelling();break;
        case 'accent':{const input=$('#carnet-lesson-answer');if(input.readOnly)return;input.setRangeText(target.dataset.accent,input.selectionStart,input.selectionEnd,'end');draft=input.value;input.focus({preventScroll:true});break;}
        case 'restart':spelling=makeSpelling();draft='';lastMistake=null;$('#carnet-lesson-answer').value='';renderSpelling();break;
        case 'continue':options.onContinue?.(6);break;
        case 'play-word':play('word');break;
        case 'play-sentence':play('sentence');break;
        case 'retry-audio':play(lastAudio);break;
        case 'voices':voicesOpen=!voicesOpen;updateVoices();break;
        case 'refresh-voices':updateVoices();break;
        case 'entry':entry=target.dataset.entry;finishError='';finishErrorField='';renderFinish();break;
        case 'finish':finish();break;
        case 'restore':finish('restore');break;
      }
    }
    function handleInput(event) {
      if(event.target.id==='carnet-lesson-answer')draft=event.target.value;
      if(event.target.id==='carnet-lesson-goal'){dailyGoal=event.target.value;goalDirty=true;finishError='';finishErrorField='';renderFinish();}
      if(event.target.id==='carnet-lesson-batch'){newBatch=event.target.value;batchDirty=true;finishError='';finishErrorField='';renderFinish();}
    }
    function handleChange(event) {
      if(event.target.id==='carnet-lesson-voice'){voiceURI=event.target.value;voiceDirty=true;updateVoices();play('word');}
      if(event.target.name==='carnet-pace'){paceEnabled=event.target.value==='true';paceDirty=true;finishError='';finishErrorField='';renderFinish();}
    }
    function handleKeydown(event) {
      if(event.target.id!=='carnet-lesson-answer'||event.key!=='Enter')return;
      if(event.isComposing||composing||event.keyCode===229||event.repeat){event.preventDefault();return;}
      if(E.current(spelling)?.feedback){event.preventDefault();advanceSpelling();}
    }
    function handleSubmit(event) {if(event.target.matches('.carnet-spell-form')){event.preventDefault();if(!composing)submitSpelling();}}
    function handlePointer(event) {if(event.target.closest('[data-lesson-action="accent"]'))event.preventDefault();}
    const beginComposition=()=>{composing=true;};const endComposition=()=>{composing=false;};
    host.addEventListener('click',handleClick);host.addEventListener('input',handleInput);host.addEventListener('change',handleChange);
    host.addEventListener('keydown',handleKeydown);host.addEventListener('submit',handleSubmit);host.addEventListener('pointerdown',handlePointer);
    $('#carnet-lesson-answer').addEventListener('compositionstart',beginComposition);$('#carnet-lesson-answer').addEventListener('compositionend',endComposition);
    global.speechSynthesis?.addEventListener?.('voiceschanged',updateVoices);
    function destroy(){if(disposed)return;stopAudio();disposed=true;host.removeEventListener('click',handleClick);host.removeEventListener('input',handleInput);host.removeEventListener('change',handleChange);host.removeEventListener('keydown',handleKeydown);host.removeEventListener('submit',handleSubmit);host.removeEventListener('pointerdown',handlePointer);global.speechSynthesis?.removeEventListener?.('voiceschanged',updateVoices);host.replaceChildren();}
    updateRecall();renderSpelling();updateVoices();updateAudio();renderFinish();setChapter(null);
    function resetDemo(){recall={revealed:false,rating:null};spelling=makeSpelling();draft='';lastMistake=null;$('#carnet-lesson-answer').value='';stopAudio();updateRecall();renderSpelling();}
    return Object.freeze({setChapter,getState,setPreferences,syncLanguage,resetDemo,showError,submit:finish,destroy});
  }
  global.VocabCarnetLessons=Object.freeze({mount});
})(window);
