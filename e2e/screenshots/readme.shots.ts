import { expect, test, type Page } from '@playwright/test';

// README screenshots: `npm run screenshots` (fresh emulators, see
// playwright.screenshots.config.ts). Seeds a made-up demo family and saves
// the images to docs/screenshots/. Not part of the e2e suite.
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_DOCS = 'http://127.0.0.1:8080/v1/projects/demo-generations/databases/(default)/documents';
/** The emulators' built-in admin token; it bypasses security rules. */
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const PASSWORD = 'Passw0rd!';
const EMAIL = 'arjun@generations.test';
const OUT = 'docs/screenshots';

test.describe.configure({ mode: 'serial' });

async function call(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: OWNER, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

const str = (stringValue: string) => ({ stringValue });
const ids = (list: string[]) => ({ arrayValue: { values: list.map(str) } });
const now = () => ({ timestampValue: new Date().toISOString() });

/** Firestore REST fields for a person. */
function person(p: {
  name: string;
  gender: string;
  birth?: string;
  death?: string;
  anniversary?: string;
  address?: string;
  parents?: string[];
  children?: string[];
  spouses?: string[];
}) {
  const fields: Record<string, unknown> = { name: str(p.name), gender: str(p.gender), updatedAt: now() };
  for (const key of ['birth', 'death', 'anniversary', 'address'] as const) if (p[key]) fields[key] = str(p[key]!);
  for (const key of ['parents', 'children', 'spouses'] as const) if (p[key]?.length) fields[key] = ids(p[key]!);
  return fields;
}

/** A made-up family around Arjun (an admin), plus one account waiting for approval. */
async function seed(): Promise<void> {
  const { localId: uid } = await call(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/demo-generations/accounts`,
    { email: EMAIL, password: PASSWORD, displayName: 'Arjun Sharma', emailVerified: true },
  );
  const doc = (path: string, fields: Record<string, unknown>) => call(`${FIRESTORE_DOCS}/${path}`, { fields }, 'PATCH');
  await doc(`users/${uid}`, {
    email: str(EMAIL),
    displayName: str('Arjun Sharma'),
    role: str('admin'),
    active: { booleanValue: true },
    createdAt: now(),
  });
  const tree = (id: string, fields: Record<string, unknown>) => doc(`trees/${uid}/people/${id}`, fields);
  await tree(
    uid,
    person({
      name: 'Arjun Sharma',
      gender: 'male',
      birth: '1985-03-12',
      anniversary: '2012-11-20',
      address: 'Jaipur, Rajasthan',
      parents: ['ram', 'sita'],
      spouses: ['priya'],
      children: ['kabir', 'anaya'],
    }),
  );
  await tree(
    'priya',
    person({
      name: 'Priya Sharma',
      gender: 'female',
      birth: '1987-07-02',
      anniversary: '2012-11-20',
      parents: ['mohan', 'geeta'],
      spouses: [uid],
      children: ['kabir', 'anaya'],
    }),
  );
  await tree(
    'ram',
    person({
      name: 'Ram Sharma',
      gender: 'male',
      birth: '1950-01-15',
      death: '2019-08-04',
      spouses: ['sita'],
      children: ['meera', uid],
    }),
  );
  await tree(
    'sita',
    person({ name: 'Sita Sharma', gender: 'female', birth: '1955-05-21', spouses: ['ram'], children: ['meera', uid] }),
  );
  await tree('meera', person({ name: 'Meera Joshi', gender: 'female', birth: '1981-09-30', parents: ['ram', 'sita'] }));
  await tree(
    'mohan',
    person({ name: 'Mohan Verma', gender: 'male', birth: '1958-12-01', spouses: ['geeta'], children: ['priya'] }),
  );
  await tree(
    'geeta',
    person({ name: 'Geeta Verma', gender: 'female', birth: '1961-04-18', spouses: ['mohan'], children: ['priya'] }),
  );
  await tree('kabir', person({ name: 'Kabir Sharma', gender: 'male', birth: '2014-06-10', parents: [uid, 'priya'] }));
  await tree('anaya', person({ name: 'Anaya Sharma', gender: 'female', birth: '2017-02-25', parents: [uid, 'priya'] }));

  // Someone who signed up and waits for an admin (shown on the bell).
  await doc('users/newcomer', {
    email: str('rohan@generations.test'),
    displayName: str('Rohan Mehta'),
    role: str('user'),
    active: { booleanValue: false },
    createdAt: now(),
  });
  await doc('notifications/newcomer', {
    type: str('account-approval'),
    audience: str('admins'),
    userId: str('newcomer'),
    email: str('rohan@generations.test'),
    displayName: str('Rohan Mehta'),
    status: str('pending'),
    readBy: { arrayValue: { values: [] } },
    createdAt: now(),
  });
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('ion-input[formcontrolname=email] input').fill(EMAIL);
  await page.locator('ion-input[formcontrolname=password] input').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(card(page, 'Anaya Sharma')).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.locator('app-person-card', { has: page.getByRole('heading', { name, exact: true }) });

/** Lets animations (line drawing, cards appearing, modals) finish before a shot. */
const settle = (page: Page) => page.waitForTimeout(900);

test.beforeAll(seed);

test('sign-in page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/sign-in.png` });
});

test('dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await login(page);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.mouse.move(5, 5);
  await settle(page);
  await page.screenshot({ path: `${OUT}/family-tree-dark.png` });
});

test('family tree, profile, editing and notifications', async ({ page }) => {
  await login(page);
  // Three generations on screen.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.mouse.move(5, 5); // no hover effects
  await settle(page);
  await page.screenshot({ path: `${OUT}/family-tree.png` });

  // Hovering a couple shows the add buttons and highlights their family lines.
  await page.getByRole('button', { name: 'Center on me' }).click();
  await card(page, 'Arjun Sharma').hover({ position: { x: 130, y: 300 } });
  await settle(page);
  await page.screenshot({ path: `${OUT}/add-relatives.png` });

  // Profile popup.
  await card(page, 'Arjun Sharma').locator('ion-card-title').click();
  const profile = page.locator('ion-modal.profile');
  await expect(profile.getByRole('heading', { name: 'Arjun Sharma' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/profile.png` });
  await profile.getByRole('button', { name: 'Close' }).click();
  await expect(profile.locator('h1')).toBeHidden();

  // Remembered ancestor: move the view up to the grandparents first.
  const canvas = page.locator('.tree-canvas');
  await canvas.focus();
  for (let i = 0; i < 8; i++) await canvas.press('ArrowUp');
  await card(page, 'Ram Sharma').locator('ion-card-title').click();
  await expect(profile.getByText('In loving memory')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/in-memory.png` });
  await profile.getByRole('button', { name: 'Close' }).click();
  await expect(profile.locator('h1')).toBeHidden();

  // Adding a child: new person or someone already in the tree, with birth order.
  await page.getByRole('button', { name: 'Center on me' }).click();
  await card(page, 'Arjun Sharma').hover({ position: { x: 130, y: 300 } });
  await page.getByRole('button', { name: 'Add sibling right of Arjun Sharma' }).click();
  await page.locator('ion-modal ion-input[formcontrolname=name] input').fill('Rahul Sharma');
  await settle(page);
  await page.screenshot({ path: `${OUT}/add-sibling.png` });
  await page.locator('ion-modal').getByRole('button', { name: 'Cancel' }).click();

  // Notifications: a new account waits for approval.
  await page.mouse.move(5, 5);
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByText('Rohan Mehta wants to join')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/notifications.png` });
  await page.getByText('Rohan Mehta wants to join').click();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/approve-account.png` });
});

test('on a phone', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 412, height: 860 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await login(page);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/mobile.png` });
  await context.close();
});
