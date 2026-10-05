/* Carnet UI bridge. Persistence stays in the original application/data/audio
   modules; onboarding examples and chapter position never enter study state. */
(function (host) {
  'use strict';
  const enabled = host.CARNET_ENABLED === true || host.CARNET_PREVIEW === true;
  if (!enabled) return;
  const copy = value => JSON.parse(JSON.stringify(value));
  const motions = ['immersive','standard','reduced','system'];
  let app, resolveReady, rejectReady, appearanceQueue = Promise.resolve();
  let finishing = null, completed = null, flow = 0;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const bridge = {
    ready,
    getState() { if (!app) return null; return app.getState(); },
    // Settings are a detached copy; ordinary UI reads never need the whole library.
    getSettings() { return app?.getSettings?.() || app?.getState?.()?.settings || {}; },
    getStartup() { return app ? app.carnetStartup() : {needsOnboarding:false,hasWords:false,loading:true,preview:host.CARNET_PREVIEW === true}; },
    getAppearance() {
      if (host.CARNET_PREVIEW === true && host.VocabCarnetPreview) return host.VocabCarnetPreview.getAppearance();
      if (app?.carnetAppearance) return app.carnetAppearance();
      const s = bridge.getSettings();
      return {design:s?.designTheme || 'classic',mode:s?.theme || 'light',motion:motions.includes(s?.carnetMotion) ? s.carnetMotion : s?.motionMode === 'simple' ? 'reduced' : 'system'};
    },
    setAppearance(patch = {}) {
      const run = async () => {
        await ready;
        const next = {...bridge.getAppearance(),...patch};
        if (!['classic','atelier','verdure'].includes(next.design) || !['light','dark','system'].includes(next.mode) || !motions.includes(next.motion)) throw new Error('外观设置无效。');
        if (host.CARNET_PREVIEW === true) return host.VocabCarnetPreview.setAppearance(next);
        return app.previewAppearance(next);
      };
      const operation = appearanceQueue.then(run,run); appearanceQueue = operation.catch(() => {}); return operation;
    },
    async showApp(view = 'today') {
      if (!['today','study','spelling','library','contexts','settings'].includes(view)) throw new Error('未知页面。');
      await ready; return app.previewNavigate(view);
    },
    async suspend() { await ready; return app.previewSuspend(); },
    // A new explicit replay is a new flow; scrolling backward is not. Finishing
    // twice within the same flow shares one operation and never imports twice.
    beginOnboarding() { if (finishing) return false; flow++; completed = null; return true; },
    finishOnboarding(options = {}) {
      if (finishing) return finishing;
      if (completed) return Promise.resolve(copy(completed));
      const currentFlow = flow;
      finishing = (async () => {
        await ready;
        const result = await app.carnetFinishOnboarding(options);
        if (result.ok && currentFlow === flow) completed = copy(result);
        return result;
      })().finally(() => { finishing = null; });
      return finishing;
    },
    _attachApp(value) {
      app = value;
      const savedMotion = bridge.getSettings().carnetMotion;
      if (host.CARNET_PREVIEW === true && motions.includes(savedMotion)) host.VocabCarnetPreview?._setMotion(savedMotion);
      resolveReady(bridge);
    },
    _fail(error) { rejectReady(error); }
  };
  host.VocabCarnetProduct = Object.freeze(bridge);
})(window);
