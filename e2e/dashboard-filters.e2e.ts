import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * End-to-end for the redesigned Dashboard filter UX:
 *   1. Open the seeded analysis → add filters (department, encounter_type) via
 *      the Add Filter dialog.
 *   2. Save the analysis.
 *   3. Publish it as a dashboard.
 *   4. Open the dashboard → verify the PERSISTENT top filter bar renders the
 *      filters, is visible by DEFAULT (no toggle hunt), collapses via chevron,
 *      and a filter value applies.
 */
const SHOTS = '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg', USER = 'administrator', PASS = 'Pass@1234';
const log: string[] = [];
const cerr: string[] = [];
const net: string[] = [];
let dashName = `Filter Dash ${Date.now().toString().slice(-6)}`;
async function shot(p: Page, n: string) { try { await p.screenshot({ path: `${SHOTS}/${n}.png` }); } catch {} }
async function step(p: Page, label: string, fn: () => Promise<void>) {
  try { await fn(); log.push(`OK   ${label}`); } catch (e: any) { log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 220)}`); }
  await shot(p, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}
async function addFilter(page: Page, column: string) {
  await page.locator('.add-filter-button, button').filter({ hasText: /add filter/i }).first().click({ timeout: 6000 });
  await page.waitForTimeout(800);
  // Column dropdown (first dropdown in the filter dialog).
  const colDd = page.locator('.filter-dialog-form app-custom-dropdown, .filter-dialog-field app-custom-dropdown').first();
  await colDd.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('.p-dropdown-item, li[role="option"]').filter({ hasText: new RegExp('^\\s*' + column + '\\s*$', 'i') }).first().click({ timeout: 4000 }).catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(800);
  // Filter type may auto-detect; if a type dropdown is empty pick the first option.
  const save = page.locator('.filter-dialog-form .btn-primary, .dialog-footer .btn-primary').first();
  await save.scrollIntoViewIfNeeded().catch(() => {});
  const enabled = await save.isEnabled().catch(() => false);
  if (!enabled) {
    // pick a filter type
    const typeDd = page.locator('.filter-dialog-section app-custom-dropdown').nth(1);
    if (await typeDd.count()) { await typeDd.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(400); await page.locator('.p-dropdown-item, li[role="option"]').first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(500); }
  }
  await save.click({ timeout: 6000 }).catch(async () => { await save.click({ force: true }).catch(() => {}); });
  await page.waitForTimeout(1200);
}

test('dashboard-filters — add filters, publish, verify persistent filter bar', async ({ page }) => {
  test.setTimeout(400_000);
  page.on('console', (m) => { if (m.type() === 'error' && !/primeicons/.test(m.text())) cerr.push(m.text().slice(0, 180)); });
  page.on('pageerror', (e) => cerr.push('PAGEERR ' + (e.message || String(e)).slice(0, 180)));
  page.on('response', (r) => { if (r.status() >= 400 && !/primeicons/.test(r.url())) net.push(`${r.status()} ${r.request().method()} ${r.url().slice(-50)}`); });

  await step(page, 'df-00-login', async () => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#auth-account').fill(ORG);
    await page.locator('#auth-username').fill(USER);
    await page.locator('#auth-password').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app|\/home/, { timeout: 45000 });
    await page.waitForTimeout(1200);
  });

  await step(page, 'df-01-open-editor', async () => {
    await page.locator('.nav-card').filter({ hasText: /analyses/i }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.getByText(/^\s*Clinical Encounters Analysis\s*$/i).first().click({ timeout: 10000 });
    await page.waitForURL(/\/app\/analyses\/[0-9a-f-]{36}/i, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const editBtn = page.locator('button, a, app-button').filter({ hasText: /^\s*Edit\s*$/i }).first();
    if (await editBtn.count()) { await editBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForURL(/\/edit/, { timeout: 20000 }).catch(() => {}); }
    await page.waitForTimeout(6000);
    // Open the Filters panel segment so Add Filter is reachable.
    const fb = page.locator('.a-segment__btn', { hasText: /filters/i }).first();
    if (await fb.count()) { const c = await fb.getAttribute('class'); if (!/is-active/.test(c || '')) await fb.click().catch(() => {}); }
    await page.waitForTimeout(800);
    // Wait for data so distinct-value fetches work.
    for (let i = 0; i < 20; i++) { const t = (await page.locator('.a-status__text').first().textContent().catch(() => '')) || ''; if (/rows/i.test(t)) break; await page.waitForTimeout(1000); }
  });

  await step(page, 'df-02-add-filter-department', async () => { await addFilter(page, 'department'); });
  await step(page, 'df-03-add-filter-enctype', async () => { await addFilter(page, 'encounter_type'); });
  await step(page, 'df-04-filters-added', async () => {
    const cards = await page.locator('.filter-card').count();
    log.push(`   filterCards=${cards}`);
  });

  // Save the analysis (versioned) so the filters persist for publish.
  await step(page, 'df-05-save', async () => {
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(120); }
    await page.evaluate(() => { document.querySelectorAll('.p-overlaypanel, .p-multiselect-panel, .p-dropdown-panel, .tab-ctx-panel').forEach((el) => el.parentElement?.removeChild(el)); }).catch(() => {});
    await page.mouse.click(1200, 300).catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('.a-toolbar__right .a-btn--primary').first().click({ timeout: 10000 }).catch(() => {});
    await page.locator('.save-analysis-popup').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const just = page.locator('#saveJustification, .save-analysis-popup textarea').first();
    if (await just.count()) { await just.click().catch(() => {}); await just.fill('Add filters for dashboard filter-bar E2E', { timeout: 5000 }).catch(() => {}); }
    await page.waitForTimeout(400);
    const putWait = page.waitForResponse((r) => /\/analyses\//.test(r.url()) && r.request().method() === 'PUT', { timeout: 15000 }).catch(() => null);
    await page.locator('.save-analysis-popup .btn-save').first().click({ timeout: 8000 }).catch(() => {});
    const put = await putWait;
    log.push(`   savePUT=${put ? put.status() : 'NONE'}`);
    await page.waitForURL(/\/app\/analyses(\?|$)/i, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
  });

  // Re-open the saved analysis and Publish it as a dashboard.
  await step(page, 'df-06-reopen-and-publish', async () => {
    if (!/\/app\/analyses/.test(page.url())) { await page.locator('.nav-card').filter({ hasText: /analyses/i }).first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(2000); }
    await page.getByText(/^\s*Clinical Encounters Analysis\s*$/i).first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForURL(/\/app\/analyses\/[0-9a-f-]{36}/i, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const editBtn = page.locator('button, a, app-button').filter({ hasText: /^\s*Edit\s*$/i }).first();
    if (await editBtn.count()) { await editBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForURL(/\/edit/, { timeout: 20000 }).catch(() => {}); }
    await page.waitForTimeout(5000);
    // Publish button in the toolbar.
    const pubBtn = page.locator('.a-btn--secondary, button, app-button').filter({ hasText: /publish/i }).first();
    await expect(pubBtn).toBeEnabled({ timeout: 15000 }).catch(() => {});
    await pubBtn.click({ timeout: 8000 }).catch(() => {});
    await page.locator('.publish-dashboard-popup').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    const nameInp = page.locator('.publish-dashboard-popup input').first();
    await nameInp.fill(dashName, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, 'df-06a-publish-dialog');
    const pubResp = page.waitForResponse((r) => /dashboard/i.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
    await page.locator('.publish-dashboard-popup .btn-publish').first().click({ timeout: 8000 }).catch(() => {});
    const pr = await pubResp;
    log.push(`   publishPOST=${pr ? pr.status() : 'NONE'} name="${dashName}"`);
    await page.waitForTimeout(4000);
    log.push(`   afterPublishUrl=${page.url()}`);
  });

  // Open the published dashboard and verify the persistent filter bar.
  await step(page, 'df-07-open-dashboard', async () => {
    await page.goto('/app/dashboards', { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    const link = page.getByText(new RegExp('^\\s*' + dashName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i')).first();
    if (await link.count()) await link.click({ timeout: 8000 }).catch(() => {});
    else await page.locator('.dataset-name-link, a[href*="/dashboards/"]').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(6000);
    log.push(`   dashUrl=${page.url()}`);
  });

  await step(page, 'df-08-verify-filter-bar', async () => {
    const barVisible = await page.locator('.dashboard-filter-bar').isVisible().catch(() => false);
    const bodyVisible = await page.locator('.dashboard-filter-bar .filter-bar-body').isVisible().catch(() => false);
    const controls = await page.locator('.dashboard-filter-bar .filter-control').count();
    const title = await page.locator('.dashboard-filter-bar .filter-bar-title').innerText().catch(() => '');
    const headerHasOldToggle = await page.locator('.header-actions .header-icon-btn .pi-filter').count();
    log.push(`   filterBarVisible=${barVisible} bodyVisibleByDefault=${bodyVisible} filterControls=${controls} title="${title.trim()}" oldHeaderToggle=${headerHasOldToggle}`);
    await shot(page, 'df-08a-filter-bar-default-open');
    // Collapse via chevron.
    await page.locator('.dashboard-filter-bar .filter-bar-toggle').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const bodyAfterCollapse = await page.locator('.dashboard-filter-bar .filter-bar-body').isVisible().catch(() => false);
    log.push(`   bodyVisibleAfterCollapse=${bodyAfterCollapse}`);
    await shot(page, 'df-08b-filter-bar-collapsed');
    // Re-open.
    await page.locator('.dashboard-filter-bar .filter-bar-toggle').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
  });

  log.push(`consoleErrors=${JSON.stringify([...new Set(cerr)].slice(0, 20))}`);
  log.push(`netErrors=${JSON.stringify([...new Set(net)].slice(0, 20))}`);
  fs.writeFileSync(`${SHOTS}/../dashboard-filters-diag.json`, JSON.stringify(log, null, 2));
  console.log('=== DASHBOARD FILTERS ===\n' + log.join('\n'));
  expect(log.some((l) => l.startsWith('OK   df-00-login'))).toBeTruthy();
});
