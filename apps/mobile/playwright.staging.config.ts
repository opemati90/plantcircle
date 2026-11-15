import { defineConfig } from '@playwright/test';

const PORT = 4180;

/**
 * Smoke test against a real Supabase project (staging). Reads the project's public URL and anon
 * key from the environment: run with `pnpm smoke:staging`, which loads `.env.staging`.
 * It only reads, except for typing a city, which the app creates exactly as a member would.
 */
export default defineConfig({
  testDir: 'e2e-staging',
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
  },
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { EXPO_NO_TELEMETRY: '1' },
  },
});
