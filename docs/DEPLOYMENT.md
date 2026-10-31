# Deployment

Generations is hosted entirely on Firebase (Spark plan). Each environment is a
separate Firebase project.

## Environments

| Environment | Firebase project | Alias | URL | Status |
|---|---|---|---|---|
| Local | `demo-generations` (emulators only) | `default` | <http://localhost:4200> | `npm run dev` |
| UAT | `generations-uat` | `uat` | <https://generations-uat.web.app> | Deployed |
| Production | `generations-prod` | `prod` | <https://generations-prod.web.app> | Set up, app **not deployed** |

Both real projects have:

- Firestore `(default)` database in **asia-south1 (Mumbai)**. The location is
  pinned in `firebase.json`; without it `firebase deploy` would create the
  database in `nam5` (US). The location can never be changed later.
- Authentication with the Email/Password and Google providers enabled.
- A registered web app named "Generations Web". The deployed app reads its
  config from `/__/firebase/init.json`, so no config is stored in the code.

## Prerequisites

- Owner or Editor access to the Firebase projects.
- The Firebase CLI from this repository: `npx firebase …` (no global install).
- Sign in once on your machine: `npx firebase login`.

## Deploy to UAT

```bash
npm run deploy:uat
```

This builds the app and deploys Hosting, Firestore rules and indexes to
`generations-uat`. Before uploading, the Hosting predeploy step
(`scripts/prepare-hosting.mjs`) fills in the site URL for link previews and
marks UAT as not indexable by search engines. For a custom domain, set
`SITE_URL=https://your.domain` when deploying. To deploy only the rules: `npx firebase deploy --only firestore --project uat`.

Always run `npm run test:rules` before deploying rule changes.

## Production

Production deployment is intentionally **not scripted** until the first
release is approved. When it is, the equivalent command is:

```bash
npm run build
npx firebase deploy --project prod --only hosting,firestore
```

## First admin (per environment)

Security rules never let users promote themselves, so the first admin is set
up once in the Firebase console:

1. Open the environment's URL, register with the admin's email, and click the
   link in the verification email.
2. Sign in once. The app creates your profile (`users/{uid}`) as a normal user.
3. In the Firebase console, open **Firestore Database → users → (your uid)**
   and change `role` from `user` to `admin`.
4. Reload the app. The menu and User Management page appear.

Further admins are promoted from the User Management page.

## API key restriction (done once per project)

The browser API key is public by design, but it is restricted so that only the
app's own sites can use it.

Google Cloud console → **APIs & Services → Credentials** → "Browser key (auto
created by Firebase)" → **Application restrictions: Websites**:

| Project | Allowed websites |
|---|---|
| `generations-uat` | `https://generations-uat.web.app/*`, `https://generations-uat.firebaseapp.com/*` |
| `generations-prod` | `https://generations-prod.web.app/*`, `https://generations-prod.firebaseapp.com/*` |

- Keep the `firebaseapp.com` entry: Google sign-in runs on that domain.
- Do not add `localhost`; local development uses the emulators, not these keys.
- Leave **API restrictions** unchanged.

Check a key (replace `KEY` and the site). An allowed site answers
`INVALID_LOGIN_CREDENTIALS`; any other site answers `Requests from referer … are blocked`:

```bash
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=KEY"   -H "Content-Type: application/json" -H "Referer: https://generations-uat.web.app/"   -d '{"email":"nobody@example.test","password":"x123456789"}'
```

Also keep **Authentication → Settings → Authorized domains** limited to the
domains the app is served from.

## App Check (reCAPTCHA Enterprise)

App Check makes Firestore accept only requests from the real app in a real
browser. Site keys live in `src/environments/app-check.ts` (public values).

| Project | Site key | Firestore enforcement |
|---|---|---|
| `generations-uat` | `6Lc_AQouAAAAAGQJsIwdH5DXeOdMpukAwTSXoBvi` | **Enforced** |
| `generations-prod` | `6Lf2ugkuAAAAAKUOm622Ifd_pLc13ApLOuDmJlKT` | Not yet (enforce after the first Prod deploy) |

Setting up a project:

1. Google Cloud console → **Security → reCAPTCHA** → **Create key**: Web,
   domains `<project>.web.app` and `<project>.firebaseapp.com`, **checkbox
   challenge off** (score-based; a checkbox key fails with
   `appCheck/recaptcha-error`), no `localhost`.
2. Firebase console → **App Check → Apps** → the web app → reCAPTCHA
   Enterprise → paste the key.
3. Add the key to `src/environments/app-check.ts` and deploy.
4. Watch **App Check → APIs → Cloud Firestore**; when verified requests show
   up and rise, click **Enforce** (takes up to 15 minutes). **Unenforce** is
   instant if something breaks.
5. Leave **Authentication** on Monitoring (preview feature).

The emulators ignore App Check, so local development needs no key. The
browser warning `requestStorageAccess: Permission denied` comes from the
reCAPTCHA frame and is harmless.

## Free-tier limits to watch (Spark)

- Auth emails: about 1,000 verification and 150 password-reset emails per day.
- Firestore: 50,000 reads, 20,000 writes and 20,000 deletes per day; 1 GiB stored.
- Hosting: 10 GB storage, 360 MB/day transfer.

Check the current [pricing page](https://firebase.google.com/pricing) before
relying on these numbers.
