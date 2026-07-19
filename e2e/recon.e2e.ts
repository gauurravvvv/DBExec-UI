import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * Recon-first live driver for the DBExec Analyses program.
 * Logs in, navigates by CLICKING the sidebar (not goto), and at each
 * screen dumps the interactive DOM (ids/text/roles of inputs+buttons)
 * so we can discover real selectors, plus a screenshot. Captures every
 * console error / pageerror / >=400 network response.
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
      if (u.includes('primeicons.css')) return; // benign MIME warning
      netErrors.push(`${r.status()} ${r.request().method()} ${u.slice(0, 200)}`);
    }
  });
}

async function shot(page: Page, name: string) {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  } catch {
    /* ignore */
  }
}

/** Dump interactive DOM (buttons, inputs, links, roles) to a file. */
async function dumpDom(page: Page, name: string) {
  const data = await page.evaluate(() => {
    const pick = (el: Element) => {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null; // invisible
      return {
        tag: e.tagName.toLowerCase(),
        id: e.id || undefined,
        cls: (e.className && typeof e.className === 'string'
          ? e.className.slice(0, 80)
          : undefined),
        text: (e.innerText || (e as HTMLInputElement).value || '')
          .trim()
          .slice(0, 60),
        type: (e as HTMLInputElement).type || undefined,
        ph: (e as HTMLInputElement).placeholder || undefined,
        role: e.getAttribute('role') || undefined,
        aria: e.getAttribute('aria-label') || undefined,
        href: (e as HTMLAnchorElement).getAttribute?.('routerlink') || undefined,
      };
    };
    const sels = 'button, a, input, textarea, select, [role="button"], [role="tab"], [role="menuitem"]';
    return Array.from(document.querySelectorAll(sels))
      .map(pick)
      .filter(Boolean);
  });
  fs.writeFileSync(`${SHOTS}/../dom-${name}.json`, JSON.stringify(data, null, 2));
  log.push(`   dom-${name}: ${data.length} interactive els`);
}

async function step(page: Page, label: string, fn: () => Promise<void>) {
  try {
    await fn();
    log.push(`OK   ${label}  url=${page.url()}`);
  } catch (e: any) {
    log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 240)}`);
  }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}

/** Click a sidebar nav link by its routerLink attribute. */
async function clickSidebar(page: Page, route: string) {
  const link = page.locator(`.sidebar-nav a[ng-reflect-router-link="${route}"], .sidebar-nav a[href="${route}"], .sidebar a[routerlink="${route}"]`).first();
  if (await link.count()) {
    await link.click();
    return;
  }
  // Fallback: match by nav text
  const byRoute = page.locator('.sidebar-nav a').filter({ hasText: '' });
  await byRoute.first().click().catch(() => {});
}

test('recon — login + sidebar nav + dom dumps', async ({ page }) => {
  wire(page);

  await step(page, 'r01-login', async () => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#auth-account').fill(ORG);
    await page.locator('#auth-username').fill(USER);
    await page.locator('#auth-password').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app|\/relay|\/home|\/dashboard/, { timeout: 45000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  await dumpDom(page, 'shell');

  // Dump the sidebar links present so we know exact selectors.
  const sidebarLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.sidebar-nav a, .sidebar a')).map(
      (a) => ({
        text: (a as HTMLElement).innerText.trim().slice(0, 40),
        routerlink: a.getAttribute('routerlink') || a.getAttribute('ng-reflect-router-link') || a.getAttribute('href'),
      }),
    );
  });
  fs.writeFileSync(`${SHOTS}/../sidebar-links.json`, JSON.stringify(sidebarLinks, null, 2));
  log.push(`   sidebar links: ${sidebarLinks.length}`);

  // Navigate to datasources via sidebar
  await step(page, 'r02-datasources', async () => {
    await clickSidebar(page, '/app/datasources');
    await page.waitForTimeout(2500);
  });
  await dumpDom(page, 'datasources');

  // Datasets
  await step(page, 'r03-datasets', async () => {
    await clickSidebar(page, '/app/datasets');
    await page.waitForTimeout(2500);
  });
  await dumpDom(page, 'datasets');

  // DB roles
  await step(page, 'r04-db-roles', async () => {
    await clickSidebar(page, '/app/db-roles');
    await page.waitForTimeout(2500);
  });
  await dumpDom(page, 'db-roles');

  // Analyses
  await step(page, 'r05-analyses', async () => {
    await clickSidebar(page, '/app/analyses');
    await page.waitForTimeout(2500);
  });
  await dumpDom(page, 'analyses');

  const report = {
    steps: log,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 60),
    pageErrors: [...new Set(pageErrors)].slice(0, 60),
    netErrors: [...new Set(netErrors)].slice(0, 60),
    finalUrl: page.url(),
  };
  fs.writeFileSync(`${SHOTS}/../recon-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== RECON DIAG ===\n' + JSON.stringify(report, null, 2));

  expect(log.some((l) => l.startsWith('OK   r01-login'))).toBeTruthy();
});
