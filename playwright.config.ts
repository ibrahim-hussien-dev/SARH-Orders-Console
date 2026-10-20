import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'docs/evidence/e2e-results.json' }]],
  webServer: {
    command: 'npm run dev --workspace client -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: { API_PROXY_TARGET: 'http://127.0.0.1:4100' },
  },
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'off', // Do not persist authentication cookies in traces.
  },
});
