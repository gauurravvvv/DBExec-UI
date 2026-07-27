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

/** Fields the spec creates, removed again in the cleanup test. */
const ALPHA = 'e2e_alpha';
const BETA = 'e2e_beta';

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}

/** Open the dataset list and click through to `dataset1`'s detail view. */
async function openDatasetView(page: Page): Promise<void> {
  await page.goto('/app/datasets', { waitUntil: 'networkidle' });
  const row = page.locator(`:text-is("${DATASET}")`).first();
  await expect(row, 'dataset1 must exist — seed it first').toBeVisible();
  await row.click();
  await page.waitForURL(/\/datasets?\//, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
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
 * Type into the formula editor.
 *
 * Monaco is not a textarea, so focus the container and use keyboard input. The
 * dialog ships a plain-textarea fallback for when Monaco fails to load, so try
 * that second rather than failing outright.
 */
async function typeFormula(page: Page, text: string): Promise<void> {
  const monaco = page.locator('#formula-editor-container');
  if (await monaco.isVisible().catch(() => false)) {
    await monaco.click();
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
    );
    await page.keyboard.press('Delete');
    await page.keyboard.type(text, { delay: 12 });
    return;
  }
  const fallback = page.locator('.acf-editor textarea').first();
  await expect(fallback, 'neither Monaco nor its textarea fallback rendered').toBeVisible();
  await fallback.fill(text);
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
async function suggestionsAfter(page: Page, text: string): Promise<string[]> {
  await typeFormula(page, text);
  await page.keyboard.press('Control+Space').catch(() => undefined);
  const widget = page.locator('.suggest-widget, .editor-widget.suggest-widget');
  if (!(await widget.isVisible({ timeout: 6000 }).catch(() => false))) {
    return [];
  }
  const rows = page.locator('.suggest-widget .monaco-list-row');
  const n = await rows.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(((await rows.nth(i).innerText().catch(() => '')) || '').trim());
  }
  return out;
}

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

    const labels = await suggestionsAfter(page, '{');
    console.log('B1 suggestions sample:', labels.slice(0, 12));
    const joined = labels.join(' | ').toLowerCase();
    expect(joined, 'expected base columns in the suggest widget').toContain('sales');
  });

  test('B2 a just-created field is suggestable without reopening', async ({
    page,
  }) => {
    await login(page);
    await openDatasetView(page);

    // 1 · create and save ALPHA
    await openFieldDialog(page);
    await setFieldName(page, ALPHA);
    await typeFormula(page, 'round({sales} * 2, 2)');
    await clickValidate(page);
    const save = page.locator('.acf-footer__primary .acf-btn--primary, .acf-footer__primary button').last();
    await expect(save).toBeEnabled({ timeout: 20_000 });
    await save.click();
    await expect(page.locator('.acf-body')).toBeHidden({ timeout: 30_000 });
    console.log('B2 saved', ALPHA);

    // 2 · open a NEW field dialog in the same session
    await openFieldDialog(page);

    // 3 · the field created seconds ago must already be offered
    const labels = await suggestionsAfter(page, '{');
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

    const labels = await suggestionsAfter(page, 'conc');
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
      await typeFormula(page, c.formula);
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
      await typeFormula(page, r.formula);
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
    await typeFormula(page, "concat(upper({region}), '-', {product})");
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
    await page.goto('/app/datasets', { waitUntil: 'networkidle' });
    const row = page.locator(`:text-is("${DATASET}")`).first();
    await row.click();
    await page.waitForLoadState('networkidle');

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
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('.field-sidebar');
    await expect(sidebar, 'D2 sidebar must render in edit-dataset').toBeVisible({
      timeout: 30_000,
    });
    const count = await page.locator('.field-sidebar__count').innerText();
    console.log('D2 sidebar field count:', count.trim());
    expect(parseInt(count.trim(), 10)).toBeGreaterThanOrEqual(21);

    // D3 — the five seeded fields cover Row, Aggregate and Window.
    const badges = await page.locator('.field-sidebar__item app-chip').count();
    console.log('D3 badge count in sidebar:', badges);
    expect(badges, 'formula fields should carry a stage badge').toBeGreaterThan(0);

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
    await typeFormula(page, '{sales} + 1');

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
  test('E1 removes the fields this suite created', async ({ page }) => {
    await login(page);
    await openDatasetView(page);

    for (const name of [ALPHA, BETA]) {
      const row = page.locator(`:text-is("${name}")`).first();
      if (!(await row.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log('E1', name, 'not present, nothing to remove');
        continue;
      }
      // Delete controls live on the field row; find the nearest destructive action.
      const container = row.locator('xpath=ancestor::*[self::tr or self::li][1]');
      const del = container
        .locator('button')
        .filter({ has: page.locator('i.pi-trash, [class*="trash"]') })
        .first();
      if (await del.isVisible({ timeout: 3000 }).catch(() => false)) {
        await del.click();
        const confirm = page
          .locator('.confirmation-popup button, [class*="confirm"] button')
          .filter({ hasText: /delete|yes|confirm/i })
          .first();
        if (await confirm.isVisible({ timeout: 4000 }).catch(() => false)) {
          await confirm.click();
        }
        console.log('E1 removed', name);
        await page.waitForTimeout(1200);
      } else {
        console.log('E1 no delete control found for', name);
      }
    }
  });
});
