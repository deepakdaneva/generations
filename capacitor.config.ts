import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.deepakdaneva.generations',
  appName: 'Generations',
  webDir: 'www',
  // Matches the launch screen, so there is no white flash before the app paints.
  backgroundColor: '#0054e9',
  plugins: {
    // Google only: the other providers' SDKs are not bundled (Facebook's would
    // also add the advertising-ID permission, against the privacy policy).
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;
