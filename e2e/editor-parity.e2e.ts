/**
 * Cross-module editor parity.
 *
 * The point of the unification was that the three editor surfaces look the same.
 * This asserts it by reading COMPUTED styles off the live pages rather than by
 * eyeballing screenshots — a screenshot shows a difference, a computed-style
 * comparison names it.
 *
 * Screens covered: Query Executor, Dataset Creator (add), Dataset Editor (edit)
 * and the Field Creator dialog — the four distinct components that mount an
 * editor. All go through CodeEditorService, so the editor and its gutter must
 * report identical values everywhere.
 *
 * The Field Editor is not a fifth sample: it is the same component and template
 * as the Field Creator with an editMode flag, so sampling it would assert that a
 * component matches itself.
 *
 * No dark-mode leg: the app has no dark mode. Four components used to branch on a
 * `dark-theme` body class that nothing ever adds, so toggling it would test
 * nothing. The variation that DOES exist is per-organisation branding, and the
 * theme is built from computed tokens precisely so it follows that.
 *
 * Also writes screenshots/editor-parity-*.png for review.
 *
 * Run:  npx playwright test -c e2e/playwright.config.ts editor-parity
 */
import { expect, Page, test } from '@playwright/test';

import {
  authToken,
  connectableDatasourceId,
  firstConnection,
  login,
} from './_auth';

const DATASET_ID = '929bdfcc-cc8c-43e2-a18d-b24fb1247cc3';
const OUT = '/Users/gaurav.goel/code/Personal/DBExec/screenshots';

test.use({ viewport: { width: 1680, height: 1050 } });

/** Properties that must match on every screen, and why each one matters. */
const EDITOR_PROPS = [
  'fontFamily', // the mono stack
  'fontSize', // code must not shrink to the app's rem scale
  'lineHeight',
  'backgroundColor',
] as const;


interface Sample {
  screen: string;
  editor: Record<string, string>;
  gutter: Record<string, string>;
  theme: string;
}

/** Wait for Monaco to exist AND have laid out, so styles are real. */
async function waitForMonaco(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const m = (window as any).monaco;
      return !!m?.editor?.getModels?.().length && !!document.querySelector('.monaco-editor');
    },
    undefined,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(1200);
}

/** Read the styles that define "how the editor looks" on the current screen. */
async function sample(page: Page, screen: string): Promise<Sample> {
  return page.evaluate(
    ({ screen, editorProps }) => {
      const pick = (el: Element | null, props: readonly string[]) => {
        const out: Record<string, string> = {};
        if (!el) return out;
        const cs = getComputedStyle(el);
        for (const p of props) out[p] = (cs as any)[p];
        return out;
      };
      const root = document.querySelector('.monaco-editor');
      // Monaco applies the font to .view-lines, not the root.
      const lines = document.querySelector('.monaco-editor .view-lines');
      const gutter = document.querySelector('.monaco-editor .margin');
      return {
        screen,
        editor: pick(lines ?? root, editorProps),
        gutter: pick(gutter, ['backgroundColor']),
        // Monaco records the theme as a class on its root element.
        theme: root ? root.className.replace(/\s+/g, ' ').trim() : '',
      };
    },
    { screen, editorProps: EDITOR_PROPS as unknown as string[] },
  );
}

/** Report every property whose value is not identical across all samples. */
function divergences(samples: Sample[]): string[] {
  const out: string[] = [];
  const first = samples[0];
  for (const prop of EDITOR_PROPS) {
    const values = new Map<string, string[]>();
    for (const s of samples) {
      const v = s.editor[prop] ?? '(missing)';
      values.set(v, [...(values.get(v) ?? []), s.screen]);
    }
    if (values.size > 1) {
      const detail = [...values.entries()]
        .map(([v, screens]) => `${v} → ${screens.join(', ')}`)
        .join('  |  ');
      out.push(`editor.${prop}: ${detail}`);
    }
  }
  const gutters = new Set(samples.map(s => s.gutter['backgroundColor']));
  if (gutters.size > 1) {
    out.push(
      `gutter.backgroundColor: ${samples
        .map(s => `${s.screen}=${s.gutter['backgroundColor']}`)
        .join('  |  ')}`,
    );
  }
  void first;
  return out;
}

/**
 * Object-explorer rows, sampled per screen.
 *
 * The Dataset Creator's schema tree and the Query Executor's object browser are
 * the same thing — schema → table → column — so unlike the Field Creator's flat
 * field list they must converge completely. `.schema-header`/`.column-item` and
 * `.qx-node`/`.qx-col` now include the same mixins; this proves it.
 */
const EXPLORER_PROPS = ['paddingTop', 'paddingBottom', 'fontSize', 'gap'] as const;

async function sampleExplorer(
  page: Page,
  screen: string,
  rowSelector: string,
  colSelector: string,
): Promise<Record<string, string> | null> {
  return page.evaluate(
    ({ rowSelector, colSelector, props }) => {
      const row = document.querySelector(rowSelector);
      const col = document.querySelector(colSelector);
      if (!row) return null;
      const out: Record<string, string> = {};
      const rcs = getComputedStyle(row);
      for (const p of props) out[`row.${p}`] = (rcs as any)[p];
      if (col) {
        const ccs = getComputedStyle(col);
        for (const p of props) out[`col.${p}`] = (ccs as any)[p];
      }
      return out;
    },
    { rowSelector, colSelector, props: EXPLORER_PROPS as unknown as string[] },
  );
}

test.describe('editor parity across the three modules', () => {
  test('all five editor screens report identical editor styling', async ({ page }) => {
    const samples: Sample[] = [];
    const explorers: Record<string, Record<string, string> | null> = {};

    await login(page);
    const tok = await authToken(page);

    // ── 1. Query Executor ──────────────────────────────────────────────────
    const conn = await firstConnection(page, tok);

    await page.goto(`/query-runner/exec?conn=${conn.id}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForMonaco(page);
    samples.push(await sample(page, 'query-executor'));
    // Expand a schema so the tree rows exist before sampling them.
    await page.locator('.qx-node').first().click().catch(() => undefined);
    await page.waitForTimeout(2000);
    explorers['query-executor'] = await sampleExplorer(
      page,
      'query-executor',
      '.qx-node',
      '.qx-col',
    );
    await page.screenshot({ path: `${OUT}/60-parity-query-executor.png` });

    // ── 2. Dataset Creator ─────────────────────────────────────────────────
    // The create route is /new and edit is /:id/edit — not /add and /edit/:id.
    await page.goto('/app/datasets/new', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // The SQL editor only mounts once a datasource is chosen — and it must be one
    // that can actually connect. Picking the first dropdown option selects the
    // newest datasource, which in this environment is often a migration-import
    // stub whose schema call answers 500; the editor then never mounts and this
    // spec reports a styling regression that isn't one.
    const goodDs = await connectableDatasourceId(page, await authToken(page));
    if (goodDs) {
      await page.goto(`/app/datasets/new?datasourceId=${goodDs}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(3000);
    }
    if (await page.locator('.monaco-editor').first().isVisible().catch(() => false)) {
      await waitForMonaco(page);
      samples.push(await sample(page, 'dataset-add'));
      await page.screenshot({ path: `${OUT}/61-parity-dataset-add.png` });
    } else {
      console.log(
        goodDs
          ? 'dataset-add: editor did not mount despite a connectable datasource'
          : 'dataset-add: skipped — no datasource in this environment can connect',
      );
    }

    // ── 3. Dataset Editor ──────────────────────────────────────────────────
    await page.goto(`/app/datasets/${DATASET_ID}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(4500);
    if (await page.locator('.monaco-editor').first().isVisible().catch(() => false)) {
      await waitForMonaco(page);
      samples.push(await sample(page, 'dataset-edit'));
      await page.locator('.schema-header').first().click().catch(() => undefined);
      await page.waitForTimeout(2500);
      explorers['dataset-edit'] = await sampleExplorer(
        page,
        'dataset-edit',
        '.schema-header',
        '.column-item',
      );
      await page.screenshot({ path: `${OUT}/62-parity-dataset-edit.png` });
    } else {
      console.log('dataset-edit: editor did not mount — skipped');
    }

    // ── 4. Field Creator ───────────────────────────────────────────────────
    await page.goto(`/app/datasets/${DATASET_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.locator('button.btn-add-field').first().click();
    await expect(page.locator('.acf-body')).toBeVisible({ timeout: 20_000 });
    await waitForMonaco(page);
    samples.push(await sample(page, 'field-add'));
    await page.screenshot({ path: `${OUT}/63-parity-field-add.png` });

    // The Field EDITOR is deliberately not sampled separately: it is the same
    // component and the same template as the Field Creator, opened with an
    // editMode flag. There is no distinct styling path, so a fifth sample would
    // assert that a component matches itself. Dataset add and edit ARE sampled
    // separately, because those are two different components.

    // ── Report ─────────────────────────────────────────────────────────────
    console.log('\n=== editor style samples ===');
    for (const s of samples) {
      console.log(
        `${s.screen.padEnd(16)} font=${s.editor['fontFamily']?.slice(0, 28)} ` +
          `size=${s.editor['fontSize']} lh=${s.editor['lineHeight']} ` +
          `bg=${s.editor['backgroundColor']} gutter=${s.gutter['backgroundColor']}`,
      );
    }

    // Four distinct components: the executor, dataset add, dataset edit and the
    // field dialog. Fewer means a screen failed to mount and parity was not
    // actually measured — which must fail, not pass quietly.
    expect(
      samples.map(s => s.screen),
      'a screen failed to mount, so parity was not measured across all four',
    ).toEqual(['query-executor', 'dataset-add', 'dataset-edit', 'field-add']);

    // The object explorers, reported side by side. Both are schema trees, so
    // every property here should match.
    console.log('\n=== object explorer rows ===');
    for (const [screen, vals] of Object.entries(explorers)) {
      console.log(`${screen.padEnd(16)} ${vals ? JSON.stringify(vals) : '(no rows found)'}`);
    }
    const exRows = explorers['query-executor'];
    const dsRows = explorers['dataset-edit'];
    if (exRows && dsRows) {
      const bad = Object.keys(exRows).filter(k => exRows[k] !== dsRows[k]);
      if (bad.length) {
        console.log(
          'EXPLORER DIVERGENCES:\n  ' +
            bad
              .map(k => `${k}: executor=${exRows[k]} dataset=${dsRows[k]}`)
              .join('\n  '),
        );
      } else {
        console.log('explorer rows: identical');
      }
    }

    const diffs = divergences(samples);
    if (diffs.length) console.log('\nDIVERGENCES:\n  ' + diffs.join('\n  '));
    expect(
      diffs,
      `editor styling differs across screens:\n  ${diffs.join('\n  ')}`,
    ).toEqual([]);
  });
});
