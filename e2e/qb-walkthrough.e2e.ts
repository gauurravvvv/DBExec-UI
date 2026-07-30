/**
 * Query Builder v2 — complete functional walkthrough with detailed screenshots.
 *
 * Seeds a realistic scenario via the API (a datasource over the clinical demo
 * DB, several prompts bound to real columns, a builder with base table + joins
 * + output columns + placements), then drives the UI to screenshot every stage
 * — prompt library, per-prompt config, form designer, joins, columns, settings,
 * the compose screen with real conditions, and the RUN results grid.
 *
 * Screenshots land in /Users/gaurav.goel/code/Personal/DBExec/screenshots/QB.
 *
 * Run headed:
 *   DBEXEC_FE=http://localhost:4200 DBEXEC_API=http://localhost:3000/api/v1 \
 *   npx playwright test e2e/qb-walkthrough.e2e.ts --config=e2e/playwright.config.ts --headed
 */
import { expect, Page, test } from '@playwright/test';

const ORG = process.env['QB_ORG'] ?? 'TestOrg';
const USER = process.env['QB_USER'] ?? 'admin_gaurav';
const PASS = process.env['QB_PASS'] ?? 'Pass@1234';
const API = process.env['DBEXEC_API'] ?? 'http://localhost:3000/api/v1';
const DIR = '/Users/gaurav.goel/code/Personal/DBExec/screenshots/QB';

// Clinical demo DB connection (same PG server, the DbExec database).
// Stable name so re-runs reuse the same datasource instead of piling up dupes.
const CLIN = {
  name: `Clinical DW Demo`,
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'DbExec',
  username: 'postgres',
  password: 'Gaurav9058**',
};

let n = 0;
async function shot(page: Page, name: string) {
  n += 1;
  await page.screenshot({ path: `${DIR}/${String(n).padStart(2, '0')}-${name}.png`, fullPage: false });
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}
async function token(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = localStorage.getItem('access-token');
    if (d && d.split('.').length === 3) return d;
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) || '';
      const m = v.match(/"accessToken"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    }
    return '';
  });
}
function auth(tok: string) {
  return { 'x-auth-token': tok, 'Content-Type': 'application/json' };
}

test('QB v2 complete walkthrough', async ({ page }) => {
  test.setTimeout(300_000);

  await login(page);
  const tok = await token(page);
  expect(tok).toBeTruthy();
  const H = auth(tok);

  // ── SEED: datasource over the clinical demo DB (idempotent) ──────────
  // Reuse an existing "Clinical DW Demo" if a prior run already created it.
  const listDsRes = await page.request.get(`${API}/datasources?page=1&limit=200`, { headers: H });
  const listDs = await listDsRes.json();
  const dsRows: any[] =
    listDs?.data?.datasources ?? listDs?.data?.databases ??
    (Array.isArray(listDs?.data) ? listDs.data : []);
  let dsId = dsRows.find(d => d?.name === CLIN.name)?.id ?? null;
  if (!dsId) {
    const dsRes = await page.request.post(`${API}/datasources`, { headers: H, data: CLIN });
    const dsBody = await dsRes.json();
    dsId = dsBody?.data?.id ?? dsBody?.data?.datasource?.id;
    expect(dsId, `datasource create: ${JSON.stringify(dsBody).slice(0, 300)}`).toBeTruthy();
  }

  // ── SEED: prompts bound to real clinical columns ─────────────────────
  // Each prompt's config gives the filter/select expression the compiler uses.
  const prompts = [
    { name: 'Department', type: 'multiselect', dataType: 'text', col: 'department', group: 'Encounter', values: ['Cardiology', 'Oncology', 'Surgery', 'Emergency', 'Internal Medicine', 'Orthopedics'] },
    { name: 'Sex', type: 'radio', dataType: 'text', col: 'sex', group: 'Patient', values: ['M', 'F'] },
    { name: 'Encounter Type', type: 'dropdown', dataType: 'text', col: 'encounter_type', group: 'Encounter', values: ['Inpatient', 'Outpatient', 'Emergency'] },
    { name: 'Total Charge', type: 'number', dataType: 'number', col: 'total_charge', group: 'Financials' },
    { name: 'Region', type: 'multiselect', dataType: 'text', col: 'region', group: 'Geography', values: ['Northeast', 'Midwest', 'South', 'West'] },
    { name: 'Is Chronic', type: 'checkbox', dataType: 'bool', col: 'is_chronic', group: 'Clinical' },
  ];

  // Existing prompts on this datasource (idempotent re-use by name).
  const existRes = await page.request.get(
    `${API}/prompts?datasourceId=${dsId}&page=1&pageSize=500`, { headers: H });
  const existBody = await existRes.json();
  const existRows: any[] =
    existBody?.data?.prompts ?? existBody?.data?.rows ??
    (Array.isArray(existBody?.data) ? existBody.data : []);
  const existByName = new Map<string, string>(
    existRows.filter(r => r?.name && r?.id).map(r => [r.name, r.id]),
  );

  const promptIds: Record<string, string> = {};
  for (const p of prompts) {
    let id: string | null = existByName.get(p.name) ?? null;
    if (!id) {
      const cr = await page.request.post(`${API}/prompts`, {
        headers: H,
        data: {
          datasource: dsId,
          prompts: [{
            name: p.name, description: `${p.name} filter`, type: p.type,
            groupName: p.group, dataType: p.dataType,
            isSelectable: true, isFilterable: true, isSortable: true,
          }],
        },
      });
      const cb = await cr.json();
      id = cb?.data?.[0]?.id ?? cb?.data?.id;
      expect(id, `prompt ${p.name}: ${JSON.stringify(cb).slice(0, 200)}`).toBeTruthy();
    }
    promptIds[p.name] = id as string;

    // Config: bind to the real column (ea.<col>) + value source.
    await page.request.post(`${API}/prompts/${id}/config`, {
      headers: H,
      data: {
        id,
        datasource: dsId,
        schema: 'clinical',
        tables: 'encounter_analytics',
        columns: p.col,
        promptJoin: '',
        promptWhere: '',
        promptSql: `ea.${p.col}`,
        promptValueSQL: '',
        promptValues: p.values ?? [],
      },
    });
    // Value source for the curated ones.
    if (p.values) {
      await page.request.put(`${API}/prompts/${id}/value-source`, {
        headers: H,
        data: { valueSource: { kind: 'static', options: p.values.map(v => ({ value: v })) } },
      });
    }
    // Appearance + operators (prompt-level config, owned by the Prompt module).
    const opsByType: Record<string, string[]> = {
      multiselect: ['in', 'not_in'],
      dropdown: ['eq', 'neq'],
      radio: ['eq', 'neq'],
      number: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
      checkbox: ['eq'],
    };
    await page.request.put(`${API}/prompts/${id}/appearance`, {
      headers: H,
      data: {
        id,
        appearance: {
          type: p.type,
          label: p.name,
          placeholder: `Select ${p.name}`,
          allowedOperators: opsByType[p.type] ?? [],
        },
      },
    });
  }

  // ── SEED: query builder over clinical.encounter_analytics ────────────
  const qbRes = await page.request.post(`${API}/query-builders`, {
    headers: H,
    data: { name: `Encounter Explorer ${Date.now()}`, description: 'Clinical encounters demo', datasource: dsId },
  });
  const qbId = (await qbRes.json())?.data?.id;
  expect(qbId).toBeTruthy();

  // Base table + engine flag + output columns.
  await page.request.put(`${API}/query-builders/${qbId}/settings`, {
    headers: H,
    data: { baseSchema: 'clinical', baseTable: 'encounter_analytics', baseAlias: 'ea', usesOperatorEngine: true, defaultLimit: 500, maxLimit: 5000 },
  });
  await page.request.put(`${API}/query-builders/${qbId}/output-columns`, {
    headers: H,
    data: { outputColumns: [
      { expr: 'ea.department', alias: 'Department', sequence: 0 },
      { expr: 'ea.sex', alias: 'Sex', sequence: 1 },
      { expr: 'ea.encounter_type', alias: 'Type', sequence: 2 },
      { expr: 'ea.total_charge', alias: 'Charge', sequence: 3 },
      { expr: 'ea.region', alias: 'Region', sequence: 4 },
    ] },
  });
  // Placements: put every prompt on the builder, grouped.
  await page.request.put(`${API}/query-builders/${qbId}/prompts`, {
    headers: H,
    data: { placements: prompts.map((p, i) => ({
      promptId: promptIds[p.name], groupLabel: p.group, groupSequence: i, promptSequence: i,
      isMandatory: false, isLocked: false,
    })) },
  });

  // Seed a default condition tree so the composer opens PRE-FILLED with a real,
  // value-bearing filter (Department in Cardiology/Oncology AND Sex = F). This
  // makes the RUN screenshot show a genuinely FILTERED result, not all rows.
  await page.request.put(`${API}/query-builders/${qbId}/default-tree`, {
    headers: H,
    data: {
      defaultConditionTree: {
        kind: 'group', id: 'g0', op: 'AND', negate: false,
        children: [
          {
            kind: 'condition', id: 'c1', promptId: promptIds['Department'],
            operatorCode: 'in', negate: false,
            rhs: { kind: 'literal', values: ['Cardiology', 'Oncology'] },
          },
          {
            kind: 'condition', id: 'c2', promptId: promptIds['Sex'],
            operatorCode: 'eq', negate: false,
            rhs: { kind: 'literal', values: ['F'] },
          },
        ],
      },
    },
  });

  // ═══════════════ UI SCREENSHOTS ═══════════════════════════════════════

  // 1) Prompt library list
  await page.goto('/app/prompts', { waitUntil: 'domcontentloaded' });
  await page.locator('app-custom-dropdown').first().click();
  await page.locator(`li:has-text("${CLIN.name}"), .p-dropdown-item:has-text("${CLIN.name}")`).first().click();
  await page.waitForTimeout(1500);
  await shot(page, 'prompt-library-list');

  // 2) The prompt config screen — now the single home for ALL prompt config:
  // schema/table/column, related-table FK join, Appearance & Operators, Values.
  await page.goto(`/app/prompts/${promptIds['Department']}/configure`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot(page, 'prompt-config-top');
  // The scroll container is the inner .admin-form (overflow-y:auto), not body.
  const scrollForm = async (frac: number) =>
    page.evaluate((f) => {
      const el = document.querySelector('.admin-form') as HTMLElement | null;
      if (el) el.scrollTop = el.scrollHeight * f;
    }, frac);
  await scrollForm(0.5);
  await page.waitForTimeout(1000);
  await shot(page, 'prompt-config-appearance-operators');
  await scrollForm(1);
  await page.waitForTimeout(1000);
  await shot(page, 'prompt-config-values');

  // 3) Add-prompt form (blank, shows the create UX)
  await page.goto('/app/prompts/new', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await shot(page, 'prompt-add-form');

  // 4) Query builder list
  await page.goto('/app/query-builders', { waitUntil: 'domcontentloaded' });
  await page.locator('app-custom-dropdown').first().click();
  await page.locator(`li:has-text("${CLIN.name}"), .p-dropdown-item:has-text("${CLIN.name}")`).first().click();
  await page.waitForTimeout(1500);
  await shot(page, 'query-builder-list');

  // 5) DESIGN — form designer (placed prompts grouped)
  await page.goto(`/app/query-builders/${qbId}/design`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await shot(page, 'design-form-designer');

  // 6) DESIGN — joins
  await page.locator('button:has-text("Joins")').first().click();
  await page.waitForTimeout(1000);
  await shot(page, 'design-joins');

  // 7) DESIGN — output columns
  await page.locator('button:has-text("Columns")').first().click();
  await page.waitForTimeout(1000);
  await shot(page, 'design-output-columns');

  // 8) DESIGN — settings
  await page.locator('button:has-text("Settings")').first().click();
  await page.waitForTimeout(1000);
  await shot(page, 'design-settings');

  // 9) DESIGN — back to the picker-only Form Designer (no per-prompt config).
  // The form designer now only picks + arranges prompts; all prompt config
  // (appearance/operators/values) lives in the Prompt module (step 2).
  await page.locator('button:has-text("Form")').first().click();
  await page.waitForTimeout(1000);
  await shot(page, 'design-form-picker-only');

  // 10) COMPOSE — opens PRE-FILLED from the seeded default tree
  // (Department in Cardiology/Oncology AND Sex = F).
  await page.goto(`/app/query-builders/${qbId}/compose`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await shot(page, 'compose-prefilled-conditions');

  // 11) Add one more condition interactively to show the Add-condition UX
  const addCond = page.locator('button:has-text("Add condition")').first();
  if (await addCond.count()) {
    await addCond.click();
    await page.waitForTimeout(1000);
    await shot(page, 'compose-add-condition');
    // pick Encounter Type in the new row's prompt dropdown
    const newRowPicker = page.locator('qb-condition-row app-custom-dropdown').last();
    await newRowPicker.click().catch(() => {});
    await page.locator('li:has-text("Encounter Type"), .p-dropdown-item:has-text("Encounter Type")').first().click().catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, 'compose-condition-prompt-selected');
  }

  // 12) COMPOSE — the generated SQL + summary panels reflect the real filter
  await page.waitForTimeout(800);
  await shot(page, 'compose-with-sql-preview');

  // 13) RUN — Count then Run, capture the FILTERED results
  const countBtn = page.locator('button:has-text("Count")').first();
  if (await countBtn.count()) {
    await countBtn.click();
    await page.waitForTimeout(2500);
    await shot(page, 'run-count-result');
  }
  const runBtn = page.locator('button:has-text("Run")').first();
  await runBtn.click();
  await page.waitForTimeout(3500);
  await shot(page, 'run-results-grid');

  // Final wide shot of the whole composer with results
  await page.waitForTimeout(500);
  await shot(page, 'run-results-full');

  // Leave the seeded scenario in place so the user can explore it in the UI.
  // (No cleanup — the user asked to see complete functionality live.)
});
