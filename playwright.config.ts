import { defineConfig, devices } from '@playwright/test';

/**
 * Ein Smoke-Test über den kompletten Alltagsweg. Läuft gegen `next dev`, damit
 * kein Build-Schritt nötig ist.
 *
 * Chromium ist in der CI-Umgebung vorinstalliert (PLAYWRIGHT_BROWSERS_PATH),
 * deshalb kein `playwright install`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobil', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npm run dev -- --port 3100 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
