import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Runs against the Firebase emulators started by playwright.config.ts.
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PASSWORD = 'Passw0rd!';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execFileSync('node', ['scripts/seed-emulators.mjs'], { stdio: 'inherit' });
});

/** The signed-in user's own card on the home canvas. */
const ownCard = (page: Page, name: string) => page.locator('app-person-card ion-card-title', { hasText: name });

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.locator('ion-input[formcontrolname=email] input').fill(email);
  await page.locator('ion-input[formcontrolname=password] input').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Latest email of this type the Auth emulator "sent" to the address. */
async function emailFor(email: string, requestType: 'VERIFY_EMAIL' | 'PASSWORD_RESET') {
  const res = await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/demo-generations/oobCodes`);
  const { oobCodes } = (await res.json()) as {
    oobCodes: { email: string; requestType: string; oobLink: string; oobCode: string }[];
  };
  const code = oobCodes.reverse().find((c) => c.email === email && c.requestType === requestType);
  expect(code, `${requestType} email for ${email}`).toBeTruthy();
  return code!;
}

/** Opens the verification link sent to this address. */
async function verifyEmail(email: string) {
  await fetch((await emailFor(email, 'VERIFY_EMAIL')).oobLink);
}

async function lookup(email: string): Promise<{ localId: string; emailVerified?: boolean }> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/demo-generations/accounts:lookup`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    },
  );
  return ((await res.json()) as { users: { localId: string }[] }).users[0];
}

/** Uses the "set your password" link sent to this address. */
async function setPasswordFromEmail(email: string, newPassword = PASSWORD) {
  const { oobCode } = await emailFor(email, 'PASSWORD_RESET');
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oobCode, newPassword }),
    },
  );
  expect(res.ok).toBe(true);
}

test('redirects signed-out visitors to the login page', async ({ page }) => {
  await page.goto('/users');
  // First page of the run: the freshly started dev server compiles on demand,
  // which can take longer than the default 5 s.
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Generations' })).toBeVisible();
});

test('normal user sees Home without the menu and cannot open User Management', async ({ page }) => {
  await login(page, 'user@generations.test');
  await expect(page).toHaveURL(/\/home$/);
  await expect(ownCard(page, 'Test User')).toBeVisible();
  await expect(page.locator('ion-menu-button')).toBeHidden();

  await page.goto('/users');
  await expect(page).toHaveURL(/\/home$/);
});

test('admin uses the menu to reach User Management and can log out', async ({ page }) => {
  await login(page, 'admin@generations.test');
  await expect(page).toHaveURL(/\/home$/);

  await page.locator('ion-menu-button:visible').click();
  await page.locator('ion-menu ion-item', { hasText: 'Users' }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByText('user@generations.test')).toBeVisible();
  await expect(page).toHaveTitle('User Management · Generations');

  await page.locator('ion-searchbar input').fill('test user');
  await expect(page.getByText('user@generations.test')).toBeVisible();
  await expect(page.locator('app-users').getByText('admin@generations.test')).toBeHidden();
  await page.locator('ion-searchbar input').fill('nobody-matches');
  await expect(page.getByText('No users match')).toBeVisible();
  await page.locator('ion-searchbar input').fill('');

  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Logout').click();
  await expect(page).toHaveURL(/\/login$/);
});

/** Admin activates a waiting account from the Users page, then signs out. */
async function approve(page: Page, email: string) {
  await login(page, 'admin@generations.test');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/users');
  await page.getByText(email).click();
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page.locator('ion-item', { hasText: email }).getByText('Inactive')).toBeHidden();
  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Logout').click();
  await expect(page).toHaveURL(/\/login$/);
}

test('self-registration requires email verification and admin approval before sign-in', async ({ page }) => {
  const email = `new-${Date.now()}@generations.test`;
  await page.goto('/register');
  await page.locator('ion-input[formcontrolname=displayName] input').fill('New Member');
  await page.locator('ion-input[formcontrolname=email] input').fill(email);
  await page.locator('ion-input[formcontrolname=password] input').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your inbox')).toBeVisible();

  await login(page, email);
  await expect(page.getByText('Verify your email')).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();

  await verifyEmail(email);
  await login(page, email);
  // Verified, but self-registered accounts wait for an admin's approval.
  await expect(page.getByText("Your account isn't active")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await approve(page, email);
  await login(page, email);
  await expect(page).toHaveURL(/\/home$/);
  await expect(ownCard(page, 'New Member')).toBeVisible();
});

test('admin creates a user without a password; the user sets their own and signs in', async ({ page }) => {
  const email = `invited-${Date.now()}@generations.test`;
  await login(page, 'admin@generations.test');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/users');

  await page.getByRole('button', { name: 'Add user' }).click();
  const modal = page.locator('ion-modal');
  await expect(modal.locator('ion-input[formcontrolname=password]')).toHaveCount(0);
  await modal.locator('ion-input[formcontrolname=displayName] input').fill('Invited Member');
  await modal.locator('ion-input[formcontrolname=email] input').fill(email);
  await modal.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Logout').click();

  // The invited user sets a password from the email, then signs in.
  await setPasswordFromEmail(email);
  await login(page, email);
  // Depending on Firebase, the reset link may not count as verification; then
  // the normal verify step applies.
  const verifyPrompt = page.getByText('Verify your email');
  await expect(ownCard(page, 'Invited Member').or(verifyPrompt)).toBeVisible();
  if (await verifyPrompt.isVisible()) {
    await page.getByRole('button', { name: 'Resend email' }).click();
    await expect(page.getByText('Verification email sent.')).toBeVisible();
    await verifyEmail(email);
    await login(page, email);
  }
  await expect(ownCard(page, 'Invited Member')).toBeVisible();
});

test('admin creates a user, deactivates them, and the user is blocked', async ({ page }) => {
  const email = `managed-${Date.now()}@generations.test`;
  await login(page, 'admin@generations.test');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/users');

  await page.getByRole('button', { name: 'Add user' }).click();
  const modal = page.locator('ion-modal');
  await modal.locator('ion-input[formcontrolname=displayName] input').fill('Managed Member');
  await modal.locator('ion-input[formcontrolname=email] input').fill(email);
  await modal.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByText(email).click();
  await page.getByRole('button', { name: 'Deactivate account' }).click();
  await expect(page.locator('ion-item', { hasText: email }).getByText('Inactive')).toBeVisible();

  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Logout').click();

  await setPasswordFromEmail(email);
  await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/demo-generations/accounts:update`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: (await lookup(email)).localId, emailVerified: true }),
  });
  await login(page, email);
  await expect(page.getByText("Your account isn't active")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('Google sign-in creates a normal user profile that waits for approval', async ({ page }) => {
  const email = `google-${Date.now()}@generations.test`;
  await page.goto('/login');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google' }).click();

  // The Auth emulator's fake Google account picker.
  const popup = await popupPromise;
  await popup.locator('#add-account-button button').click();
  await popup.locator('#email-input').fill(email);
  await popup.locator('#display-name-input').fill('Google Member');
  await popup.locator('#sign-in').click();

  // New Google users also wait for approval.
  await expect(page.getByText("Your account isn't active")).toBeVisible();
  await approve(page, email);

  const again = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await (await again).getByText(email).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(ownCard(page, 'Google Member')).toBeVisible();
  await expect(page.locator('ion-menu-button')).toBeHidden();
});

test('theme setting switches between Dark, Light and System and is remembered', async ({ page }) => {
  const html = page.locator('html');
  await login(page, 'user@generations.test');
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Settings').click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(html).toHaveClass(/ion-palette-dark/);

  await page.reload();
  await expect(html).toHaveClass(/ion-palette-dark/);

  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Settings').click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(html).not.toHaveClass(/ion-palette-dark/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('radio', { name: 'System default' }).click();
  await expect(html).toHaveClass(/ion-palette-dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).not.toHaveClass(/ion-palette-dark/);
});

test('profile page: picture is cropped, shrunk and shown; name editable; email locked; reset links limited', async ({
  page,
}) => {
  await login(page, 'user@generations.test');
  await expect(page).toHaveURL(/\/home$/);

  // Profile menu → first item opens the profile page.
  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByRole('button', { name: 'Open your profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);

  // A wide 1200x630 photo becomes a 256x256 square, well under the size cap.
  await page.locator('app-profile input[type=file]').setInputFiles('public/og-image.jpg');
  await expect(page.getByText('Profile picture updated.')).toBeVisible();
  const photo = page.locator('.photo-large img');
  const size = await photo.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight, length: img.src.length, type: img.src.slice(0, 15) };
  });
  expect(size).toMatchObject({ w: 256, h: 256 });
  expect(size.length).toBeLessThan(60_000);
  expect(size.type).toMatch(/^data:image\/(webp|jpeg)/);
  await expect(page.locator('.profile-button-avatar img:visible')).toHaveCount(1);

  // Name can change; email is read-only.
  await page.locator('ion-input[label=Name] input').fill('Renamed User');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name updated.')).toBeVisible();
  await expect(page.locator('ion-input[label=Email] input')).toHaveAttribute('readonly', '');

  // Two reset links a day from this device, then the button is disabled.
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Send password reset link' }).click();
    await expect(page.getByText('Password reset link sent').first()).toBeVisible();
  }
  await expect(page.getByText('0 of 2 links left today')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send password reset link' })).toBeDisabled();

  // The same limit applies to "Forgot password?" on the sign-in page.
  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Logout').click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.locator('ion-alert input').fill('user@generations.test');
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText("You've already requested 2 reset links")).toBeVisible();

  // Picture stays visible in the profile menu after signing in again.
  await login(page, 'user@generations.test');
  await expect(page.locator('app-person-card')).toBeVisible();
  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await expect(page.locator('ion-popover ion-item ion-avatar img')).toBeVisible();
});

test('family tree: own card can be edited and the canvas panned and zoomed', async ({ page }) => {
  await login(page, 'admin@generations.test');
  const card = page.locator('app-person-card');
  await expect(ownCard(page, 'Admin')).toBeVisible();

  await page.getByRole('button', { name: 'Edit Admin' }).click();
  const modal = page.locator('ion-modal');
  await modal.locator('ion-input[formcontrolname=name] input').fill('Ada Admin');
  await modal.locator('ion-input[formcontrolname=birth] input').fill('1990-04-01');
  await modal.getByRole('button', { name: 'Add link' }).click();
  await modal.locator('ion-input[formcontrolname=value] input').fill('@ada');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(ownCard(page, 'Ada Admin')).toBeVisible();
  await expect(card).toContainText('Instagram: @ada');

  // Saved in Firestore: still there after a reload.
  await page.reload();
  await expect(ownCard(page, 'Ada Admin')).toBeVisible();
  await expect(card).toContainText('1990');

  // Drag the empty canvas: the card moves with it.
  const before = (await card.boundingBox())!;
  await page.mouse.move(40, 300);
  await page.mouse.down();
  await page.mouse.move(140, 360, { steps: 5 });
  await page.mouse.up();
  const after = (await card.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(100);
  expect(Math.round(after.y - before.y)).toBe(60);

  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(async () => (await card.boundingBox())!.width).toBeLessThan(after.width);
  await page.getByRole('button', { name: 'Center on me' }).click();
  await expect.poll(async () => Math.round((await card.boundingBox())!.width)).toBe(Math.round(after.width));
});

test('family tree: add relatives, remove a relationship and delete a person', async ({ page }) => {
  await login(page, 'admin@generations.test');
  const card = (name: string) =>
    page.locator('app-person-card', { has: page.getByRole('heading', { name, exact: true }) });
  const modal = page.locator('ion-modal');
  /** Pans with the arrow keys (60 px each) until the card is near the middle of the screen. */
  async function bringIntoView(name: string) {
    // Wait until re-layout animations have settled.
    let box = (await card(name).boundingBox())!;
    await expect
      .poll(async () => {
        const prev = box;
        box = (await card(name).boundingBox())!;
        return box.x === prev.x && box.y === prev.y;
      })
      .toBe(true);
    const size = page.viewportSize()!;
    const canvas = page.locator('.tree-canvas');
    await canvas.focus();
    const dx = Math.round((size.width / 2 - (box.x + box.width / 2)) / 60);
    const dy = Math.round((size.height / 2 - (box.y + box.height / 2)) / 60);
    for (let i = 0; i < Math.abs(dx); i++) await canvas.press(dx > 0 ? 'ArrowLeft' : 'ArrowRight');
    for (let i = 0; i < Math.abs(dy); i++) await canvas.press(dy > 0 ? 'ArrowUp' : 'ArrowDown');
  }
  /** Opens a card's buttons (tap), clicks one, fills the name and saves. */
  async function addRelative(of: string, button: string, name: string) {
    await bringIntoView(of);
    await card(of)
      .locator('ion-card')
      .click({ position: { x: 20, y: 200 } });
    await page.getByRole('button', { name: `${button} ${of}` }).click();
    await modal.locator('ion-input[formcontrolname=name] input').fill(name);
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(card(name)).toBeVisible();
    await expect(modal.locator('form')).toHaveCount(0); // closed, so the canvas gets the keys again
  }

  await expect(card('Ada Admin')).toBeVisible();
  await addRelative('Ada Admin', 'Add parent of', 'Father');
  await addRelative('Ada Admin', 'Add spouse of', 'Partner');
  // A child with a spouse asks for the other parent first.
  await bringIntoView('Ada Admin');
  await card('Ada Admin')
    .locator('ion-card')
    .click({ position: { x: 20, y: 200 } });
  await page.getByRole('button', { name: 'Add child of Ada Admin' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'OK' }).click();
  await modal.locator('ion-input[formcontrolname=name] input').fill('Kid');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(card('Kid')).toBeVisible();
  await expect(modal.locator('form')).toHaveCount(0);
  await addRelative('Father', 'Add parent of', 'Grandfather');

  // Parents are drawn above, children below, joined by lines.
  const y = async (name: string) => (await card(name).boundingBox())!.y;
  expect(await y('Father')).toBeLessThan(await y('Ada Admin'));
  expect(await y('Kid')).toBeGreaterThan(await y('Ada Admin'));
  await expect(page.locator('.lines path')).toHaveCount(6);

  // Saved: the same tree after a reload.
  await page.reload();
  await expect(card('Grandfather')).toBeVisible();
  await expect(card('Kid')).toBeVisible();

  // Removing the only link to Father (and Grandfather) is refused.
  await page.getByRole('button', { name: 'Edit Ada Admin' }).click();
  await modal.getByRole('button', { name: 'Remove relationship with Father' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Remove' }).click();
  await expect(modal.getByText('only connection to 2 people')).toBeVisible();
  // Removing the spouse works: the child keeps both parents.
  await modal.getByRole('button', { name: 'Remove relationship with Partner' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Remove' }).click();
  await expect(modal.getByRole('button', { name: 'Remove relationship with Partner' })).toBeHidden();
  await modal.getByRole('button', { name: 'Cancel' }).click();

  // Deleting Father also deletes Grandfather, who is only connected through him.
  await bringIntoView('Father');
  await page.getByRole('button', { name: 'Edit Father' }).click();
  await modal.getByRole('button', { name: 'Delete person' }).click();
  await expect(page.locator('ion-alert')).toContainText('Grandfather');
  await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
  await expect(card('Father')).toBeHidden();
  await expect(card('Grandfather')).toBeHidden();
  await expect(card('Kid')).toBeVisible();
});

test('family tree: up to 5 photos per person, browsed with arrows and removable', async ({ page }) => {
  await login(page, 'admin@generations.test');
  const me = page.locator('app-person-card', { has: page.getByRole('heading', { name: 'Ada Admin', exact: true }) });
  const file = me.locator('input[type=file]');
  await expect(me.getByRole('button', { name: 'Add photo of Ada Admin' })).toBeVisible();

  for (let i = 1; i <= 5; i++) {
    await file.setInputFiles('public/og-image.jpg');
    await expect(me.getByRole('img', { name: `Photo ${i} of Ada Admin` })).toBeVisible();
  }
  // Shrunk in the browser before saving.
  const src = await me.locator('.photo img').getAttribute('src');
  expect(src!.length).toBeLessThan(100_000);
  await me.locator('ion-card').click({ position: { x: 20, y: 250 } });
  await expect(me.getByRole('button', { name: 'Add photo of Ada Admin' })).toBeHidden(); // 5 is the limit

  await me.getByRole('button', { name: 'Next photo' }).click();
  await expect(me.getByRole('img', { name: 'Photo 1 of Ada Admin' })).toBeVisible();
  await me.getByRole('button', { name: 'Previous photo' }).click();
  await expect(me.getByRole('img', { name: 'Photo 5 of Ada Admin' })).toBeVisible();

  // Saved: after a reload the first photo loads again.
  await page.reload();
  await expect(me.getByRole('img', { name: 'Photo 1 of Ada Admin' })).toBeVisible();

  await me.locator('ion-card').click({ position: { x: 20, y: 250 } });
  await me.getByRole('button', { name: 'Remove this photo' }).click();
  await expect(me.locator('.dots span')).toHaveCount(4);
  await expect(me.getByRole('button', { name: 'Add photo of Ada Admin' })).toBeVisible();
});

test('family tree: loads the nearest 10 people first, then more while exploring', async ({ page }) => {
  // Seed 20 generations of ancestors above the test user's own card.
  const { localId: uid } = await lookup('user@generations.test');
  const base = 'http://127.0.0.1:8080/v1/projects/demo-generations/databases/(default)/documents';
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const ids = (list: string[]) => ({ arrayValue: { values: list.map((stringValue) => ({ stringValue })) } });
  const put = (id: string, fields: Record<string, unknown>, mask = '') =>
    fetch(`${base}/trees/${uid}/people/${id}${mask}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  await put(
    uid,
    {
      name: { stringValue: 'Test User' },
      parents: ids(['a1']),
      updatedAt: { timestampValue: new Date().toISOString() },
    },
    '?updateMask.fieldPaths=name&updateMask.fieldPaths=parents&updateMask.fieldPaths=updatedAt',
  );
  for (let i = 1; i <= 20; i++) {
    await put(`a${i}`, {
      name: { stringValue: `Ancestor ${i}` },
      children: ids([i === 1 ? uid : `a${i - 1}`]),
      ...(i < 20 && { parents: ids([`a${i + 1}`]) }),
      updatedAt: { timestampValue: new Date().toISOString() },
    });
  }

  await login(page, 'user@generations.test');
  const cards = page.locator('app-person-card');
  await expect(page.getByRole('heading', { name: 'Ancestor 9', exact: true })).toBeAttached();
  // Own card + 9 ancestors; the 10th is a placeholder until it comes near the screen.
  await expect(cards).toHaveCount(10);
  await expect(page.locator('.ghost')).toHaveCount(1);

  // Zooming out brings more of the tree near the screen, so more loads.
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => cards.count()).toBeGreaterThan(10);
  // Panning up reaches the oldest generation.
  const canvas = page.locator('.tree-canvas');
  for (let i = 0; i < 40; i++) await canvas.press('ArrowUp');
  await expect(page.getByRole('heading', { name: 'Ancestor 20', exact: true })).toBeAttached();

  // Deleting checks the whole tree, so the warning names everyone who would go.
  await page.reload();
  await expect(cards).toHaveCount(10);
  await page.getByRole('button', { name: 'Edit Ancestor 1' }).dispatchEvent('click'); // above the screen
  await page.locator('ion-modal').getByRole('button', { name: 'Delete person' }).click();
  await expect(page.locator('ion-alert')).toContainText('Ancestor 20');
  await expect(page.locator('ion-alert')).toContainText('19 people');
  await page.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click();
});
