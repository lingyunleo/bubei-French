/* Explicit, one-shot local reset. No startup marker, automatic wipe, or broad storage.clear(). */
(function (host) {
  'use strict';
  const FORMAL = Object.freeze({
    databases: ['FR_VOCAB_DATA_V4', 'FR_VOCAB_MEDIA_V4'],
    keys: ['FR_VOCAB_APP_V4', 'FR_VOCAB_APP_V4_SNAPSHOT', 'FR_VOCAB_APP_V2', 'FR_VOCAB_APP_V2_SNAPSHOT', 'FR_VOCAB_INTERFACE_LANGUAGE'],
    prefixes: ['FR_VOCAB_APP_V2_WORDS_']
  });
  const EXPERIMENTAL = Object.freeze({
    databases: ['FR_VOCAB_ATELIER_DATA_V4', 'FR_VOCAB_ATELIER_MEDIA_V4'],
    keys: ['FR_VOCAB_ATELIER_APP_V4', 'FR_VOCAB_ATELIER_APP_V4_SNAPSHOT'],
    prefixes: []
  });
  let configuration = {}, running = null, dialog = null;
  const words = {
    title: ['清除本机学习数据', 'Clear local learning data', 'Effacer les données locales'],
    detail: ['将清除当前浏览器中本站的词表、例句、学习进度、用户偏好、已导入音频和恢复快照，回到首次使用状态。其他网站的数据不会被清除。', 'This removes this site’s word lists, examples, progress, preferences, imported audio and recovery snapshots from this browser, returning it to first use. Other sites are not affected.', 'Cette action supprime les listes, exemples, progrès, préférences, fichiers audio et instantanés de ce site dans ce navigateur, pour retrouver le premier démarrage. Les autres sites sont préservés.'],
    backup: ['清除后无法撤销。如需保留，请先取消并导出完整备份。', 'This cannot be undone. Cancel and export a complete backup first if you want to keep your data.', 'Cette action est irréversible. Annulez et exportez une sauvegarde complète pour conserver vos données.'],
    limitation: ['仅处理本页可访问的浏览器存储；其他浏览器、设备或文件地址下的存档不受影响。', 'Only browser storage accessible to this page is affected. Archives in other browsers, devices or file locations are unchanged.', 'Seul le stockage accessible à cette page est concerné. Les autres navigateurs, appareils et emplacements restent inchangés.'],
    cancel: ['取消', 'Cancel', 'Annuler'], confirm: ['确认清除', 'Clear data', 'Confirmer'],
    preparing: ['正在停止播放与保存…', 'Stopping playback and saving…', 'Arrêt de la lecture et de l’enregistrement…'],
    deleting: ['正在清除本机数据…', 'Clearing local data…', 'Effacement des données locales…'],
    blocked: ['清除尚未完成：请关闭此网站的其他标签页或窗口。它们释放存储后，本次已确认的清除会继续完成。', 'Clearing is not complete. Close other tabs or windows of this site; this confirmed operation will finish once they release storage.', 'L’effacement n’est pas terminé. Fermez les autres onglets ou fenêtres de ce site ; l’opération confirmée se terminera lorsque le stockage sera libéré.'],
    failed: ['未能完成全部清除。部分数据可能已删除。请关闭此网站的其他窗口后重试；也可以重新载入查看当前状态。', 'Not all data could be cleared. Some may already be removed. Close other windows of this site and retry, or reload to inspect the current state.', 'L’effacement est incomplet. Certaines données ont peut-être été supprimées. Fermez les autres fenêtres puis réessayez, ou rechargez pour vérifier l’état actuel.'],
    done: ['已清除本页可访问的本站数据。重新开始后会显示新用户引导。', 'This site’s accessible local data has been cleared. Start again to see the new-user guide.', 'Les données locales accessibles de ce site sont effacées. Recommencez pour afficher le guide de démarrage.'],
    retry: ['重试清除', 'Retry clearing', 'Réessayer'], reload: ['重新载入', 'Reload', 'Recharger'], start: ['全新开始', 'Start fresh', 'Recommencer'],
    preview: ['此演示页面无法清除学习数据。', 'Learning data cannot be cleared from this demo.', 'Cette démonstration ne permet pas d’effacer les données d’apprentissage.'],
    portable: ['此便携文件内含学习数据，清除浏览器记录后仍会从文件恢复。请打开不含学习数据的网站文件，再使用此功能。', 'This portable file contains learning data that would return after clearing the browser. Open a website file without learning data to use this option.', 'Ce fichier portable contient des données qui seraient rétablies après l’effacement. Ouvrez un fichier du site sans données d’apprentissage pour utiliser cette option.'],
    confirmation: ['需要先确认清除范围。', 'Confirm the reset scope first.', 'Confirmez d’abord le périmètre.'],
    integration: ['清除尚未开始：网站未能安全停止保存，请重新载入后重试。', 'Clearing has not started: saving could not be stopped safely. Reload and retry.', 'L’effacement n’a pas commencé : l’enregistrement n’a pas pu être arrêté. Rechargez et réessayez.'],
    unavailable: ['浏览器存储不可访问，无法确认所有数据都已清除。', 'Browser storage is unavailable; complete removal cannot be verified.', 'Le stockage est inaccessible ; l’effacement complet ne peut pas être vérifié.']
  };
  function language() { const value = typeof configuration.language === 'function' ? configuration.language() : configuration.language; return value === 'en' ? 1 : value === 'fr' ? 2 : 0; }
  function text(key) { return words[key][language()]; }
  function failure(key, code) { const error = new Error(text(key)); error.code = code; return error; }
  function status(phase, extra = {}) {
    const value = {phase, message:text(phase), ...extra};
    configuration.onStatus?.(value);
    const area = dialog?.querySelector('[data-reset-status]');
    if (area) { area.hidden = false; area.textContent = value.message; area.setAttribute('role', phase === 'failed' || phase === 'blocked' ? 'alert' : 'status'); }
    return value;
  }
  function configure(options) { configuration = {...configuration, ...options}; }
  function scope() {
    return {databases:[...FORMAL.databases, ...EXPERIMENTAL.databases], keys:[...FORMAL.keys, ...EXPERIMENTAL.keys], prefixes:[...FORMAL.prefixes, ...EXPERIMENTAL.prefixes]};
  }
  function matchingKeys(storage, selected) {
    const keys = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (selected.keys.includes(key) || selected.prefixes.some(prefix => key?.startsWith(prefix))) keys.push(key);
    }
    return keys;
  }
  function removeDatabase(name) {
    return new Promise((resolve, reject) => {
      let request;
      try { request = host.indexedDB.deleteDatabase(name); } catch (error) { reject(error); return; }
      // A blocked IDB delete cannot be cancelled. Keep the promise pending and do not
      // claim success or schedule another wipe; it completes only on onsuccess.
      request.onblocked = () => status('blocked', {database:name});
      request.onerror = () => reject(request.error || failure('unavailable', 'STORAGE_UNAVAILABLE'));
      request.onsuccess = () => resolve(name);
    });
  }
  async function perform() {
    const selected = scope();
    let storage;
    try { storage = host.localStorage; matchingKeys(storage, selected); if (!host.indexedDB) throw new Error('IndexedDB unavailable'); }
    catch (_) { throw failure('unavailable', 'STORAGE_UNAVAILABLE'); }
    status('preparing');
    await configuration.prepare();
    status('deleting');
    for (const name of selected.databases) await removeDatabase(name);
    // Re-read after quiescing and DB deletion: a queued save must not survive reset.
    const keys = matchingKeys(storage, selected);
    for (const key of keys) storage.removeItem(key);
    if (matchingKeys(storage, selected).length) throw failure('unavailable', 'STORAGE_UNAVAILABLE');
    // Only inspect names; never reopen deleted databases merely to verify deletion.
    if (typeof host.indexedDB.databases === 'function') {
      const remaining = await host.indexedDB.databases();
      if (remaining.some(db => selected.databases.includes(db.name))) throw failure('unavailable', 'STORAGE_UNAVAILABLE');
    }
    const result = {ok:true, databases:selected.databases, keys};
    status('done');
    return result;
  }
  function execute(options = {}) {
    if (options.confirmed !== true) return Promise.reject(failure('confirmation', 'CONFIRMATION_REQUIRED'));
    if (host.CARNET_PREVIEW === true || !(typeof host.VOCAB_RELEASE === 'string' && host.VOCAB_RELEASE.trim())) return Promise.reject(failure('preview', 'PREVIEW_ONLY'));
    if (document.getElementById('portable-state')) return Promise.reject(failure('portable', 'PORTABLE_EMBEDDED_DATA'));
    if (typeof configuration.prepare !== 'function') return Promise.reject(failure('integration', 'RESET_NOT_CONFIGURED'));
    if (running) return running;
    running = perform().catch(error => { status('failed', {errorCode:error.code || 'RESET_FAILED'}); throw error; }).finally(() => { running = null; });
    return running;
  }
  function button(label, style, callback) {
    const element = document.createElement('button'); element.type = 'button'; element.className = 'button ' + style; element.textContent = label; element.addEventListener('click', callback); return element;
  }
  function request() {
    if (dialog?.isConnected) { if (!dialog.open) dialog.showModal(); return dialog; }
    dialog = document.createElement('dialog'); dialog.className = 'local-reset-dialog compact'; dialog.setAttribute('aria-labelledby', 'local-reset-title');
    dialog.style.cssText = 'width:min(560px,calc(100vw - 16px));max-width:560px;max-height:calc(100dvh - 24px);height:fit-content;min-height:0;margin:auto';
    const heading = document.createElement('header'), title = document.createElement('h2'); title.id = 'local-reset-title'; title.textContent = text('title'); heading.append(title);
    const body = document.createElement('div'); body.style.cssText = 'padding:20px 24px;overflow:auto;min-height:0;line-height:1.7';
    for (const key of ['detail', 'backup']) { const paragraph = document.createElement('p'); paragraph.textContent = text(key); body.append(paragraph); }
    const note = document.createElement('p'); note.className = 'license-note'; note.textContent = text('limitation'); body.append(note);
    const statusArea = document.createElement('p'); statusArea.dataset.resetStatus = ''; statusArea.hidden = true; statusArea.setAttribute('aria-live', 'polite'); body.append(statusArea);
    const footer = document.createElement('footer'); let submitted = false;
    const close = () => { if (running) return; dialog.close(); dialog.remove(); dialog = null; };
    const reload = () => host.location.reload();
    const submit = async () => {
      submitted = true;
      for (const item of footer.querySelectorAll('button')) item.disabled = true;
      try {
        await execute({confirmed:true});
        footer.replaceChildren(button(text('start'), 'primary', () => typeof configuration.onDone === 'function' ? configuration.onDone() : reload()));
      } catch (error) {
        if (['PREVIEW_ONLY', 'RESET_NOT_CONFIGURED', 'PORTABLE_EMBEDDED_DATA'].includes(error.code)) {
          statusArea.hidden = false; statusArea.textContent = error.message;
          footer.replaceChildren(button(text('cancel'), '', close));
        } else {
          footer.replaceChildren(button(text('reload'), '', reload), button(text('retry'), 'danger', submit));
        }
      }
    };
    if (document.getElementById('portable-state')) {
      body.replaceChildren(statusArea); statusArea.hidden = false; statusArea.textContent = text('portable');
      footer.append(button(text('cancel'), '', close));
    } else footer.append(button(text('cancel'), '', close), button(text('confirm'), 'danger', submit));
    dialog.append(heading, body, footer); document.body.append(dialog);
    dialog.addEventListener('cancel', event => { if (running || submitted) event.preventDefault(); else close(); });
    dialog.showModal(); footer.querySelector('button').focus({preventScroll:true}); return dialog;
  }
  host.VocabLocalReset = Object.freeze({configure, request, execute, scope, get running() { return !!running; }});
})(window);
