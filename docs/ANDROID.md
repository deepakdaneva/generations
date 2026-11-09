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
- **Sign-in:** email and password, or **Continue with Google** through
  Android's own account picker (see below).
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

Both are in place for `generations-uat` and `generations-prod`.

Without them, sign-in fails (blocked referer) and Firestore rejects every
request (App Check). Both lower the protection of the public key a little:
any page served from `localhost` (for example on a developer's computer) can
use the key and pass the score-based reCAPTCHA check. Firestore Security
Rules still decide what each signed-in user can read and write, so this does
not expose anyone's data; it only weakens the bot protection of the free
quota. A native App Check provider (Play Integrity) would avoid it but needs
a native Firebase plugin; revisit if abuse shows up.

## Google sign-in

Browsers use Firebase's Google popup, which cannot open inside the app's
WebView. The app uses `@capgo/capacitor-social-login` instead: Android's
Credential Manager shows the system account picker and returns a Google ID
token, which the app exchanges with `signInWithCredential`. No browser,
redirect or Dynamic Links. Only the plugin's Google provider is bundled
(`capacitor.config.ts`); the others, including Facebook's SDK and its
advertising-ID permission, are left out.

Setup per Firebase project (done for UAT and Production):

1. The Android app is registered in Firebase (Project settings → Your apps)
   with the package name (`io.github.deepakdaneva.generations` in Production,
   `.uat` in UAT) and the signing key's SHA-1 and SHA-256 (see "Signing key").
   Registering creates the Android OAuth client Google checks.
2. The project's **web** client ID (Authentication → Sign-in method → Google →
   Web SDK configuration) is in `src/environments/google-sign-in.ts`. Without
   one, the app hides the Google button for that project.

A new signing key must be added to both Firebase apps. The PR debug APKs are
signed with a throwaway debug key, so Google sign-in fails in them
(`Developer console is not set up correctly`); test it with the signed UAT
APK.

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

## Continuous integration and releases

| Trigger | Job | Output |
|---|---|---|
| Pull request | **Android build**: Gradle unit tests, lint, debug APK against UAT | Debug APK, run artifact `generations-uat-debug-apk` for 7 days |
| Push to `development` | **Android release** after the UAT deploy | Signed **UAT APK** (`io.github.deepakdaneva.generations.uat`, "Generations UAT"), run artifact `android-uat-apk` for 30 days |
| Push to `main` | **Android release** after the approved Production deploy | Signed **production APK** and its SHA-256, attached to the GitHub release `vX.Y.Z` that release-please created |

- The UAT app has its own package name, so both apps install side by side.
- `versionName` is the `package.json` version, `versionCode` the pipeline run
  number, so every build upgrades the previous one. The About page shows the
  same version and build number.
- The APK is built from the same commit that was just deployed, with the
  deployed project's Firebase config.
- Release APKs are built unsigned and signed afterwards with `apksigner`, so
  the key is only present in that one CI step, not during dependency installs
  or the Gradle build. The job then checks the signature, package name and
  version.

### Installing

Download the APK from the GitHub release (or the UAT run artifact), allow
installs from that source when Android asks, and open it. Compare the
SHA-256 with the `.sha256` file to confirm the download. New versions are
installed the same way (no in-app update prompt yet).

### Signing key (once)

Android only accepts updates signed with the same key. Keep the keystore and
its password backed up (a password manager). If it is lost, users must
uninstall and reinstall to get new versions.

1. Create the keystore (PKCS12, one password for store and key, alias
   `generations`), outside the repository:

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore generations-release.jks -alias generations -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Generations, O=Generations"
   ```

2. Store it as repository secrets (Settings → Secrets and variables →
   Actions), or with the GitHub CLI:

   ```bash
   base64 -w0 generations-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
   gh secret set ANDROID_KEYSTORE_PASSWORD
   ```

   On Windows PowerShell, encode with
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("generations-release.jks")) | gh secret set ANDROID_KEYSTORE_BASE64`.

3. Never commit the keystore.

The signing certificate's SHA-1 and SHA-256 fingerprints are printed by the
**Sign and verify** step of every release run (`apksigner verify
--print-certs`):

- SHA-1 `5a:67:aa:61:0d:eb:18:6e:5a:81:01:a3:a2:8e:2f:8b:05:5d:3c:ed`
- SHA-256 `6a:87:f2:73:a3:32:c1:85:29:ac:69:39:1e:be:69:e1:57:58:5c:91:9a:96:55:ea:4a:f6:10:e4:e5:46:08:93`
