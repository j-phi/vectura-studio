const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');
const { CHROMIUM_PROJECTS, WEBKIT_PROJECTS, DEVICES } = require('./tests/e2e/touch/viewports');

// Parallel worktrees must never cross-attach to another worktree's server
// (reuseExistingServer greened against the wrong tree once). Set PW_PORT per lane.
const PORT = Number(process.env.PW_PORT || 4173);

const TOUCH_MATCH = /touch\/.*\.spec\.js$/;
// Specs that desktop-chromium must not run: touch projects own tests/e2e/touch, the visual
// project owns visual.spec.js, and the iPhone mini project owns iphone-mini.spec.js.
const DESKTOP_IGNORE = [TOUCH_MATCH, /visual\.spec\.js$/, /iphone-mini\.spec\.js$/];
const touchUse = (d) => ({
  viewport: { width: d.width, height: d.height },
  deviceScaleFactor: d.dpr,
  hasTouch: true,
  isMobile: true,
  userAgent: d.ua,
});
// TUX-058: the browser-chrome variants (-c devices) only serve the audit's canvas/overflow row,
// so they run the `default` state only. Non-default audit states carry @audit-extra in the title.
// TUX-033: iPhone landscape shows about one layer row, so row-tap and ring-drag specs tagged
// @needs-tall-pane run on the other projects only (a project filter, not a runtime skip).
const chromeVariantGrep = (name) => {
  const parts = [];
  if (/-chrome$/.test(name)) parts.push('@audit-extra');
  if (/iphone-landscape/.test(name)) parts.push('@needs-tall-pane');
  return parts.length ? { grepInvert: new RegExp(parts.join('|')) } : {};
};
const chromiumTouchProjects = Object.entries(CHROMIUM_PROJECTS).map(([name, dev]) => ({
  name,
  use: { ...devices['Desktop Chrome'], ...touchUse(DEVICES[dev]) },
  testMatch: TOUCH_MATCH,
  ...chromeVariantGrep(name),
}));
const webkitTouchProjects = Object.entries(WEBKIT_PROJECTS).map(([name, dev]) => ({
  name,
  use: { ...devices['Desktop Safari'], ...touchUse(DEVICES[dev]) },
  testMatch: TOUCH_MATCH,
  ...chromeVariantGrep(name),
}));

const systemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const useSystemChrome = !process.env.CI && fs.existsSync(systemChromePath);

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  // Match CI locally so `npm run test:ci` is a faithful pre-push gate.
  // Keep browser concurrency bounded while the Node static server serves
  // presets and geometry assets; raising this needs measured resource evidence.
  retries: 1,
  workers: 2,
  // CI also writes a JSON report outside test-results/ (each Playwright run cleans that dir).
  // scripts/playwright-flaky.js reads it to surface tests that passed only on retry.
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_FILE || 'playwright-json/results.json' }]]
    : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: `node scripts/dev-server.js ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(useSystemChrome ? { channel: 'chrome' } : {}),
        viewport: { width: 1600, height: 1000 },
      },
      // Every spec under tests/e2e except the ones other projects own. A new desktop spec runs
      // here (and in the PR smoke) with no list to update. tests/unit/e2e-ci-roster.test.js
      // checks that every non-touch spec maps to a PR smoke project.
      testIgnore: DESKTOP_IGNORE,
    },
    {
      name: 'desktop-visual-chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(useSystemChrome ? { channel: 'chrome' } : {}),
        viewport: { width: 1600, height: 1000 },
      },
      testMatch: /visual\.spec\.js$/,
    },
    {
      name: 'tablet-touch-chromium',
      use: {
        // Keep touch-tablet interaction coverage while staying on Chromium in CI.
        ...devices['Desktop Chrome'],
        ...(useSystemChrome ? { channel: 'chrome' } : {}),
        viewport: { width: 834, height: 1194 },
        hasTouch: true,
        isMobile: true,
      },
      testMatch: /smoke\.spec\.js$/,
    },
    {
      // iPhone 13 Mini logical viewport (375×812). Anchors mobile-layout
      // coverage at the smallest commonly-targeted phone size so toolbar /
      // touch-target regressions there can't slip past CI. Skips the Desktop
      // Chrome device-profile spread because its `hasTouch:false` /
      // `isMobile:false` defaults can shadow our overrides — we want a clean
      // touch-mobile context so `(pointer: coarse)` matches.
      name: 'phone-iphone-mini-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
      testMatch: /iphone-mini\.spec\.js$/,
    },
    // PW_TOUCH_PROJECTS=0 drops the 11 touch projects (for a local desktop-only run; CI runs the
    // full touch roster in the sharded touch-e2e-nightly matrix).
    ...(process.env.PW_TOUCH_PROJECTS === '0' ? [] : [...chromiumTouchProjects, ...webkitTouchProjects]),
  ],
});
