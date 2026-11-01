# Generations

**Every family has a story.** Generations helps families build, maintain and
explore their family tree and family hierarchy.

Try it (UAT test environment): <https://generations-uat.web.app> It runs as an installable Progressive Web App (PWA) on the
web, iOS and Android, and is designed to grow into dedicated native apps later.

> **Status:** early development (`v0.0.1`). Not production-ready.

## Objectives

- A simple, welcoming way to record family members and how they are related.
- An interactive family-tree canvas (being built step by step).
- Runs entirely on Firebase, within the free **Spark** plan, with no separate
  backend server.
- Open source, easy to self-host, and cheap to maintain.

## Technology stack

| Concern | Choice |
|---|---|
| UI framework | [Ionic Framework 9](https://ionicframework.com/) with [Angular 22](https://angular.dev/) (standalone components) |
| Native apps (later) | [Capacitor 8](https://capacitorjs.com/) (iOS / Android from the same code) |
| Authentication | Firebase Authentication (email + password with verification, Google) |
| Database | Cloud Firestore, protected by Firestore Security Rules |
| Hosting | Firebase Hosting |
| Local development | Firebase Emulator Suite |
| Firebase SDK | Official modular [Firebase JS SDK](https://firebase.google.com/docs/web/setup) (no wrapper library) |
| Tests | Vitest (unit), Playwright (end-to-end) |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture and the
reasoning behind these choices.

## Features (v0.0.1)

- Email + password sign-in, self-registration, and mandatory email verification
  (unverified accounts cannot sign in or read any data). New accounts wait for
  an admin's approval before they can use the app.
- "Continue with Google" sign-in (Google accounts are already verified; first
  use creates a normal user that also waits for approval).
- Password reset by email ("Forgot password?" on the sign-in page).
- Two roles, **Admin** and **User**, stored in Firestore and enforced by
  Firestore Security Rules.
- **User Management** (admins only): invite users (name, email, role; they
  get an email to set their own password), activate/deactivate accounts,
  change roles, send password-reset emails.
- **User search** on the User Management page (name, email, role or status).
- Header-less layout: only a floating menu button (top left, admins only) and a
  profile button (top right, with Logout) sit over the page. Admins' menu holds
  Home and User Management; normal users only have Home, so no menu is shown.
- **Profile page** (profile button → your name): change your name and
  profile picture (cropped to a square and shrunk on the device before
  upload), see your email (not editable), and send yourself a password reset
  link (max 2 per day per device; also applies to "Forgot password?").
  Your picture appears on the profile button, in the profile menu and in the
  Users list.
- **Notifications** (bell next to the profile button): admins are notified
  when someone registers or signs in with Google for the first time. The
  badge counts requests that are still waiting and that you have not opened.
  Opening one shows the account with **Approve** and **Reject**; once any
  admin has acted, the buttons are off for everyone and the name opens the
  user on the Users page. Activating a user on the Users page resolves their
  request too.
- **Settings page** (profile button → Settings):
  - Theme: System default, Light or Dark. Saved per device; System default
    follows the OS live.
  - Remember last position (off by default, saved per account): the family
    tree reopens where you left it, also after signing out and in or on
    another device. When off, it always opens on your own card.
- **About** (profile button → About, or the version link on the sign-in page):
  version, commit, deployment time, environment, source code, issues, security
  policy, license and copyright. Public, no sign-in needed.
- **Family tree (in progress):** the home page is a canvas centered on your
  own card. Drag (mouse or finger) or use the arrow keys to move; scroll, pinch
  or use the +/- buttons to zoom; the target button re-centers.
  - Hover or tap a card for its buttons: **+** on top adds a parent, left and
    right add a sibling on that side, bottom adds a child, the heart adds a
    spouse. A new child or sibling also gets a birth order (1st, 2nd, ...);
    siblings are drawn eldest to youngest, left to right.
  - Lines connect parents to their children and are labelled (son, daughter
    or child; brother, sister or sibling for siblings without known parents).
  - Cards of men have a light blue tint, cards of women a light pink one.
    Gender is required when adding or editing a person.
  - Spouses are stacked behind the card and fan out on hover or tap; a
    spouse's parents connect to the spouse's own card and are placed on the
    spouse's side, outside the other partner's family.
  - The pencil edits name, dates of birth, death and anniversary, gender,
    email, place/address and up to 10 social links. It also lists the
    person's relationships to remove one, and deletes the person (anyone
    only connected through them is deleted too, after a warning).
  - Up to 5 photos per person: "+ add" on the photo circle, arrows to browse,
    the bin to remove. Photos are shrunk in the browser (longest side 480 px,
    about 10-40 KB each) before they are saved.
  - Large trees open fast: only your card and the 10 nearest people load
    first. Relatives further away show as placeholder cards and load in the
    background as you pan or zoom towards them.
  - Encryption follows in a later step.
- **Installable app (PWA):** add it to the home screen on Android, iOS or
  desktop; it opens full screen, starts offline, and offers a reload when a new
  version is deployed.

### Install on a phone

- **Android (Chrome/Edge):** open the site, then menu → **Install app** (or
  **Add to Home screen**).
- **iPhone/iPad (Safari):** open the site, tap **Share** → **Add to Home Screen**.

## Project structure

```text
.
├── docs/                   Architecture and technical documentation
├── e2e/                    Playwright end-to-end tests
├── src/
│   ├── app/
│   │   ├── about/          About page (version, commit, links, license)
│   │   ├── auth/           Sign-in and registration pages
│   │   ├── core/           Firebase setup, AuthService, route guards
│   │   ├── home/           Home page (family-tree canvas: pan, zoom)
│   │   ├── profile/        Profile page (name, picture, password reset link)
│   │   ├── settings/       Settings page (theme, remember last position)
│   │   ├── shared/         Floating menu, profile button and notifications bell (no header bar)
│   │   ├── tree/           Family-tree data service, person card, edit form
│   │   └── users/          User Management page (admins)
│   ├── assets/             Static assets
│   ├── environments/       Local vs deployed build settings
│   └── theme/              Ionic theme variables
├── public/                 PWA manifest and app icons (copied to the site root)
├── scripts/                Emulator seed data, emulator runner, icon generator
├── tests/rules/            Firestore Security Rules tests
├── firebase.json           Hosting, Firestore and emulator configuration
├── .firebaserc             Firebase project aliases
├── firestore.rules         Firestore Security Rules
├── firestore.indexes.json  Firestore indexes
├── Dockerfile, compose.yaml  Single-container local development
├── angular.json            Angular build configuration
├── capacitor.config.ts     Capacitor (native apps) configuration
└── package.json
```

Deployment: see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Pull requests into
`development` and `main` run CI in GitHub Actions; merges deploy `development`
to UAT and `main` to Production. Feature branches run nothing in CI: test them
locally.

## Local development

Local development runs entirely against the
[Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite).
It uses the demo project `demo-generations`, so **no Firebase account, project
or credentials are needed**, and nothing touches real Firebase services.

Choose one of the two options below.

### Option A: Docker (one container)

Prerequisite: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
or Docker Engine with Compose.

```bash
git clone https://github.com/deepakdaneva/generations.git
cd generations
docker compose up --build
```

Stop with `Ctrl+C` or `docker compose down`. Emulator data (users, documents)
is kept in the `emulator-data` Docker volume between runs. Delete it with
`docker compose down -v`.

### Option B: directly on your machine

Prerequisites:

- [Node.js](https://nodejs.org/) 24 LTS and npm 11
- Java 21 or newer (required by the Firestore emulator)
- Git

```bash
git clone https://github.com/deepakdaneva/generations.git
cd generations
npm ci
npm run dev
```

`npm run dev` starts the Auth and Firestore emulators and the Angular dev
server together. Stop with `Ctrl+C` once and wait for the export to finish.
Emulator data is saved in `emulator-data/` (git-ignored) and loaded on the next
run. Delete that folder for a clean start.

### Test accounts

With the stack running, create two ready-to-use accounts (emulators only):

```bash
npm run seed
```

With Docker, run it inside the container: `docker compose exec app npm run seed`.

| Email | Password | Role |
|---|---|---|
| `admin@generations.test` | `Passw0rd!` | Admin |
| `user@generations.test` | `Passw0rd!` | User |

These exist only in the local emulators. You can also register new accounts
in the app; open the verification link from the Emulator UI
(<http://localhost:4000/auth>) or the emulator log.

The Firebase CLI is installed as a project dependency; use it with
`npx firebase …`. No global install is needed.

### Local URLs

| URL | What |
|---|---|
| <http://localhost:4200> | The app |
| <http://localhost:4000> | Emulator UI (inspect users and Firestore data) |
| `localhost:9099` | Auth emulator |
| `localhost:8080` | Firestore emulator |

Emails sent by the Auth emulator (verification, password reset) are not
delivered. Their links appear in the emulator log and the Emulator UI.

> The repository's `.npmrc` pins the public npm registry
> (`https://registry.npmjs.org/`) so installs behave the same for every
> contributor, regardless of personal or corporate npm settings.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the emulators and the dev server (full local stack) |
| `npm start` | Start only the dev server (no emulators) |
| `npm run build` | Production build into `www/` |
| `npm run deploy:uat` | Build and deploy to the UAT Firebase project ([details](docs/DEPLOYMENT.md)) |
| `npm run lint` | ESLint, e2e type check and Prettier check |
| `npm run lint:fix` | Fix lint and formatting issues |
| `npm run seed` | Create the local test accounts (emulators must be running) |
| `npm run test:unit` | Unit tests (Vitest) |
| `npm run test:rules` | Firestore Security Rules tests (starts the Firestore emulator) |
| `npm run test:e2e` | End-to-end tests against fresh emulators (run `npx playwright install chromium` once first) |
| `npm test` | All of the above tests |

## Configuration and secrets

Firebase **web client configuration** (`apiKey`, `projectId`, …) is public by
design: it identifies the Firebase project but grants no privileges. Access is
controlled by Firebase Authentication and Firestore Security Rules.

The code does not contain any real project's configuration. Local builds use
the emulator demo project. Deployed builds load the configuration at startup
from Firebase Hosting's reserved URL `/__/firebase/init.json`, so one build
works in whichever Firebase project it is deployed to (UAT, Production, or your
own fork). The target project is chosen at deploy time.

**Privileged credentials** (service-account keys, CI deploy credentials,
passwords) must never be committed. The CI/CD pipeline needs none: it reaches
Google through Workload Identity Federation. Local tools use your own sign-in
or environment variables. See [`.env.example`](.env.example) and
[SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and
our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Deepak Kumar Jangir. You may use, modify and redistribute this
project for any purpose, provided the copyright and license notice are kept,
which credits the original author.
