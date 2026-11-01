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

- `npm audit` reports high-severity issues in `@grpc/grpc-js` through the
  `firebase` package. They affect gRPC **servers** in Node.js; the browser
  build uses WebChannel and does not ship that code. `npm audit fix --force`
  would wrongly downgrade Firebase to v9, so we wait for a Firebase release.
- Remaining moderate findings are in development-only tools (test runners,
  linters) and do not reach the deployed app.

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
