// Packages the built web app (www/) into the Android project for one Firebase
// project:   npm run android:sync -- uat     (or prod, or any project id)
//
// The website gets its Firebase config from Hosting's /__/firebase/init.json.
// The Android app has no Hosting origin, so the same public file is fetched
// from the deployed site now and shipped at the same path inside the APK:
// src/app/core/firebase.ts needs no native branch. The build details on the
// About page are filled in the same way as for a deployment.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const ALIASES = { uat: 'generations-uat', prod: 'generations-prod' };
const target = process.argv[2];
const project = ALIASES[target] ?? target;
if (!project || !/^[a-z0-9-]+$/.test(project)) {
  throw new Error('Usage: node scripts/prepare-android.mjs <uat|prod|project-id>');
}

execFileSync(process.execPath, ['scripts/prepare-hosting.mjs'], {
  env: { ...process.env, GCLOUD_PROJECT: project },
  stdio: 'inherit',
});

const url = `https://${project}.web.app/__/firebase/init.json`;
const res = await fetch(url);
if (!res.ok) throw new Error(`Cannot load ${url} (${res.status}); is the project deployed?`);
const config = await res.json();
if (config.projectId !== project) throw new Error(`${url} belongs to ${config.projectId}, not ${project}`);
mkdirSync('www/__/firebase', { recursive: true });
writeFileSync('www/__/firebase/init.json', JSON.stringify(config));
console.log(`Firebase config for ${project} added to the app`);

execFileSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], { stdio: 'inherit' });
