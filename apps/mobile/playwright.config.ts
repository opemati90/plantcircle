import { defineConfig } from '@playwright/test';

const PORT = 4173;
/** Optional path to a pre-installed Chromium (sandboxed CI images). */
const rawChromiumPath: unknown = process.env.PW_CHROMIUM_PATH;
const chromiumPath = typeof rawChromiumPath === 'string' ? rawChromiumPath : undefined;

/**
 * Interim smoke tests: they drive the app through Expo's WEB renderer because
 * that can run anywhere. They do not replace device testing — the Maestro flows
 * required by docs/14-testing.md are still to be written and run on iOS/Android.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Size of the prototype artboards.
    viewport: { width: 390, height: 844 },
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [{ name: 'journeys' }],
  webServer: {
    // No Supabase variables: the dev server uses the labelled fixture backend.
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      EXPO_PUBLIC_SUPABASE_URL: '',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
      EXPO_NO_TELEMETRY: '1',
    },
  },
});
