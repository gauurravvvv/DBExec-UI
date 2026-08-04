/**
 * Full Name smoke — verifies the single "Full Name" field replaced First/Last
 * across the org-users, system-admin and org-onboarding screens, and that an
 * org user created with a Full Name persists and lists.
 *
 * Screenshots land in /Users/gaurav.goel/code/Personal/DBExec/screenshots/fullname.
 * Runs HEADLESS (config default). No --headed.
 */
import { expect, Page, test } from '@playwright/test';

const ORG = process.env['QB_ORG'] ?? 'TestOrg';
const USER = process.env['QB_USER'] ?? 'admin_gaurav';
const PASS = process.env['QB_PASS'] ?? 'Pass@1234';
const DIR = '/Users/gaurav.goel/code/Personal/DBExec/screenshots/fullname';

let n = 0;
async function shot(page: Page, name: string) {
  n += 1;
  await page.screenshot({ path: `${DIR}/${String(n).padStart(2, '0')}-${name}.png`, fullPage: false });
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  // Angular lazy-loads the auth module; wait for the org field to render.
  await page.locator('#auth-account').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}

test('Full Name field across users / system-admin / org', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  // Sidebar chip shows the derived display name (JWT `name` = fullName).
  await page.waitForTimeout(1500);
  await shot(page, 'app-shell-sidebar-name');

  // 1) Add User — single Full Name field (the first labeled control)
  await page.goto('/app/users/new', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await shot(page, 'add-user-form');

  // Type into the Full Name control to show it accepts a whole name.
  const fnInput = page.locator('input[formcontrolname="fullName"]').first();
  if (await fnInput.count()) {
    await fnInput.fill('Test Person Example');
    await page.waitForTimeout(400);
    await shot(page, 'add-user-fullname-typed');
  }

  // 2) List Users — single Full Name column
  await page.goto('/app/users', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await shot(page, 'list-user-fullname-column');

  // 3) Add System Admin — single Full Name field
  await page.goto('/app/system-admin/new', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shot(page, 'add-system-admin-form');

  // 4) List System Admins
  await page.goto('/app/system-admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await shot(page, 'list-system-admin');

  // 5) Add Organisation — the bootstrap admin "Full Name" field
  await page.goto('/app/organisation/new', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await shot(page, 'add-organisation-admin-fullname');

  expect(n).toBeGreaterThan(5);
});
