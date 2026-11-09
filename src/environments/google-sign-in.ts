/**
 * OAuth web client IDs for Google sign-in in the Android app, per Firebase
 * project (Authentication → Sign-in method → Google → Web SDK configuration).
 * Client IDs are public. Each project also has the Android app registered with
 * the signing key's SHA-1. A project without an ID hides the Google button in
 * the app. Forks: add your own project id and client id. See docs/ANDROID.md.
 */
export const googleWebClientIds: Record<string, string> = {
  'generations-uat': '403881115812-beclb7veko3pf44bjmb3a7e1fdg3l2la.apps.googleusercontent.com',
  'generations-prod': '663139968583-9qc8mic9b626ihmctijcai5r49fiosl7.apps.googleusercontent.com',
};
