const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    colorScheme: 'dark',
    locale: 'zh-CN',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'mobile-360', use: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 1 } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1 } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: 'node scripts/serve-static.js',
    url: 'http://127.0.0.1:4173/status.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
