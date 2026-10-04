/* Portable Playwright runtime shared by current release checks.
   Defaults to the browsers installed by `npx playwright install chromium webkit`. */
const path = require('node:path');
let playwright;
try {
  playwright = require(process.env.CARNET_PLAYWRIGHT || 'playwright');
} catch (error) {
  error.message = 'Playwright is required. Run npm install and npx playwright install chromium webkit, or set CARNET_PLAYWRIGHT to an installed module.\n' + error.message;
  throw error;
}
const {chromium, webkit} = playwright;
function launchOptions(engine, options = {}) {
  const name = String(engine).toLowerCase();
  if (!['chromium', 'webkit'].includes(name)) throw new Error('Unsupported test browser: ' + engine);
  const defaults = {headless:true};
  if (name === 'chromium') {
    defaults.args = ['--enable-unsafe-swiftshader', '--mute-audio'];
    if (process.env.CARNET_CHROME) defaults.executablePath = path.resolve(process.env.CARNET_CHROME);
  } else if (process.env.CARNET_WEBKIT_CACHE) {
    // Keep the revision and platform launcher chosen by this installed Playwright.
    // A WebKit-specific cache must not change Chromium's normal installation path.
    const location = webkit.executablePath().match(/[\\/](webkit-[^\\/]+)([\\/].+)$/);
    if (!location) throw new Error('Cannot locate this Playwright WebKit revision in CARNET_WEBKIT_CACHE. Use PLAYWRIGHT_BROWSERS_PATH for a shared browser cache instead.');
    defaults.executablePath = path.join(path.resolve(process.env.CARNET_WEBKIT_CACHE), location[1], location[2].replace(/^[\\/]/, ''));
  }
  return {...defaults, ...options};
}
async function launchBrowser(engine = 'Chromium', options = {}) {
  const driver = String(engine).toLowerCase() === 'webkit' ? webkit : chromium;
  return driver.launch(launchOptions(engine, options));
}
module.exports = {chromium, webkit, launchBrowser, launchOptions};
