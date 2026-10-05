const {spawnSync} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['release-review','release-legacy','product-polish-review','appearance-morph-review','verdure-theme-review','study-controls-review','guide-recovery-accessibility','audio-backup-review','audio-interaction-review','onboarding-settings-review']) {
  const run = spawnSync(process.execPath, [path.join(root,'tests',name+'.cjs')], {cwd:root, stdio:'inherit', env:process.env});
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status || 1);
}
