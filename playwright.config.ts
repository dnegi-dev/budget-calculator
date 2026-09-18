import { defineConfig, devices } from '@playwright/test';

/**
 * Ein Smoke-Test über den kompletten Alltagsweg.
 *
 * Läuft gegen das **gebaute** Bundle, nicht gegen `next dev`. Grund: Das
 * Dev-Overlay von Next legt ein Portal über die linke untere Ecke — genau
 * dort, wo mobil die Navigation sitzt — und fängt deren Klicks ab. Außerdem
 * ist das gebaute Bundle das, was ausgeliefert wird.
 *
 * `CHROMIUM_PATH` setzen, wenn ein vorinstalliertes Chromium benutzt werden
 * soll, dessen Version nicht zu der von @playwright/test erwarteten passt
 * (typisch in vorbereiteten CI-Images):
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
 *
 * Ohne die Variable gilt der normale Weg über `npx playwright install`.
 */
const executablePath = process.env.CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'mobil', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run build && npx --yes serve out -l 3100 --single',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
