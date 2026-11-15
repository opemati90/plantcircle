import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Store screenshots (store/capture.spec.ts): the real screens with the fixture data, at
 * iPhone 6.9" resolution. `pnpm store:capture`, then `pnpm store:compose`.
 */
export default defineConfig({
  ...base,
  testDir: 'store',
  fullyParallel: false,
  use: {
    ...base.use,
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
  },
});
