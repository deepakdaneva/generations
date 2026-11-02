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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
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

describe('notifications', () => {
  const request = (uid: string, extra: Record<string, unknown> = {}) => ({
    type: 'account-approval',
    audience: 'admins',
    userId: uid,
    email: `${uid}@example.test`,
    displayName: uid,
    status: 'pending',
    readBy: [],
    createdAt: serverTimestamp(),
    ...extra,
  });
  const seedRequest = (uid: string) =>
    env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `notifications/${uid}`), { ...request(uid), createdAt: new Date() }),
    );

  it('lets a new, inactive user ask for approval, once and only for themselves', async () => {
    const fs = db('bob');
    const batch = writeBatch(fs);
    batch.set(doc(fs, 'users/bob'), profile('bob@example.test', 'user', false));
    batch.set(doc(fs, 'notifications/bob'), request('bob'));
    await assertSucceeds(batch.commit());
    await assertFails(setDoc(doc(fs, 'notifications/bob'), request('bob'))); // already exists
    await assertFails(setDoc(doc(db('carol'), 'notifications/bob'), request('bob')));
  });
  it('blocks requests from active users, or with a wrong status or extra fields', async () => {
    await assertFails(setDoc(doc(db('alice'), 'notifications/alice'), request('alice')));
    await assertFails(setDoc(doc(db('off'), 'notifications/off'), request('off', { status: 'approved' })));
    await assertFails(setDoc(doc(db('off'), 'notifications/off'), request('off', { x: 1 })));
    await assertSucceeds(setDoc(doc(db('off'), 'notifications/off'), request('off')));
  });
  it('lets only active admins read requests and mark them read', async () => {
    await seedRequest('off');
    await assertSucceeds(getDocs(query(collection(db('admin'), 'notifications'), where('audience', '==', 'admins'))));
    await assertFails(getDoc(doc(db('alice'), 'notifications/off')));
    await assertFails(getDoc(doc(db('off'), 'notifications/off')));
    await assertSucceeds(updateDoc(doc(db('admin'), 'notifications/off'), { readBy: arrayUnion('admin') }));
    await assertFails(updateDoc(doc(db('admin'), 'notifications/off'), { readBy: ['someone-else'] }));
    await assertFails(updateDoc(doc(db('alice'), 'notifications/off'), { readBy: arrayUnion('alice') }));
  });
  it('lets an admin approve (activating the user in the same batch) or reject, once', async () => {
    await seedRequest('off');
    const fs = db('admin');
    const acted = (status: string) => ({ status, actedBy: 'admin', actedAt: serverTimestamp() });
    // Approving without activating the user is refused.
    await assertFails(updateDoc(doc(fs, 'notifications/off'), acted('approved')));
    const batch = writeBatch(fs);
    batch.update(doc(fs, 'users/off'), { active: true });
    batch.update(doc(fs, 'notifications/off'), acted('approved'));
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(doc(fs, 'notifications/off'), acted('rejected'))); // already acted on
    await assertFails(deleteDoc(doc(fs, 'notifications/off')));
  });
  it('lets an admin reject without changing the account', async () => {
    await seedRequest('off');
    await assertSucceeds(
      updateDoc(doc(db('admin'), 'notifications/off'), {
        status: 'rejected',
        actedBy: 'admin',
        actedAt: serverTimestamp(),
      }),
    );
  });
});

describe('family tree', () => {
  const person = (extra: Record<string, unknown> = {}) => ({
    name: 'Alice',
    birth: '1990-04-01',
    gender: 'female',
    parents: [],
    updatedAt: serverTimestamp(),
    ...extra,
  });

  it('lets an active user create, read, update and delete people in their own tree', async () => {
    const ref = doc(db('alice'), 'trees/alice/people/alice');
    await assertSucceeds(setDoc(ref, person()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db('alice'), 'trees/alice/people')));
    await assertSucceeds(updateDoc(ref, { name: 'Alice B', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
  });
  it("blocks reading or writing someone else's tree, even for admins", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'trees/alice/people/p1'), { name: 'X' }));
    await assertFails(getDoc(doc(db('admin'), 'trees/alice/people/p1')));
    await assertFails(setDoc(doc(db('admin'), 'trees/alice/people/p2'), person()));
    await assertFails(deleteDoc(doc(db('admin'), 'trees/alice/people/p1')));
  });
  it('blocks deactivated and unverified users', async () => {
    await assertFails(setDoc(doc(db('off'), 'trees/off/people/off'), person()));
    await assertFails(getDoc(doc(db('alice', false), 'trees/alice/people/alice')));
  });
  it('lets the owner store up to 5 small photos per person, and nothing else', async () => {
    const photo = (data = 'data:image/webp;base64,' + 'A'.repeat(40000)) => ({ data, updatedAt: serverTimestamp() });
    await assertSucceeds(setDoc(doc(db('alice'), 'trees/alice/photos/p1_0'), photo()));
    await assertSucceeds(setDoc(doc(db('alice'), 'trees/alice/photos/p1_4'), photo()));
    await assertSucceeds(getDoc(doc(db('alice'), 'trees/alice/photos/p1_4')));
    await assertSucceeds(deleteDoc(doc(db('alice'), 'trees/alice/photos/p1_4')));
    await assertFails(setDoc(doc(db('alice'), 'trees/alice/photos/p1_5'), photo()));
    await assertFails(setDoc(doc(db('alice'), 'trees/alice/photos/p1'), photo()));
    await assertFails(
      setDoc(doc(db('alice'), 'trees/alice/photos/p1_0'), photo('data:image/webp;base64,' + 'A'.repeat(100000))),
    );
    await assertFails(setDoc(doc(db('alice'), 'trees/alice/photos/p1_0'), photo('https://example.com/a.png')));
    await assertFails(getDoc(doc(db('admin'), 'trees/alice/photos/p1_0')));
    await assertFails(setDoc(doc(db('admin'), 'trees/alice/photos/p1_1'), photo()));
  });
  it('lets the owner keep their tree settings and saved position', async () => {
    const ref = doc(db('alice'), 'trees/alice');
    const view = { focus: 'p1', path: ['alice', 'p1'], dx: 10, dy: -20.5, z: 0.8 };
    await assertSucceeds(setDoc(ref, { rememberView: true, view, updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(ref, { rememberView: false, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { rememberView: 'yes', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { rememberView: true, view: { ...view, z: 50 }, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { rememberView: true, other: 1, updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(db('admin'), 'trees/alice')));
    await assertFails(setDoc(doc(db('admin'), 'trees/alice'), { rememberView: true, updatedAt: serverTimestamp() }));
  });
  it('blocks invalid people', async () => {
    const ref = doc(db('alice'), 'trees/alice/people/p1');
    await assertFails(setDoc(ref, person({ name: '' })));
    await assertFails(setDoc(ref, person({ gender: 'robot' })));
    await assertFails(setDoc(ref, person({ birth: '1 April 1990' })));
    await assertFails(setDoc(ref, person({ parents: ['a', 'b', 'c'] })));
    await assertFails(setDoc(ref, person({ photos: [0, 1, 2, 3, 4, 0] })));
    await assertFails(setDoc(ref, person({ extra: true })));
    await assertFails(setDoc(ref, person({ updatedAt: new Date(0) })));
  });
});

describe('other collections', () => {
  it('denies everything else', () => assertFails(getDoc(doc(db('admin'), 'anything/else'))));
});
