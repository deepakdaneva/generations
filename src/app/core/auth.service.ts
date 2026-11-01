import { Injectable, computed, inject, signal } from '@angular/core';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  validatePassword,
  connectAuthEmulator,
  type User,
} from 'firebase/auth';
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';

import { environment } from '../../environments/environment';

import { AUTH, FIRESTORE } from './firebase';
import { recordResetLink, resetLinksLeft } from './reset-limit';

export type Role = 'admin' | 'user';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  /** Small square picture as a data URL (see core/avatar.ts). */
  photo?: string;
}

/** Throw-away password for admin-created accounts; the user replaces it via email. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  // Fixed prefix satisfies any upper/lower/digit/symbol password policy.
  return 'Aa1!' + btoa(String.fromCharCode(...bytes));
}

/** Why the current session ended, shown on the login page. */
export type SignOutReason = 'inactive' | null;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(AUTH);
  private readonly db = inject(FIRESTORE);
  private stopProfile?: Unsubscribe;

  /** False until the first auth state (and profile, if signed in) is known. */
  readonly ready = signal(false);
  readonly profile = signal<UserProfile | null>(null);
  readonly signOutReason = signal<SignOutReason>(null);
  readonly isAdmin = computed(() => this.profile()?.role === 'admin');

  constructor() {
    onAuthStateChanged(this.auth, (user) => this.watchProfile(user));
  }

  /** Signs in; returns false (and signs out again) when the email is not verified yet. */
  async login(email: string, password: string): Promise<boolean> {
    this.signOutReason.set(null);
    const { user } = await signInWithEmailAndPassword(this.auth, email, password);
    if (user.emailVerified) return true;
    await signOut(this.auth);
    return false;
  }

  /**
   * Google sign-in (also signs up on first use). Google accounts arrive with a
   * verified email, so the profile is created right away as a normal user.
   * Returns false when the user closed the popup.
   */
  async loginWithGoogle(): Promise<boolean> {
    this.signOutReason.set(null);
    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return false;
      throw e;
    }
  }

  /** Signs in briefly to send a fresh verification email. */
  async resendVerification(email: string, password: string): Promise<void> {
    const { user } = await signInWithEmailAndPassword(this.auth, email, password);
    try {
      await sendEmailVerification(user);
    } finally {
      await signOut(this.auth);
    }
  }

  /** Creates the account and sends a verification email. The user stays signed out until verified. */
  async register(displayName: string, email: string, password: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email, password);
    try {
      await updateProfile(user, { displayName });
      await sendEmailVerification(user);
    } finally {
      await signOut(this.auth);
    }
  }

  /**
   * Checks a new password against the project's live password policy (set in
   * the Firebase console) and returns what is missing, or null when it passes.
   * Firebase enforces the same policy server-side; this only gives a clear
   * message before submitting. Unavailable policy (e.g. emulators) → null.
   */
  async passwordProblem(password: string): Promise<string | null> {
    const status = await validatePassword(this.auth, password).catch(() => null);
    if (!status || status.isValid) return null;
    const p = status.passwordPolicy.customStrengthOptions;
    const missing = [
      status.meetsMinPasswordLength === false && `at least ${p.minPasswordLength} characters`,
      status.containsLowercaseLetter === false && 'a lowercase letter',
      status.containsUppercaseLetter === false && 'an uppercase letter',
      status.containsNumericCharacter === false && 'a number',
      status.containsNonAlphanumericCharacter === false && 'a symbol (e.g. ! @ # $ %)',
    ].filter(Boolean);
    return `Your password needs ${missing.join(', ')}.`;
  }

  /** Admin-triggered reset email (not limited). */
  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  /**
   * User-triggered reset email, limited per email per day on this device.
   * Returns false when today's limit is already used up.
   */
  async sendOwnResetLink(email: string): Promise<boolean> {
    if (!resetLinksLeft(email)) return false;
    recordResetLink(email); // counted even if sending fails, so retries can't spam
    await sendPasswordResetEmail(this.auth, email.trim());
    return true;
  }

  /** True when the signed-in account has a password (not Google-only). */
  hasPassword(): boolean {
    return !!this.auth.currentUser?.providerData.some((p) => p.providerId === 'password');
  }

  /** Updates the signed-in user's own name and/or picture (null removes it). */
  async updateMyProfile(changes: { displayName?: string; photo?: string | null }): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const update: Record<string, unknown> = {};
    if (changes.displayName !== undefined) update['displayName'] = changes.displayName;
    if (changes.photo !== undefined) update['photo'] = changes.photo ?? deleteField();
    await updateDoc(doc(this.db, 'users', user.uid), update);
    if (changes.displayName !== undefined) await updateProfile(user, { displayName: changes.displayName });
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }

  /**
   * Admin only: creates another user's account and profile without signing the
   * admin out, using a throw-away second Firebase app (the Spark-plan
   * alternative to the Admin SDK). The account gets a random password nobody
   * sees; the user receives a "set your password" (password reset) email.
   */
  async createUser(displayName: string, email: string, role: Role): Promise<void> {
    const app = initializeApp(this.auth.app.options, `create-user-${Date.now()}`);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    if (environment.useEmulators) {
      connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
    }
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, randomPassword());
      await updateProfile(user, { displayName });
      await setDoc(doc(this.db, 'users', user.uid), {
        email: user.email,
        displayName,
        role,
        active: true,
        createdAt: serverTimestamp(),
      });
      await sendPasswordResetEmail(this.auth, email);
    } finally {
      await deleteApp(app);
    }
  }

  private watchProfile(user: User | null): void {
    this.stopProfile?.();
    this.stopProfile = undefined;

    if (!user?.emailVerified) {
      this.profile.set(null);
      this.ready.set(true);
      return;
    }

    this.ready.set(false);
    const ref = doc(this.db, 'users', user.uid);
    // Profile unreadable or not creatable (e.g. rules changed): fail closed.
    const failClosed = () => signOut(this.auth);
    this.stopProfile = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      async (snap) => {
        if (!snap.exists()) {
          // First verified sign-in of a self-registered user: create the profile,
          // inactive until an admin approves it.
          await setDoc(ref, {
            email: user.email,
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            role: 'user',
            active: false, // waits for an admin to approve (rules enforce this)
            createdAt: serverTimestamp(),
          }).catch(failClosed);
          return; // the snapshot fires again with the new profile
        }
        const profile = { id: snap.id, ...snap.data() } as UserProfile;
        if (!profile.active) {
          // Wait until a just-created profile reaches the server; signing out
          // earlier would drop the pending write.
          if (snap.metadata.hasPendingWrites) return;
          this.signOutReason.set('inactive');
          await signOut(this.auth);
          return;
        }
        this.profile.set(profile);
        this.ready.set(true);
      },
      failClosed,
    );
  }
}
