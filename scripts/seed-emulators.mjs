// Seeds the local Firebase emulators with test accounts. Emulators only: it
// uses emulator-only endpoints and refuses to run against anything else.
//
//   npm run seed        (while `npm run dev` or Docker is running)
//
// Test accounts (local emulators only, never real credentials):
//   admin@generations.test / Passw0rd!   (admin)
//   user@generations.test  / Passw0rd!   (user)

const project = 'demo-generations';
const host = process.env.EMULATOR_HOST ?? '127.0.0.1';
const authUrl = `http://${host}:9099`;
const firestoreUrl = `http://${host}:8080/v1/projects/${project}/databases/(default)/documents`;
// "owner" is the emulators' built-in admin token; it bypasses security rules.
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const users = [
  { email: 'admin@generations.test', displayName: 'Admin', role: 'admin' },
  { email: 'user@generations.test', displayName: 'Test User', role: 'user' },
];
const password = 'Passw0rd!';

async function call(url, body, method = 'POST') {
  const res = await fetch(url, { method, headers: owner, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${url}: ${json.error?.message ?? res.status}`);
  return json;
}

for (const u of users) {
  const { users: found = [] } = await call(
    `${authUrl}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`,
    {
      email: [u.email],
    },
  );
  let uid = found[0]?.localId;
  if (!uid) {
    ({ localId: uid } = await call(`${authUrl}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts`, {
      email: u.email,
      password,
      displayName: u.displayName,
      emailVerified: true,
    }));
  }
  await call(
    `${firestoreUrl}/users/${uid}`,
    {
      fields: {
        email: { stringValue: u.email },
        displayName: { stringValue: u.displayName },
        role: { stringValue: u.role },
        active: { booleanValue: true },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    },
    'PATCH',
  );
  console.log(`seeded ${u.role.padEnd(5)} ${u.email}`);
}
