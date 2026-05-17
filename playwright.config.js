const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

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
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: 'node scripts/dev-server.js 4173',
    port: 4173,
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
      testMatch: /smoke\.spec\.js$|mask-shift-drag\.spec\.js$/,
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
  ],
});
