import { InjectionToken } from '@angular/core';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

import { appCheckSiteKeys } from '../../environments/app-check';
import { environment } from '../../environments/environment';

export const AUTH = new InjectionToken<Auth>('Firebase Auth');
export const FIRESTORE = new InjectionToken<Firestore>('Firestore');

async function loadConfig(): Promise<FirebaseOptions> {
  if (environment.firebase) return environment.firebase;
  const res = await fetch('/__/firebase/init.json');
  if (!res.ok) throw new Error(`Cannot load Firebase config (${res.status})`);
  return res.json();
}

export async function initFirebase(): Promise<{ auth: Auth; db: Firestore }> {
  const config = await loadConfig();
  const app = initializeApp(config);

  // App Check: proves requests come from this app on a real browser, so Firestore
  // can reject scripts and bots using the public config. The emulators don't
  // check it, so it is only turned on for deployed projects that have a key.
  const siteKey = config.projectId && appCheckSiteKeys[config.projectId];
  if (!environment.useEmulators && siteKey) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
  }
  // IndexedDB first: it also persists sessions inside Capacitor's native WebView.
  // The popup resolver enables Google sign-in. ponytail: popups do not work inside
  // Capacitor's native WebView; native apps will need a native sign-in plugin.
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  const db = getFirestore(app);

  if (environment.useEmulators) {
    const host = location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
  return { auth, db };
}
