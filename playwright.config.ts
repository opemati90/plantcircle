import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  // Baselines are rendered on Linux Chromium; other platforms differ in font rendering.
  snapshotPathTemplate: 'e2e/__screenshots__/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, stylePath: 'e2e/screenshot.css' } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Reference size of the design artboards.
    viewport: { width: 390, height: 844 },
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'journeys', testIgnore: /visual\.spec\.ts/ },
    // Opt-in: `npm run test:visual`. Not part of CI because baselines are OS-specific.
    { name: 'visual', testMatch: /visual\.spec\.ts/ },
  ],
  webServer: {
    // Runs against the dev server so the app uses the labelled fixture backend.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
