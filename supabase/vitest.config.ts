import { defineConfig } from 'vitest/config';

// Each test builds a fresh database by replaying every migration, which takes seconds as the
// schema grows, so the timeouts leave room for that.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
