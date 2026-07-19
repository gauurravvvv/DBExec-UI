import { test, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * Full live driver: login → (expand sidebar) → datasources → datasets →
 * db-roles → analyses. At each stop dump interactive DOM + screenshot.
 * Then attempt the create-analysis-from-dataset flow and reach the editor.
 */

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg';
const USER = 'administrator';
const PASS = 'Pass@1234';

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
}

async function shot(page: Page, name: string) {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  } catch {}
}

async function dumpDom(page: Page, name: string) {
  const data = await page.evaluate(() => {
    const pick = (el: Element) => {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return {
        tag: e.tagName.toLowerCase(),
        id: e.id || undefined,
        cls:
          e.className && typeof e.className === 'string'
            ? e.className.slice(0, 90)
            : undefined,
        text: (e.innerText || (e as HTMLInputElement).value || '').trim().slice(0, 70),
        type: (e as HTMLInputElement).type || undefined,
        ph: (e as HTMLInputElement).placeholder || undefined,
        role: e.getAttribute('role') || undefined,
        aria: e.getAttribute('aria-label') || undefined,
      };
    };
    const sels =
      'button, a, input, textarea, select, [role="button"], [role="tab"], [role="menuitem"], .p-dropdown, app-custom-dropdown';
    return Array.from(document.querySelectorAll(sels)).map(pick).filter(Boolean);
  });
  fs.writeFileSync(`${SHOTS}/../dom-${name}.json`, JSON.stringify(data, null, 2));
  log.push(`   dom-${name}: ${data.length} interactive els`);
}

async function step(page: Page, label: string, fn: () => Promise<void>) {
  try {
    await fn();
    log.push(`OK   ${label}  url=${page.url()}`);
  } catch (e: any) {
    log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 260)}`);
  }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}

async function ensureSidebarExpanded(page: Page) {
  const toggle = page.locator('button.toggle-btn').first();
  const aria = await toggle.getAttribute('aria-label').catch(() => null);
  if (aria && /expand/i.test(aria)) {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

// nav-by-text: the routerlink attribute isn't reliably reflected to the DOM,
// but the visible nav label is stable. Map route → sidebar label.
const NAV_LABEL: Record<string, string> = {
  '/app/datasources': 'Data Source',
  '/app/datasets': 'Dataset',
  '/app/db-roles': 'Database Roles',
  '/app/analyses': 'Analyses',
  '/app/db-privileges': 'Privileges & Access',
};

async function nav(page: Page, route: string, label: string) {
  await step(page, label, async () => {
    await ensureSidebarExpanded(page);
    const text = NAV_LABEL[route] || route;
    const link = page
      .locator('.sidebar-nav a')
      .filter({ hasText: new RegExp('^\\s*' + text + '\\s*$', 'i') })
      .first();
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await link.click({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle').catch(() => {});
  });
}

test('drive — full nav + create analysis', async ({ page }) => {
  wire(page);

  await step(page, 'd01-login', async () => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#auth-account').fill(ORG);
    await page.locator('#auth-username').fill(USER);
    await page.locator('#auth-password').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app|\/relay|\/home|\/dashboard/, { timeout: 45000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  await nav(page, '/app/datasources', 'd02-datasources');
  await dumpDom(page, 'datasources');

  await nav(page, '/app/datasets', 'd03-datasets');
  await dumpDom(page, 'datasets');

  await nav(page, '/app/db-roles', 'd04-db-roles');
  await dumpDom(page, 'db-roles');

  await nav(page, '/app/analyses', 'd05-analyses');
  await dumpDom(page, 'analyses');

  // Capture the analyses list rows (existing analyses) as text.
  const analysesRows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.dataset-name-link, a[href*="/app/analyses/"]')).map(
      (a) => (a as HTMLElement).innerText.trim(),
    );
  });
  log.push(`   analyses rows: ${JSON.stringify(analysesRows.slice(0, 10))}`);

  const report = {
    steps: log,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 60),
    pageErrors: [...new Set(pageErrors)].slice(0, 60),
    netErrors: [...new Set(netErrors)].slice(0, 60),
    finalUrl: page.url(),
  };
  fs.writeFileSync(`${SHOTS}/../drive-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== DRIVE DIAG ===\n' + JSON.stringify(report, null, 2));
});
