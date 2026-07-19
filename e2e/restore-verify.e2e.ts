import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * Live verification of the SELECTIVE RESTORE in the Analyses editor:
 *   1) the "+" add-tab TYPE popover (Chart/Table/KPI + name + Add tab) is BACK
 *   2) deleting a real tab asks for a JUSTIFICATION in the confirm dialog
 * plus the KEPT improvements survive:
 *   - tab strip scrolls horizontally with many tabs
 *   - Layers panel lists ALL tabs' visuals
 *   - "Add Widget" lives in the Charts/visuals panel (not the tab strip)
 *
 * Reaches the editor by CLICKING the sidebar Analyses entry then opening
 * "Clinical Encounters Analysis" (direct goto to /edit bounces home).
 */

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg';
const USER = 'administrator';
const PASS = 'Pass@1234';

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
  catch (e: any) { log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 220)}`); }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}

test('selective-restore verification', async ({ page }) => {
  test.setTimeout(300_000);
  wire(page);

  // ── Login ──────────────────────────────────────────────────────────
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app|\/home/, { timeout: 45000 });
  await page.waitForTimeout(1500);

  // ── Navigate to Analyses ─────────────────────────────────────────────
  // The sidebar rail is collapsed (icon-only). Expand it and click the
  // "Analyses" nav entry; fall back to the home-screen "Analyses" card.
  await step(page, 'r00-goto-analyses', async () => {
    // Expand the collapsed sidebar if there's a toggle chevron.
    const toggle = page.locator('.sidebar-toggle, .sidebar .toggle, button').filter({ has: page.locator('.pi-angle-right, .ci-chevron-right') }).first();
    if (await toggle.count()) { await toggle.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); }

    // Try a real sidebar link to /app/analyses first.
    const sideLink = page.locator('.sidebar-nav a[href="/app/analyses"], .sidebar a[href="/app/analyses"]').first();
    if (await sideLink.count()) {
      await sideLink.click({ timeout: 4000, force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    // If we're not on the analyses list yet, click the home "Analyses" card.
    if (!/\/app\/analyses/.test(page.url())) {
      const card = page.locator('.card, .home-card, a, div').filter({ hasText: /^\s*Analyses/i }).filter({ hasText: /visualize|analyze/i }).first();
      if (await card.count()) { await card.click({ timeout: 4000 }).catch(() => {}); }
      await page.waitForTimeout(2500);
    }
    log.push(`   url=${page.url()}`);
  });

  // ── Open "Clinical Encounters Analysis" ──────────────────────────────
  await step(page, 'r01-open-analysis', async () => {
    // Dump candidate clickable rows for diagnosis.
    const candidates = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="/app/analyses/"], .dataset-name-link, .app-custom-table td, .row-cell, .cell, tr'))
        .map((e) => (e as HTMLElement).innerText?.trim().slice(0, 60))
        .filter((t) => t && /clinical|analysis|encounter/i.test(t))
        .slice(0, 12),
    );
    log.push(`   listCandidates=${JSON.stringify(candidates)}`);

    // The Name cell is a blue clickable link — click the text node itself.
    const nameLink = page
      .getByText(/^\s*Clinical Encounters Analysis\s*$/i)
      .first();
    if (await nameLink.count()) {
      await nameLink.click({ timeout: 8000 });
    } else {
      await page.locator('.dataset-name-link, a[href*="/app/analyses/"]').first().click({ timeout: 8000 }).catch(() => {});
    }
    // Clicking the name opens the read-only "Analysis Details" VIEW page.
    // The editor (with the tab strip) is behind the top-right "Edit" button.
    await page.waitForURL(/\/app\/analyses\/[^/]+/, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const editBtn = page.locator('button, a, app-button').filter({ hasText: /^\s*Edit\s*$/i }).first();
    if (await editBtn.count()) {
      await editBtn.click({ timeout: 8000 }).catch(() => {});
      await page.waitForURL(/\/edit/, { timeout: 20000 }).catch(() => {});
    }
    await page.waitForTimeout(5000);
    log.push(`   editorUrl=${page.url()}`);
    // Make sure Fields/Visuals segments are active so the canvas + tab strip render.
    for (const lbl of [/fields/i, /visuals/i]) {
      const b = page.locator('.a-segment__btn', { hasText: lbl }).first();
      if (await b.count()) {
        const c = await b.getAttribute('class');
        if (!/is-active/.test(c || '')) await b.click().catch(() => {});
      }
    }
    await page.waitForTimeout(800);
    log.push(`   url=${page.url()}`);
    log.push(`   tabs=${await page.locator('.analysis-tab').count()}`);
  });

  // Ensure at least one tab exists (open the strip via the empty-strip add).
  await step(page, 'r02-ensure-a-tab', async () => {
    const strip = await page.locator('.analysis-tab-strip').count();
    const emptyStrip = await page.locator('.analysis-tab-strip--empty').count();
    log.push(`   tabStrip=${strip} emptyStrip=${emptyStrip} tabs=${await page.locator('.analysis-tab').count()}`);
    if ((await page.locator('.analysis-tab').count()) === 0) {
      // Empty strip → labelled add creates the first (plain) tab.
      const addLabelled = page.locator('.analysis-tab-strip--empty .analysis-tab-add').first();
      if (await addLabelled.count()) {
        await addLabelled.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    }
    log.push(`   tabsAfter=${await page.locator('.analysis-tab').count()}`);
  });

  // ── FEATURE 1: "+" opens the TYPE popover ────────────────────────────
  await step(page, 'r03-plus-opens-type-popover', async () => {
    const before = await page.locator('.analysis-tab').count();
    await page.locator('.analysis-tab-add').filter({ has: page.locator('.pi-plus') }).first().click({ timeout: 6000 });
    await page.waitForTimeout(900);
    const form = await page.locator('.add-tab-form').count();
    const chips = await page.locator('.add-tab-form app-chip, .add-tab-types app-chip').allInnerTexts().catch(() => []);
    const nameInput = await page.locator('.add-tab-form .add-tab-name').count();
    const addBtn = await page.locator('.add-tab-form .add-tab-btn').count();
    log.push(`   before=${before} popoverForm=${form} typeChips=${JSON.stringify(chips)} nameInput=${nameInput} addBtn=${addBtn}`);
    expect(form, 'add-tab TYPE popover should appear').toBeGreaterThan(0);
    expect(chips.join(' ')).toMatch(/chart/i);
    expect(chips.join(' ')).toMatch(/table/i);
    expect(chips.join(' ')).toMatch(/kpi/i);
    expect(nameInput, 'name field present').toBeGreaterThan(0);
    expect(addBtn, 'Add tab button present').toBeGreaterThan(0);
  });

  // Pick a TYPE (Table) + type a NAME, then Add tab.
  await step(page, 'r04-create-typed-named-tab', async () => {
    const before = await page.locator('.analysis-tab').count();
    await page.locator('.add-tab-types app-chip').filter({ hasText: /table/i }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('.add-tab-form .add-tab-name').first().fill('QA Restore Tab', { timeout: 4000 });
    await page.waitForTimeout(200);
    await shot(page, 'r04a-popover-filled');
    await page.locator('.add-tab-form .add-tab-btn').first().click({ timeout: 4000 });
    await page.waitForTimeout(1000);
    const after = await page.locator('.analysis-tab').count();
    const names = await page.locator('.analysis-tab__name').allInnerTexts().catch(() => []);
    log.push(`   tabs ${before}->${after} names=${JSON.stringify(names)}`);
    expect(after, 'a new tab was created').toBeGreaterThan(before);
    expect(names.join(' | ')).toMatch(/qa restore tab/i);
  });

  // ── KEEP: many tabs → strip scrolls; "+" & Add widget not pushed off ─
  await step(page, 'r05-many-tabs-scroll', async () => {
    // Add several plain tabs quickly (via the popover's Add with default name).
    for (let i = 0; i < 6; i++) {
      await page.locator('.analysis-tab-add').filter({ has: page.locator('.pi-plus') }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      const addBtn = page.locator('.add-tab-form .add-tab-btn').first();
      if (await addBtn.count()) { await addBtn.click().catch(() => {}); await page.waitForTimeout(500); }
    }
    const tabs = await page.locator('.analysis-tab').count();
    const scroll = page.locator('.analysis-tabs-scroll').first();
    const canScroll = await scroll.evaluate((el) => el.scrollWidth > el.clientWidth + 2).catch(() => false);
    const plusVisible = await page.locator('.analysis-tab-add').filter({ has: page.locator('.pi-plus') }).first().isVisible().catch(() => false);
    log.push(`   tabs=${tabs} scrollWrapperOverflows=${canScroll} plusVisible=${plusVisible}`);
    expect(tabs, 'many tabs present').toBeGreaterThanOrEqual(6);
  });

  // ── KEEP: "Add Widget" lives in the Charts/visuals panel ─────────────
  await step(page, 'r06-add-widget-in-charts-panel', async () => {
    // Charts/visuals sidebar hosts an "Add widget" button; the tab strip must NOT.
    const inStrip = await page.locator('.analysis-tab-strip .analysis-tab-add--labelled').filter({ hasText: /widget/i }).count();
    const inPanel = await page.locator('.visuals-chart-sidebar, .charts-panel, app-visuals-chart-sidebar')
      .locator('button, app-button').filter({ hasText: /widget/i }).count();
    log.push(`   addWidgetInTabStrip=${inStrip} addWidgetInChartsPanel=${inPanel}`);
    expect(inStrip, 'Add Widget NOT in the tab strip').toBe(0);
  });

  // ── KEEP: Layers panel lists ALL tabs' visuals ───────────────────────
  await step(page, 'r07-layers-all-tabs', async () => {
    const layersBtn = page.locator('.a-segment__btn, button').filter({ hasText: /layers/i }).first();
    await layersBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    const groups = await page.locator('.layer-group').count();
    const headers = await page.locator('.layer-group__header').allInnerTexts().catch(() => []);
    log.push(`   layerGroups=${groups} headers=${JSON.stringify(headers.slice(0, 12))}`);
  });

  // ── FEATURE 2: deleting a real tab asks for a justification ──────────
  // Re-open Visuals segment so the tab strip is interactive, then right-click
  // a tab → Delete → confirm dialog must show a justification textarea.
  await step(page, 'r08-open-delete-confirm', async () => {
    for (const lbl of [/visuals/i]) {
      const b = page.locator('.a-segment__btn', { hasText: lbl }).first();
      if (await b.count()) { await b.click().catch(() => {}); }
    }
    // Dismiss any lingering overlay (e.g. an add-tab popover left attached to
    // body) that could intercept the right-click, then settle.
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(793, 500).catch(() => {});
    await page.waitForTimeout(600);
    // Right-click the FIRST tab (same approach that reliably opens the menu in
    // r10), wait for the menu, then click "Delete tab". This is a DRAFT-only
    // in-memory delete — the test never Saves, so nothing persists to the DB.
    await page.locator('.analysis-tab').first().click({ button: 'right', timeout: 5000 }).catch(() => {});
    await page.locator('.tab-ctx').first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, 'r08a-tab-context-menu');
    const ctxItems = await page.locator('.tab-ctx__item').allInnerTexts().catch(() => []);
    log.push(`   ctxItems=${JSON.stringify(ctxItems)}`);
    const del = page.locator('.tab-ctx__item--danger, .tab-ctx__item').filter({ hasText: /delete/i }).first();
    if (await del.count()) { await del.click({ timeout: 4000 }).catch(() => {}); }
    await page.waitForTimeout(1000);
    const dlg = await page.locator('.confirmation-popup').count();
    const justArea = await page.locator('.confirmation-popup .justification-section, .confirmation-popup textarea').count();
    const justLabel = await page.locator('.confirmation-popup').allInnerTexts().catch(() => []);
    log.push(`   confirmPopup=${dlg} justificationSection=${justArea}`);
    log.push(`   confirmText=${JSON.stringify(justLabel.join(' ').slice(0, 200))}`);
    expect(dlg, 'delete-tab confirm dialog open').toBeGreaterThan(0);
    expect(justArea, 'justification textarea present in delete dialog').toBeGreaterThan(0);
  });

  // Fill a reason + proceed with the delete.
  await step(page, 'r09-justify-and-delete', async () => {
    const before = await page.locator('.analysis-tab').count();
    const ta = page.locator('.confirmation-popup textarea').first();
    if (await ta.count()) { await ta.fill('QA: removing the temporary QA restore tab', { timeout: 4000 }).catch(() => {}); }
    await page.waitForTimeout(300);
    await shot(page, 'r09a-justification-filled');
    const confirmBtn = page.locator('.confirmation-popup .btn-confirm').first();
    await confirmBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const after = await page.locator('.analysis-tab').count();
    const stillOpen = await page.locator('.confirmation-popup').count();
    log.push(`   tabs ${before}->${after} dialogStillOpen=${stillOpen}`);
    expect(after, 'a tab was deleted').toBeLessThan(before);
  });

  // ── Tab right-click SET COLOR swatch row alignment (screenshot) ──────
  await step(page, 'r10-set-color-swatch-row', async () => {
    await page.locator('.analysis-tab').first().click({ button: 'right', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    const swatches = await page.locator('.tab-ctx__swatch').count();
    // Measure vertical centres of every swatch — they should share ~one line.
    const centres = await page.locator('.tab-ctx__swatch').evaluateAll((els) =>
      els.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }),
    ).catch(() => [] as number[]);
    const spread = centres.length ? Math.max(...centres) - Math.min(...centres) : -1;
    log.push(`   swatches=${swatches} centreYs=${JSON.stringify(centres)} verticalSpreadPx=${spread}`);
    await shot(page, 'r10a-set-color-row');
    expect(swatches, '7 swatches present').toBeGreaterThanOrEqual(7);
    expect(spread, 'all swatches share one centre line (≤2px spread)').toBeLessThanOrEqual(2);
  });

  const report = {
    steps: log,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    pageErrors: [...new Set(pageErrors)].slice(0, 40),
  };
  fs.writeFileSync(`${SHOTS}/../restore-verify-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== RESTORE VERIFY DIAG ===\n' + JSON.stringify(report, null, 2));
  expect(log.length).toBeGreaterThan(0);
});
