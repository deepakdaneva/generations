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
  await page.locator('input[type=file]').setInputFiles('public/og-image.jpg');
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
