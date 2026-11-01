// Firestore Security Rules tests. Run with `npm run test:rules` (starts the
// Firestore emulator automatically).
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const profile = (email: string, role: string, active = true) => ({
  email,
  displayName: email.split('@')[0],
  role,
  active,
  createdAt: serverTimestamp(),
});

const db = (uid: string, verified = true) =>
  env.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: verified }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-generations-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'users/admin'), profile('admin@example.test', 'admin'));
    await setDoc(doc(fs, 'users/alice'), profile('alice@example.test', 'user'));
    await setDoc(doc(fs, 'users/off'), profile('off@example.test', 'user', false));
    await setDoc(doc(fs, 'users/offadmin'), profile('offadmin@example.test', 'admin', false));
  });
});

describe('reading profiles', () => {
  it('lets a verified user read their own profile', () => assertSucceeds(getDoc(doc(db('alice'), 'users/alice'))));
  it('lets a deactivated user read their own profile', () => assertSucceeds(getDoc(doc(db('off'), 'users/off'))));
  it("blocks reading someone else's profile", () => assertFails(getDoc(doc(db('alice'), 'users/admin'))));
  it('blocks unverified users', () => assertFails(getDoc(doc(db('alice', false), 'users/alice'))));
  it('blocks signed-out users', () =>
    assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice'))));
  it('lets an admin list all users', () => assertSucceeds(getDocs(collection(db('admin'), 'users'))));
  it('blocks a normal user from listing users', () => assertFails(getDocs(collection(db('alice'), 'users'))));
  it('blocks a deactivated admin from listing users', () => assertFails(getDocs(collection(db('offadmin'), 'users'))));
});

describe('self-registration', () => {
  it('lets a verified user create their own profile, waiting for approval (inactive)', () =>
    assertSucceeds(setDoc(doc(db('bob'), 'users/bob'), profile('bob@example.test', 'user', false))));
  it('blocks self-registering as already active (approval is required)', () =>
    assertFails(setDoc(doc(db('bob'), 'users/bob'), profile('bob@example.test', 'user'))));
  it('blocks self-registering as admin', () =>
    assertFails(setDoc(doc(db('bob'), 'users/bob'), profile('bob@example.test', 'admin', false))));
  it('blocks self-registering with extra fields', () =>
    assertFails(setDoc(doc(db('bob'), 'users/bob'), { ...profile('bob@example.test', 'user', false), x: 1 })));
  it('blocks a different email than the signed-in one', () =>
    assertFails(setDoc(doc(db('bob'), 'users/bob'), profile('someone@example.test', 'user', false))));
  it('blocks unverified users from creating a profile', () =>
    assertFails(setDoc(doc(db('bob', false), 'users/bob'), profile('bob@example.test', 'user', false))));
  it("blocks creating someone else's profile", () =>
    assertFails(setDoc(doc(db('bob'), 'users/carol'), profile('carol@example.test', 'user', false))));
  it('blocks a deactivated user from recreating their profile', () =>
    assertFails(setDoc(doc(db('off'), 'users/off'), profile('off@example.test', 'user', false))));
});

describe('admin management', () => {
  it('lets an admin create a profile for another user, with any role', () =>
    assertSucceeds(setDoc(doc(db('admin'), 'users/carol'), profile('carol@example.test', 'admin'))));
  it("lets an admin change another user's role, status and name", () =>
    assertSucceeds(updateDoc(doc(db('admin'), 'users/alice'), { role: 'admin', active: false, displayName: 'Al' })));
  it('blocks an admin from changing their own role or status', async () => {
    await assertFails(updateDoc(doc(db('admin'), 'users/admin'), { role: 'user' }));
    await assertFails(updateDoc(doc(db('admin'), 'users/admin'), { active: false }));
  });
  it('blocks an admin from changing email or using invalid values', async () => {
    await assertFails(updateDoc(doc(db('admin'), 'users/alice'), { email: 'x@example.test' }));
    await assertFails(updateDoc(doc(db('admin'), 'users/alice'), { role: 'owner' }));
  });
  it("blocks normal users from changing their own role or status, or anyone else's profile", async () => {
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { active: false }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { email: 'x@example.test' }));
    await assertFails(updateDoc(doc(db('alice'), 'users/off'), { active: true }));
    await assertFails(updateDoc(doc(db('alice'), 'users/admin'), { displayName: 'Hacked' }));
  });
  it('blocks a deactivated admin from managing users', () =>
    assertFails(updateDoc(doc(db('offadmin'), 'users/alice'), { active: false })));
  it('blocks deletes for everyone', () => assertFails(deleteDoc(doc(db('admin'), 'users/alice'))));
});

describe('own profile: name and picture', () => {
  const photo = 'data:image/webp;base64,' + 'A'.repeat(20000);

  it('lets users change their own name and picture, and remove the picture', async () => {
    await assertSucceeds(updateDoc(doc(db('alice'), 'users/alice'), { displayName: 'Alice B', photo }));
    await assertSucceeds(updateDoc(doc(db('alice'), 'users/alice'), { photo: deleteField() }));
  });
  it('lets admins edit their own name and picture', () =>
    assertSucceeds(updateDoc(doc(db('admin'), 'users/admin'), { displayName: 'Boss', photo })));
  it('blocks pictures that are too large or not small images', async () => {
    await assertFails(
      updateDoc(doc(db('alice'), 'users/alice'), { photo: 'data:image/webp;base64,' + 'A'.repeat(70000) }),
    );
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { photo: 'https://example.com/me.png' }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { photo: 'data:image/png;base64,AAAA' }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { photo: 42 }));
  });
  it('blocks empty names', () => assertFails(updateDoc(doc(db('alice'), 'users/alice'), { displayName: '' })));
  it('blocks deactivated users from editing their profile', () =>
    assertFails(updateDoc(doc(db('off'), 'users/off'), { displayName: 'Back' })));
  it("blocks admins from setting other users' pictures", () =>
    assertFails(updateDoc(doc(db('admin'), 'users/alice'), { photo })));
});

describe('other collections', () => {
  it('denies everything else', () => assertFails(getDoc(doc(db('admin'), 'anything/else'))));
});
