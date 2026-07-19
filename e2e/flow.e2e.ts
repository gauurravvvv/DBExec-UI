import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * Live end-to-end flow verification for the Analyses production program.
 * Login → navigate the app → open the Analyses editor → exercise the new
 * authoring UI (tabs, add-visual, config). Captures a screenshot + any
 * console / page / network errors after every step so runtime bugs surface.
 *
 * This is a DIAGNOSTIC run: steps are tolerant (a failed step is logged, the
 * run continues) so one break doesn't hide everything downstream.
 */

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg';
const USER = 'administrator';
const PASS = 'Pass@1234';

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const netErrors: string[] = [];

function wire(page: Page) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => pageErrors.push((e.message || String(e)).slice(0, 300)));
  page.on('response', (r) => {
    if (r.status() >= 400)
      netErrors.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
  });
}

async function shot(page: Page, name: string) {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  } catch {
    /* ignore */
  }
}

test('DBExec live flow — login + analyses authoring', async ({ page }) => {
  wire(page);
  const log: string[] = [];
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      log.push(`OK   ${label}`);
    } catch (e: any) {
      log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 200)}`);
    }
    await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  };

  // ── Step 1: login ────────────────────────────────────────────────
  await step('01-login', async () => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    // Angular does not reflect formControlName to the DOM — use the stable ids.
    await page.locator('#auth-account').fill(ORG);
    await page.locator('#auth-username').fill(USER);
    await page.locator('#auth-password').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app|\/relay|\/home|\/dashboard/, { timeout: 45000 });
  });

  await step('02-post-login-landing', async () => {
    await page.waitForLoadState('networkidle');
    // capture current URL
    log.push(`   url=${page.url()}`);
  });

  // ── Step 3: navigate to Analyses ────────────────────────────────
  await step('03-open-analyses', async () => {
    await page.goto('/app/analyses', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
  });

  // ── Step 4: open/create an analysis (find a New button or a row) ─
  await step('04-analyses-list-or-new', async () => {
    // Try a "New" / "Add" / "Create" control
    const newBtn = page
      .locator('button, a')
      .filter({ hasText: /new analysis|add analysis|create|new/i })
      .first();
    if (await newBtn.count()) {
      await newBtn.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    log.push(`   url=${page.url()}`);
  });

  // ── Step 5: reach the editor (best-effort) + probe new UI ────────
  await step('05-editor-probe', async () => {
    await page.waitForTimeout(1500);
    // Probe for the wave-7 authoring chrome
    const hasAddTab = await page.getByText(/add tab/i).count();
    const hasAddVisual = await page.getByText(/add visual/i).count();
    const hasPresent = await page
      .locator('[class*="present"], button')
      .filter({ hasText: /present/i })
      .count();
    log.push(
      `   authoring chrome: addTab=${hasAddTab} addVisual=${hasAddVisual} present=${hasPresent}`,
    );
  });

  // Write the diagnostic log + error buckets to disk for the orchestrator.
  const report = {
    steps: log,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    pageErrors: [...new Set(pageErrors)].slice(0, 40),
    netErrors: [...new Set(netErrors)].slice(0, 40),
    finalUrl: page.url(),
  };
  fs.writeFileSync(`${SHOTS}/../diag.json`, JSON.stringify(report, null, 2));
  console.log('=== DIAG ===\n' + JSON.stringify(report, null, 2));

  // The run "passes" if login worked; downstream is diagnostic.
  expect(log.some((l) => l.startsWith('OK   01-login'))).toBeTruthy();
});
