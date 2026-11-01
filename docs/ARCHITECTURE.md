# Architecture

This document describes how Generations is built and why. Update it whenever an
architectural decision changes.

## Overview

```text
 Browser / PWA  (later: Capacitor iOS & Android shells)
 ┌──────────────────────────────────────────────┐
 │ Ionic 9 + Angular 22 (standalone components) │
 │  pages ─ services ─ route guards             │
 │  Firebase JS SDK (modular)                   │
 └───────────────┬──────────────────────────────┘
                 │ HTTPS
 ┌───────────────┴──────────────────────────────┐
 │ Firebase (Spark plan)                        │
 │  Hosting · Authentication · Firestore        │
 │  Firestore Security Rules = authorization    │
 └──────────────────────────────────────────────┘
```

There is no application server. The client talks directly to Firebase, and
every authorization decision is enforced by Firestore Security Rules.

## Decisions

### D1. Firebase Spark plan only, no backend

Everything must work on the free Spark plan. Cloud Functions require the paid
Blaze plan, so the app does not use them and does not use the Firebase Admin
SDK at runtime. Consequences are listed in
[Authentication and user management](#authentication-and-user-management).

Revisit only when a feature genuinely needs Blaze, and only with the
maintainer's explicit approval.

### D2. Ionic 9 + Angular 22, standalone components

Angular is Ionic's primary integration and ships the router, forms, HTTP client
and service worker in the box, which keeps third-party dependencies to a
minimum. Standalone components and lazy-loaded routes keep the code modular.

### D3. Capacitor for future native apps

The project already includes Capacitor 8 configuration
(`capacitor.config.ts`, app id `io.github.deepakdaneva.generations`). Native iOS and
Android projects are added later with `npx cap add ios|android`; the web code
stays the same.

### D4. Modular Firebase JS SDK, no AngularFire

The official modular Firebase JS SDK is Google's recommended web SDK, is
tree-shakeable, and works inside Capacitor's native WebView. AngularFire was
rejected because it is an extra dependency that lags Angular releases (at the
time of writing it supports Angular 21, not 22).

For native builds, Auth is initialized with `initializeAuth` and
`indexedDBLocalPersistence` so sessions persist inside the WebView. Email +
password sign-in needs no native plugin.

### D5. Roles in Firestore, not custom claims

Custom claims can only be set with the Admin SDK (a backend). Roles and account
status are therefore stored in a Firestore document per user, and Security
Rules read that document with `get()`.

### D6. Environments selected by configuration

Local (emulators), UAT and Production each have their own Firebase project.
Production deployment stays disabled until explicitly requested.

| Environment | Firebase project | Build | Web config source |
|---|---|---|---|
| Local | `demo-generations` (emulators only) | development | `src/environments/environment.ts` |
| UAT | `generations-uat` (alias `uat`) | production | `/__/firebase/init.json` |
| Production | `generations-prod` (alias `prod`) | production | `/__/firebase/init.json` |

Deployed builds contain no project configuration. At startup the app fetches
`/__/firebase/init.json`, a reserved URL that Firebase Hosting serves with the
config of the project it is deployed to. One build artifact therefore works
for UAT, Production and forks, and switching environments means choosing a
different `firebase deploy --project` target, not editing code.

Native builds (later) have no Hosting origin; they will fetch the same file
from the deployed site or have the config written in at build time.
`src/app/core/firebase.ts` is the only place that needs to change.

### D9. Installable PWA

`@angular/service-worker` (added with `ng add @angular/pwa`) makes the app
installable and lets it start offline. Production builds only; it is off in
development.

- `public/manifest.webmanifest`: name, colors, start URL, icons (regular and
  maskable). `public/icons/` is rendered from one SVG design by
  `node scripts/generate-icons.mjs`.
- `ngsw-config.json`: prefetches the app shell; never serves it for Firebase's
  reserved `/__/` URLs; caches `/__/firebase/init.json` (network first) so the
  app can start offline.
- Hosting sends `Cache-Control: no-cache` for `index.html`, `ngsw-worker.js`,
  `ngsw.json` and the manifest so updates are picked up; hashed JS/CSS are
  cached for a year.
- When a new version is downloaded, the app shows a "Reload" toast.

Signing in and loading data still need a connection (Firestore offline
persistence is not enabled).

### D12. Security headers

`firebase.json` sends a Content-Security-Policy that allows scripts only from
the app itself, Google's sign-in (`apis.google.com`) and reCAPTCHA; frames only
from `*.firebaseapp.com` (sign-in) and reCAPTCHA; network calls only to the app,
`*.googleapis.com` and Google; and forbids framing the app (`frame-ancestors
'none'`, `X-Frame-Options: DENY`). Inline styles are allowed because Ionic
injects them at runtime; inline scripts are not, which is why Angular's
critical-CSS inlining (`inlineCritical`) is turned off. When adding a new
external service, extend the policy and re-test sign-in, Google sign-in and App
Check on UAT.

### D11. Profile pictures without Cloud Storage

Cloud Storage for Firebase requires the Blaze plan for new projects (since
October 2024), so pictures are stored in the user's Firestore document
instead. `src/app/core/avatar.ts` center-crops any picked image to a square,
scales it to 256x256 and compresses it (WebP, JPEG fallback) until it is under
60,000 characters, all in the browser; the original never leaves the device.
The rules cap `photo` at 70,000 characters and only accept JPEG/WebP data
URLs. At ~20-40 KB per user this fits the 1 GiB free Firestore storage for any
family-sized group. Users list documents carry the picture, so no extra reads
are needed to show avatars.

User-triggered password-reset emails (profile page and "Forgot password?") are
limited to 2 per email per day per device (`src/app/core/reset-limit.ts`,
browser storage). This protects the daily email quota from casual repeats; it
is not a security boundary, because a server-side limit would need a backend.
Admin-triggered reset emails are not limited. Google-only accounts have no
password, so the profile page shows a note instead of the reset button.

### D10. Link previews and SEO

`src/index.html` carries the title, description, Open Graph and Twitter card
tags, so shared links (WhatsApp, Facebook, LinkedIn, X, Slack, bookmarks) show
the name, description and `public/og-image.jpg` (1200×630, rendered by
`scripts/generate-icons.mjs`). Link previews need absolute URLs, which differ
per environment, so the tags use `__SITE_URL__` / `__ROBOTS__` placeholders.
The Hosting predeploy hook `scripts/prepare-hosting.mjs` fills them for the
target project (`https://<project>.web.app`, or `SITE_URL` for a custom
domain), marks test projects (`-uat`, `-dev`, `-test`, `-staging`) as
`noindex`, and regenerates `ngsw.json` so the service worker hashes still
match. Apps that preview links cache them; changes can take time to show.

### D8. Theme (System / Light / Dark)

Ionic's class-based dark palette (`dark.class.css`) is used instead of the
system-only one, so the app can override the OS. `src/app/core/theme.ts`
toggles the `.ion-palette-dark` class on `<html>`, follows OS changes when
"System default" is chosen, and stores the choice in `localStorage` (per
device, also before sign-in). `main.ts` applies it before Angular starts to
avoid a light flash. The preference is deliberately per device (maintainer
decision); syncing it per account would need a Firestore field and a rules
change.

### D13. Family-tree layout with ELK (elkjs)

Family trees are not trees: people have two parents, spouses, and families
that join. Laying them out neatly is a graph-layout problem, so the canvas
uses [elkjs](https://github.com/kieler/elkjs) (Eclipse Layout Kernel,
actively maintained, EPL-2.0 OR GPL-3.0; approved by the maintainer) instead
of a home-made algorithm. It is the only new runtime dependency.

- A person and their spouses form one node (a stack of cards). Each set of
  parents gets a 1x1 "family" node: the parents' line drops into it and the
  children's lines leave from it, which draws the classic family-tree bus.
  Siblings without known parents hang from a family node of their own.
- Every card in a stack has its own port on top of the node (fixed port
  positions), and lines from parents end at the port of their child's card.
  So a spouse's parents connect to the spouse's card and ELK places them on
  that side. The front card's port is in the middle; the ports of the cards
  behind it are near their right edge, so the two lines never run side by
  side. Lines to cards behind the front one stop 56 px above the stack; the
  household draws the rest, down to the stacked card or, when the stack fans
  out, across to the card's spread-out position (with the relationship
  label). Fanned out, a marriage line with a beating heart joins each spouse
  to their partner at photo height.
- A man's card is the front card of his stack (the first male member).
- Lines to children leave from each parent's own port at the bottom of the
  stack (the front card's middle, or the visible edge of a card behind), so a
  child's line comes from both parents. Like the lines on top, lines from a
  card behind start 56 px below the stack and the household draws the rest.
- Households are given to ELK depth-first from the user's own card, each
  person's family before their spouse's, so the spouse's parents end up
  outside the other partner's parents and their siblings.
- ELK's layered algorithm (top to bottom, orthogonal edges) places the nodes;
  the app draws the edges as SVG paths with rounded corners under the cards.
  Generations are 80 px apart (twice, through the family node), and lines
  reach each card straight down for at least 56 px, which leaves room for
  the relationship label (son, daughter, child, ...) on the line.
- Birth order is the order of the parents' `children` lists, which the form
  sets when a child or sibling is added, and changes when a person with
  siblings is edited. Gender is required by the form
  only, not by the security rules, because adding a relative also rewrites
  older cards that may have no gender yet.
- Cards have a fixed size, so the layout never waits for rendering. Only the
  front card counts toward a stack's height, so rows stay aligned.
- ELK is loaded on first use (a lazy chunk of about 340 kB compressed), so it
  is not in the main bundle. It runs on the main thread; its web worker is the
  upgrade path if large trees ever stutter.
- Pan and zoom are plain pointer events and a CSS transform, with no library.

### D7. Local development on the Emulator Suite

`npm run dev` runs `firebase emulators:exec`, which starts the Auth and
Firestore emulators and then the Angular dev server, and stops everything
together. The `demo-` project id guarantees that local runs can never reach
real Firebase services. `scripts/emulators-exec.mjs` wraps that command and
stops the Firestore emulator afterwards through its `/shutdown` endpoint,
because on Windows the Firebase CLI leaves the emulator's Java process running. `firebase-tools` is a pinned dev dependency so every
developer and CI run uses the same CLI version.

Docker (`Dockerfile`, `compose.yaml`) packages the same stack into one
container with Node 24 and Java 21. Emulator data is exported on shutdown
(`SIGINT`) into a named volume.

## Authentication and user management

Validated against the Spark plan:

| Capability | Spark | Implementation |
|---|---|---|
| Email + password sign-in | Yes | Firebase Auth email provider |
| Self-registration | Yes | `createUserWithEmailAndPassword` |
| Email verification | Yes | `sendEmailVerification`; sign-in is refused until `emailVerified` is true |
| Password reset | Yes | `sendPasswordResetEmail` (by the user, or triggered by an admin) |
| Roles (Admin / User) | Yes | `users/{uid}` Firestore document, enforced by Security Rules |
| Admin creates users | Yes | Secondary Firebase app instance, so the admin stays signed in |
| Activate / deactivate | Partly | `active` flag; rules deny all access when false and the app signs the user out. The Auth account itself stays enabled (disabling it needs the Admin SDK). |
| Admin sets another user's password | No | Needs the Admin SDK. Admins send a reset email instead. |
| Phone sign-in | Out of scope | SMS sign-in requires a billing account. |
| Blocking sign-up at the Auth level | No | Anyone can create an Auth account, but without a verified email and an active `users/{uid}` document it has no data access. |

### Spark quotas to keep in mind

Firebase Auth on Spark sends at most about **1,000 verification emails** and
**150 password-reset emails per day**. Check the current
[Auth limits](https://firebase.google.com/docs/auth/limits) before relying on
these numbers.

### Data model

```text
users/{uid}
  email:       string
  displayName: string
  role:        "admin" | "user"
  active:      boolean
  createdAt:   timestamp
  photo?:      string   (256x256 WebP/JPEG data URL, at most 70,000 characters)
```

```text
trees/{uid}/people/{personId}   one document per person; the user's own card has personId == uid
  name:          string (1-100 characters)
  gender?:       "male" | "female" | "other"
  birth?, death?, anniversary?:  "YYYY-MM-DD"
  email?:        string (≤ 254)
  address?:      string (≤ 500)
  socials?:      { label, value }[] (≤ 10)
  parents?:      personId[] (≤ 2)   relationship links, kept on both people
  children?:     personId[]          in birth order, eldest first (drawn left to right)
  spouses?:      personId[]
  siblings?:     personId[]          only for siblings without known parents:
                                     the whole group in order, including self
  photos?:       number[] (≤ 5)      photo slots 0-4 in display order
  updatedAt:     timestamp (server time)

notifications/{uid}             a new account's approval request, for all admins (id = the new user's uid)
  type:          "account-approval"
  audience:      "admins"
  userId, email, displayName
  status:        "pending" | "approved" | "rejected"
  readBy:        uid[]              admins who opened it (no longer highlighted for them)
  actedBy?, actedAt?                the admin who approved or rejected it, and when
  createdAt:     timestamp (server time)

trees/{uid}                     tree settings
  rememberView:  boolean            "Remember last position" (off when the document is missing)
  view?:         { focus, path, dx, dy, z }   saved position, only while rememberView is on
  updatedAt:     timestamp (server time)

trees/{uid}/photos/{personId}_{slot}   slot 0-4, so at most 5 photos per person
  data:          string   (WebP/JPEG data URL, at most 100,000 characters)
  updatedAt:     timestamp (server time)
```

Photos follow D11: `toPhotoDataUrl()` in `src/app/core/avatar.ts` keeps the
whole picture, scales the longest side to 480 px (faces stay clearly
recognizable) and compresses it to the lowest quality step that fits, usually
10-40 KB. Each photo is its own document, so a card reads only the photo on
screen (one read), and the 1 MiB document limit is never near. Adding or
removing a photo updates the person's `photos` list in the same batch write;
deleting a person deletes their photos too. At five 40 KB photos per person
the free 1 GiB holds roughly 5,000 fully photographed people.

**Loading.** The canvas never reads the whole tree up front
(`src/app/tree/tree.service.ts`):

- On opening, it reads the user's own card and then the nearest relatives,
  breadth-first, until 10 people are loaded (one `in` query per generation,
  at most 30 ids each; Firestore bills one read per document).
- Relatives linked from loaded people but not loaded yet become placeholders
  in the layout (`withPlaceholders()` in `layout.ts`), so ELK keeps their place
  and the canvas shows a skeleton card there. Whenever the view moves, the
  placeholders on screen or within one screen of it are loaded (150 ms after
  the movement stops); new cards fade in over their placeholder.
- Adding a relative first loads the person's direct relatives, because the
  change rewrites them too. Removing a relationship or deleting a person
  first loads the whole tree once per session, because only the whole tree
  shows who would be cut off.
- Links to documents that no longer exist (deleted on another device) are
  hidden instead of being retried.

**Remember last position.** Canvas coordinates depend on what is loaded and
screen positions on the screen size, so the app saves the position relative
to a person instead: `focus` is the person whose card is nearest the middle
of the screen, `dx`/`dy` the middle's offset from that card (in canvas units)
and `z` the zoom. `path` is the shortest chain of ids from the user's own
card to `focus`; the next visit loads it with one query, so the layout
contains the saved person even with lazy loading. The view is saved 2 s after
it stops moving, when leaving the page and on `pagehide`, and only when it
changed, which keeps writes low. Turning the setting off rewrites the
document without `view`. If the saved person no longer exists, the canvas
opens on the user's own card.

Relationship changes (`src/app/tree/relations.ts`) are pure functions that
return every person to rewrite; the app saves them in one batch write, so
both sides of a link always change together. The tree stays connected to the
user's own card: removing a relationship that is someone's only connection
is refused. Only people at the end of a branch can be deleted: not someone
with both parents and children, and not when anyone else would lose their
connection to the user's card (checked against the whole tree). Siblings
without parents keep a shared `siblings` list; adding a parent to one of
them makes the parent everyone's, and deleting the only parent (a top-most
ancestor) of several children turns them into such a group.

The family tree is stored as plaintext for now. A later step encrypts each
person in the browser before it is written, so the database only holds
ciphertext.

### Security rules (`firestore.rules`)

- All access requires a signed-in user with `email_verified == true`.
- Users can read their own profile, even when deactivated, so the app can tell
  them. Only active admins can read or list everyone.
- A verified user may create **their own** profile only as `role: "user"`,
  `active: false` (waiting for approval), with their own email. Active admins may create profiles for
  others with any role.
- Active users can update their own `displayName` and `photo` only (never
  email, role or status). `photo` must be a JPEG/WebP data URL of at most
  70,000 characters.
- Active admins can update other users' `displayName`, `role` and `active`,
  never their own role or status (so an admin cannot lock themselves out).
- Profiles are never deleted: the Auth account would remain and could recreate
  its profile. Deactivate instead.
- Family tree: only the owner, while active, can read and write their tree
  settings (`trees/{uid}`: `rememberView`, a bounded `view`) and read, create,
  update and delete people in `trees/{uid}/people` and photos in `trees/{uid}/photos`
  (ids `{personId}_{0-4}`, small JPEG/WebP data URLs only). Admins cannot read other users'
  trees. Writes must match the shape above, and `updatedAt` must be the
  server time.
- Notifications: a verified user may create only `notifications/{their uid}`,
  as a pending `account-approval` for the admins, with their own email, and
  only while their profile is inactive (checked with `getAfter`, so it works
  in the same batch that creates the profile). Only active admins read them
  (queries must filter `audience == "admins"`), add themselves to `readBy`,
  and set the status once; approving must activate the user in the same
  batch. Nobody deletes them.
- Every other path is denied.

`tests/rules/firestore.rules.spec.ts` covers these cases against the Firestore
emulator (`npm run test:rules`).

### Sign-in flow (`src/app/core/auth.service.ts`)

1. **Register:** create the Auth account, set the display name, send the
   verification email, sign out.
2. **Sign in:** if the email is not verified, sign out again and offer to
   resend the verification email.
3. **First verified sign-in:** the app creates the user's profile
   (`role: "user"`, `active: false`), and in the same batch write a
   notification asking the admins for approval (there is no backend to do it;
   the rules allow exactly this). The rules enforce those values. Accounts
   registered before notifications existed get their request on their next
   sign-in attempt. Admins approve or reject from the notification (bell);
   rejecting keeps the account inactive, since the Auth account cannot be
   deleted without the Admin SDK. The
   account **waits for an admin to activate it** (Users page → Activate), so
   strangers cannot join a family's data just by registering. The app waits
   for the server to confirm that write before signing the user out.
4. **While signed in:** the app listens to the profile. If an admin
   deactivates the account, the user is signed out at once and shown why. Role
   changes apply immediately.
5. **Google sign-in:** `signInWithPopup` with the Google provider. Google
   accounts arrive with a verified email, so step 3 applies immediately. If the
   email already has a password account, Firebase's one-account-per-email
   setting decides; the app shows a clear message for
   `auth/account-exists-with-different-credential`. Popups do not work inside
   Capacitor's native WebView, so native apps will need a native sign-in plugin.
6. **Admin creates a user:** the admin enters only name, email and role. A
   temporary second Firebase app instance creates the account with a random
   password nobody sees (so the admin stays signed in), the admin writes the
   profile, and the new user gets a "set your password" (password reset)
   email. If Firebase does not treat that link as email verification, the
   normal verify step at sign-in applies. Gmail users can also just use Google.

Route guards (`src/app/core/guards.ts`) only steer navigation; the rules are
the real protection.

### First admin

Rules cannot let a user promote themselves, so the first admin is set up once
by the project owner in the Firebase console, which bypasses rules. No script,
Admin SDK or backend is needed:

1. Register in the app with the admin's email and open the verification link.
2. Sign in once. The app creates the profile `users/{uid}` with `role: "user"`.
3. In the Firebase console, open **Firestore → users → {uid}** and change
   `role` to `admin`.

After that, admins promote other users from the User Management page.
Locally, `npm run seed` creates a ready-made admin in the emulators.
