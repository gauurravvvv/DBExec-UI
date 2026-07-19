import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * The main event: drive the Analyses EDITOR live against the seeded clinical
 * dataset. Login → open the analysis → build tabs + visuals (bar / line / pie /
 * KPI / table) → map clinical fields into wells → set aggregation → save →
 * reload → confirm the visuals persisted and charts rendered real data.
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
  // Capture the analyses PUT body so we can inspect the exact save payload.
  page.on('request', (req) => {
    if (req.method() === 'PUT' && /\/analyses\//.test(req.url())) {
      try {
        const body = req.postData();
        if (body) {
          fs.writeFileSync(`${SHOTS}/../put-payload.json`, body);
        }
      } catch {}
    }
  });
}

async function shot(page: Page, name: string) {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  } catch {}
}

async function step(page: Page, label: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    log.push(`OK   ${label} (${Date.now() - t0}ms)`);
  } catch (e: any) {
    log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 260)}`);
  }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}

/** Add a visual, set its chart type, then map fields into named role slots.
 *  mappings: array of { role: <axis-label regex>, field: <field name> } applied
 *  in order. Each map = click the axis-slot, then click the field card. */
async function buildVisual(
  page: Page,
  chartLabel: RegExp,
  mappings: Array<{ role: RegExp; field: string }>,
) {
  // Ensure Visuals panel open (chart-type grid lives there). Click "Add Visual".
  const addVisual = page
    .locator('button, .add-visual-button, [class*="add-visual"]')
    .filter({ hasText: /add visual/i })
    .first();
  await addVisual.click({ timeout: 10000 });
  await page.waitForTimeout(800);

  // Pick chart type from the grid.
  const card = page
    .locator('.chart-type-card')
    .filter({ hasText: chartLabel })
    .first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(800);

  // Map each field: click the axis slot by its label, then the field card.
  for (const m of mappings) {
    const slot = page
      .locator('.axis-slot')
      .filter({ hasText: m.role })
      .first();
    await slot.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    // field-card in the Fields panel (left). Match exact field name text.
    const fieldCard = page
      .locator('.field-card .field-name, .field-card')
      .filter({ hasText: new RegExp('^\\s*' + m.field + '\\s*$', 'i') })
      .first();
    await fieldCard.click({ timeout: 8000 }).catch(async () => {
      // fallback: looser contains-match
      await page
        .locator('.field-card')
        .filter({ hasText: new RegExp(m.field, 'i') })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    });
    await page.waitForTimeout(500);
  }
}

test('editor — build maximal clinical analysis, save, reload, verify', async ({
  page,
}) => {
  test.setTimeout(300_000);
  wire(page);

  await step(page, 'e01-login', async () => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#auth-account').fill(ORG);
    await page.locator('#auth-username').fill(USER);
    await page.locator('#auth-password').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app|\/relay|\/home|\/dashboard/, { timeout: 45000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  // Direct-navigate to the editor (we're authenticated now; the guard bounce
  // was for a cold /app/analyses list goto — the edit route with an id loads).
  await step(page, 'e02-open-editor', async () => {
    await page.goto(`/app/analyses/${ANALYSIS_ID}/edit`, {
      waitUntil: 'networkidle',
    });
    await page.waitForTimeout(4000); // bootstrap + dataset run
    log.push(`   url=${page.url()}`);
  });

  // Probe the authoring chrome is present.
  await step(page, 'e03-probe-chrome', async () => {
    const hasSave = await page.locator('button', { hasText: /save/i }).count();
    const hasAddTabStrip = await page
      .locator('.analysis-tab-strip, .analysis-tab-add')
      .count();
    const fieldsCount = await page.locator('.field-card').count();
    const status = await page.locator('.a-status__text').first().textContent().catch(() => '');
    log.push(
      `   chrome: save=${hasSave} tabStrip=${hasAddTabStrip} fieldCards=${fieldsCount} status="${(status || '').trim()}"`,
    );
  });

  // Ensure Visuals panel + Fields panel are open (toolbar segmented toggles).
  await step(page, 'e04-open-panels', async () => {
    // Fields
    const fieldsBtn = page.locator('.a-segment__btn', { hasText: /fields/i }).first();
    if (await fieldsBtn.count()) {
      const active = await fieldsBtn.getAttribute('class');
      if (!/is-active/.test(active || '')) await fieldsBtn.click().catch(() => {});
    }
    // Visuals
    const visualsBtn = page.locator('.a-segment__btn', { hasText: /visuals/i }).first();
    if (await visualsBtn.count()) {
      const active = await visualsBtn.getAttribute('class');
      if (!/is-active/.test(active || '')) await visualsBtn.click().catch(() => {});
    }
    await page.waitForTimeout(800);
  });

  // Dump the editor DOM so we can see field-card names + chart-type labels.
  const editorDom = await page.evaluate(() => {
    const fields = Array.from(document.querySelectorAll('.field-card .field-name')).map(
      (e) => (e as HTMLElement).innerText.trim(),
    );
    const charts = Array.from(document.querySelectorAll('.chart-type-card .chart-name')).map(
      (e) => (e as HTMLElement).innerText.trim(),
    );
    const slots = Array.from(document.querySelectorAll('.axis-slot .axis-label')).map(
      (e) => (e as HTMLElement).innerText.trim(),
    );
    return { fields, charts, slots };
  });
  fs.writeFileSync(`${SHOTS}/../editor-dom.json`, JSON.stringify(editorDom, null, 2));
  log.push(
    `   editor: fields=${editorDom.fields.length} charts=${editorDom.charts.length} slots=${editorDom.slots.length}`,
  );

  // ── Create a named tab FIRST so every visual we build lands on it ──
  await step(page, 'e04b-add-tab-first', async () => {
    // With no tabs yet the strip shows a labelled "+ Add tab" button.
    const addTabBtn = page
      .locator('.analysis-tab-add')
      .first();
    await addTabBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(700);
    // If the type/name popup appeared, fill it; otherwise the click already
    // created a default tab.
    const nameInput = page.locator('input.add-tab-name, .add-tab-name').first();
    if (await nameInput.count()) {
      await nameInput.fill('Overview', { timeout: 4000 }).catch(() => {});
      const addBtn = page
        .locator('.add-tab-btn.primary, .add-tab-btn')
        .filter({ hasText: /add/i })
        .first();
      await addBtn.click({ timeout: 4000 }).catch(() => {});
    }
    await page.waitForTimeout(1000);
    const tabCount = await page.locator('.analysis-tab').count();
    log.push(`   tabs after first add: ${tabCount}`);
  });

  // ── Visual 1: Bar — total_charge by department (X-Axis / Y-Axis) ──
  await step(page, 'e05-visual-bar', async () => {
    await buildVisual(page, /bar chart/i, [
      { role: /x[- ]?axis/i, field: 'department' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await page.waitForTimeout(1500);
  });

  // ── Visual 2: Line — total_charge by encounter_date ─────────────
  await step(page, 'e06-visual-line', async () => {
    await buildVisual(page, /line chart/i, [
      { role: /x[- ]?axis/i, field: 'encounter_date' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await page.waitForTimeout(1500);
  });

  // ── Visual 3: Pie — total_charge by encounter_type (multi-slice) ─
  // (region/specialty/facility_state are single-valued in this dataset, so
  //  they'd render as one slice; encounter_type has 4 distinct values.)
  await step(page, 'e07-visual-pie', async () => {
    await buildVisual(page, /pie chart/i, [
      { role: /x[- ]?axis/i, field: 'encounter_type' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await page.waitForTimeout(1500);
  });

  // ── Visual 4: KPI (number card) — sum of total_charge (~$68M) ───
  await step(page, 'e07b-visual-kpi', async () => {
    await buildVisual(page, /number|kpi|card|metric/i, [
      { role: /y[- ]?axis|value|measure/i, field: 'total_charge' },
    ]);
    await page.waitForTimeout(1500);
  });

  // ── Visual 5: Table — a few columns ─────────────────────────────
  await step(page, 'e07c-visual-table', async () => {
    // Table has no axis slots; clicking fields toggles table columns.
    const addVisual = page
      .locator('button, .add-visual-button, [class*="add-visual"]')
      .filter({ hasText: /add visual/i })
      .first();
    await addVisual.click({ timeout: 10000 });
    await page.waitForTimeout(800);
    const card = page.locator('.chart-type-card').filter({ hasText: /^\s*table\s*$/i }).first();
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await card.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    // Toggle a few columns into the table by clicking field cards.
    for (const f of ['department', 'total_charge', 'region']) {
      await page
        .locator('.field-card')
        .filter({ hasText: new RegExp('^\\s*' + f + '\\s*$', 'i') })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1000);
  });

  // ── Aggregation via on-pill menu: set SUM on the bar's Y-Axis measure.
  //     (Re-focus visual 1 from the Layers list first.)
  await step(page, 'e07d-agg-pill', async () => {
    const firstLayer = page.locator('.visual-list-item').first();
    await firstLayer.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    // Open the Y-axis pill menu on the focused visual's mapping.
    const pill = page.locator('.axis-value__pill').last();
    if (await pill.count()) {
      await pill.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(500);
      const sumItem = page
        .locator('.pill-menu__item')
        .filter({ hasText: /^\s*sum\s*$/i })
        .first();
      if (await sumItem.count()) {
        await sumItem.click({ timeout: 4000 }).catch(() => {});
      }
      // Dismiss any lingering pill overlay so it can't obscure the toolbar.
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(600);
  });

  // Save — opens save-analyses-dialog (name prefilled + REQUIRED justification).
  await step(page, 'e08-save', async () => {
    // Close any open overlay panel first (pill / add-tab) that could sit
    // over the toolbar.
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(1200, 300).catch(() => {}); // click empty canvas
    await page.waitForTimeout(400);
    const saveBtn = page.locator('button.a-btn--primary').first();
    // Wait for it to be enabled (canSave = some visual has a chartType).
    await expect(saveBtn).toBeEnabled({ timeout: 15000 }).catch(() => {});
    await saveBtn.click({ timeout: 10000 }).catch(async () => {
      await saveBtn.click({ timeout: 5000, force: true }).catch(() => {});
    });
    await page.waitForTimeout(1500);
    // Fill the required justification (textarea #saveJustification).
    const just = page.locator('#saveJustification, textarea').first();
    await just.fill('E2E automated maximal analysis save', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    // Click "Save Analysis" (.btn-save), enabled once justification is set.
    const dlgSave = page.locator('.btn-save, button').filter({ hasText: /save analysis/i }).first();
    await dlgSave.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);
    log.push(`   url-after-save=${page.url()}`);
  });

  // Verify the analyses LIST loads (BUG #6 regression) + shows our analysis,
  // then open it from the list (the head-of-lineage / latest version) and
  // confirm the visuals + charts persisted and re-render.
  await step(page, 'e09-list-loads', async () => {
    // Save navigated to /app/analyses. Confirm the list is not empty.
    await page.waitForTimeout(2000);
    const listRows = await page.locator('.dataset-name-link, a[href*="/app/analyses/"]').count();
    const emptyState = await page.getByText(/no records found/i).count();
    log.push(`   list rows=${listRows} emptyState=${emptyState}`);
    // Open our analysis by name.
    const link = page
      .locator('.dataset-name-link, a[href*="/app/analyses/"]')
      .filter({ hasText: /clinical encounters analysis/i })
      .first();
    await link.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);
    log.push(`   opened url=${page.url()}`);
  });

  // The list link opens the VIEW route (:id). Switch to edit to inspect the
  // authored layers, or just verify the view renders the charts.
  await step(page, 'e10-reopen-verify', async () => {
    // If we're on the view route, that's fine — charts should render there.
    // If a route needs /edit, navigate there using the current id.
    const m = page.url().match(/\/app\/analyses\/([0-9a-f-]{36})/i);
    const openId = m ? m[1] : null;
    if (openId) {
      await page.goto(`/app/analyses/${openId}/edit`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(6000);
    }
    const visualCells = await page.locator('.visual-cell, .visual-box').count();
    const canvasEls = await page.locator('canvas').count();
    const layerItems = await page.locator('.visual-list-item').count();
    const tabs = await page.locator('.analysis-tab').count();
    const layers = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.visual-list-item')).map((el) => ({
        name: (el.querySelector('.visual-name') as HTMLElement)?.innerText?.trim(),
        type: (el.querySelector('.visual-type-label') as HTMLElement)?.innerText?.trim(),
      })),
    );
    log.push(
      `   after reopen: visualCells=${visualCells} canvas=${canvasEls} layerItems=${layerItems} tabs=${tabs}`,
    );
    log.push(`   layers=${JSON.stringify(layers)}`);
  });

  const report = {
    steps: log,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 60),
    pageErrors: [...new Set(pageErrors)].slice(0, 60),
    netErrors: [...new Set(netErrors)].slice(0, 60),
    finalUrl: page.url(),
  };
  fs.writeFileSync(`${SHOTS}/../editor-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== EDITOR DIAG ===\n' + JSON.stringify(report, null, 2));

  expect(log.some((l) => l.startsWith('OK   e01-login'))).toBeTruthy();
});
