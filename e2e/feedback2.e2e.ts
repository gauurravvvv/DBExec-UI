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
async function shot(page: Page, name: string) { try { await page.screenshot({ path: `${SHOTS}/${name}.png` }); } catch {} }
async function step(page: Page, label: string, fn: () => Promise<void>) {
  try { await fn(); log.push(`OK   ${label}`); } catch (e: any) { log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 200)}`); }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}

test('feedback round 2 verify', async ({ page }) => {
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

  // ensure a tab exists
  await step(page, 'f01-ensure-tab', async () => {
    const addLabelled = page.locator('.analysis-tab-add--labelled').filter({ hasText: /tab/i }).first();
    if (await addLabelled.count()) { await addLabelled.click().catch(() => {}); await page.waitForTimeout(500); }
  });

  // Add-widget button should now live in the Charts panel (not the tab strip).
  await step(page, 'f02-addwidget-location', async () => {
    const inStrip = await page.locator('.analysis-tab-strip .analysis-tab-add--labelled').filter({ hasText: /widget/i }).count();
    const inSidebar = await page.locator('.add-widget-button').count();
    log.push(`   addWidget inTabStrip=${inStrip} inSidebar=${inSidebar}`);
  });

  // Open the Add-widget dialog + inspect its dropdowns for raw i18n keys.
  await step(page, 'f03-open-widget-dialog', async () => {
    await page.locator('.add-widget-button').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    // scan the dialog text for raw keys
    const raw = await page.evaluate(() => {
      const dlg = document.querySelector('.widget-editor-dialog, .p-dialog');
      if (!dlg) return { open: false, keys: [] as string[] };
      const out = new Set<string>();
      const rx = /\b[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+){1,}\b/;
      dlg.querySelectorAll('*').forEach((el) => {
        const e = el as HTMLElement;
        if (e.children.length) return;
        const t = (e.innerText || '').trim();
        if (t && rx.test(t) && !/\s/.test(t)) out.add(t.slice(0, 80));
      });
      return { open: true, keys: Array.from(out).slice(0, 30) };
    });
    log.push(`   widgetDialog open=${raw.open} rawKeys=${JSON.stringify(raw.keys)}`);
  });

  // Open the widget type dropdown to verify options are translated.
  await step(page, 'f04-widget-type-dropdown', async () => {
    const typeDd = page.locator('.p-dialog .config-group').filter({ hasText: /widget type/i }).locator('app-custom-dropdown, .p-dropdown').first();
    await typeDd.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    const opts = await page.locator('.p-dropdown-item, li[role="option"]').allInnerTexts().catch(() => []);
    log.push(`   widgetType options=${JSON.stringify(opts)}`);
    // pick KPI to reveal measure/aggregate/format dropdowns
    const kpi = page.locator('.p-dropdown-item, li[role="option"]').filter({ hasText: /kpi/i }).first();
    await kpi.click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(600);
  });

  // KPI mode — check the aggregate + format dropdown option labels are translated.
  await step(page, 'f05-kpi-dropdowns', async () => {
    const aggDd = page.locator('.p-dialog .config-group').filter({ hasText: /aggregate/i }).locator('app-custom-dropdown, .p-dropdown').first();
    await aggDd.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    const aggOpts = await page.locator('.p-dropdown-item, li[role="option"]').allInnerTexts().catch(() => []);
    log.push(`   aggregate options=${JSON.stringify(aggOpts.slice(0, 8))}`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  });
  await step(page, 'f06-close-widget-dialog', async () => {
    await page.locator('.p-dialog .p-dialog-header-close, .p-dialog-header-icon').first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(500);
  });

  // Delete a tab — the confirm dialog must NOT have a justification field.
  await step(page, 'f07-delete-tab-nojustify', async () => {
    // need 2 tabs to allow delete
    await page.locator('.analysis-tab-add').filter({ has: page.locator('.pi-plus') }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    // right-click first tab → Delete
    const name = page.locator('.analysis-tab .analysis-tab__name').first();
    const bb = await name.boundingBox();
    if (bb) await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' });
    await page.waitForTimeout(600);
    await page.locator('.tab-ctx__item--danger').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
    const hasJustify = await page.locator('.confirmation-popup .justification-section, .confirmation-popup textarea').count();
    const dialogOpen = await page.locator('.confirmation-popup').count();
    log.push(`   deleteTab dialogOpen=${dialogOpen} hasJustification=${hasJustify}`);
  });
  await step(page, 'f08-confirm-delete', async () => {
    await page.locator('.confirmation-popup .btn-confirm').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
    const tabs = await page.locator('.analysis-tab').count();
    log.push(`   tabs after delete=${tabs}`);
  });

  const report = { steps: log, consoleErrors: [...new Set(consoleErrors)].slice(0, 40), pageErrors: [...new Set(pageErrors)].slice(0, 40) };
  fs.writeFileSync(`${SHOTS}/../feedback2-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== FEEDBACK2 DIAG ===\n' + JSON.stringify(report, null, 2));
  expect(log.length).toBeGreaterThan(0);
});
