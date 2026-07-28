/**
 * Formula-field UI screenshot sweep.
 *
 * Companion to formula-fields.e2e.ts. That suite asserts behaviour; this one
 * captures what the screens actually LOOK like, across simple and complex
 * formulas and every rejection class, so styling can be reviewed rather than
 * assumed.
 *
 * Output: /Users/gaurav.goel/code/Personal/DBExec/screenshots
 *
 * Run:  npx playwright test -c e2e/playwright.config.ts formula-screenshots
 */
import { expect, Page, test } from '@playwright/test';

const ORG = 'AIOrg';
const USER = 'admin_gaurav';
const PASS = 'Pass@1234';
const DATASET_ID = '929bdfcc-cc8c-43e2-a18d-b24fb1247cc3';
const OUT = '/Users/gaurav.goel/code/Personal/DBExec/screenshots';

const RUN_ID = String(Date.now()).slice(-6);

test.use({ viewport: { width: 1680, height: 1050 } });

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}

async function openDataset(page: Page): Promise<void> {
  // Never `networkidle`: the app holds an open SSE stream, so it never settles.
  await page.goto(`/app/datasets/${DATASET_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3000);
}

async function openDialog(page: Page): Promise<void> {
  await page.locator('button.btn-add-field').first().click();
  await expect(page.locator('.acf-body')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => !!(window as any).monaco?.editor?.getModels?.().length,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(1200);
}

/** Drive Monaco's model API — typed input gets mangled by auto-closing brackets. */
async function setFormula(page: Page, text: string): Promise<void> {
  await page.evaluate((value: string) => {
    const m = (window as any).monaco;
    const models = m.editor.getModels();
    const model =
      models.find((x: any) => x.getLanguageId?.() === 'formulaLang') ??
      models[models.length - 1];
    model.setValue(value);
  }, text);
  await page.waitForTimeout(600);
}

async function setName(page: Page, name: string): Promise<void> {
  const input = page.locator('.acf-form app-custom-input input').first();
  await input.fill(name);
  await input.blur();
  await page.waitForTimeout(300);
}

async function validate(page: Page): Promise<string> {
  const btn = page.locator('.acf-footer__validate');
  await expect(btn).toBeEnabled({ timeout: 15_000 });
  await btn.click();
  await expect(page.locator('.acf-validation')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
  return (await page.locator('.acf-validation').innerText()).trim();
}

async function shotDialog(page: Page, file: string): Promise<void> {
  await page.locator('.acf-body').screenshot({ path: `${OUT}/${file}` });
}

/* ── 1. Palette / catalog ────────────────────────────────────────────────── */

test.describe('screenshots', () => {
  test('01 · palette, usage docs and IntelliSense', async ({ page }) => {
    await login(page);
    await openDataset(page);

    await page.screenshot({
      path: `${OUT}/01-dataset-view-with-computed-fields.png`,
      fullPage: false,
    });

    await openDialog(page);
    await shotDialog(page, '02-dialog-empty-full-palette.png');

    // Every category expanded — the 137-function inventory.
    const heads = page.locator('.acf-category button, .acf-category [role="button"]');
    const n = await heads.count();
    for (let i = 0; i < Math.min(n, 4); i++) {
      await heads.nth(i).click({ timeout: 5000 }).catch(() => undefined);
    }
    await page.waitForTimeout(600);
    await shotDialog(page, '03-palette-categories-expanded.png');

    // Function usage + description preview — the "expose functions and their
    // usage properly" requirement.
    // Reach a function through the palette SEARCH rather than hunting for its
    // row: most categories are collapsed, so a direct row lookup only ever
    // found functions in whichever category happened to be open.
    const search = page.locator('input[placeholder*="Search functions"]').first();
    await expect(search, 'palette search input').toBeVisible();

    for (const fn of ['concat', 'ifelse', 'runningSum', 'periodToDateSum']) {
      await search.fill(fn);
      await page.waitForTimeout(800);
      const row = page.locator(`:text-is("${fn}")`).first();
      if (await row.isVisible().catch(() => false)) {
        await row.click();
        await page.waitForTimeout(600);
        await shotDialog(page, `04-function-usage-${fn}.png`);
      } else {
        console.log(`04: "${fn}" not found by palette search`);
      }
    }

    // Palette search filtering a family of functions.
    await search.fill('percentile');
    await page.waitForTimeout(800);
    await shotDialog(page, '05-palette-search-percentile.png');
    await search.fill('');
    await page.waitForTimeout(500);

    // IntelliSense — field references.
    const monaco = page.locator('#formula-editor-container');
    await monaco.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type('{sal', { delay: 80 });
    await page.waitForTimeout(1500);
    const fieldRows = await page
      .locator('.suggest-widget .monaco-list-row')
      .allInnerTexts()
      .catch(() => []);
    console.log('06 field suggestions:', JSON.stringify(fieldRows));
    await page.screenshot({ path: `${OUT}/06-intellisense-field-suggestions.png` });

    // IntelliSense — function names, outside braces.
    await page.keyboard.press('Escape');
    await setFormula(page, '');
    await monaco.click();
    await page.waitForTimeout(300);
    await page.keyboard.type('period', { delay: 80 });
    await page.waitForTimeout(1500);
    const fnRows = await page
      .locator('.suggest-widget .monaco-list-row')
      .allInnerTexts()
      .catch(() => []);
    console.log('07 function suggestions:', JSON.stringify(fnRows));
    await page.screenshot({ path: `${OUT}/07-intellisense-function-suggestions.png` });
  });

  /* ── 2. Valid formulas, simple → very complex ─────────────────────────── */

  const VALID: Array<[string, string, string]> = [
    [
      '10-valid-simple-row-concat',
      `concat({region}, ' / ', {product})`,
      'simple ROW · string concatenation',
    ],
    [
      '11-valid-row-arithmetic-round',
      `round(({profit} / {sales}) * 100, 2)`,
      'ROW · arithmetic with division guard-free rounding',
    ],
    [
      '12-valid-agg-sum',
      `sum({sales})`,
      'AGG · whole-column aggregate',
    ],
    [
      '13-valid-window-runningsum',
      `runningSum({sales})`,
      'WINDOW · running total',
    ],
    [
      '14-valid-nested-conditional',
      `ifelse({sales} > 5000, 'High', ifelse({sales} > 2000, 'Mid', ifelse({sales} > 500, 'Low', 'Minimal')))`,
      'ROW · three-deep nested ifelse',
    ],
    [
      '15-valid-nested-string-date',
      `concat(upper(left({product}, 3)), '-', extract('YYYY', {period}), '-', right(concat('00000', toString({quantity})), 5))`,
      'ROW · nested string + date extraction + zero-padding composed from right/concat',
    ],
    [
      '16-valid-window-over-agg',
      `round((runningSum({sales}) / sum({sales})) * 100, 2)`,
      'WINDOW over AGG · percent-of-total running share',
    ],
    [
      '17-valid-ranking',
      `rank({sales})`,
      'WINDOW · ranking',
    ],
    [
      '18-valid-period-to-date',
      `periodToDateSum({sales}, {period}, 'MM')`,
      'WINDOW · month-to-date aggregate',
    ],
    [
      '19-valid-percentile',
      `percentileCont({sales}, 90)`,
      'AGG · 90th percentile (continuous)',
    ],
    [
      '20-valid-very-complex',
      `ifelse(\n  sum({sales}) = 0,\n  'no sales',\n  concat(\n    upper(trim({region})),\n    ' | share ',\n    toString(round((runningSum({sales}) / sum({sales})) * 100, 1)),\n    '% | ',\n    ifelse(\n      dateDiff({period}, now(), 'DD') > 365,\n      concat('older than a year (', toString(extract('YYYY', {period})), ')'),\n      'within a year'\n    )\n  )\n)`,
      'very complex · AGG + WINDOW + dates + nested conditionals, multi-line',
    ],
    [
      '21-valid-derived-on-derived',
      `round({margin_pct} * 1.0 + coalesce({total_sales}, 0) / 100000, 3)`,
      'ROW · references EXISTING computed fields (derived-on-derived)',
    ],
  ];

  for (const [file, formula, label] of VALID) {
    test(`${file} — ${label}`, async ({ page }) => {
      await login(page);
      await openDataset(page);
      await openDialog(page);
      await setName(page, `shot_${RUN_ID}`);
      await setFormula(page, formula);
      const verdict = await validate(page);
      console.log(`${file}\n  formula: ${formula.replace(/\n/g, ' ')}\n  verdict: ${verdict.replace(/\n/g, ' | ')}`);
      await shotDialog(page, `${file}.png`);
      // The filename claims this is valid, so assert it. Without this the suite
      // happily produced a screenshot labelled "valid" that showed
      // Unknown function "lpad" — the label was wrong, not the engine.
      expect(verdict, `${file} is named valid but the UI rejected it`).toMatch(
        /validated successfully/i,
      );
    });
  }

  /* ── 3. Invalid formulas — every rejection class ──────────────────────── */

  const INVALID: Array<[string, string, string]> = [
    ['30-invalid-unknown-function', `nope({sales})`, 'unknown function + did-you-mean'],
    ['31-invalid-arity', `abs()`, 'wrong argument count + usage hint'],
    ['32-invalid-unknown-field', `{not_a_real_column} * 2`, 'unknown field reference'],
    ['33-invalid-nested-aggregate', `sum(avg({sales}))`, 'aggregate nested inside aggregate'],
    ['34-invalid-unbalanced-paren', `concat({region}, {product}`, 'unclosed parenthesis'],
    ['35-invalid-sql-injection', `{sales}; DROP TABLE users; --`, 'illegal character / injection attempt'],
    ['36-invalid-bad-date-unit', `extract('XX', {period})`, 'unrecognised date unit'],
    ['37-invalid-percentile-range', `percentileCont({sales}, 999)`, 'percentile outside 0-100'],
    ['38-invalid-too-deep', `${'abs('.repeat(40)}{sales}${')'.repeat(40)}`, 'nesting depth bound exceeded'],
    ['39-invalid-unterminated-string', `concat({region}, 'abc`, 'unterminated string literal'],
    ['40-invalid-bad-operator', `{sales} + * {profit}`, 'malformed operator sequence'],
    ['41-invalid-typo-did-you-mean', `concatt({region}, {product})`, 'misspelled function → did-you-mean hint'],
  ];

  for (const [file, formula, label] of INVALID) {
    test(`${file} — ${label}`, async ({ page }) => {
      await login(page);
      await openDataset(page);
      await openDialog(page);
      await setName(page, `shot_${RUN_ID}`);
      await setFormula(page, formula);
      const verdict = await validate(page);
      console.log(`${file}\n  formula: ${formula.slice(0, 90)}\n  verdict: ${verdict.replace(/\n/g, ' | ')}`);
      await shotDialog(page, `${file}.png`);
      // Likewise: a screenshot called "invalid" must actually show a rejection.
      expect(verdict, `${file} is named invalid but the UI accepted it`).not.toMatch(
        /validated successfully/i,
      );
    });
  }

  /* ── 4. Reserved name + save flow + live sidebar ──────────────────────── */

  test('50 · reserved function name is refused inline', async ({ page }) => {
    await login(page);
    await openDataset(page);
    await openDialog(page);
    await setName(page, 'concat');
    await setFormula(page, `{sales} * 2`);
    await page.waitForTimeout(800);
    const saveDisabled = await page
      .locator('.acf-footer .acf-btn--primary')
      .first()
      .isDisabled()
      .catch(() => null);
    console.log('50 reserved-name: save disabled =', saveDisabled);
    await shotDialog(page, '50-reserved-name-refused.png');
  });

  test('51 · save then the new field is immediately suggestable', async ({ page }) => {
    await login(page);
    await openDataset(page);
    await openDialog(page);
    const NEW = `shot_live_${RUN_ID}`;
    await setName(page, NEW);
    await setFormula(page, `concat({region}, '-', {channel})`);
    await validate(page);
    const save = page.locator('.acf-footer .acf-btn--primary').first();
    await save.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/51-after-save-field-list.png` });

    // Reopen and confirm the just-created field is suggestable with no refresh.
    await openDialog(page);
    const monaco = page.locator('#formula-editor-container');
    await monaco.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type('{shot_live', { delay: 70 });
    await page.keyboard.press('Control+Space').catch(() => undefined);
    await page.waitForTimeout(1200);
    const rows = await page.locator('.suggest-widget .monaco-list-row').allInnerTexts().catch(() => []);
    console.log('51 live suggestions:', JSON.stringify(rows));
    await page.screenshot({ path: `${OUT}/52-live-field-suggestable-no-refresh.png` });
  });
});
