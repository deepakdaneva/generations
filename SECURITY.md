# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/deepakdaneva/generations/security/advisories/new).
Include steps to reproduce and the potential impact. You will receive a
response as soon as possible.

## Supported versions

The project is in early development. Only the latest code on `main` receives
security fixes.

## Security model

- **Your family tree is yours.** Only you can read and change your tree and
  its photos. Admins manage accounts but cannot read anyone else's tree. The
  operator of the Firebase project can read stored data: the tree is not yet
  encrypted on your device (end-to-end encryption is planned). See the
  [Privacy Policy](docs/PRIVACY.md).
- **Encrypted in transit and at rest:** all traffic uses HTTPS, and Google
  encrypts stored data on its servers.
- **Authorization is in Firestore Security Rules** (`firestore.rules`, tested in
  `tests/rules/`). The UI only hides things.
- **Accounts:** email + password (verified email required) or Google. New
  self-registered accounts stay **inactive until an admin approves them**.
- **App Check** (reCAPTCHA Enterprise) is enforced on Firestore, so only the real
  app in a real browser can read or write data.
- **Browser API keys** are restricted to the app's own domains.
- **Security headers** (`firebase.json`): a strict Content-Security-Policy (no
  inline scripts), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`; HSTS is added by Firebase Hosting.
- **Free plan only:** the projects have no billing account, so abuse can at
  worst exhaust a daily quota; it can never create charges.

## Known, accepted advisories

- Dependencies pinned to vulnerable versions upstream are lifted to patched
  versions with `package.json` `overrides`; the rules and end-to-end tests
  cover them. Remove an override once upstream catches up:
  - `@grpc/grpc-js` 1.14.7+ (`firebase` pins `~1.9`).
  - `uuid` 11.1.1+ (`firebase-tools` pulls in `uuid@9`).
  - `minimatch` 11.0.1+ for copies from 7.0.0 up (GHSA-g3hv-75wg-m249, denial
    of service through crafted patterns), used by `firebase-tools`, ESLint and
    `glob`. The 3.x, 5.x and 6.x copies are not affected.
  - `glob` 14.0.2+ for copies from 9.0.0 up (GHSA-3g3m-2fjr-6pw4), used by
    `firebase-tools` and its archiver; its hosting file listing is checked to
    still work.
- `@opentelemetry/core` 1.x (GHSA-8988-4f7v-96qf, memory use in W3C baggage
  parsing) remains inside `firebase-tools`, through `@google-cloud/pubsub` 5,
  which only the Pub/Sub emulator and Cloud Functions tooling load; this
  project uses neither, and the CLI never parses baggage headers from others.
  The fix is a major version that pubsub 5 does not support, so the alert is
  accepted until `firebase-tools` moves to pubsub 6.
- `npm audit --omit=dev` reports no vulnerabilities in the app's runtime
  dependencies.

## Handling secrets

- Firebase web client configuration (`apiKey`, `authDomain`, `projectId`, …) is
  public by design and may appear in the built app. Restrict the API key to the
  app's domains in the Google Cloud console.
- Service-account keys, deploy credentials and passwords are privileged. Never
  commit them, bake them into Docker images, or print them in CI logs. Provide
  them through local environment variables. CI/CD uses Workload Identity
  Federation and stores no Google credentials (see docs/DEPLOYMENT.md).
- Access to data is enforced by Firestore Security Rules, not by the UI.

## Repository protections

- `main` and `development` are protected by rulesets: no deletion, no force
  pushes, changes only through pull requests with one approval (the maintainer
  may bypass on a pull request) and passing CI checks.
- Deployments use GitHub Environments: `uat` only from `development`,
  `production` only from `main` and only after the maintainer approves.
- Secret scanning with push protection, Dependabot alerts and security
  updates, CodeQL default setup and private vulnerability reporting are on.
- The GitHub Actions token is read-only by default, and workflows from outside
  contributors need approval before they run.
