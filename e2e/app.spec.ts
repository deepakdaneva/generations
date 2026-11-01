import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Runs against the Firebase emulators started by playwright.config.ts.
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PASSWORD = 'Passw0rd!';
const FIRESTORE_DOCS = 'http://127.0.0.1:8080/v1/projects/demo-generations/databases/(default)/documents';
/** The emulators' built-in admin token; it bypasses security rules. */
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execFileSync('node', ['scripts/seed-emulators.mjs'], { stdio: 'inherit' });
});

/**
 * A new, verified, active account with an empty family tree. Tests that build
 * a tree use their own account, so a retried test starts from a clean tree.
 */
async function freshUser(displayName: string): Promise<string> {
  const email = `tree-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@generations.test`;
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/demo-generations/accounts`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ email, password: PASSWORD, displayName, emailVerified: true }),
  });
  const { localId } = (await res.json()) as { localId: string };
  await fetch(`${FIRESTORE_DOCS}/users/${localId}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({
      fields: {
        email: { stringValue: email },
        displayName: { stringValue: displayName },
        role: { stringValue: 'user' },
        active: { booleanValue: true },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
  return email;
}

/** Picks an option of an ion-select (popover interface) in the open modal. */
async function choose(page: Page, control: string, option: string) {
  await page.locator(`ion-modal ion-select[formcontrolname=${control}]`).click();
  const popover = page.locator('ion-popover.select-popover');
  await popover.getByRole('radio', { name: option, exact: true }).click();
  await expect(popover).toHaveCount(0);
}

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
  await page.getByText(email, { exact: true }).click(); // not the toast that also names it
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
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Logout').click();
  await expect(page).toHaveURL(/\/login$/); // signed out before the next sign-in

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
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.getByText(email, { exact: true }).click(); // not the toast that also names it
  await page.getByRole('button', { name: 'Deactivate account' }).click();
  await expect(page.locator('ion-item', { hasText: email }).getByText('Inactive')).toBeVisible();

  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Logout').click();
  await expect(page).toHaveURL(/\/login$/); // signed out before the next sign-in

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
  // On slow machines the first click can land before the picker's script is
  // ready and do nothing, so click until the form appears.
  await expect(async () => {
    await popup.locator('#add-account-button button').click();
    await expect(popup.locator('#email-input')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
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

  await expect(page).toHaveURL(/\/settings$/);
  await page.reload();
  await expect(html).toHaveClass(/ion-palette-dark/);

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
  await expect(page).toHaveURL(/\/login$/); // signed out before the next sign-in
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.locator('ion-alert input').fill('user@generations.test');
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText("You've already requested 2 reset links")).toBeVisible();

  // Picture stays visible in the profile menu after signing in again.
  await login(page, 'user@generations.test');
  await expect(page.locator('app-person-card')).toBeVisible();
  // The own card has no tree photos, so it shows the profile picture.
  await expect(page.locator('app-person-card').getByRole('img', { name: /^Profile picture of / })).toBeVisible();
  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await expect(page.locator('ion-popover ion-item ion-avatar img')).toBeVisible();
});

test('family tree: own card can be edited and the canvas panned and zoomed', async ({ page }) => {
  await login(page, await freshUser('Admin'));
  const card = page.locator('app-person-card');
  await expect(ownCard(page, 'Admin')).toBeVisible();

  await page.getByRole('button', { name: 'Edit Admin' }).click();
  const modal = page.locator('ion-modal');
  await modal.locator('ion-input[formcontrolname=name] input').fill('Ada Admin');
  await modal.locator('ion-input[formcontrolname=birth] input').fill('1990-04-01');
  await modal.getByRole('button', { name: 'Add link' }).click();
  await modal.locator('ion-input[formcontrolname=value] input').fill('@ada');
  // Gender is required: it decides the card's tint and the relationship labels.
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(modal.getByText('Choose a gender')).toBeVisible();
  await choose(page, 'gender', 'Female');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(ownCard(page, 'Ada Admin')).toBeVisible();
  await expect(card.locator('ion-card.female')).toHaveCount(1); // pink tint
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

/** Family-tree canvas helpers: find cards, pan to them, add relatives through their buttons. */
function treeHelpers(page: Page) {
  const card = (name: string) =>
    page.locator('app-person-card', { has: page.getByRole('heading', { name, exact: true }) });
  const modal = page.locator('ion-modal');
  /** Pans with the arrow keys (60 px each) until the card is near the middle of the screen. */
  async function bringIntoView(name: string) {
    // A closing modal still holds the keyboard focus; wait until it is gone.
    await expect(modal.locator('form')).toHaveCount(0);
    const canvas = page.locator('.tree-canvas');
    await canvas.focus();
    // Measure again after every step: cards can still move after a re-layout.
    await expect(async () => {
      const box = (await card(name).boundingBox())!;
      const size = page.viewportSize()!;
      const dx = size.width / 2 - (box.x + box.width / 2);
      const dy = size.height / 2 - (box.y + box.height / 2);
      if (Math.abs(dx) > 60) await canvas.press(dx > 0 ? 'ArrowLeft' : 'ArrowRight');
      if (Math.abs(dy) > 60) await canvas.press(dy > 0 ? 'ArrowUp' : 'ArrowDown');
      expect(Math.abs(dx) <= 60 && Math.abs(dy) <= 60).toBe(true);
    }).toPass({ intervals: [50], timeout: 30_000 });
  }
  /** Shows a card's buttons (a tap, as on touch screens), clicks one, fills the name and saves. */
  async function addRelative(of: string, button: string, name: string, gender = 'Male') {
    await bringIntoView(of);
    await card(of).locator('ion-card').dispatchEvent('pointerdown', { pointerType: 'touch' });
    await page.getByRole('button', { name: `${button} ${of}` }).click();
    await modal.locator('ion-input[formcontrolname=name] input').fill(name);
    await choose(page, 'gender', gender);
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(card(name)).toBeVisible();
    await expect(modal.locator('form')).toHaveCount(0); // closed, so the canvas gets the keys again
  }
  /** The relationship label on the line above a card. */
  const label = (name: string) =>
    page
      .locator('.household', { has: card(name) })
      .locator('.relation')
      .first();
  return { card, modal, bringIntoView, addRelative, label };
}

test('family tree: add relatives, remove a relationship and delete a person', async ({ page }) => {
  test.slow(); // many steps; slower CI runners need more than the default 30 s
  await login(page, await freshUser('Ada Admin'));
  const { card, modal, bringIntoView, addRelative, label } = treeHelpers(page);

  await expect(card('Ada Admin')).toBeVisible();
  await addRelative('Ada Admin', 'Add parent of', 'Father');
  await addRelative('Ada Admin', 'Add spouse of', 'Partner');
  // Married to someone alive: no heart button for another spouse.
  await expect(page.getByRole('button', { name: 'Add spouse of Ada Admin' })).toHaveCount(0);
  // A child with a spouse asks for the other parent first.
  await bringIntoView('Ada Admin');
  await card('Ada Admin').locator('ion-card').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.getByRole('button', { name: 'Add child of Ada Admin' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'OK' }).click();
  await modal.locator('ion-input[formcontrolname=name] input').fill('Kid');
  await choose(page, 'gender', 'Male');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(card('Kid')).toBeVisible();
  await expect(modal.locator('form')).toHaveCount(0);
  await expect(card('Kid').locator('ion-card.male')).toHaveCount(1); // blue tint
  await expect(label('Kid')).toHaveText('Son');
  await addRelative('Father', 'Add parent of', 'Grandfather');

  // Parents are drawn above, children below, joined by lines.
  const y = async (name: string) => (await card(name).boundingBox())!.y;
  expect(await y('Father')).toBeLessThan(await y('Ada Admin'));
  expect(await y('Kid')).toBeGreaterThan(await y('Ada Admin'));
  await expect(page.locator('.lines path.line')).toHaveCount(7); // the child's line comes from both parents

  // Birth order: a new eldest child is drawn left of the younger one.
  await bringIntoView('Ada Admin');
  await card('Ada Admin').locator('ion-card').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.getByRole('button', { name: 'Add child of Ada Admin' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'OK' }).click();
  await modal.locator('ion-input[formcontrolname=name] input').fill('Elder');
  await choose(page, 'gender', 'Female');
  await choose(page, 'order', '1st child (eldest)');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(card('Elder')).toBeVisible();
  await expect(modal.locator('form')).toHaveCount(0);
  await expect(label('Elder')).toHaveText('Daughter');
  const x = async (name: string) => (await card(name).boundingBox())!.x;
  await expect.poll(async () => (await x('Elder')) < (await x('Kid'))).toBe(true);

  // Saved: the same tree after a reload.
  await page.reload();
  await expect(card('Grandfather')).toBeVisible();
  await expect(card('Kid')).toBeVisible();

  // Removing the only link to Father (and Grandfather) is refused.
  await bringIntoView('Ada Admin');
  await page.getByRole('button', { name: 'Edit Ada Admin' }).click();
  await modal.getByRole('button', { name: 'Remove relationship with Father' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Remove' }).click();
  await expect(modal.getByText('only connection to 2 people')).toBeVisible();
  // Removing the spouse works: the child keeps both parents.
  await modal.getByRole('button', { name: 'Remove relationship with Partner' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Remove' }).click();
  await expect(modal.getByRole('button', { name: 'Remove relationship with Partner' })).toBeHidden();
  await modal.getByRole('button', { name: 'Cancel' }).click();

  // Birth order can also be changed when editing: Kid becomes the eldest.
  await bringIntoView('Kid');
  await page.getByRole('button', { name: 'Edit Kid' }).click();
  await choose(page, 'order', '1st child (eldest)');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(modal.locator('form')).toHaveCount(0);
  await expect.poll(async () => (await x('Kid')) < (await x('Elder'))).toBe(true);

  // Clicking a card opens the profile (on touch, after a first tap that shows its buttons); its
  // relatives open theirs, and edit opens the form.
  await card('Kid').locator('ion-card').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await card('Kid').locator('ion-card-title').click();
  const profile = page.locator('ion-modal.profile');
  await expect(profile.getByRole('heading', { name: 'Kid', exact: true })).toBeVisible();
  await expect(profile.getByText('Son of Ada Admin')).toBeVisible();
  await profile.getByRole('button', { name: /^Open Ada Admin, / }).click();
  await expect(profile.getByRole('heading', { name: 'Ada Admin', exact: true })).toBeVisible();
  await profile.getByRole('button', { name: 'Edit Ada Admin' }).click();
  await expect(modal.locator('form')).toBeVisible();
  await modal.getByRole('button', { name: 'Cancel' }).click();
  await expect(modal.locator('form')).toHaveCount(0);

  // A date of death marks the card: ribbon and "In loving memory".
  await bringIntoView('Grandfather');
  await page.getByRole('button', { name: 'Edit Grandfather' }).click();
  await modal.locator('ion-input[formcontrolname=birth] input').fill('1920-05-01');
  await modal.locator('ion-input[formcontrolname=death] input').fill('1990-04-30');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(card('Grandfather').locator('.memorial')).toHaveText(/In loving memory · aged 69/);
  // Someone who has died gets no new spouse.
  await expect(page.getByRole('button', { name: 'Add spouse of Grandfather' })).toHaveCount(0);

  // Only people at the end of a branch can be deleted: not Father (parents and
  // children), but Grandfather (the top of the line).
  await expect(modal.locator('form')).toHaveCount(0);
  await bringIntoView('Father');
  await page.getByRole('button', { name: 'Edit Father' }).click();
  await expect(modal.getByRole('button', { name: 'Delete person' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Cancel' }).click();
  await expect(modal.locator('form')).toHaveCount(0);
  await bringIntoView('Grandfather');
  await page.getByRole('button', { name: 'Edit Grandfather' }).click();
  await modal.getByRole('button', { name: 'Delete person' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
  await expect(card('Grandfather')).toBeHidden();
  await expect(card('Father')).toBeVisible();
});

test('family tree: two brothers marry two sisters; a parent already in the tree is linked; crossings show a gap', async ({
  page,
}) => {
  test.slow(); // many steps; slower CI runners need more than the default 30 s
  await login(page, await freshUser('Sam'));
  const { card, modal, bringIntoView, addRelative, label } = treeHelpers(page);
  await expect(card('Sam')).toBeVisible();
  await addRelative('Sam', 'Add sibling right of', 'Brother');
  await addRelative('Sam', 'Add spouse of', 'Dia', 'Female');
  await addRelative('Dia', 'Add parent of', 'Her father');
  await addRelative('Brother', 'Add spouse of', 'Dora', 'Female');

  // Dora is Dia's sister: link her to Dia's father, who is already in the tree
  // one generation up. The spouse form offers no such choice.
  await bringIntoView('Dora');
  await card('Dora').locator('ion-card').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.getByRole('button', { name: 'Add parent of Dora' }).click();
  await modal.locator('ion-segment-button[value=existing]').click();
  await expect(modal.getByRole('radio')).toHaveCount(1); // only Her father: not Brother's (absent) parents, nobody else
  await modal.locator('ion-searchbar input').fill('Her');
  await modal.getByRole('radio', { name: /Her father/ }).click();
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(modal.locator('form, ion-searchbar')).toHaveCount(0);

  // Dora stays beside Brother and gets the line from her father.
  await expect(page.locator('.household', { has: card('Brother') }).locator('app-person-card')).toHaveCount(2);
  await expect(
    page
      .locator('.household', { has: card('Dora') })
      .locator('.relation')
      .last(),
  ).toHaveText('Daughter');
  await expect(label('Sam')).toHaveText('Sibling'); // Sam and Brother: siblings without known parents
  // Every line has a gap band under it; hovering a couple highlights their families' lines.
  await expect(page.locator('.lines path.gap')).toHaveCount(await page.locator('.lines path.line').count());
  await card('Brother').hover();
  await expect(page.locator('.lines g.highlight').first()).toBeAttached();
});

test('family tree: up to 5 photos per person, browsed with arrows and removable', async ({ page }) => {
  await login(page, await freshUser('Ada Admin'));
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
  await me.locator('ion-card').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await expect(me.getByRole('button', { name: 'Add photo of Ada Admin' })).toBeHidden(); // 5 is the limit

  await me.getByRole('button', { name: 'Next photo' }).click();
  await expect(me.getByRole('img', { name: 'Photo 1 of Ada Admin' })).toBeVisible();
  await me.getByRole('button', { name: 'Previous photo' }).click();
  await expect(me.getByRole('img', { name: 'Photo 5 of Ada Admin' })).toBeVisible();

  // Saved: after a reload the first photo loads again.
  await page.reload();
  await expect(me.getByRole('img', { name: 'Photo 1 of Ada Admin' })).toBeVisible();

  await me.locator('ion-card').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await me.getByRole('button', { name: 'Remove this photo' }).click();
  await expect(me.locator('.dots span')).toHaveCount(4);
  await expect(me.getByRole('button', { name: 'Add photo of Ada Admin' })).toBeVisible();
});

test('family tree: loads the nearest 10 people first, then more while exploring', async ({ page }) => {
  test.slow(); // many steps; slower CI runners need more than the default 30 s
  // Seed 20 generations of ancestors above a new user's own card.
  const email = await freshUser('Test User');
  const { localId: uid } = await lookup(email);
  const ids = (list: string[]) => ({ arrayValue: { values: list.map((stringValue) => ({ stringValue })) } });
  const put = (id: string, fields: Record<string, unknown>, mask = '') =>
    fetch(`${FIRESTORE_DOCS}/trees/${uid}/people/${id}${mask}`, {
      method: 'PATCH',
      headers: OWNER,
      body: JSON.stringify({ fields }),
    });
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

  await login(page, email);
  const cards = page.locator('app-person-card');
  await expect(page.getByRole('heading', { name: 'Ancestor 9', exact: true })).toBeAttached();
  // Own card + 9 ancestors; the 10th is a placeholder until it comes near the screen.
  await expect(cards).toHaveCount(10);
  await expect(page.locator('.ghost')).toHaveCount(1);

  // Zooming out and moving up brings more of the tree near the screen, so more loads.
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  const canvas = page.locator('.tree-canvas');
  for (let i = 0; i < 10; i++) await canvas.press('ArrowUp');
  await expect.poll(() => cards.count()).toBeGreaterThan(10);
  // Panning further up reaches the oldest generation.
  for (let i = 0; i < 50; i++) await canvas.press('ArrowUp');
  await expect(page.getByRole('heading', { name: 'Ancestor 20', exact: true })).toBeAttached();

  // Deleting checks the whole tree: a person in the middle of the line can't be deleted.
  await page.reload();
  await expect(cards).toHaveCount(10);
  await page.getByRole('button', { name: 'Edit Ancestor 1' }).dispatchEvent('click'); // above the screen
  await expect(page.locator('ion-modal').getByRole('button', { name: 'Delete person' })).toHaveCount(0);
});

test('family tree: "Remember last position" reopens where the user left, only when turned on', async ({ page }) => {
  test.slow(); // many steps; slower CI runners need more than the default 30 s
  const email = await freshUser('Ada Admin');
  const { localId: uid } = await lookup(email);
  const settingsDoc = `${FIRESTORE_DOCS}/trees/${uid}`;
  const savedZoom = async () => {
    const res = await fetch(settingsDoc, { headers: { Authorization: 'Bearer owner' } });
    const doc = (await res.json()) as { fields?: { view?: { mapValue: { fields: { z: { doubleValue?: number } } } } } };
    return doc.fields?.view?.mapValue.fields.z.doubleValue;
  };
  const remembered = async () => {
    const res = await fetch(settingsDoc, { headers: { Authorization: 'Bearer owner' } });
    return ((await res.json()) as { fields?: { rememberView?: { booleanValue: boolean } } }).fields?.rememberView
      ?.booleanValue;
  };
  const me = page.locator('app-person-card', { has: page.getByRole('heading', { name: 'Ada Admin', exact: true }) });
  const canvas = page.locator('.tree-canvas');
  const box = async () => {
    const b = (await me.boundingBox())!;
    return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width) };
  };
  const relogin = async () => {
    await page.getByRole('button', { name: 'Profile menu' }).last().click();
    await page.getByText('Logout').click();
    await expect(page).toHaveURL(/\/login$/); // signed out before the next sign-in
    await login(page, email);
    await expect(me).toBeVisible();
  };

  // Off by default: the canvas opens centered on the own card.
  await login(page, email);
  await expect(me).toBeVisible();
  const centered = await box();

  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Settings').click();
  const toggle = page.getByRole('switch', { name: /Remember last position/ });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect.poll(remembered).toBe(true);

  // Move away and zoom out; the position is saved shortly after moving stops.
  await page.goto('/home');
  await expect(me).toBeVisible();
  for (let i = 0; i < 3; i++) await canvas.press('ArrowLeft');
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(savedZoom).toBe(0.8);
  const moved = await box();
  expect(moved).not.toEqual(centered);

  await relogin();
  await expect.poll(box).toEqual(moved);

  // Turned off: back to the own card in the middle.
  await page.getByRole('button', { name: 'Profile menu' }).last().click();
  await page.getByText('Settings').click();
  await page.getByRole('switch', { name: /Remember last position/ }).click();
  await expect(page.getByRole('switch', { name: /Remember last position/ })).not.toBeChecked();
  await expect.poll(savedZoom).toBeUndefined();
  await page.goto('/home');
  await relogin();
  await expect.poll(box).toEqual(centered);
});

test('admins are notified of new accounts, and approve them from the notification', async ({ page }) => {
  test.slow(); // several sign-ins
  // A new, verified account signs in for the first time: the app creates its
  // inactive profile and, with it, the approval request for the admins.
  const email = `new-${Date.now()}@generations.test`;
  await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/demo-generations/accounts`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ email, password: PASSWORD, displayName: 'Nora New', emailVerified: true }),
  });
  await login(page, email);
  await expect(page.getByText("Your account isn't active")).toBeVisible();

  // The admin's bell counts it (other tests may have left requests too).
  await login(page, 'admin@generations.test');
  const bell = page.getByRole('button', { name: /^Notifications/ }).filter({ visible: true });
  await expect(bell).toHaveAccessibleName(/Notifications, \d+ new/);
  const count = Number(/(\d+) new/.exec((await bell.getAttribute('aria-label')) ?? '')![1]);
  const badge = (n: number) => (n ? `Notifications, ${n} new` : 'Notifications');

  await bell.click();
  const item = page.locator('ion-popover ion-item', { hasText: 'Nora New wants to join' });
  await expect(item).toHaveClass(/\bnew\b/);
  await item.click();
  const details = page.locator('ion-modal', { hasText: 'New account' });
  await expect(details.getByText(`(${email})`)).toBeVisible();
  await details.getByRole('button', { name: 'Approve' }).click();
  await expect(details.getByText(/Approved\s+by you/)).toBeVisible();
  await expect(details.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await expect(details.getByRole('button', { name: 'Reject' })).toBeDisabled();
  await details.getByRole('button', { name: 'Close' }).click();
  // Opened and acted on: one less on the badge.
  await expect(bell).toHaveAccessibleName(badge(count - 1));

  // Still listed, no longer highlighted; opening it again keeps the buttons off,
  // and the name leads to the user on the Users page.
  await bell.click();
  await expect(item).not.toHaveClass(/\bnew\b/);
  await expect(item).toContainText('Approved');
  await item.click();
  await expect(details.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await details.getByRole('link', { name: 'Nora New' }).click();
  await expect(page).toHaveURL(/\/users/);
  await expect(page.locator('ion-action-sheet')).toContainText('Nora New');
  await page.locator('ion-action-sheet').getByRole('button', { name: 'Cancel' }).click();

  // Approved: the new user can sign in.
  await page.getByRole('button', { name: 'Profile menu' }).filter({ visible: true }).click();
  await page.getByText('Logout').click();
  await expect(page).toHaveURL(/\/login$/); // signed out before the next sign-in
  await login(page, email);
  await expect(page).toHaveURL(/\/home$/);
});
