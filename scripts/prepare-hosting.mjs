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

const file = 'www/index.html';
const html = readFileSync(file, 'utf8');
if (!html.includes('__SITE_URL__')) throw new Error(`${file} has no placeholders; run \`npm run build\` first.`);
writeFileSync(file, html.replaceAll('__SITE_URL__', siteUrl).replaceAll('__ROBOTS__', robots));

execFileSync(
  process.execPath,
  ['node_modules/@angular/service-worker/ngsw-config.js', 'www', 'ngsw-config.json', '/'],
  {
    stdio: 'inherit',
  },
);
console.log(`prepared ${file} for ${siteUrl} (robots: ${robots})`);
