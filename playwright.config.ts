import { defineConfig, devices } from '@playwright/test';

const API_PORT = Number(process.env.E2E_API_PORT ?? 8799);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5179);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}/`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
    trace: 'off',
  },
  webServer: [
    {
      command: `npx wrangler dev --port ${API_PORT} --ip 127.0.0.1 --persist-to .wrangler/e2e-state`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      command: `npx vite --port ${WEB_PORT} --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      env: { FIB_BACKEND_ORIGIN: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
