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

## Branches and pipeline

| Branch | Purpose | Pipeline |
|---|---|---|
| `main` | Production releases | After a merge: CI, then deploy to Production once the maintainer approves it in GitHub Actions |
| `development` (default) | Integration, UAT | After a merge: CI, then deploy to UAT |
| any other (feature) | Day-to-day work | Nothing runs; test locally (`npm run lint`, `npm test`) |

Work flows feature branch → pull request into `development` → UAT, then
`development` → pull request into `main` → Production. Both `development` and
`main` are protected by rulesets: no force pushes or deletion, changes only
through pull requests, and the CI checks must pass.

The workflow is [`.github/workflows/pipeline.yml`](../.github/workflows/pipeline.yml).
On a pull request into `development` or `main` it runs three parallel jobs:
lint + unit tests + build, the Firestore rules tests, and the Playwright
end-to-end tests. On a push to either branch it runs the same jobs and then
deploys Hosting, Firestore rules and indexes. GitHub Environments bind each
deployment to its branch: `uat` accepts only `development`, `production`
accepts only `main` and requires the maintainer's approval.

### Keyless Google access (Workload Identity Federation)

The pipeline holds no Google keys. GitHub issues a short-lived OIDC token for
the deploy job, and Google exchanges it for credentials of a deploy-only
service account. Each Firebase project trusts only its own branch and
environment. Everything below is free and works on the Spark plan.

Setup, once per project (`P` = `generations-uat` / `generations-prod`,
`ENV` = `uat` / `production`, `BRANCH` = `development` / `main`):

```bash
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com --project P
gcloud iam workload-identity-pools create github --project P --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc generations --project P --location global \
  --workload-identity-pool github --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.environment=assertion.environment" \
  --attribute-condition "assertion.repository_owner_id == '68489729' && assertion.repository == 'deepakdaneva/generations' && assertion.ref == 'refs/heads/BRANCH' && assertion.environment == 'ENV'"
gcloud iam service-accounts create github-deployer --project P --display-name "GitHub Actions deployer"
# Least privilege: deploy Hosting, rules and indexes; nothing else.
for role in firebasehosting.admin firebaserules.admin datastore.indexAdmin serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding P --member serviceAccount:github-deployer@P.iam.gserviceaccount.com --role roles/$role --condition None
done
# Only the matching GitHub environment may act as the service account.
gcloud iam service-accounts add-iam-policy-binding github-deployer@P.iam.gserviceaccount.com --project P \
  --role roles/iam.workloadIdentityUser \
  --member principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/subject/repo:deepakdaneva/generations:environment:ENV
```

Then set two variables on the GitHub environment `ENV` (Settings →
Environments): `WIF_PROVIDER` =
`projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/generations`
and `DEPLOY_SERVICE_ACCOUNT` = `github-deployer@P.iam.gserviceaccount.com`.
They are identifiers, not secrets. Forks use their own owner id, repository and
projects.

## Manual deploy to UAT

The pipeline is the normal path. For a manual deploy from your machine:

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

Production is deployed only by the pipeline, from `main`, after the maintainer
approves the run in GitHub Actions. The first release is a pull request from
`development` into `main`. Before it, enforce App Check on Production
(Firestore first, then Authentication) as described below.

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
