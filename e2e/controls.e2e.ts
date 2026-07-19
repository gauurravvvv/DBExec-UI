import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * Critical walkthrough of the Properties-panel controls + tab strip.
 * Clicks through Color Scheme / Trend line / Quick calc / Compare / Sort /
 * Reference line / Top-N and the tab actions, watching for console + network
 * errors and screenshotting each. Tolerant (a failed step logs + continues).
 */

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg';
const USER = 'administrator';
const PASS = 'Pass@1234';
const ANALYSIS_ID = 'f1fac3f3-f1b3-4410-ae96-d1b77a1f9fe6';

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const netErrors: string[] = [];
const log: string[] = [];

function wire(page: Page) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => pageErrors.push((e.message || String(e)).slice(0, 400)));
  page.on('response', (r) => {
    if (r.status() >= 400) {
      const u = r.url();
      if (u.includes('primeicons.css')) return;
      netErrors.push(`${r.status()} ${r.request().method()} ${u.slice(0, 200)}`);
    }
  });
}

async function shot(page: Page, name: string) {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  } catch {}
}
async function step(page: Page, label: string, fn: () => Promise<void>) {
  try { await fn(); log.push(`OK   ${label}`); }
  catch (e: any) { log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 200)}`); }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}

test('controls walkthrough', async ({ page }) => {
  test.setTimeout(300_000);
  wire(page);

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app|\/home/, { timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.goto(`/app/analyses/${ANALYSIS_ID}/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);

  for (const label of [/fields/i, /visuals/i]) {
    const btn = page.locator('.a-segment__btn', { hasText: label }).first();
    if (await btn.count()) {
      const cls = await btn.getAttribute('class');
      if (!/is-active/.test(cls || '')) await btn.click().catch(() => {});
    }
  }
  await page.waitForTimeout(500);

  // Build a bar to configure.
  await step(page, 'c01-build', async () => {
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
  });

  // Open Properties via right-click.
  await step(page, 'c02-open-properties', async () => {
    const v = page.locator('.visual-cell, [class*="visual-card"]').first();
    await v.click({ button: 'right', timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(900);
  });

  // Helper: pick a dropdown option by opening it and clicking the 2nd item.
  const cycleDropdown = async (labelRx: RegExp, tag: string) => {
    await step(page, `c-${tag}`, async () => {
      const group = page.locator('.config-group, .config-row').filter({ hasText: labelRx }).first();
      const dd = group.locator('app-custom-dropdown, p-dropdown, .p-dropdown').first();
      await dd.scrollIntoViewIfNeeded().catch(() => {});
      await dd.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(500);
      // pick the last visible option in the opened overlay
      const opt = page.locator('.p-dropdown-item, li[role="option"]').nth(1);
      await opt.click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(700);
    });
  };

  await cycleDropdown(/color scheme/i, 'color-scheme');
  await cycleDropdown(/trend line/i, 'trend-line');
  await cycleDropdown(/quick calc/i, 'quick-calc');
  await cycleDropdown(/sort/i, 'sort');

  // Toggle a few switches (grid lines, data labels) to ensure no throw.
  await step(page, 'c-toggles', async () => {
    const toggles = page.locator('app-custom-toggle');
    const n = Math.min(await toggles.count(), 4);
    for (let i = 0; i < n; i++) {
      await toggles.nth(i).click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  });

  // Tab strip: add a tab.
  await step(page, 'c-add-tab', async () => {
    const addTab = page.locator('.analysis-tab-add').first();
    await addTab.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    // popup?
    const nameInput = page.locator('input.add-tab-name, .add-tab-name').first();
    if (await nameInput.count()) {
      await nameInput.fill('Overview', { timeout: 3000 }).catch(() => {});
      await page.locator('.add-tab-btn.primary, .add-tab-btn').filter({ hasText: /add/i }).first().click({ timeout: 3000 }).catch(() => {});
    }
    await page.waitForTimeout(800);
    const tabCount = await page.locator('.analysis-tab').count();
    log.push(`   tabs=${tabCount}`);
  });

  // Right-click a tab for its context menu.
  await step(page, 'c-tab-rightclick', async () => {
    const tab = page.locator('.analysis-tab').first();
    await tab.click({ button: 'right', timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(700);
  });

  // Enable cross-filter so the Interaction "Applies to" dropdown renders.
  await step(page, 'c-enable-crossfilter', async () => {
    const cf = page.locator('.config-row').filter({ hasText: /cross-?filter/i }).first();
    const tog = cf.locator('app-custom-toggle').first();
    await tog.scrollIntoViewIfNeeded().catch(() => {});
    await tog.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
  });

  // Scan the ENTIRE properties panel for leaked raw i18n keys.
  const rawKeys: string[] = await page.evaluate(() => {
    const out = new Set<string>();
    const rx = /\b[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+){1,}\b/;
    document.querySelectorAll('body *').forEach((el) => {
      const e = el as HTMLElement;
      if (e.children.length) return;
      const t = (e.innerText || '').trim();
      if (t && rx.test(t) && !/\s/.test(t)) out.add(t.slice(0, 80));
    });
    return Array.from(out).slice(0, 50);
  });
  log.push(`   leaked-raw-i18n-keys=${JSON.stringify(rawKeys)}`);
  await shot(page, 'c-final-scan');

  const report = {
    steps: log,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 60),
    pageErrors: [...new Set(pageErrors)].slice(0, 60),
    netErrors: [...new Set(netErrors)].slice(0, 60),
  };
  fs.writeFileSync(`${SHOTS}/../controls-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== CONTROLS DIAG ===\n' + JSON.stringify(report, null, 2));
  expect(log.length).toBeGreaterThan(0);
});
