const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');
const { CHROMIUM_PROJECTS, WEBKIT_PROJECTS, DEVICES } = require('./tests/e2e/touch/viewports');

// Parallel worktrees must never cross-attach to another worktree's server
// (reuseExistingServer greened against the wrong tree once). Set PW_PORT per lane.
const PORT = Number(process.env.PW_PORT || 4173);

const TOUCH_MATCH = /touch\/.*\.spec\.js$/;
const touchUse = (d) => ({
  viewport: { width: d.width, height: d.height },
  deviceScaleFactor: d.dpr,
  hasTouch: true,
  isMobile: true,
  userAgent: d.ua,
});
const chromiumTouchProjects = Object.entries(CHROMIUM_PROJECTS).map(([name, dev]) => ({
  name,
  use: { ...devices['Desktop Chrome'], ...touchUse(DEVICES[dev]) },
  testMatch: TOUCH_MATCH,
}));
const webkitTouchProjects = Object.entries(WEBKIT_PROJECTS).map(([name, dev]) => ({
  name,
  use: { ...devices['Desktop Safari'], ...touchUse(DEVICES[dev]) },
  testMatch: TOUCH_MATCH,
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
  // The dev server is a single-threaded `python3 -m http.server`; >2 workers
  // saturates it and causes petalis-profile JSON requests to time out.
  retries: 1,
  workers: 2,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
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
      testMatch: /smoke\.spec\.js$|layout-boundary\.spec\.js$|mask-shift-drag\.spec\.js$|stroke-options\.spec\.js$|phone-header-desktop\.spec\.js$|tool-drawer\.spec\.js$|import-3d\.spec\.js$/,
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
    ...chromiumTouchProjects,
    ...webkitTouchProjects,
  ],
});
