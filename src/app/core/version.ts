/**
 * App version and commit, e.g. "v0.0.1 (75c4bb8)". Written into index.html at
 * deploy time by scripts/prepare-hosting.mjs; local runs show "dev".
 */
const meta = document.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content ?? '';
export const appVersion = !meta || meta.startsWith('__') ? 'dev' : meta;
