// Both the public src/tests/release.json repository and the original local layout.
// Accepted verification records are inputs; every run gets a separate output folder.
const path = require('node:path');
const fs = require('node:fs');
const testsParent = path.resolve(__dirname, '..');
const publicLayout = fs.existsSync(path.join(testsParent, 'release.json'));
const developmentRoot = testsParent;
const projectRoot = publicLayout ? testsParent : path.dirname(developmentRoot);
const releaseRoot = publicLayout ? projectRoot : path.resolve(projectRoot, '../..');
const releaseConfigPath = path.join(developmentRoot, publicLayout ? 'release.json' : '发布配置.json');
const releaseConfig = JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8'));
if (typeof releaseConfig.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(releaseConfig.version)) {
  throw new Error('A valid version is required in ' + releaseConfigPath);
}
const explicitRelease = process.env.CARNET_RELEASE_HTML || process.env.VOCAB_RELEASE_FILE;
const releaseFile = explicitRelease ? path.resolve(explicitRelease) : path.resolve(releaseRoot, releaseConfig.output || ('不背法语-' + releaseConfig.version + '.html'));
const previousReleaseRequested = process.env.CARNET_PREVIOUS_RELEASE ? path.resolve(process.env.CARNET_PREVIOUS_RELEASE) : null;
const previousRelease = previousReleaseRequested && fs.existsSync(previousReleaseRequested) && fs.statSync(previousReleaseRequested).isFile() ? previousReleaseRequested : null;
const previewRoot = path.join(projectRoot, '预览与验收');
const evidenceRoot = path.join(previewRoot, '验收材料');
const runRoot = process.env.CARNET_RESULTS
  ? path.resolve(process.env.CARNET_RESULTS)
  : path.join(developmentRoot, publicLayout ? 'test-results' : 'qa/验证运行', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
for (const name of ['', '验收材料', '验收材料/第二轮', '产品接入', 'carnet-review', 'carnet-secondary-final', 'carnet-lessons']) {
  fs.mkdirSync(path.join(runRoot, name), {recursive:true});
}
console.log('本次验证结果：' + runRoot);
module.exports = Object.freeze({
  layout: publicLayout ? 'public' : 'local', projectRoot, developmentRoot, releaseRoot,
  releaseConfigPath, releaseConfig, releaseFile, previousRelease, previousReleaseRequested,
  previewRoot, evidenceRoot, runRoot,
  sourceRoot: path.join(developmentRoot, 'src'),
  sourceBaseline: path.join(developmentRoot, '主线源码基线.json'),
  previewFile: path.join(previewRoot, '不背法语-CARNET-视觉验收.html'),
  liveFile: path.join(projectRoot, '不背法语-CARNET-实验版.html'),
  reportRoot: path.join(runRoot, '验收材料'),
  productResults: path.join(runRoot, '产品接入'),
});
