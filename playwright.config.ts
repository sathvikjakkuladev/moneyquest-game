import { defineConfig, devices } from '@playwright/test';

// Tests the production build by default; set E2E_URL to test a running dev server instead.
// Uses the installed Google Chrome, so no browser download is needed.
const url = process.env.E2E_URL;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  use: { baseURL: url ?? 'http://localhost:4173', viewport: { width: 1280, height: 720 } },
  webServer: url ? undefined : { command: 'npm run build && npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 180_000 },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
