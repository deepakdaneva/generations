# Android app

The Android app (`io.github.deepakdaneva.generations`) is the same web app
packaged with [Capacitor 8](https://capacitorjs.com/). There is no separate
Android UI code; `android/` holds the generated native project plus the icon,
launch screen and `MainActivity`.

## The Android experience

- **Icon:** adaptive icon (brand gradient with the family mark) and a themed
  monochrome icon for Android 13+. Android 7 uses the PNGs that
  `node scripts/generate-icons.mjs` renders into `android/.../mipmap-*`.
- **Launch:** brand-blue launch screen where the two parents appear, their
  lines grow down and the child appears (`splash_animated.xml`, androidx
  core-splashscreen). Android 12+ animates it; older versions show the
  finished mark.
- **First launch:** story-style welcome slides (`src/app/welcome/`): tap
  right or left to move, hold to pause, Skip. They end in **Create account**
  or **I already have an account**. Later launches open sign-in directly. The
  website keeps its home page (`appStartGuard` in `src/app/core/guards.ts`).
- **Edge to edge:** content sits below the status bar and above the gesture
  bar (`--ion-safe-area-*` in `src/global.scss`); status-bar icons follow the
  app theme (`src/app/core/theme.ts`).
- The Android back button navigates back (`@capacitor/app`).
- **Sign-in:** email and password. "Continue with Google" is hidden in the app
  for now: Google's sign-in popup cannot open inside the WebView; a native
  sign-in plugin brings it back later.
- No service worker: the APK already contains the app's files.

## Firebase configuration

The website loads its Firebase config from Hosting's `/__/firebase/init.json`.
The app has no Hosting origin, so `scripts/prepare-android.mjs` downloads that
same public file from `https://<project>.web.app` while packaging and ships it
at the same path inside the APK; `src/app/core/firebase.ts` is unchanged. It
also fills the build details shown on the About page, as a deployment does.

The app runs at `https://localhost` inside the WebView. Each Firebase project
the app connects to needs these one-time console changes:

1. **API key:** Google Cloud console → APIs & Services → Credentials →
   "Browser key (auto created by Firebase)" → allowed websites: add
   `https://localhost/*`.
2. **App Check:** Google Cloud console → Security → reCAPTCHA → the project's
   key → domains: add `localhost`.

Without them, sign-in fails (blocked referer) and Firestore rejects every
request (App Check). Both lower the protection of the public key a little:
any page served from `localhost` (for example on a developer's computer) can
use the key and pass the score-based reCAPTCHA check. Firestore Security
Rules still decide what each signed-in user can read and write, so this does
not expose anyone's data; it only weakens the bot protection of the free
quota. A native App Check provider (Play Integrity) would avoid it but needs
a native Firebase plugin; revisit if abuse shows up.

## Building locally

Needs Node, JDK 21 and the Android SDK (API 36), most easily through
[Android Studio](https://developer.android.com/studio). Android builds are
optional for web work.

```bash
npm run android:sync -- uat   # build, add UAT's Firebase config, copy into android/
npx cap open android          # open in Android Studio; run on a phone or emulator
```

Use `prod` instead of `uat` for the Production project. The local emulators are
not supported in the app.

## Continuous integration

Every pull request runs the **Android build** job: `npm run android:sync -- uat`,
then Gradle unit tests, Android lint and a debug APK. The debug APK is kept for
7 days as the run artifact `generations-uat-debug-apk`; install it on a phone
(allow installs from your browser or file manager when Android asks) to try a
change against UAT. Signed release builds follow in a later step.
