/**
 * Editor showcase — screenshots of the three modules in use, for review.
 *
 * The parity spec proves the styling matches by comparing computed values; this
 * one shows what that looks like with real content, IntelliSense open and results
 * on screen. Output: /Users/gaurav.goel/code/Personal/DBExec/screenshots
 *
 * Run:  npx playwright test -c e2e/playwright.config.ts editor-showcase
 */
import { expect, Page, test } from '@playwright/test';

import { authToken, firstConnection, login } from './_auth';

const DATASET_ID = '929bdfcc-cc8c-43e2-a18d-b24fb1247cc3';
const OUT = '/Users/gaurav.goel/code/Personal/DBExec/screenshots';

test.use({ viewport: { width: 1680, height: 1050 } });

async function waitForMonaco(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!(window as any).monaco?.editor?.getModels?.().length,
    undefined,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(1000);
}

async function setSql(page: Page, sql: string): Promise<void> {
  await page.evaluate((value: string) => {
    (window as any).monaco.editor.getModels()[0].setValue(value);
  }, sql);
  await page.waitForTimeout(500);
}

/** Focus Monaco's textarea — clicking the host can land on an overlay. */
async function focusEditor(page: Page): Promise<void> {
  await page.locator('.monaco-editor textarea').first().focus();
  await page.waitForTimeout(250);
}

test.describe('editor showcase', () => {
  test('Query Executor — IntelliSense, results, find', async ({ page }) => {
    await login(page);
    const conn = await firstConnection(page, await authToken(page));
    await page.goto(`/query-runner/exec?conn=${conn.id}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForMonaco(page);
    await page.waitForTimeout(1500);

    // Expand a schema so the object browser shows the shared row styling.
    await page.locator('.qx-node').first().click().catch(() => undefined);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/70-executor-object-browser.png` });

    // Schema/table IntelliSense after FROM.
    await setSql(page, 'select * from ');
    await focusEditor(page);
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End',
    );
    await page.keyboard.press('End');
    await page.keyboard.type('pu', { delay: 90 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/71-executor-intellisense-schema.png` });

    // Column IntelliSense through the lazy fetch.
    await setSql(page, 'select * from public.chart_demo t where ');
    await focusEditor(page);
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End',
    );
    await page.keyboard.press('End');
    await page.keyboard.type('t.', { delay: 110 });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${OUT}/72-executor-intellisense-columns.png` });

    // A real query, run.
    await setSql(
      page,
      'select region, product, sum(sales) as total\nfrom public.chart_demo\ngroup by region, product\norder by total desc',
    );
    await page.evaluate(() => {
      const host = document.querySelector('app-query-executor');
      (window as any).ng?.getComponent?.(host)?.run?.('all');
    });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/73-executor-results.png` });

    // Error marker from the shared validator.
    await setSql(page, 'select count( from public.chart_demo');
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/74-executor-syntax-error.png` });

    // Monaco's find widget, styled as the shared card.
    await setSql(page, 'select region, product, sales\nfrom public.chart_demo\nwhere region = \'East\'');
    await focusEditor(page);
    await page.evaluate(() => {
      (window as any).monaco.editor.getEditors()[0].trigger('s', 'actions.find', {});
    });
    await page.waitForTimeout(900);
    await page.keyboard.type('region', { delay: 80 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/75-executor-find-widget.png` });
  });

  test('Dataset Creator and Editor — the same editor', async ({ page }) => {
    await login(page);

    await page.goto(`/app/datasets/${DATASET_ID}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(4000);
    if (await page.locator('.monaco-editor').first().isVisible().catch(() => false)) {
      await waitForMonaco(page);
      await page.screenshot({ path: `${OUT}/76-dataset-editor.png` });

      // IntelliSense in the dataset SQL editor.
      await setSql(page, 'select * from ');
      await focusEditor(page);
      await page.keyboard.press(
        process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End',
      );
      await page.keyboard.press('End');
      await page.keyboard.type('pu', { delay: 90 });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/77-dataset-editor-intellisense.png` });

      // The live field sidebar. Its icons come from the app-wide data-type
      // vocabulary, so a list of columns is scannable rather than the same glyph
      // repeated once per row.
      const sidebar = page.locator('app-field-sidebar');
      if (await sidebar.isVisible().catch(() => false)) {
        await sidebar.screenshot({ path: `${OUT}/80-field-sidebar.png` });
        const icons = await page
          .locator('.field-sidebar__item .pi')
          .evaluateAll(els => [
            ...new Set(
              els.map(e => [...e.classList].find(c => c.startsWith('pi-'))),
            ),
          ]);
        console.log('field sidebar distinct icons:', JSON.stringify(icons));
        // One icon for every row means the icon column carries no information —
        // which is exactly what pi-table-for-everything did.
        expect(
          icons.length,
          'the field sidebar is rendering a single icon for every type',
        ).toBeGreaterThan(3);
      }
    }

    await page.goto('/app/datasets/new', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/78-dataset-creator.png` });
  });

  test('Field Creator — formula editor beside the same chrome', async ({ page }) => {
    await login(page);
    await page.goto(`/app/datasets/${DATASET_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.locator('button.btn-add-field').first().click();
    await expect(page.locator('.acf-body')).toBeVisible({ timeout: 20_000 });
    await waitForMonaco(page);
    await page.waitForTimeout(1200);

    await page.locator('.acf-form app-custom-input input').first().fill('showcase_margin');
    await page.evaluate(() => {
      const m = (window as any).monaco;
      const models = m.editor.getModels();
      const model =
        models.find((x: any) => x.getLanguageId?.() === 'formulaLang') ??
        models[models.length - 1];
      model.setValue(
        "ifelse(\n  sum({sales}) = 0,\n  'no sales',\n  concat(\n    upper(trim({region})),\n    ' · ',\n    toString(round((runningSum({sales}) / sum({sales})) * 100, 1)),\n    '%'\n  )\n)",
      );
    });
    await page.waitForTimeout(700);
    await page.locator('.acf-footer__validate').click();
    await expect(page.locator('.acf-validation')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/79-field-creator-validated.png` });
  });
});
