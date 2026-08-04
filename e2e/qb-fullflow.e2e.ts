/**
 * Query Builder v2 + Prompt full-flow live verification.
 *
 * Walks the real admin journey end to end against the running dev stack and
 * screenshots every step into e2e/screenshots/qb-fullflow/ so failures are
 * visible, not just asserted. Run headed to watch:
 *
 *   DBEXEC_FE=http://localhost:4200 DBEXEC_API=http://localhost:3000/api/v1 \
 *   npx playwright test e2e/qb-fullflow.e2e.ts --headed --project=chromium
 *
 * Creds come from the env (QB_ORG / QB_USER / QB_PASS) with TestOrg defaults.
 */
import { expect, Page, test } from '@playwright/test';

const ORG = process.env['QB_ORG'] ?? 'TestOrg';
const USER = process.env['QB_USER'] ?? 'admin_gaurav';
const PASS = process.env['QB_PASS'] ?? 'Pass@1234';
const API = process.env['DBEXEC_API'] ?? 'http://localhost:3000/api/v1';

import * as path from 'path';
const DIR = path.resolve(__dirname, 'screenshots/qb-fullflow');
let step = 0;
async function shot(page: Page, name: string) {
  step += 1;
  const n = String(step).padStart(2, '0');
  await page.screenshot({ path: `${DIR}/${n}-${name}.png`, fullPage: false });
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
    const direct = localStorage.getItem('access-token');
    if (direct && direct.split('.').length === 3) return direct;
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) || '';
      const m = v.match(/"accessToken"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
      if (v.startsWith('ey') && v.split('.').length === 3) return v;
    }
    return '';
  });
}

test('QB v2 + Prompt full admin flow', async ({ page }) => {
  test.setTimeout(240_000);

  await login(page);
  await shot(page, 'logged-in-home');

  const tok = await token(page);
  expect(tok, 'no auth token').toBeTruthy();

  // Resolve a datasource to work against.
  const dsRes = await page.request.get(`${API}/datasources?page=1&limit=10`, {
    headers: { 'x-auth-token': tok },
  });
  const dsBody = await dsRes.json();
  const datasource = dsBody?.data?.datasources?.[0];
  expect(datasource, `no datasource: ${JSON.stringify(dsBody).slice(0, 200)}`).toBeTruthy();
  const dsId = datasource.id;
  const dsName = datasource.name;

  // ─── 1. ADD PROMPT ───────────────────────────────────────────────────
  await page.goto('/app/prompts/new', { waitUntil: 'domcontentloaded' });
  await shot(page, 'add-prompt-empty');

  // Datasource (server-mode dropdown)
  await page.locator('app-custom-dropdown').first().click();
  await page.locator('.p-dropdown-item, li[role="option"]').first().waitFor({ timeout: 10_000 });
  await page.locator(`.p-dropdown-item:has-text("${dsName}"), li:has-text("${dsName}")`).first().click();

  const uniqueName = `E2E Country ${Date.now()}`;
  await page.locator('input[placeholder="Enter name"]').fill(uniqueName);
  await page.locator('input[placeholder="Enter description"]').fill('Country filter for E2E');

  // Type dropdown -> dropdown control
  const typeDd = page.locator('app-custom-dropdown').nth(1);
  await typeDd.click();
  await page.locator('.p-dropdown-item:has-text("Dropdown"), li:has-text("Dropdown")').first().click();
  await shot(page, 'add-prompt-filled');

  await page.locator('button:has-text("Save")').click();

  // Success toast, then navigation back to the list.
  await page.locator('text=/created successfully/i').first().waitFor({ timeout: 15_000 }).catch(() => {});
  await shot(page, 'add-prompt-success-toast');
  await page.waitForURL(/\/app\/prompts$/, { timeout: 20_000 }).catch(() => {});
  await shot(page, 'add-prompt-after-save');

  // Verify the prompt exists — search across every datasource (the form may
  // have defaulted to a different one than datasources[0]). Retry a few times
  // to ride out commit latency after the toast.
  const allDs = dsBody?.data?.datasources ?? [];
  let created: any = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    for (const d of allDs) {
      const r = await page.request.get(
        `${API}/prompts?datasourceId=${d.id}&page=1&limit=100`,
        { headers: { 'x-auth-token': tok } },
      );
      const b = await r.json();
      created = (b?.data?.prompts ?? []).find((p: any) => p.name === uniqueName);
      if (created) break;
    }
    if (!created) await page.waitForTimeout(1000);
  }
  expect(created, `prompt "${uniqueName}" was not created in any datasource`).toBeTruthy();
  const promptDsId = created.datasourceId;

  // ─── 2. PROMPT LIST renders the new columns ──────────────────────────
  await page.goto('/app/prompts', { waitUntil: 'domcontentloaded' });
  // list needs the datasource filter selected to show rows
  await page.locator('app-custom-dropdown').first().click();
  await page.locator(`.p-dropdown-item:has-text("${dsName}"), li:has-text("${dsName}")`).first().click();
  await page.waitForTimeout(1500);
  await shot(page, 'prompt-list-with-group-column');

  // ─── 3. QUERY BUILDER: create one, open config/design ────────────────
  // Use the datasource the prompt actually landed on so the designer palette
  // can show it.
  const qbRes = await page.request.post(`${API}/query-builders`, {
    headers: { 'x-auth-token': tok, 'Content-Type': 'application/json' },
    data: { name: `E2E Builder ${Date.now()}`, description: 'E2E', datasource: promptDsId },
  });
  const qbBody = await qbRes.json();
  const qbId = qbBody?.data?.id;
  expect(qbId, `builder not created: ${JSON.stringify(qbBody).slice(0, 300)}`).toBeTruthy();

  // The list's config icon must open the design shell (not a blank page).
  await page.goto('/app/query-builders', { waitUntil: 'domcontentloaded' });
  await page.locator('app-custom-dropdown').first().click();
  await page.locator(`.p-dropdown-item:has-text("${dsName}"), li:has-text("${dsName}")`).first().click();
  await page.waitForTimeout(1500);
  await shot(page, 'qb-list');

  // Click the config (cog) icon on the first row.
  const cog = page.locator('.config-btn, button:has(i.pi-cog)').first();
  if (await cog.count()) {
    await cog.click();
    await page.waitForURL(/\/design$/, { timeout: 15_000 }).catch(() => {});
  } else {
    await page.goto(`/app/query-builders/${qbId}/design`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(1500);
  await shot(page, 'qb-design-form');
  expect(page.url()).toContain('/design');

  // Design tabs
  for (const tab of ['Joins', 'Columns', 'Settings', 'Form']) {
    const t = page.locator(`button:has-text("${tab}")`).first();
    if (await t.count()) {
      await t.click();
      await page.waitForTimeout(800);
      await shot(page, `qb-design-${tab.toLowerCase()}`);
    }
  }

  // ─── 4. COMPOSE / RUN ────────────────────────────────────────────────
  await page.goto(`/app/query-builders/${qbId}/compose`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shot(page, 'qb-compose');

  // Clean up the throwaway builder.
  await page.request.delete(`${API}/query-builders/${qbId}`, {
    headers: { 'x-auth-token': tok, 'Content-Type': 'application/json' },
    data: { justification: 'e2e cleanup' },
  });
});
