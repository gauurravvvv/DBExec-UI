import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * MAXIMAL clinical analysis showcase — drives the LIVE Analyses editor at
 * :4200 against BE :3000 and warehouse pg :5432 (clinical schema, ~$68.7M
 * total_charge over 5000 encounters; analysis load cap 1000 rows).
 *
 * Fresh multi-tab analysis on "Clinical Encounters":
 *   1 Overview     KPI SUM(total_charge) · KPI COUNT · KPI AVG(payment_ratio=collection rate)
 *                  · bar department×SUM(total_charge) desc + data labels · donut encounter_type
 *   2 Time Trends  line encounter_date×SUM(total_charge) + trend + running total · area count over time
 *   3 Geography    world-map region×SUM(total_charge) · bar region×AVG(length_of_stay)
 *   4 Providers    Top-10 bar provider×SUM(total_charge) · scatter los vs charge · table provider/specialty/count
 *   5 Financials   heat-map dept×enctype×SUM(charge) pivot · combo dual-axis charge+payment_ratio
 *                  · bar on CALCULATED FIELD unpaid_amount
 * plus per-pill aggregate + sort, Top-N, cross-filter, drill path, tab colours, tab rename.
 * Then SAVE (versioned) → RE-OPEN from list → screenshot every tab.
 */

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg', USER = 'administrator', PASS = 'Pass@1234';

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const netErrors: string[] = [];
const log: string[] = [];
let savedAnalysisName = `Clinical Showcase ${Date.now().toString().slice(-6)}`;
let savedUrl = '';

function wire(page: Page) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', (e) => pageErrors.push((e.message || String(e)).slice(0, 400)));
  page.on('response', (r) => {
    if (r.status() >= 400) {
      const u = r.url();
      if (u.includes('primeicons.css')) return;
      netErrors.push(`${r.status()} ${r.request().method()} ${u.slice(0, 220)}`);
    }
  });
}
async function shot(page: Page, name: string) { try { await page.screenshot({ path: `${SHOTS}/${name}.png` }); } catch {} }
async function step(page: Page, label: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try { await fn(); log.push(`OK   ${label} (${Date.now() - t0}ms)`); }
  catch (e: any) { log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 300)}`); }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}
async function ensureSegment(page: Page, rx: RegExp) {
  const b = page.locator('.a-segment__btn', { hasText: rx }).first();
  if (await b.count()) {
    const c = await b.getAttribute('class');
    if (!/is-active/.test(c || '')) { await b.click().catch(() => {}); await page.waitForTimeout(150); }
  }
}
async function clickField(page: Page, field: string) {
  // Filter the Fields list via the search box so fields low in the list
  // (e.g. analysis-level calculated fields) become visible + clickable,
  // independent of scroll position. Then clear the search afterwards.
  const search = page.locator('.datasource-sidebar .search-wrapper input, .fields-panel-content input').first();
  if (await search.count()) {
    await search.fill(field, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  const exact = page.locator('.field-card').filter({ hasText: new RegExp('^\\s*' + field + '\\s*$', 'i') }).first();
  if (await exact.count()) {
    await exact.scrollIntoViewIfNeeded().catch(() => {});
    await exact.click({ timeout: 8000 });
  } else {
    await page.locator('.field-card').filter({ hasText: new RegExp(field, 'i') }).first().click({ timeout: 8000 });
  }
  if (await search.count()) { await search.fill('', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(250); }
}
async function mapRole(page: Page, roleRx: RegExp, field: string) {
  const slot = page.locator('.axis-slot').filter({ hasText: roleRx }).first();
  await slot.scrollIntoViewIfNeeded().catch(() => {});
  await slot.click({ timeout: 8000 });
  await page.waitForTimeout(300);
  await clickField(page, field);
  await page.waitForTimeout(400);
  // Verify the role now shows a pill; retry once if the field click missed
  // (the slot may not have entered selection mode on the first click).
  const filled = await slot.locator('.axis-value__pill, app-chip').count().catch(() => 0);
  if (!filled) {
    await slot.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(300);
    await clickField(page, field);
    await page.waitForTimeout(400);
  }
}
async function addVisualPick(page: Page, chartNameRx: RegExp) {
  await ensureSegment(page, /visuals/i);
  const addVisual = page.locator('.visuals-sidebar button, .visuals-sidebar .add-visual-button').filter({ hasText: /add visual/i }).first();
  await addVisual.click({ timeout: 10000 });
  await page.waitForTimeout(500);
  const card = page.locator('.chart-type-card').filter({ hasText: chartNameRx }).first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(500);
}
async function buildVisual(page: Page, chartNameRx: RegExp, mappings: Array<{ role: RegExp; field: string }>) {
  await addVisualPick(page, chartNameRx);
  for (const m of mappings) await mapRole(page, m.role, m.field);
}
async function setPillAggregate(page: Page, aggLabelRx: RegExp) {
  const pill = page.locator('.axis-value__pill').last();
  await pill.scrollIntoViewIfNeeded().catch(() => {});
  await pill.click({ timeout: 5000 });
  await page.waitForTimeout(350);
  await page.locator('.pill-menu__item').filter({ hasText: aggLabelRx }).first().click({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape').catch(() => {});
}
async function setPillSort(page: Page, dir: 'asc' | 'desc') {
  const pill = page.locator('.axis-value__pill').last();
  await pill.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const rx = dir === 'desc' ? /desc/i : /asc/i;
  await page.locator('.pill-menu__item').filter({ hasText: rx }).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape').catch(() => {});
}
async function openProperties(page: Page) {
  const box = page.locator('.visual-box').last();
  await box.click({ button: 'right', timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(500);
}
async function closeProperties(page: Page) {
  await page.locator('.config-sidebar .close-btn').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(200);
}
async function setConfigDropdown(page: Page, labelRx: RegExp, optionRx: RegExp) {
  const group = page.locator('.config-sidebar .config-group, .config-sidebar .config-row').filter({ hasText: labelRx }).first();
  const dd = group.locator('app-custom-dropdown, .p-dropdown').first();
  await dd.scrollIntoViewIfNeeded().catch(() => {});
  await dd.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.locator('.p-dropdown-item, li[role="option"]').filter({ hasText: optionRx }).first().click({ timeout: 4000 }).catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(400);
}
async function addTab(page: Page, typeRx: RegExp, name: string) {
  const plus = page.locator('.analysis-tab-add').filter({ has: page.locator('.pi-plus') }).first();
  const empty = page.locator('.analysis-tab-strip--empty .analysis-tab-add').first();
  if (await plus.count()) await plus.click({ timeout: 6000 });
  else if (await empty.count()) await empty.click({ timeout: 6000 });
  await page.waitForTimeout(500);
  const chip = page.locator('.add-tab-types app-chip').filter({ hasText: typeRx }).first();
  if (await chip.count()) await chip.click({ timeout: 4000 }).catch(() => {});
  const nameInput = page.locator('.add-tab-form .add-tab-name').first();
  if (await nameInput.count()) {
    await nameInput.fill(name, { timeout: 4000 }).catch(() => {});
    await page.locator('.add-tab-form .add-tab-btn').first().click({ timeout: 4000 }).catch(() => {});
  }
  await page.waitForTimeout(700);
}
async function selectTabByName(page: Page, nameRx: RegExp) {
  await page.locator('.analysis-tab').filter({ hasText: nameRx }).first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
}

test('showcase — build maximal multi-tab clinical analysis, save, reload', async ({ page }) => {
  test.setTimeout(600_000);
  wire(page);

  await step(page, 'showcase-00-login', async () => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#auth-account').fill(ORG);
    await page.locator('#auth-username').fill(USER);
    await page.locator('#auth-password').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app|\/home|\/dashboard/, { timeout: 45000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
  });

  // ── Create a FRESH analysis from the Clinical Encounters dataset ──────
  await step(page, 'showcase-01-datasets', async () => {
    await page.locator('.nav-card').filter({ hasText: /datasets/i }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    log.push(`   url=${page.url()}`);
  });
  await step(page, 'showcase-02-create-from-dataset', async () => {
    const row = page.locator('tr, [role="row"], .ct-row').filter({ hasText: /clinical encounters/i }).first();
    const more = row.locator('.more-btn').first();
    await more.scrollIntoViewIfNeeded().catch(() => {});
    await more.click({ timeout: 6000 });
    await page.waitForTimeout(1000);
    await page.locator('.action-menu-item').filter({ hasText: /analysis/i }).first().click({ timeout: 5000 });
    await page.waitForTimeout(800);
    const nameInput = page.locator('.save-analysis-popup input').first();
    await nameInput.fill(savedAnalysisName, { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.locator('.save-analysis-popup .btn-save').first().click({ timeout: 6000 });
    await page.waitForTimeout(3000);
    log.push(`   name="${savedAnalysisName}" url=${page.url()}`);
  });

  // ── Open the new analysis + reach the editor ─────────────────────────
  await step(page, 'showcase-03-open-editor', async () => {
    if (!/\/app\/analyses/.test(page.url())) {
      await page.locator('.nav-card').filter({ hasText: /analyses/i }).first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    let link = page.getByText(new RegExp('^\\s*' + savedAnalysisName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i')).first();
    if (!(await link.count())) link = page.getByText(/^\s*Clinical Encounters Analysis\s*$/i).first();
    await link.click({ timeout: 10000 });
    await page.waitForURL(/\/app\/analyses\/[0-9a-f-]{36}/i, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const editBtn = page.locator('button, a, app-button').filter({ hasText: /^\s*Edit\s*$/i }).first();
    if (await editBtn.count()) { await editBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForURL(/\/edit/, { timeout: 20000 }).catch(() => {}); }
    await page.waitForTimeout(4000);
    await ensureSegment(page, /fields/i);
    await ensureSegment(page, /visuals/i);
    log.push(`   editorUrl=${page.url()} fieldCards=${await page.locator('.field-card').count()}`);
  });
  await step(page, 'showcase-04-wait-data', async () => {
    for (let i = 0; i < 30; i++) {
      const txt = (await page.locator('.a-status__text').first().textContent().catch(() => '')) || '';
      if (/rows/i.test(txt)) { log.push(`   status="${txt.trim()}" after ${i}s`); break; }
      await page.waitForTimeout(1000);
    }
    log.push(`   tabsAtStart=${await page.locator('.analysis-tab').count()}`);
  });

  // ── Create an analysis-scoped CALCULATED FIELD via "Add Field" ───────
  // The dataset's `calculated_field` rows aren't surfaced in the analyses
  // editor (that table feeds the dataset preview, not the analysis field
  // list — getAnalysisFields reads dataset_field only). The editor's own
  // calc-field mechanism is the "Add Field" dialog, which writes an
  // analysis-scoped dataset_field (type=2) that DOES appear in the list and
  // can be charted. We author collection_rate = [amount_paid] / [total_charge].
  await step(page, 'showcase-05-add-calc-field', async () => {
    await ensureSegment(page, /fields/i);
    await page.locator('.add-field-btn, button').filter({ hasText: /add field/i }).first().click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const nameInput = page.locator('.acf-form input').first();
    await nameInput.fill('collection_rate', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const dd = page.locator('.acf-form app-custom-dropdown, .acf-form .p-dropdown').first();
    await dd.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.p-dropdown-item, li[role="option"]').filter({ hasText: /^\s*Decimal\s*$/i }).first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(500);
    const monaco = page.locator('#formula-editor-container .monaco-editor, #formula-editor-container').first();
    await monaco.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.keyboard.type('[amount_paid] / [total_charge]', { delay: 15 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.acf-footer__validate, button').filter({ hasText: /validate/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const saveResp = page.waitForResponse((r) => /\/fields\b/.test(r.url()) && ['POST', 'PUT'].includes(r.request().method()), { timeout: 12000 }).catch(() => null);
    await page.locator('.acf-btn--primary').first().click({ timeout: 6000 }).catch(() => {});
    const sr = await saveResp;
    await page.waitForTimeout(2500);
    const cards = await page.locator('.field-card .field-name').allInnerTexts().catch(() => []);
    log.push(`   calcFieldSaved=${sr ? sr.status() : 'none'} hasCollectionRate=${cards.some((c) => /collection_rate/i.test(c))} fieldCount=${cards.length}`);
  });

  // ══════════════════ TAB 1: OVERVIEW ══════════════════════════════════
  await step(page, 'showcase-10-tab-overview', async () => {
    await addTab(page, /chart/i, 'Overview');
    await selectTabByName(page, /overview/i);
    log.push(`   tabNames=${JSON.stringify(await page.locator('.analysis-tab__name').allInnerTexts().catch(() => []))}`);
  });
  await step(page, 'showcase-11-kpi-sum-charge', async () => {
    await buildVisual(page, /number cards/i, [{ role: /y[- ]?axis|value|measure/i, field: 'total_charge' }]);
    await setPillAggregate(page, /^\s*sum\s*$/i);
  });
  await step(page, 'showcase-12-kpi-count', async () => {
    await buildVisual(page, /number cards/i, [{ role: /y[- ]?axis|value|measure/i, field: 'encounter_id' }]);
    await setPillAggregate(page, /count(?!\s*distinct)/i);
  });
  await step(page, 'showcase-13-kpi-collection-rate', async () => {
    // collection_rate is the calculated field authored in step 05.
    await buildVisual(page, /number cards/i, [{ role: /y[- ]?axis|value|measure/i, field: 'collection_rate' }]);
    await setPillAggregate(page, /average|avg/i);
  });
  await step(page, 'showcase-14-bar-dept-charge', async () => {
    await buildVisual(page, /^\s*Bar Chart\s*$/i, [
      { role: /x[- ]?axis/i, field: 'department' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await setPillAggregate(page, /^\s*sum\s*$/i);
    await setPillSort(page, 'desc');
    await openProperties(page);
    const dl = page.locator('.config-sidebar .config-row, .config-sidebar .config-group').filter({ hasText: /data label/i }).first();
    const tog = dl.locator('app-custom-toggle').first();
    if (await tog.count()) await tog.click({ timeout: 3000 }).catch(() => {});
    await closeProperties(page);
  });
  await step(page, 'showcase-15-donut-enctype', async () => {
    await buildVisual(page, /donut/i, [
      { role: /x[- ]?axis/i, field: 'encounter_type' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await setPillAggregate(page, /^\s*sum\s*$/i);
  });

  // ══════════════════ TAB 2: TIME TRENDS ═══════════════════════════════
  await step(page, 'showcase-20-tab-time', async () => { await addTab(page, /chart/i, 'Time Trends'); await selectTabByName(page, /time trends/i); });
  await step(page, 'showcase-21-line-trend', async () => {
    await buildVisual(page, /line chart/i, [
      { role: /x[- ]?axis/i, field: 'encounter_date' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await setPillAggregate(page, /^\s*sum\s*$/i);
    await openProperties(page);
    await setConfigDropdown(page, /trend line/i, /linear/i).catch(() => {});
    await setConfigDropdown(page, /quick calc/i, /running total/i).catch(() => {});
    await closeProperties(page);
  });
  await step(page, 'showcase-22-area-encounters', async () => {
    await buildVisual(page, /area chart/i, [
      { role: /x[- ]?axis/i, field: 'encounter_date' },
      { role: /y[- ]?axis/i, field: 'encounter_id' },
    ]);
    await setPillAggregate(page, /count(?!\s*distinct)/i);
  });

  // ══════════════════ TAB 3: GEOGRAPHY ═════════════════════════════════
  await step(page, 'showcase-30-tab-geo', async () => { await addTab(page, /chart/i, 'Geography'); await selectTabByName(page, /geography/i); });
  await step(page, 'showcase-31-worldmap-region', async () => {
    await buildVisual(page, /world map/i, [
      { role: /x[- ]?axis|region/i, field: 'region' },
      { role: /y[- ]?axis|value/i, field: 'total_charge' },
    ]);
    await setPillAggregate(page, /^\s*sum\s*$/i);
  });
  await step(page, 'showcase-32-bar-region-los', async () => {
    await buildVisual(page, /^\s*Bar Chart\s*$/i, [
      { role: /x[- ]?axis/i, field: 'region' },
      { role: /y[- ]?axis/i, field: 'length_of_stay_days' },
    ]);
    await setPillAggregate(page, /average|avg/i);
  });

  // ══════════════════ TAB 4: PROVIDERS ═════════════════════════════════
  await step(page, 'showcase-40-tab-providers', async () => { await addTab(page, /chart/i, 'Providers'); await selectTabByName(page, /providers/i); });
  await step(page, 'showcase-41-topn-providers', async () => {
    await buildVisual(page, /horizontal bar/i, [
      { role: /x[- ]?axis/i, field: 'provider_name' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await setPillAggregate(page, /^\s*sum\s*$/i);
    await setPillSort(page, 'desc');
    await openProperties(page);
    await setConfigDropdown(page, /^\s*Limit\s*$/i, /top/i).catch(() => {});
    const cnt = page.locator('.config-sidebar .config-group').filter({ hasText: /count/i }).locator('input').first();
    if (await cnt.count()) await cnt.fill('10', { timeout: 3000 }).catch(() => {});
    await closeProperties(page);
  });
  await step(page, 'showcase-42-scatter-los-charge', async () => {
    await buildVisual(page, /scatter plot/i, [
      { role: /x[- ]?axis/i, field: 'length_of_stay_days' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
  });
  await step(page, 'showcase-43-table-providers', async () => {
    await addVisualPick(page, /^\s*Table\s*$/i);
    for (const f of ['provider_name', 'specialty', 'encounter_id']) { await clickField(page, f).catch(() => {}); await page.waitForTimeout(250); }
  });

  // ══════════════════ TAB 5: FINANCIALS ════════════════════════════════
  await step(page, 'showcase-50-tab-financials', async () => { await addTab(page, /table/i, 'Financials'); await selectTabByName(page, /financials/i); });
  await step(page, 'showcase-51-heatmap-pivot', async () => {
    await buildVisual(page, /heat map/i, [
      { role: /x[- ]?axis/i, field: 'department' },
      { role: /y[- ]?axis/i, field: 'encounter_type' },
      { role: /z[- ]?axis|value/i, field: 'total_charge' },
    ]);
    await setPillAggregate(page, /^\s*sum\s*$/i);
  });
  await step(page, 'showcase-52-combo-dualaxis', async () => {
    await buildVisual(page, /combo/i, [
      { role: /x[- ]?axis/i, field: 'department' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await setPillAggregate(page, /^\s*sum\s*$/i);
    // Second measure on the secondary axis: avg amount_paid.
    const addCol = page.locator('.axis-slot.multi .add-chip, .axis-chips .add-chip').first();
    if (await addCol.count()) { await addCol.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(250); await clickField(page, 'amount_paid').catch(() => {}); await page.waitForTimeout(350); }
  });
  await step(page, 'showcase-53-calc-field-chart', async () => {
    // Bar on the CALCULATED FIELD collection_rate (authored in step 05).
    await buildVisual(page, /^\s*Bar Chart\s*$/i, [
      { role: /x[- ]?axis/i, field: 'department' },
      { role: /y[- ]?axis/i, field: 'collection_rate' },
    ]);
    await setPillAggregate(page, /average|avg/i);
  });

  // ══════════════════ CROSS-FILTER + DRILL (Overview) ══════════════════
  await step(page, 'showcase-60-crossfilter-drill', async () => {
    await selectTabByName(page, /overview/i);
    await page.waitForTimeout(500);
    const bar = page.locator('.visual-box').filter({ hasText: /department/i }).first();
    if (await bar.count()) { await bar.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(500); }
    await ensureSegment(page, /visuals/i);
    const cf = page.locator('.interaction-row').filter({ hasText: /cross/i }).first();
    const cfTog = cf.locator('app-custom-toggle').first();
    if (await cfTog.count()) await cfTog.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    const ms = page.locator('.drill-row app-custom-multiselect, .drill-row').first();
    await ms.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
    for (const dim of [/region/i, /specialty/i]) {
      const opt = page.locator('.p-multiselect-item, li[role="option"]').filter({ hasText: dim }).first();
      if (await opt.count()) { await opt.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(200); }
    }
    await page.keyboard.press('Escape').catch(() => {});
    log.push('   cross-filter + drill applied');
  });

  // ══════════════════ TAB RENAME ══════════════════════════════════════
  // The first tab was created by the empty-strip add (default "Tab 1"); the
  // popover-named tabs came after. Rename the first tab to "Overview" via
  // double-click (the tab name has (dblclick)="startRenameTab" — more reliable
  // than the context menu), and separately rename "Providers".
  async function renameTab(tab: import('@playwright/test').Locator, to: string) {
    await page.mouse.click(1200, 300).catch(() => {});
    await page.waitForTimeout(200);
    const nameEl = tab.locator('.analysis-tab__name').first();
    await nameEl.dblclick({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const input = page.locator('.analysis-tab__rename').first();
    if (await input.count()) {
      await input.fill(to, { timeout: 4000 }).catch(() => {});
      await input.press('Enter').catch(() => {});
    } else {
      // Fallback: right-click → Rename.
      await tab.click({ button: 'right', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.locator('.tab-ctx__item').filter({ hasText: /rename/i }).first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(300);
      const input2 = page.locator('.analysis-tab__rename').first();
      if (await input2.count()) { await input2.fill(to, { timeout: 4000 }).catch(() => {}); await input2.press('Enter').catch(() => {}); }
    }
    await page.waitForTimeout(500);
  }
  await step(page, 'showcase-60b-rename-first-tab', async () => {
    await renameTab(page.locator('.analysis-tab').first(), 'Overview');
    log.push(`   tabNames=${JSON.stringify(await page.locator('.analysis-tab__name').allInnerTexts().catch(() => []))}`);
  });

  // ══════════════════ TAB COLOURS ══════════════════════════════════════
  await step(page, 'showcase-61-tab-colours', async () => {
    const specs: Array<[RegExp, number]> = [[/^\s*Overview\s*$/i, 0], [/^\s*Financials\s*$/i, 3]];
    for (const [nameRx, swatchIdx] of specs) {
      await page.mouse.click(1200, 300).catch(() => {});
      await page.waitForTimeout(200);
      const tab = page.locator('.analysis-tab').filter({ hasText: nameRx }).first();
      await tab.click({ button: 'right', timeout: 5000 }).catch(() => {});
      await page.locator('.tab-ctx').first().waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.locator('.tab-ctx__swatch:not(.tab-ctx__swatch--clear)').nth(swatchIdx).click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.click(1200, 300).catch(() => {});
      await page.waitForTimeout(250);
    }
    log.push(`   coloredTabDots=${await page.locator('.analysis-tab__color-dot').count()}`);
  });
  await step(page, 'showcase-62-tab-rename', async () => {
    await renameTab(page.locator('.analysis-tab').filter({ hasText: /^\s*Providers\s*$/i }).first(), 'Provider Performance');
    await page.waitForTimeout(500);
    log.push(`   tabNames=${JSON.stringify(await page.locator('.analysis-tab__name').allInnerTexts().catch(() => []))}`);
  });

  const preSave = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.visual-list-item')).map((el) => ({
      name: (el.querySelector('.visual-name') as HTMLElement)?.innerText?.trim(),
      type: (el.querySelector('.visual-type-label') as HTMLElement)?.innerText?.trim(),
    })),
  ).catch(() => []);
  log.push(`   preSaveLayers(${preSave.length})=${JSON.stringify(preSave)}`);
  await shot(page, 'showcase-63-pre-save');

  // ══════════════════ SAVE (versioned) ═════════════════════════════════
  await step(page, 'showcase-70-save', async () => {
    // Nuke ANY lingering body-attached overlay (tab context menu / pill menu /
    // drill multiselect panel) — an open p-overlayPanel / multiselect panel
    // sits above the save dialog and silently intercepts the Save click.
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(120); }
    await page.evaluate(() => {
      document.querySelectorAll('.p-overlaypanel, .p-multiselect-panel, .p-dropdown-panel, .tab-ctx-panel, .add-tab-panel, .pill-menu-panel')
        .forEach((el) => el.parentElement?.removeChild(el));
    }).catch(() => {});
    await page.mouse.click(1200, 300).catch(() => {});
    await page.waitForTimeout(600);
    // Open the save dialog from the toolbar Save button.
    const saveBtn = page.locator('.a-toolbar__right .a-btn--primary').first();
    await expect(saveBtn).toBeEnabled({ timeout: 20000 }).catch(() => {});
    await saveBtn.click({ timeout: 10000 }).catch(async () => { await saveBtn.click({ force: true }).catch(() => {}); });
    await page.locator('.save-analysis-popup').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    const dlgName = page.locator('.save-analysis-popup input').first();
    if (await dlgName.count()) {
      const v = await dlgName.inputValue().catch(() => '');
      if (!v) await dlgName.fill(savedAnalysisName, { timeout: 4000 }).catch(() => {});
      else savedAnalysisName = v;
    }
    // Justification is REQUIRED (update path). Use fill() (proven to update the
    // standalone ngModel — same as the passing savetest flow).
    const just = page.locator('#saveJustification, .save-analysis-popup textarea').first();
    if (await just.count()) {
      await just.click({ timeout: 4000 }).catch(() => {});
      await just.fill('Maximal multi-tab clinical showcase full author pass', { timeout: 6000 }).catch(() => {});
    }
    await page.waitForTimeout(500);
    await shot(page, 'showcase-70a-save-dialog');
    const dlgSave = page.locator('.save-analysis-popup .btn-save').first();
    await expect(dlgSave).toBeEnabled({ timeout: 8000 }).catch(() => {});
    const putWaiter = () => page.waitForResponse(
      (r) => /\/analyses\//.test(r.url()) && r.request().method() === 'PUT',
      { timeout: 15000 },
    ).catch(() => null);
    // Attempt 1: normal Playwright click.
    let pw = putWaiter();
    await dlgSave.click({ timeout: 8000 }).catch(() => {});
    let put = await pw;
    // Attempt 2: dispatch a native click directly on the DOM element — bypasses
    // any transparent overlay that might intercept the synthesized mouse click.
    if (!put && (await page.locator('.save-analysis-popup').count())) {
      log.push('   save click #1 did not fire PUT — retrying via DOM click()');
      pw = putWaiter();
      await dlgSave.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
      put = await pw;
    }
    // Attempt 3: Enter submit inside the justification field (<form> submit).
    if (!put && (await page.locator('.save-analysis-popup').count())) {
      log.push('   save attempt #2 failed — retrying via Enter submit');
      pw = putWaiter();
      await just.click({ timeout: 3000 }).catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
      put = await pw;
    }
    if (put) log.push(`   PUT ${put.status()} ${put.url().slice(-60)}`);
    else log.push('   WARN: no PUT captured after 3 attempts');
    await page.waitForURL(/\/app\/analyses(\?|$|\/[0-9a-f-]{36}$)/i, { timeout: 15000 }).catch(() => {});
    await page.locator('.save-analysis-popup').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    savedUrl = page.url();
    log.push(`   savedName="${savedAnalysisName}" urlAfterSave=${savedUrl}`);
  });

  // ══════════════════ RE-OPEN + VERIFY ═════════════════════════════════
  await step(page, 'showcase-80-reopen', async () => {
    await page.waitForTimeout(1500);
    if (!/\/app\/analyses(\?|$)/.test(page.url())) {
      await page.locator('.nav-card').filter({ hasText: /analyses/i }).first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    log.push(`   listRows=${await page.locator('.dataset-name-link').count()}`);
    const link = page.getByText(new RegExp('^\\s*' + savedAnalysisName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i')).first();
    if (await link.count()) await link.click({ timeout: 10000 }).catch(() => {});
    else await page.locator('.dataset-name-link').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForURL(/\/app\/analyses\/[0-9a-f-]{36}/i, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const m = page.url().match(/\/app\/analyses\/([0-9a-f-]{36})/i);
    if (m) { await page.goto(`/app/analyses/${m[1]}/edit`, { waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(6000); }
    await ensureSegment(page, /visuals/i);
    log.push(`   reopenedEditor=${page.url()}`);
  });

  const tabsAfter: any[] = [];
  await step(page, 'showcase-81-verify-tabs', async () => {
    const tabNames = await page.locator('.analysis-tab__name').allInnerTexts().catch(() => []);
    log.push(`   reloadedTabs=${JSON.stringify(tabNames)}`);
    for (let i = 0; i < tabNames.length; i++) {
      await page.locator('.analysis-tab').nth(i).click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const canvases = await page.locator('.visual-box canvas').count();
      const boxes = await page.locator('.visual-box').count();
      const titles = await page.locator('.visual-inline-title .inline-title-text').allInnerTexts().catch(() => []);
      tabsAfter.push({ tab: (tabNames[i] || '').trim(), boxes, canvases, titles });
      await shot(page, `showcase-81-reload-tab-${i}-${(tabNames[i] || 'tab').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
    }
    log.push(`   tabsAfterReload=${JSON.stringify(tabsAfter)}`);
  });

  const report = {
    savedAnalysisName, savedUrl,
    steps: log, tabsAfterReload: tabsAfter,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 80),
    pageErrors: [...new Set(pageErrors)].slice(0, 80),
    netErrors: [...new Set(netErrors)].slice(0, 80),
    finalUrl: page.url(),
  };
  fs.writeFileSync(`${SHOTS}/../showcase-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== SHOWCASE DIAG ===\n' + JSON.stringify(report, null, 2));
  expect(log.some((l) => l.startsWith('OK   showcase-00-login'))).toBeTruthy();
});
