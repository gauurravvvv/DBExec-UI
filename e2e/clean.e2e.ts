import { test, expect, Page } from '@playwright/test';

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg';
const USER = 'administrator';
const PASS = 'Pass@1234';
const ANALYSIS_ID = 'f1fac3f3-f1b3-4410-ae96-d1b77a1f9fe6';

async function shot(page: Page, name: string) {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  } catch {}
}

test('clean good-bar maximized capture', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app|\/home/, { timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.goto(`/app/analyses/${ANALYSIS_ID}/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);

  // Open panels.
  for (const label of [/fields/i, /visuals/i]) {
    const btn = page.locator('.a-segment__btn', { hasText: label }).first();
    if (await btn.count()) {
      const cls = await btn.getAttribute('class');
      if (!/is-active/.test(cls || '')) await btn.click().catch(() => {});
    }
  }
  await page.waitForTimeout(500);

  // Build: bar department → total_charge.
  await page.locator('button, .add-visual-button').filter({ hasText: /add visual/i }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.chart-type-card').filter({ hasText: /bar chart/i }).first().click();
  await page.waitForTimeout(700);
  for (const [role, field] of [[/x[- ]?axis/i, 'department'], [/y[- ]?axis/i, 'total_charge']] as const) {
    await page.locator('.axis-slot').filter({ hasText: role }).first().click().catch(() => {});
    await page.waitForTimeout(350);
    await page.locator('.field-card').filter({ hasText: new RegExp('^\\s*' + field + '\\s*$', 'i') }).first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  // SUM via Y pill.
  const pill = page.locator('.axis-value__pill').last();
  if (await pill.count()) {
    await pill.click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('.pill-menu__item').filter({ hasText: /^\s*sum\s*$/i }).first().click().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
  await page.waitForTimeout(1500);

  // Close the Properties panel if open.
  await page.locator('.close-btn').first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Maximize the (only / first) bar visual.
  await page.locator('.maximize-icon').first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, 'clean-good-bar-maximized');

  // Also hover a bar to surface the tooltip formatting.
  const box = page.locator('.maximized-visual-container canvas').first();
  if (await box.count()) {
    const bb = await box.boundingBox();
    if (bb) {
      await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.6);
      await page.waitForTimeout(800);
      await shot(page, 'clean-good-bar-tooltip');
    }
  }
  expect(true).toBeTruthy();
});
