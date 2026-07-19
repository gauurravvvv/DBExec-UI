import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * Polish + critical-review verification for the Analyses studio.
 * Drives the live editor, builds the exact charts the review calls out,
 * and screenshots the state so we can eyeball the fixes.
 */

const SHOTS =
  '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e/shots';
const ORG = 'GauravOrg';
const USER = 'administrator';
const PASS = 'Pass@1234';
const ANALYSIS_ID = 'f1fac3f3-f1b3-4410-ae96-d1b77a1f9fe6';

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

async function step(page: Page, label: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    log.push(`OK   ${label} (${Date.now() - t0}ms)`);
  } catch (e: any) {
    log.push(`FAIL ${label} :: ${(e?.message || e).toString().slice(0, 260)}`);
  }
  await shot(page, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}

async function addVisual(
  page: Page,
  chartLabel: RegExp,
  mappings: Array<{ role: RegExp; field: string }>,
) {
  const add = page
    .locator('button, .add-visual-button, [class*="add-visual"]')
    .filter({ hasText: /add visual/i })
    .first();
  await add.click({ timeout: 10000 });
  await page.waitForTimeout(700);
  const card = page.locator('.chart-type-card').filter({ hasText: chartLabel }).first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(700);
  for (const m of mappings) {
    const slot = page.locator('.axis-slot').filter({ hasText: m.role }).first();
    await slot.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(350);
    const fieldCard = page
      .locator('.field-card')
      .filter({ hasText: new RegExp('^\\s*' + m.field + '\\s*$', 'i') })
      .first();
    await fieldCard.click({ timeout: 8000 }).catch(async () => {
      await page
        .locator('.field-card')
        .filter({ hasText: new RegExp(m.field, 'i') })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    });
    await page.waitForTimeout(500);
  }
}

test('polish verify — fixes live', async ({ page }) => {
  test.setTimeout(300_000);
  wire(page);

  await step(page, 'v01-login', async () => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#auth-account').fill(ORG);
    await page.locator('#auth-username').fill(USER);
    await page.locator('#auth-password').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app|\/relay|\/home|\/dashboard/, { timeout: 45000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  await step(page, 'v02-open-editor', async () => {
    await page.goto(`/app/analyses/${ANALYSIS_ID}/edit`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4500);
  });

  await step(page, 'v03-open-panels', async () => {
    for (const label of [/fields/i, /visuals/i]) {
      const btn = page.locator('.a-segment__btn', { hasText: label }).first();
      if (await btn.count()) {
        const cls = await btn.getAttribute('class');
        if (!/is-active/.test(cls || '')) await btn.click().catch(() => {});
      }
    }
    await page.waitForTimeout(600);
  });

  // Issue #1 + #2: bar sex→X, facility_lon→Y. Axis should read "sex" / "facility_lon",
  // and the measure well should show the geo warning chip.
  await step(page, 'v04-bar-geo-measure', async () => {
    await addVisual(page, /bar chart/i, [
      { role: /x[- ]?axis/i, field: 'sex' },
      { role: /y[- ]?axis/i, field: 'facility_lon' },
    ]);
    await page.waitForTimeout(1800);
    const warnCount = await page.locator('.axis-warn').count();
    log.push(`   geo-warn chips visible=${warnCount}`);
  });

  // Issue #3: right-click the visual to open Properties → screenshot Aggregate dropdown.
  await step(page, 'v05-properties-aggregate', async () => {
    const visual = page.locator('.visual-cell, .visual-box, [class*="visual-card"]').first();
    await visual.click({ button: 'right', timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(900);
    // Scroll the Data section into view if the panel is long.
    const aggLabel = page.getByText(/^\s*Aggregate\s*$/i).first();
    await aggLabel.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
  });

  // Sane bar: department → total_charge (SUM). Axis should read "department" / "Sum of total_charge".
  await step(page, 'v06-bar-good', async () => {
    await addVisual(page, /bar chart/i, [
      { role: /x[- ]?axis/i, field: 'department' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await page.waitForTimeout(1500);
    // Set SUM via the Y-axis pill so the axis reads "Sum of total_charge".
    const pill = page.locator('.axis-value__pill').last();
    if (await pill.count()) {
      await pill.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
      const sumItem = page.locator('.pill-menu__item').filter({ hasText: /^\s*sum\s*$/i }).first();
      if (await sumItem.count()) await sumItem.click({ timeout: 4000 }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(1500);
  });

  // Line on encounter_date.
  await step(page, 'v07-line-time', async () => {
    await addVisual(page, /line chart/i, [
      { role: /x[- ]?axis/i, field: 'encounter_date' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await page.waitForTimeout(1500);
  });

  // Pie on encounter_type.
  await step(page, 'v08-pie', async () => {
    await addVisual(page, /pie chart/i, [
      { role: /x[- ]?axis/i, field: 'encounter_type' },
      { role: /y[- ]?axis/i, field: 'total_charge' },
    ]);
    await page.waitForTimeout(1500);
  });

  // KPI card on total_charge.
  await step(page, 'v09-kpi', async () => {
    await addVisual(page, /number|kpi|card|metric/i, [
      { role: /y[- ]?axis|value|measure/i, field: 'total_charge' },
    ]);
    await page.waitForTimeout(1500);
  });

  // Close the Properties panel + capture the whole canvas so every visual is
  // visible unobstructed.
  await step(page, 'v10-canvas-clean', async () => {
    const closeBtn = page.locator('.properties-sidebar .close-btn, [class*="properties"] .pi-times').first();
    await closeBtn.click({ timeout: 3000 }).catch(async () => {
      await page.keyboard.press('Escape').catch(() => {});
    });
    await page.mouse.click(700, 650).catch(() => {}); // click empty canvas
    await page.waitForTimeout(1200);
  });

  // Maximize the good bar (department → Sum of total_charge) for a full look.
  await step(page, 'v11-maximize-good-bar', async () => {
    // The 2nd visual card is the department/total_charge bar.
    const maxBtn = page.locator('.visual-cell .pi-window-maximize, [class*="maximize"]').nth(1);
    await maxBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);
  });

  // Scan the DOM for any leaked raw i18n keys (UPPER_SNAKE with a dot) that are
  // visible to the user — a strong signal of an untranslated string.
  const rawKeys: string[] = await page.evaluate(() => {
    const out = new Set<string>();
    const rx = /\b[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+){1,}\b/;
    document.querySelectorAll('body *').forEach((el) => {
      const e = el as HTMLElement;
      if (e.children.length) return; // leaf text only
      const t = (e.innerText || '').trim();
      if (t && rx.test(t) && !t.includes(' ')) out.add(t.slice(0, 80));
    });
    return Array.from(out).slice(0, 40);
  });
  log.push(`   leaked-raw-i18n-keys=${JSON.stringify(rawKeys)}`);
  await shot(page, 'v12-final');

  const report = {
    steps: log,
    leakedRawKeys: rawKeys,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 60),
    pageErrors: [...new Set(pageErrors)].slice(0, 60),
    netErrors: [...new Set(netErrors)].slice(0, 60),
    finalUrl: page.url(),
  };
  fs.writeFileSync(`${SHOTS}/../polish-verify-diag.json`, JSON.stringify(report, null, 2));
  console.log('=== POLISH VERIFY DIAG ===\n' + JSON.stringify(report, null, 2));
  expect(log.some((l) => l.startsWith('OK   v01-login'))).toBeTruthy();
});
