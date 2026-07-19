import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg';
const USER = 'administrator';
const PASS = 'Pass@1234';
const ANALYSIS_ID = 'f1fac3f3-f1b3-4410-ae96-d1b77a1f9fe6';

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const log: string[] = [];

function wire(page: Page) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => pageErrors.push((e.message || String(e)).slice(0, 300)));
}
async function shot(page: Page, name: string) {
  try { await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); } catch {}
}
async function step(page: Page, label: string, fn: () => Promise<void>) {
  try { await fn(); log.push(`OK   ${label}`); }
  catch (e: any) { log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 200)}`); }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}
async function addVisual(page: Page, chartLabel: RegExp, maps: Array<{ role: RegExp; field: string }>) {
  await page.locator('button, .add-visual-button').filter({ hasText: /add visual/i }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.chart-type-card').filter({ hasText: chartLabel }).first().click();
  await page.waitForTimeout(600);
  for (const m of maps) {
    await page.locator('.axis-slot').filter({ hasText: m.role }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('.field-card').filter({ hasText: new RegExp('^\\s*' + m.field + '\\s*$', 'i') }).first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

test('tabs + layers walkthrough', async ({ page }) => {
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

  for (const lbl of [/fields/i, /visuals/i]) {
    const b = page.locator('.a-segment__btn', { hasText: lbl }).first();
    if (await b.count()) { const c = await b.getAttribute('class'); if (!/is-active/.test(c || '')) await b.click().catch(() => {}); }
  }
  await page.waitForTimeout(500);

  // First ensure there's a tab (some analyses start tab-less).
  await step(page, 't01-add-first-tab', async () => {
    const addLabelled = page.locator('.analysis-tab-add--labelled').filter({ hasText: /tab/i }).first();
    if (await addLabelled.count()) { await addLabelled.click().catch(() => {}); await page.waitForTimeout(600); }
    const tabs = await page.locator('.analysis-tab').count();
    log.push(`   tabs=${tabs}`);
  });

  // Build 2 visuals on tab 1.
  await step(page, 't02-tab1-bar', async () => {
    await addVisual(page, /bar chart/i, [{ role: /x[- ]?axis/i, field: 'department' }, { role: /y[- ]?axis/i, field: 'total_charge' }]);
  });
  await step(page, 't03-tab1-pie', async () => {
    await addVisual(page, /pie chart/i, [{ role: /x[- ]?axis/i, field: 'encounter_type' }, { role: /y[- ]?axis/i, field: 'total_charge' }]);
  });

  // Simple add-tab: click "+" — should add a plain tab, NO popover.
  await step(page, 't04-simple-add-tab', async () => {
    const before = await page.locator('.analysis-tab').count();
    await page.locator('.analysis-tab-add').filter({ has: page.locator('.pi-plus') }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(700);
    const after = await page.locator('.analysis-tab').count();
    const popover = await page.locator('.add-tab-panel, .add-tab-form').count();
    log.push(`   tabs ${before}->${after}  addTabPopover=${popover}`);
  });

  // Build a visual on the new (now active) tab 2.
  await step(page, 't05-tab2-line', async () => {
    await addVisual(page, /line chart/i, [{ role: /x[- ]?axis/i, field: 'encounter_date' }, { role: /y[- ]?axis/i, field: 'total_charge' }]);
  });

  // Rename a tab (double-click) — capture the rename UI.
  await step(page, 't06-rename-tab', async () => {
    const tab = page.locator('.analysis-tab').first();
    await tab.locator('.analysis-tab__name').dblclick({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    const input = page.locator('.analysis-tab__rename').first();
    if (await input.count()) {
      await input.fill('Overview', { timeout: 3000 }).catch(() => {});
    }
    await page.waitForTimeout(400);
  });
  await step(page, 't06b-rename-commit', async () => {
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(500);
  });

  // Right-click a tab → context menu (should be trimmed).
  await step(page, 't07-tab-context', async () => {
    await page.locator('.analysis-tab').first().click({ button: 'right', timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(600);
    const items = await page.locator('.tab-ctx__item').allInnerTexts().catch(() => []);
    log.push(`   ctx items=${JSON.stringify(items)}`);
  });
  await step(page, 't07b-dismiss-context', async () => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(700, 600).catch(() => {});
    await page.waitForTimeout(400);
  });

  // Open Layers panel and capture — should show ALL tabs + their visuals.
  await step(page, 't08-layers-all-tabs', async () => {
    const layersBtn = page.locator('.a-segment__btn, button').filter({ hasText: /layers/i }).first();
    await layersBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(800);
    const groups = await page.locator('.layer-group').count();
    const headers = await page.locator('.layer-group__header').allInnerTexts().catch(() => []);
    const rows = await page.locator('.visual-list-item').count();
    log.push(`   layerGroups=${groups} headers=${JSON.stringify(headers)} rows=${rows}`);
  });

  const report = { steps: log, consoleErrors: [...new Set(consoleErrors)].slice(0, 40), pageErrors: [...new Set(pageErrors)].slice(0, 40) };
  fs.writeFileSync(`${SHOTS}/../tabs-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== TABS DIAG ===\n' + JSON.stringify(report, null, 2));
  expect(log.length).toBeGreaterThan(0);
});
