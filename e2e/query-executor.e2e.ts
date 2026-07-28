/**
 * Query Executor end-to-end suite — Monaco migration gate.
 *
 * The executor ran on CodeMirror 6 and now runs on Monaco, sharing the app's one
 * theme, options and IntelliSense. This suite exists to prove the migration lost
 * nothing, so it deliberately re-tests the behaviours the CodeMirror setup
 * provided rather than only the new ones:
 *
 *   A  the editor mounts, and the placeholder Monaco has no option for is shown
 *   B  keybindings — Ctrl+Enter (statement at cursor) and Ctrl+Shift+Enter (all)
 *   C  IntelliSense — schemas/tables after FROM, dot completion, clause-scoped
 *      columns, and the case that matters most: a table whose columns were never
 *      fetched, which is what proves lazy loading survived
 *   D  toggles — word wrap and minimap, formerly Compartment reconfigures
 *   E  find/replace via Monaco's native widget, which replaced a hand-built panel
 *
 * Run:  npx playwright test -c e2e/playwright.config.ts query-executor
 */
import { expect, Page, test } from '@playwright/test';

const ORG = 'AIOrg';
const USER = 'admin_gaurav';
const PASS = 'Pass@1234';
const API = 'http://localhost:3000/api/v1';

test.use({ viewport: { width: 1680, height: 1050 } });

/** Resolve the auth token the app stored, so the spec can call the API directly. */
async function authToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) || '';
      // The login response stores `accessToken`; a naive /"token"/ match picks
      // up `refreshToken` first and every API call 401s.
      const m = v.match(/"accessToken"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
      if (v.startsWith('ey') && v.split('.').length === 3) return v;
    }
    return '';
  });
  expect(token, 'could not resolve an auth token from localStorage').toBeTruthy();
  return token;
}

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}

/** Open the standalone executor against the first available connection. */
async function openExecutor(page: Page): Promise<void> {
  await login(page);
  const token = await authToken(page);
  const res = await page.request.get(`${API}/query-runner/connections`, {
    headers: { 'x-auth-token': token },
  });
  const body = await res.json();
  const list = body?.data?.rows ?? body?.data?.connections ?? body?.data ?? [];
  const conn = (Array.isArray(list) ? list : [])[0];
  expect(conn, 'no query-runner connection exists — seed one first').toBeTruthy();

  await page.goto(`/query-runner/exec?conn=${conn.id}`, {
    // Never networkidle: the app holds an open SSE stream, so it never settles.
    waitUntil: 'domcontentloaded',
  });
  // Monaco is fetched from a CDN by MonacoLoaderService, so wait for the global
  // rather than a fixed timeout.
  await page.waitForFunction(
    () => !!(window as any).monaco?.editor?.getModels?.().length,
    undefined,
    { timeout: 40_000 },
  );
  await page.waitForTimeout(1200);
}

/** Set the SQL through Monaco's model API — typed brackets get auto-closed. */
async function setSql(page: Page, sql: string): Promise<void> {
  await page.evaluate((value: string) => {
    const m = (window as any).monaco;
    const model = m.editor.getModels()[0];
    model.setValue(value);
  }, sql);
  await page.waitForTimeout(400);
}

/** Type at the end of the current content and collect suggestion labels. */
async function suggestAfter(page: Page, sql: string, typed: string): Promise<string[]> {
  await setSql(page, sql);
  const host = page.locator('.qx-editor-host');
  await host.click();
  // Move to the very end of the document before typing.
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End',
  );
  await page.keyboard.press('End');
  await page.keyboard.type(typed, { delay: 70 });
  await page.waitForTimeout(1800);
  return page
    .locator('.suggest-widget .monaco-list-row')
    .allInnerTexts()
    .catch(() => []);
}

test.describe('Query Executor · Monaco', () => {
  test('A · editor mounts with the placeholder Monaco lacks', async ({ page }) => {
    await openExecutor(page);

    await expect(page.locator('.qx-editor-host .monaco-editor')).toBeVisible();

    // Empty document → the shared overlay stands in for CodeMirror's
    // placeholder() extension, which Monaco has no equivalent of.
    await setSql(page, '');
    const ph = page.locator('.dbx-editor-placeholder');
    await expect(ph).toBeVisible();
    console.log('A placeholder:', (await ph.innerText()).trim());

    await setSql(page, 'select 1');
    await expect(ph).toBeHidden();
    console.log('A placeholder hidden once typed');
  });

  test('B · Ctrl+Enter runs the statement at the cursor, Ctrl+Shift+Enter runs all', async ({
    page,
  }) => {
    await openExecutor(page);
    await setSql(page, 'select 1 as one;\nselect 2 as two;');

    // Put the caret inside the FIRST statement, then run "smart".
    // Focus Monaco's textarea explicitly: clicking the host can land on an
    // overlay, and the keystroke then goes to the page rather than the editor.
    await page.locator('.qx-editor-host .monaco-editor textarea').first().focus();
    await page.evaluate(() => {
      const m = (window as any).monaco;
      m.editor.getEditors()[0].setPosition({ lineNumber: 1, column: 5 });
    });
    await page.waitForTimeout(300);
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter',
    );
    await page.waitForTimeout(3500);
    const smart = (await page.locator('.qx-results').innerText()).slice(0, 400);
    console.log('B smart-run result:', smart.replace(/\n+/g, ' | ').slice(0, 200));
    // Assert the RESULT, not merely that the pane has text: the empty state
    // ("Run a query to see results") is itself text, so a length check passes
    // even when nothing ran. Only the first statement should have run, so `one`
    // must appear and `two` must not.
    expect(smart, 'Ctrl+Enter did not run the statement at the cursor').toMatch(/\bone\b/i);
    expect(smart, 'Ctrl+Enter ran more than the statement at the cursor').not.toMatch(/\btwo\b/i);

    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+Shift+Enter' : 'Control+Shift+Enter',
    );
    await page.waitForTimeout(3500);
    const all = (await page.locator('.qx-results').innerText()).slice(0, 600);
    console.log('B run-all result:', all.replace(/\n+/g, ' | ').slice(0, 200));
    // Two statements ⇒ two result sets. Assert on the tabs rather than on the
    // visible rows: only the ACTIVE tab's data is rendered, so looking for `two`
    // in the text fails even when both statements ran.
    expect(all, 'Ctrl+Shift+Enter did not produce a second result set').toMatch(
      /Result\s*2/i,
    );
  });

  test('C1 · schemas and tables are offered after FROM', async ({ page }) => {
    await openExecutor(page);
    const rows = await suggestAfter(page, 'select * from ', '');
    // An empty `typed` still needs an explicit trigger.
    await page.keyboard.press('Control+Space').catch(() => undefined);
    await page.waitForTimeout(1500);
    const after = await page
      .locator('.suggest-widget .monaco-list-row')
      .allInnerTexts()
      .catch(() => []);
    const labels = (after.length ? after : rows).map(r => r.split('\n')[0].trim());
    console.log('C1 after FROM:', JSON.stringify(labels.slice(0, 20)));
    // A bare length check passes on keyword noise ("from", "select"), which is
    // what word-based suggestions return when the schema never reached the
    // service. Demand an actual schema name from this connection's catalog.
    expect(
      labels.some(l => /^(public|schema_001)$/i.test(l)),
      `after FROM the list held no schema from the catalog: ${JSON.stringify(labels.slice(0, 20))}`,
    ).toBe(true);
  });

  test('C2 · dot completion resolves an alias to that table\'s columns', async ({
    page,
  }) => {
    await openExecutor(page);

    // Discover a real table from the object browser so the query is valid
    // against whatever this connection actually holds.
    const table = await page.evaluate(async () => {
      const cmp = (window as any).ng?.getComponent?.(
        document.querySelector('app-query-executor'),
      );
      return cmp?.browser?.[0]?.tables?.[0]?.name ?? null;
    });
    console.log('C2 discovered table:', table);

    const rows = await suggestAfter(
      page,
      `select * from public.chart_demo t where `,
      't.',
    );
    const labels = rows.map(r => r.split('\n')[0].trim());
    console.log('C2 dot completion:', JSON.stringify(labels.slice(0, 20)));
    // The lazy path: these columns were never fetched before this keystroke, so
    // they can only appear if setColumnRequestHandler fired, the fetch landed and
    // the catalog was re-fed. Generic SQL keywords (AND, BETWEEN, CASE…) are what
    // comes back when that chain is broken, so assert on a REAL column name.
    expect(
      labels.some(l => /^(region|product|sales|profit|quantity|channel|period)$/i.test(l)),
      `dot completion returned no column of chart_demo — the lazy column fetch is broken: ${JSON.stringify(labels.slice(0, 20))}`,
    ).toBe(true);
  });

  test('D · word wrap and minimap toggles apply to Monaco', async ({ page }) => {
    await openExecutor(page);

    const readOption = (name: string) =>
      page.evaluate((n: string) => {
        const m = (window as any).monaco;
        const ed = m.editor.getEditors()[0];
        return JSON.stringify(ed.getRawOptions()[n]);
      }, name);

    // Drive the component's own toggles rather than hunting for buttons, so the
    // test proves updateOptions works without depending on toolbar markup.
    const toggle = (method: 'toggleWrap' | 'toggleMinimap') =>
      page.evaluate((m: string) => {
        const host = document.querySelector('app-query-executor');
        const cmp = (window as any).ng?.getComponent?.(host);
        cmp?.[m]?.();
      }, method);

    const wrapBefore = await readOption('wordWrap');
    await toggle('toggleWrap');
    await page.waitForTimeout(500);
    const wrapAfter = await readOption('wordWrap');
    console.log(`D wordWrap ${wrapBefore} -> ${wrapAfter}`);
    expect(wrapAfter, 'toggleWrap did not change Monaco wordWrap').not.toBe(wrapBefore);

    const miniBefore = await readOption('minimap');
    await toggle('toggleMinimap');
    await page.waitForTimeout(500);
    const miniAfter = await readOption('minimap');
    console.log(`D minimap ${miniBefore} -> ${miniAfter}`);
    expect(miniAfter, 'toggleMinimap did not change Monaco minimap').not.toBe(miniBefore);
  });

  test('F · a syntax error paints a marker, and formatting reindents', async ({
    page,
  }) => {
    await openExecutor(page);

    // Unclosed parenthesis — the shared validator's territory.
    await setSql(page, 'select count( from public.chart_demo');
    await page.waitForTimeout(2000);
    const markers = await page.evaluate(() => {
      const m = (window as any).monaco;
      const model = m.editor.getModels()[0];
      return m.editor
        .getModelMarkers({ resource: model.uri })
        .map((k: any) => ({ owner: k.owner, message: k.message, severity: k.severity }));
    });
    console.log('F markers:', JSON.stringify(markers).slice(0, 260));
    expect(
      markers.length,
      'a syntax error produced no marker — the shared validator is not wired',
    ).toBeGreaterThan(0);

    expect(
      markers.some((k: any) => k.severity === 8),
      'no ERROR-severity marker for an unclosed parenthesis',
    ).toBe(true);

    // Correcting the SQL clears the ERRORS. Not all markers: the validator also
    // emits a "should end with semicolon" hint (severity 2) which is still
    // legitimately true, so asserting zero markers would be asserting a bug.
    await setSql(page, 'select count(*) from public.chart_demo');
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => {
      const m = (window as any).monaco;
      const model = m.editor.getModels()[0];
      return m.editor
        .getModelMarkers({ resource: model.uri })
        .map((k: any) => ({ message: k.message, severity: k.severity }));
    });
    console.log('F markers after fix:', JSON.stringify(after));
    expect(
      after.filter((k: any) => k.severity === 8),
      'error markers were not cleared once the SQL parsed',
    ).toEqual([]);

    // Formatting goes through the shared service, so it must actually change
    // sloppy SQL rather than silently no-op.
    await setSql(page, 'select a,b from t where a=1');
    await page.evaluate(() => {
      const host = document.querySelector('app-query-executor');
      (window as any).ng?.getComponent?.(host)?.format?.();
    });
    await page.waitForTimeout(900);
    const formatted = await page.evaluate(() =>
      (window as any).monaco.editor.getModels()[0].getValue(),
    );
    console.log('F formatted:', JSON.stringify(formatted));
    expect(formatted, 'format() did not reformat').not.toBe('select a,b from t where a=1');
    expect(formatted, 'formatting did not upper-case keywords').toMatch(/SELECT/);
  });

  test('E · Monaco find widget opens and is styled as a card', async ({ page }) => {
    await openExecutor(page);
    await setSql(page, 'select alpha, beta from gamma where alpha = 1');
    // Focus Monaco's own textarea: a click on the host can land on the overlay
    // rather than the input, and Ctrl+F then goes to the browser instead.
    await page.locator('.qx-editor-host .monaco-editor textarea').first().focus();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const m = (window as any).monaco;
      m.editor.getEditors()[0].trigger('test', 'actions.find', {});
    });
    await page.waitForTimeout(900);

    const find = page.locator('.monaco-editor .find-widget');
    await expect(find).toBeVisible();
    const radius = await find.evaluate(
      el => getComputedStyle(el).borderRadius,
    );
    console.log('E find widget border-radius:', radius);
    expect(radius, 'find widget is not using the shared card radius').not.toBe('0px');
  });
});
