import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * Look & feel capture harness for the Analyses studio overhaul.
 * Login → open the seeded "Clinical Encounters Analysis" editor → ensure a
 * couple of named tabs exist (so the folder-tab strip renders) → screenshot
 * the tab strip, toolbar, a rendered chart card, and the right rail.
 *
 * PHASE is read from env: BEFORE or AFTER — just prefixes the shot names.
 */

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg';
const USER = 'administrator';
const PASS = 'Pass@1234';
const ANALYSIS_ID = 'f1fac3f3-f1b3-4410-ae96-d1b77a1f9fe6';
const PHASE = (process.env.LF_PHASE || 'before').toLowerCase();

const log: string[] = [];

async function shot(page: Page, name: string) {
  try {
    await page.screenshot({ path: `${SHOTS}/lf-${PHASE}-${name}.png`, fullPage: false });
  } catch {}
}

async function shotEl(page: Page, selector: string, name: string) {
  try {
    const el = page.locator(selector).first();
    if (await el.count()) {
      await el.screenshot({ path: `${SHOTS}/lf-${PHASE}-${name}.png` });
      return true;
    }
  } catch {}
  return false;
}

test('lookfeel — capture analyses studio chrome', async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app|\/relay|\/home|\/dashboard/, { timeout: 45000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  await page.goto(`/app/analyses/${ANALYSIS_ID}/edit`, { waitUntil: 'networkidle' });
  // Wait for the dataset to finish loading (status flips to loaded) so the
  // canvas + charts actually render before we screenshot. Fall back after a
  // generous timeout so a slow/errored load still captures chrome.
  await page
    .waitForSelector('.a-status__dot--loaded', { timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(3500);
  log.push(`url=${page.url()}`);

  // Make sure Fields + Visuals panels are open.
  for (const label of [/fields/i, /visuals/i]) {
    const btn = page.locator('.a-segment__btn', { hasText: label }).first();
    if (await btn.count()) {
      const cls = await btn.getAttribute('class');
      if (!/is-active/.test(cls || '')) await btn.click().catch(() => {});
    }
  }
  await page.waitForTimeout(1000);

  // Ensure at least two named tabs so the folder-tab strip is visible.
  let tabCount = await page.locator('.analysis-tab').count();
  log.push(`initial tabs=${tabCount}`);
  while (tabCount < 2) {
    // Either the labelled empty-strip add, or the compact "+" add.
    const compactAdd = page.locator('.analysis-tab-add:not(.analysis-tab-add--labelled)').first();
    const labelledAdd = page.locator('.analysis-tab-add.analysis-tab-add--labelled').first();
    if (await compactAdd.count()) {
      await compactAdd.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      const nameInput = page.locator('input.add-tab-name').first();
      if (await nameInput.count()) {
        await nameInput.fill(tabCount === 0 ? 'Overview' : 'Detail').catch(() => {});
        const addBtn = page.locator('.add-tab-btn.primary').first();
        await addBtn.click({ timeout: 4000 }).catch(() => {});
      }
    } else if (await labelledAdd.count()) {
      await labelledAdd.click({ timeout: 5000 }).catch(() => {});
    } else {
      break;
    }
    await page.waitForTimeout(1200);
    const next = await page.locator('.analysis-tab').count();
    if (next === tabCount) break;
    tabCount = next;
  }
  log.push(`tabs after seeding=${tabCount}`);

  await page.waitForTimeout(1000);
  await shot(page, 'full-empty-firsttab');
  await shotEl(page, '.empty-state', 'empty');

  // Build one bar visual so a rendered chart card + encoding pills appear.
  const addVisual = page
    .locator('button, .add-visual-button, [class*="add-visual"]')
    .filter({ hasText: /add visual/i })
    .first();
  await addVisual.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const barCard = page.locator('.chart-type-card').filter({ hasText: /bar chart/i }).first();
  await barCard.scrollIntoViewIfNeeded().catch(() => {});
  await barCard.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  for (const m of [
    { role: /x[- ]?axis/i, field: 'department' },
    { role: /y[- ]?axis/i, field: 'total_charge' },
  ]) {
    const slot = page.locator('.axis-slot').filter({ hasText: m.role }).first();
    await slot.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page
      .locator('.field-card')
      .filter({ hasText: new RegExp('^\\s*' + m.field + '\\s*$', 'i') })
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2000);

  await shot(page, 'full');
  await shotEl(page, '.analysis-tab-strip', 'tabstrip');
  await shotEl(page, '.a-toolbar', 'toolbar');
  await shotEl(page, '.visual-box', 'card');
  await shotEl(page, '.axis-slot.has-value', 'well-pill');

  // A rendered chart card (focus the first layer so config sidebar opens too).
  const firstLayer = page.locator('.visual-list-item').first();
  if (await firstLayer.count()) {
    await firstLayer.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  await shot(page, 'full-focused');
  await shotEl(page, '.visual-box', 'card');
  await shotEl(page, 'app-visual-config-sidebar', 'rightrail');
  await shotEl(page, '.datasource-sidebar', 'leftrail');

  // Empty-state: switch to the second (empty) tab if present.
  const tabs = page.locator('.analysis-tab');
  if ((await tabs.count()) >= 2) {
    await tabs.nth(1).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shotEl(page, '.empty-state', 'empty');
    await shot(page, 'full-empty');
    // back to first
    await tabs.nth(0).click().catch(() => {});
    await page.waitForTimeout(800);
  }

  fs.writeFileSync(`${SHOTS}/../lookfeel-${PHASE}.json`, JSON.stringify({ log }, null, 2));
  console.log('=== LOOKFEEL ' + PHASE + ' ===\n' + JSON.stringify(log, null, 2));
  expect(log.length).toBeGreaterThan(0);
});
