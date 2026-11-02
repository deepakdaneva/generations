import { defineConfig } from '@playwright/test';

import base from './playwright.config';

/** `npm run screenshots`: README images into docs/screenshots/ (see e2e/screenshots/readme.shots.ts). */
export default defineConfig({
  ...base,
  testDir: './e2e/screenshots',
  testMatch: '*.shots.ts',
  retries: 0,
  reporter: 'list',
  projects: [{ name: 'Desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } }],
});
