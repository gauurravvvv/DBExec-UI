/**
 * Formula-field UI end-to-end suite.
 *
 * Covers the browser-only behaviour that compilation, unit tests and the
 * authenticated API sweep cannot reach. Three real defects lived exactly here
 * today — a component rendered in no template, Monaco suggestions snapshotted at
 * dialog-open, and a catalog race that could paint an empty palette — so this
 * suite concentrates on render / type / click / observe rather than on values the
 * API already proved.
 *
 * Cases and selector contract: docs/superpowers/plans/2026-07-27-formula-ui-e2e-test-cases.md
 *
 * Run:  npx playwright test -c e2e/playwright.config.ts formula-fields
 */
import { expect, Page, test } from '@playwright/test';

const ORG = 'AIOrg';
const USER = 'admin_gaurav';
const PASS = 'Pass@1234';
const DATASET = 'dataset1';

/**
 * Fields the spec creates, removed again in the cleanup test.
 *
 * Suffixed per run: a leftover field from an interrupted run makes the save
 * 400 on a duplicate name, the dialog stays open, and the failure reads as a
 * product defect rather than stale state.
 */
const RUN_ID = String(Date.now()).slice(-6);
const ALPHA = `e2e_alpha_${RUN_ID}`;
const BETA = `e2e_beta_${RUN_ID}`;

/* ── helpers ─────────────────────────────────────────────────────────────── */

/**
 * Wait for the app to be interactive.
 *
 * NEVER use `networkidle` here. The app holds an open SSE stream for real-time
 * notifications, so the network is never idle and every such wait times out after
 * 45s — which is exactly how the first version of this suite failed on every
 * test. Wait for rendered content instead.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // The shell renders a sidebar on every authenticated route; once it is present
  // the router has resolved and the feature module is mounting.
  await page
    .locator('app-sidebar, .sidebar, nav')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1200);
}

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}

/** Open the dataset list and click through to `dataset1`'s detail view. */
async function openDatasetView(page: Page): Promise<void> {
  await page.goto('/app/datasets', { waitUntil: 'domcontentloaded' });
  const row = page.locator(`:text-is("${DATASET}")`).first();
  await expect(row, 'dataset1 must exist — seed it first').toBeVisible();
  await row.click();
  await page.waitForURL(/\/datasets?\//, { timeout: 30_000 });
  await settle(page);
}

/** Open the add-formula-field dialog from the dataset detail view. */
async function openFieldDialog(page: Page): Promise<void> {
  const trigger = page.locator('button.btn-add-field').first();
  await expect(trigger, 'add-field trigger must be present').toBeVisible();
  await trigger.click();
  await expect(page.locator('.acf-body')).toBeVisible({ timeout: 20_000 });
}

async function closeDialog(page: Page): Promise<void> {
  const cancel = page.locator('.acf-footer .acf-btn--ghost').first();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    // An unsaved-changes guard may interpose; accept it if it appears.
    const confirm = page
      .locator('.confirmation-popup button, [class*="confirm"] button')
      .filter({ hasText: /discard|yes|confirm|leave/i })
      .first();
    if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirm.click();
    }
  }
  await expect(page.locator('.acf-body')).toBeHidden({ timeout: 15_000 });
}

/**
 * Set the formula by driving Monaco's model API directly.
 *
 * Do NOT use keystrokes for this. Two things corrupt typed input:
 *   - Monaco auto-closes brackets, so a typed `{sales}` becomes `{sales}}`,
 *     which surfaced as `Unexpected character "}"`.
 *   - Keystrokes sent before the editor finishes initialising are dropped, so
 *     `runningSum(...)` arrived as `ingSum(...)` — reported as an unknown
 *     function, which looks like an engine bug and is not one.
 *
 * setValue is atomic and immune to both. Keystrokes are still used, separately,
 * where the point IS the typing (see typeForSuggest).
 */
async function setFormula(page: Page, text: string): Promise<void> {
  const monaco = page.locator('#formula-editor-container');
  if (await monaco.isVisible().catch(() => false)) {
    await page.waitForFunction(
      () => !!(window as any).monaco?.editor?.getModels?.().length,
      undefined,
      { timeout: 20_000 },
    );
    await page.evaluate((value: string) => {
      const m = (window as any).monaco;
      const models = m.editor.getModels();
      // The formula editor is the one using our custom language.
      const model =
        models.find((x: any) => x.getLanguageId?.() === 'formulaLang') ??
        models[models.length - 1];
      model.setValue(value);
    }, text);
    // Let Angular's change subscription observe the new value.
    await page.waitForTimeout(500);
    return;
  }
  const fallback = page.locator('.acf-editor textarea').first();
  await expect(
    fallback,
    'neither Monaco nor its textarea fallback rendered',
  ).toBeVisible();
  await fallback.fill(text);
}

/**
 * Type a prefix with real keystrokes and return the suggestion labels.
 *
 * Deliberately never types a closing brace — Monaco supplies it — and waits for
 * the editor to be ready before the first key, since early keystrokes are lost.
 */
async function typeForSuggest(page: Page, prefix: string): Promise<string[]> {
  const monaco = page.locator('#formula-editor-container');
  await expect(monaco).toBeVisible();
  await page.waitForFunction(
    () => !!(window as any).monaco?.editor?.getModels?.().length,
    undefined,
    { timeout: 20_000 },
  );
  await monaco.click();
  await page.waitForTimeout(400);
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
  );
  await page.keyboard.press('Delete');
  await page.keyboard.type(prefix, { delay: 60 });

  // Ask for suggestions explicitly; the trigger characters may already have.
  await page.keyboard.press('Control+Space').catch(() => undefined);

  const widget = page.locator('.suggest-widget.visible, .suggest-widget');
  if (!(await widget.first().isVisible({ timeout: 8000 }).catch(() => false))) {
    return [];
  }
  await page.waitForTimeout(400);
  const rows = page.locator('.suggest-widget .monaco-list-row');
  const n = await rows.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(((await rows.nth(i).innerText().catch(() => '')) || '').trim());
  }
  return out;
}

async function setFieldName(page: Page, name: string): Promise<void> {
  const input = page.locator('.acf-form app-custom-input input').first();
  await expect(input).toBeVisible();
  await input.fill(name);
  await input.blur();
}

async function clickValidate(page: Page): Promise<void> {
  const btn = page.locator('.acf-footer__validate');
  await expect(btn).toBeEnabled({ timeout: 15_000 });
  await btn.click();
  await expect(page.locator('.acf-validation')).toBeVisible({ timeout: 30_000 });
}

/** Trigger the Monaco suggest widget and return the visible suggestion labels. */
/** Expand every palette category so all function rows are in the DOM. */
async function expandAllCategories(page: Page): Promise<void> {
  const heads = page.locator('.acf-category button, .acf-category [role="button"]');
  const n = await heads.count();
  for (let i = 0; i < n; i++) {
    await heads.nth(i).click({ timeout: 5000 }).catch(() => undefined);
  }
}

/* ── Group A — catalog rendering ──────────────────────────────────────────── */

test.describe('A · catalog rendering', () => {
  test('A1/A2/A3 palette shows 12 categories, 137 functions, real descriptions', async ({
    page,
  }) => {
    await login(page);
    await openDatasetView(page);
    await openFieldDialog(page);

    const categories = page.locator('.acf-category');
    await expect(categories.first()).toBeVisible({ timeout: 20_000 });
    const catCount = await categories.count();
    console.log('A1 categories rendered:', catCount);
    expect(catCount, 'expected the 12 catalog categories').toBeGreaterThanOrEqual(12);

    await expandAllCategories(page);
    const fnCount = await page.locator('.acf-fn-item').count();
    console.log('A2 function rows rendered:', fnCount);
    expect(fnCount, 'expected all 137 functions from the API catalog').toBe(137);

    // A3 — descriptions and usage come from the API, so spot-check three.
    for (const name of ['concat', 'sum', 'runningSum']) {
      const row = page.locator('.acf-fn-item').filter({ hasText: name }).first();
      await row.click();
      const desc = await page.locator('.acf-preview__desc').innerText();
      const usage = await page.locator('.acf-preview__code').innerText();
      console.log(`A3 ${name}: usage="${usage}" desc=${desc.length} chars`);
      expect(desc.length, `${name} description should be substantial`).toBeGreaterThan(40);
      expect(usage, `${name} usage should demonstrate itself`).toContain(name);
    }
  });

  test('A4 palette search filters the function list', async ({ page }) => {
    await login(page);
    await openDatasetView(page);
    await openFieldDialog(page);

    const search = page
      .locator('.acf-rail--functions input, input')
      .filter({ hasNot: page.locator('[type="checkbox"]') })
      .last();
    await search.fill('round');
    await page.waitForTimeout(600);

    const rows = page.locator('.acf-fn-item');
    const n = await rows.count();
    console.log('A4 rows after searching "round":', n);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(137);
  });

  test('A5 reopening the dialog still paints a populated palette', async ({
    page,
  }) => {
    await login(page);
    await openDatasetView(page);

    await openFieldDialog(page);
    const first = await page.locator('.acf-category').count();
    await closeDialog(page);

    await openFieldDialog(page);
    const second = await page.locator('.acf-category').count();
    console.log('A5 categories: first open', first, '| second open', second);
    // The shareReplay fix: a second consumer must not get an empty snapshot.
    expect(second, 'second open must not paint an empty palette').toBeGreaterThanOrEqual(12);
  });
});

/* ── Group B — live suggestions ───────────────────────────────────────────── */

test.describe('B · live field suggestions', () => {
  test('B1 existing dataset fields are suggestable', async ({ page }) => {
    await login(page);
    await openDatasetView(page);
    await openFieldDialog(page);

    // Monaco VIRTUALISES the suggest list — only ~13 rows are in the DOM at a
    // time, alphabetically. Scanning an unfiltered list for a late-alphabet name
    // finds nothing even when the entry exists, so type a prefix and let Monaco
    // filter rather than asserting against a window.
    const labels = await typeForSuggest(page, '{sal');
    console.log('B1 suggestions for "{sal":', labels.slice(0, 10));
    const joined = labels.join(' | ').toLowerCase();
    expect(joined, 'expected the sales column to be suggestable').toContain('sales');
  });

  test('B2 a just-created field is suggestable without reopening', async ({
    page,
  }) => {
    await login(page);
    await openDatasetView(page);

    // 1 · create and save ALPHA
    await openFieldDialog(page);
    await setFieldName(page, ALPHA);
    await setFormula(page, 'round({sales} * 2, 2)');
    await clickValidate(page);
    const save = page.locator('.acf-footer__primary .acf-btn--primary, .acf-footer__primary button').last();
    await expect(save).toBeEnabled({ timeout: 20_000 });
    await save.click();
    await expect(page.locator('.acf-body')).toBeHidden({ timeout: 30_000 });
    console.log('B2 saved', ALPHA);

    // 2 · open a NEW field dialog in the same session
    await openFieldDialog(page);

    // 3 · the field created seconds ago must already be offered.
    // Filter by prefix so virtualisation cannot hide it.
    const labels = await typeForSuggest(page, '{e2e');
    const joined = labels.join(' | ').toLowerCase();
    console.log('B2 suggestions after save:', labels.slice(0, 15));
    expect(
      joined,
      `${ALPHA} must be suggestable immediately — this is the snapshotted-completions defect`,
    ).toContain(ALPHA.toLowerCase());
  });

  test('B4 function names complete outside braces', async ({ page }) => {
    await login(page);
    await openDatasetView(page);
    await openFieldDialog(page);

    const labels = await typeForSuggest(page, 'conc');
    console.log('B4 suggestions for "conc":', labels.slice(0, 8));
    expect(labels.join(' | ').toLowerCase()).toContain('concat');
  });
});

/* ── Group C — validation feedback ────────────────────────────────────────── */

test.describe('C · validation feedback', () => {
  const cases: { id: string; formula: string; badge: RegExp }[] = [
    { id: 'C1 ROW', formula: 'round({sales} - {profit}, 2)', badge: /row/i },
    { id: 'C2 AGG', formula: 'sum({sales})', badge: /aggregate/i },
    { id: 'C3 WINDOW', formula: 'runningSum({sales})', badge: /window/i },
  ];

  for (const c of cases) {
    test(`${c.id} → correct stage badge`, async ({ page }) => {
      await login(page);
      await openDatasetView(page);
      await openFieldDialog(page);
      await setFieldName(page, `probe_${c.id.split(' ')[0]}`);
      await setFormula(page, c.formula);
      await clickValidate(page);

      const banner = await page.locator('.acf-validation').innerText();
      console.log(`${c.id} banner:`, banner.replace(/\s+/g, ' ').slice(0, 90));

      const badge = page.locator('.acf-tier app-chip');
      await expect(badge, 'stage badge should render after a valid formula').toBeVisible({
        timeout: 20_000,
      });
      const badgeText = await badge.innerText();
      console.log(`${c.id} badge:`, badgeText.trim());
      expect(badgeText).toMatch(c.badge);

      // C4 — the standing server-compute note accompanies the badge.
      const note = await page.locator('.acf-tier-note').innerText();
      console.log(`${c.id} note:`, note.replace(/\s+/g, ' ').slice(0, 80));
      expect(note.length).toBeGreaterThan(20);
    });
  }

  const rejects: { id: string; formula: string; expect: RegExp }[] = [
    { id: 'C5 unknown function', formula: 'nope({sales})', expect: /nope/i },
    { id: 'C6 arity + usage hint', formula: 'abs()', expect: /abs/i },
    { id: 'C7 injection', formula: '1; DROP TABLE chart_demo', expect: /.+/ },
  ];

  for (const r of rejects) {
    test(`${r.id} → surfaced as invalid`, async ({ page }) => {
      await login(page);
      await openDatasetView(page);
      await openFieldDialog(page);
      await setFieldName(page, 'probe_bad');
      await setFormula(page, r.formula);
      await clickValidate(page);

      const banner = page.locator('.acf-validation');
      const text = (await banner.innerText()).replace(/\s+/g, ' ');
      console.log(`${r.id}:`, text.slice(0, 110));
      await expect(banner).toHaveClass(/is-invalid/, { timeout: 20_000 });
      expect(text).toMatch(r.expect);
    });
  }
});

/* ── Group D — save, store and sidebar ────────────────────────────────────── */

test.describe('D · save, store and sidebar', () => {
  test('D1 saving shows the field with no navigation', async ({ page }) => {
    await login(page);
    await openDatasetView(page);
    const urlBefore = page.url();

    await openFieldDialog(page);
    await setFieldName(page, BETA);
    await setFormula(page, "concat(upper({region}), '-', {product})");
    await clickValidate(page);
    const save = page.locator('.acf-footer__primary button').last();
    await expect(save).toBeEnabled({ timeout: 20_000 });
    await save.click();
    await expect(page.locator('.acf-body')).toBeHidden({ timeout: 30_000 });

    expect(page.url(), 'saving must not navigate').toBe(urlBefore);
    await expect(
      page.locator(`:text-is("${BETA}")`).first(),
      'the saved field must appear without a reload',
    ).toBeVisible({ timeout: 15_000 });
    console.log('D1 field visible post-save, url unchanged');
  });

  test('D2/D3/D4 sidebar renders, badges cover all kinds, New-field opens the dialog', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/app/datasets', { waitUntil: 'domcontentloaded' });
    const row = page.locator(`:text-is("${DATASET}")`).first();
    await row.click();
    await settle(page);

    // Reach edit-dataset — the only screen hosting the sidebar panel today.
    const edit = page
      .locator('button, a')
      .filter({ hasText: /^\s*edit\s*$/i })
      .first();
    if (await edit.isVisible({ timeout: 5000 }).catch(() => false)) {
      await edit.click();
    } else {
      await page.goto(page.url().replace('/view', '/edit'), {
        waitUntil: 'networkidle',
      });
    }
    await settle(page);

    const sidebar = page.locator('.field-sidebar');
    await expect(sidebar, 'D2 sidebar must render in edit-dataset').toBeVisible({
      timeout: 30_000,
    });
    const count = await page.locator('.field-sidebar__count').innerText();
    console.log('D2 sidebar field count:', count.trim());
    expect(parseInt(count.trim(), 10)).toBeGreaterThanOrEqual(21);

    // D3 — the seeded fields cover Row, Aggregate and Window, so all three badge
    // variants must be present. A field whose `stage` is NULL renders no badge by
    // design; scripts/backfillFormulaStage.ts fills those in for older rows.
    const badgeTexts: string[] = [];
    const chips = page.locator('.field-sidebar__item app-chip');
    const chipCount = await chips.count();
    for (let i = 0; i < chipCount; i++) {
      badgeTexts.push(
        (
          (await chips.nth(i).innerText().catch(() => '')) ||
          (await chips.nth(i).getAttribute('title')) ||
          ''
        ).trim(),
      );
    }
    const joined = badgeTexts.join(' | ').toLowerCase();
    console.log('D3 badges:', chipCount, '|', joined.slice(0, 140));
    expect(chipCount, 'formula fields should carry a stage badge').toBeGreaterThan(0);
    for (const kind of ['row', 'aggregate', 'window']) {
      expect(joined, `expected a ${kind} badge among the seeded fields`).toContain(kind);
    }

    // D4 — the New-field action must actually open the dialog.
    const newField = sidebar.locator('app-button button, button').first();
    await newField.click();
    await expect(
      page.locator('.acf-body'),
      'D4 sidebar New-field must open the dialog',
    ).toBeVisible({ timeout: 20_000 });
    console.log('D4 dialog opened from the sidebar');
  });

  test('D5 a reserved function name is refused', async ({ page }) => {
    await login(page);
    await openDatasetView(page);
    await openFieldDialog(page);
    await setFieldName(page, 'concat');
    await setFormula(page, '{sales} + 1');

    const inlineErr = page.locator('.acf-form small, .acf-form .error, .acf-form [class*="error"]');
    const save = page.locator('.acf-footer__primary button').last();
    const saveDisabled = await save.isDisabled().catch(() => false);
    const errText = (await inlineErr.first().innerText().catch(() => '')) || '';
    console.log('D5 save disabled:', saveDisabled, '| inline:', errText.slice(0, 70));
    expect(
      saveDisabled || /reserved|function name/i.test(errText),
      'a reserved function name must block the save',
    ).toBeTruthy();
  });
});

/* ── Group E — cleanup ────────────────────────────────────────────────────── */

test.describe('E · cleanup', () => {
  test('E1 removes the fields this suite created', async ({ request }) => {
    // Done over the API rather than the UI: the per-row delete control is nested
    // and its selector proved brittle, and cleanup failing must never be
    // mistaken for a product defect.
    const login = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: { organisation: ORG, username: USER, password: PASS },
    });
    const token = (await login.json())?.data?.accessToken;
    expect(token, 'cleanup needs a token').toBeTruthy();

    const list = await request.get('http://localhost:3000/api/v1/datasets?limit=50', {
      headers: { 'x-auth-token': token },
    });
    const datasets = (await list.json())?.data?.datasets ?? [];
    const ds = datasets.find((d: any) => d.name === DATASET);
    expect(ds, 'dataset1 should exist').toBeTruthy();

    const detail = await request.get(
      `http://localhost:3000/api/v1/datasets/${ds.id}`,
      { headers: { 'x-auth-token': token } },
    );
    const fields = (await detail.json())?.data?.datasetFields ?? [];

    // Sweep this run's fields AND any leftovers from an interrupted earlier run.
    const targets = fields.filter((x: any) =>
      /^e2e_(alpha|beta)/.test(x.columnToUse ?? ''),
    );
    console.log('E1 sweeping', targets.length, 'field(s)');
    for (const f of targets) {
      const name = f.columnToUse;
      const res = await request.delete(
        `http://localhost:3000/api/v1/datasets/${ds.id}/fields/${f.id}`,
        { headers: { 'x-auth-token': token } },
      );
      console.log('E1 removed', name, '->', res.status());
      expect(res.ok(), `deleting ${name} should succeed`).toBeTruthy();
    }
  });
});
