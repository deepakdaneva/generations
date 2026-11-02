// Firebase Hosting predeploy step (see firebase.json). Fills the per-environment
// values in the built index.html, then refreshes the service worker manifest so
// its file hashes match again.
//
//   __SITE_URL__  https://<project>.web.app, or SITE_URL if set (custom domain)
//   __ROBOTS__    "noindex, nofollow" for test projects (-uat, -dev, -test,
//                 -staging); "index, follow" otherwise
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const project = process.env.GCLOUD_PROJECT;
if (!project) throw new Error('GCLOUD_PROJECT is not set; run via `firebase deploy`.');

const siteUrl = (process.env.SITE_URL || `https://${project}.web.app`).replace(/\/$/, '');
const robots = /-(uat|dev|test|staging)$/.test(project) ? 'noindex, nofollow' : 'index, follow';

// Build details shown on the login and About pages (src/app/core/version.ts).
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const commit = (process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim();
// Pipeline run number: grows with every deployment. Empty for manual deploys.
const buildNumber = process.env.GITHUB_RUN_NUMBER ?? '';
const appVersion = `v${version}${buildNumber && ` build ${buildNumber}`} (${commit.slice(0, 7)})`;

const values = {
  __SITE_URL__: siteUrl,
  __ROBOTS__: robots,
  __APP_VERSION__: version,
  __APP_BUILD__: buildNumber,
  __APP_COMMIT__: commit,
  __APP_BUILT__: new Date().toISOString(),
  __APP_PROJECT__: project,
};

const file = 'www/index.html';
let html = readFileSync(file, 'utf8');
if (!html.includes('__SITE_URL__')) throw new Error(`${file} has no placeholders; run \`npm run build\` first.`);
for (const [placeholder, value] of Object.entries(values)) html = html.replaceAll(placeholder, value);
writeFileSync(file, html);

execFileSync(
  process.execPath,
  ['node_modules/@angular/service-worker/ngsw-config.js', 'www', 'ngsw-config.json', '/'],
  {
    stdio: 'inherit',
  },
);
console.log(`prepared ${file} ${appVersion} for ${siteUrl} (robots: ${robots})`);
