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
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: 'python3 -m http.server 4173',
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
      testMatch: /smoke\.spec\.js$/,
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
  ],
});
