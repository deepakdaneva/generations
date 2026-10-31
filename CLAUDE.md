# Generations – project instructions for Claude

Family-tree PWA. Ionic 9 + Angular 22 (standalone), Capacitor 8 for later native
apps, Firebase (Hosting, Auth, Firestore) via the modular Firebase JS SDK.
Read `README.md` and `docs/ARCHITECTURE.md` before making changes.

## Hard rules

- Never commit to, push to, or merge into `main`. Initial work happens on
  `v0.0.1`; later work on feature branches merged through reviewed pull requests.
- Firebase **Spark plan only**: no Cloud Functions, no Admin SDK at runtime, no
  external backend, no paid services, unless the maintainer explicitly approves.
- Authorization lives in Firestore Security Rules. UI checks are convenience only.
- Never commit secrets (`.env`, service-account JSON, tokens). Firebase web
  client config is public; privileged credentials are not.
- Deploy only to UAT. Production deployment stays disabled until requested.
- Never claim a build, test, deployment or CI run succeeded without running it.
- Local work uses the emulator demo project `demo-generations`; never point
  local runs at a real Firebase project.
- Firebase web config is never hard-coded for deployed builds; it is loaded
  from `/__/firebase/init.json` (see `src/app/core/firebase.ts`).

## Working style

- One logical step at a time; explain architectural decisions before
  implementing them and stop for review.
- Do not expand scope without discussion.
- Prefer Ionic components with minimal custom styling. Avoid new dependencies.
- Update `README.md` and `docs/` whenever features, configuration or
  architecture change.

## Commands

```bash
npm ci               # install (public registry pinned in .npmrc)
npm run dev          # emulators + dev server (app :4200, Emulator UI :4000)
docker compose up --build   # same stack in one container
npm start            # dev server only, no emulators
npm run lint         # eslint + e2e typecheck + prettier check
npm run seed         # local test accounts (admin@/user@generations.test, Passw0rd!)
npm run test:unit    # vitest
npm run test:rules   # Firestore rules tests (emulator); update with every rules change
npm run test:e2e     # Playwright against fresh emulators
npm run build        # production build into www/
npm run deploy:uat   # build + deploy Hosting/Firestore to generations-uat (see docs/DEPLOYMENT.md)
```
