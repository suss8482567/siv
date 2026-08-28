import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
  },
  expect: {
    // Screenshot baselines (SPEC §16): WebGL antialiasing varies per GPU, so a
    // 2% pixel-diff tolerance keeps the baselines stable across machines.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
