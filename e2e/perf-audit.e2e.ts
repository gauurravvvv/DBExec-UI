import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * PERFORMANCE AUDIT harness for the Analyses editor.
 * Opens the REAL saved 5-tab / 15-visual "Clinical Showcase" analysis and
 * measures the hot interactions with performance.now() + network timing.
 * Emits a JSON report of measured numbers — the evidence for the audit.
 */
const OUT = '/private/tmp/claude-593878944/-Users-gaurav-goel-code-Personal-DBExec/12617c52-2bd7-4bf8-b7fc-63d17a25f0c7/scratchpad/e2e';
const ORG = 'GauravOrg', USER = 'administrator', PASS = 'Pass@1234';
const ANALYSIS_ID = '5b10d1ac-3b56-4878-aa11-5f67ea70aeb1';

const metrics: any = { runRequests: [], notes: [] };

test('analyses perf audit', async ({ page }) => {
  test.setTimeout(180_000);

  // Instrument BEFORE any navigation: count JSON.stringify calls (echart-visual
  // ngDoCheck does JSON.stringify(chartConfig) every CD) and expose a perf bag.
  await page.addInitScript(() => {
    (window as any).__perf = { stringifyCalls: 0, stringifyBytes: 0, stringifyMs: 0 };
    const orig = JSON.stringify;
    (JSON as any).stringify = function (...args: any[]) {
      const s = performance.now();
      const r = orig.apply(this, args as any);
      try {
        (window as any).__perf.stringifyCalls++;
        (window as any).__perf.stringifyMs += performance.now() - s;
        if (typeof r === 'string') (window as any).__perf.stringifyBytes += r.length;
      } catch {}
      return r;
    };
  });

  // Capture BE /run request timings (end-to-end: conn open + metadata + query + destroy).
  page.on('requestfinished', async (req) => {
    const u = req.url();
    if (/\/analyses\/[0-9a-f-]{36}\/run/i.test(u)) {
      const t = req.timing();
      metrics.runRequests.push({
        url: u.slice(-60),
        // responseEnd - requestStart = full server round-trip incl network
        totalMs: +(t.responseEnd - t.requestStart).toFixed(1),
        ttfbMs: +(t.responseStart - t.requestStart).toFixed(1),
      });
    }
  });

  // ── Login ───────────────────────────────────────────────────────────
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app|\/home|\/dashboard/, { timeout: 45000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // ── OPEN EDITOR (measure open-to-first-render) ────────────────────────
  const openStart = Date.now();
  await page.goto(`/app/analyses/${ANALYSIS_ID}/edit`, { waitUntil: 'domcontentloaded' });
  // wait for the canvas visuals to appear
  await page.locator('.visual-card, app-chart-renderer, .grid-visual').first().waitFor({ timeout: 45000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000); // let all client-side transforms + chart renders settle
  metrics.openEditorMs = Date.now() - openStart;

  // reset stringify counter AFTER initial render so we measure steady-state churn
  const afterOpenStringify = await page.evaluate(() => (window as any).__perf?.stringifyCalls ?? -1);
  metrics.stringifyCallsDuringOpen = afterOpenStringify;

  // Decompose open: which lazy JS chunks loaded + their transfer/decode cost,
  // and total script eval. Helps attribute openEditorMs.
  metrics.resourceTiming = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const js = res
      .filter(r => /\.js(\?|$)/.test(r.name))
      .map(r => ({
        name: r.name.split('/').pop()!.slice(0, 40),
        ms: +(r.responseEnd - r.startTime).toFixed(1),
        kb: +((r.transferSize || r.encodedBodySize || 0) / 1024).toFixed(1),
      }))
      .filter(r => r.ms > 20 || r.kb > 50)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 12);
    return js;
  });

  // Transform cost: all 15 visuals transformed once on data load.
  metrics.transformOnOpen = await page.evaluate(() => (window as any).__perfTx ?? null);

  const visualCount = await page.locator('app-chart-renderer').count();
  const tabCount = await page.locator('.analysis-tab').count();
  metrics.notes.push(`visuals on canvas=${visualCount}, tabs=${tabCount}`);

  // ── MEASURE STEADY-STATE CD CHURN: how many JSON.stringify calls happen
  //    during 2s of idle + a synthetic CD tick (mouse move triggers zone CD). ─
  await page.evaluate(() => ((window as any).__perf.stringifyCalls = 0));
  const idleStart = await page.evaluate(() => (window as any).__perf.stringifyCalls);
  // Trigger several CD cycles by dispatching events (each app event => zone.js CD).
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(200 + i * 10, 300 + i * 5);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(500);
  metrics.stringifyCallsPer10CD = await page.evaluate(() => (window as any).__perf.stringifyCalls);

  // ── MEASURE TAB SWITCH — bracket ONLY the click→next-frame with
  //    performance.now() inside the browser so sleeps don't pollute it. ──
  const tabSwitchTimings: number[] = [];
  const tabSwitchStringify: number[] = [];
  const tabs = page.locator('.analysis-tab');
  const nTabs = await tabs.count();
  for (let i = 1; i < Math.min(nTabs, 6); i++) {
    const before = await page.evaluate(() => ({
      t: performance.now(),
      s: (window as any).__perf.stringifyCalls,
      b: (window as any).__perf.stringifyBytes,
    }));
    await tabs.nth(i).click({ timeout: 8000 }).catch(() => {});
    // Wait two animation frames (Angular CD + ECharts paint) then read the clock.
    const after = await page.evaluate(
      () =>
        new Promise<any>(res => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              res({
                t: performance.now(),
                s: (window as any).__perf.stringifyCalls,
                b: (window as any).__perf.stringifyBytes,
              }),
            ),
          );
        }),
    );
    tabSwitchTimings.push(+(after.t - before.t).toFixed(1));
    tabSwitchStringify.push(after.s - before.s);
    await page.waitForTimeout(300); // settle before next (not counted)
  }
  metrics.tabSwitchMs = tabSwitchTimings;
  metrics.tabSwitchStringifyCalls = tabSwitchStringify;
  metrics.stringifyBytesTotal = await page.evaluate(() => (window as any).__perf.stringifyBytes);
  metrics.stringifyMsTotal = await page.evaluate(() => +(window as any).__perf.stringifyMs.toFixed(1));

  // ── MEASURE stringify churn attributable to tab switching ─────────────
  await page.evaluate(() => ((window as any).__perf.stringifyCalls = 0));
  await tabs.nth(0).click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  metrics.stringifyCallsPerTabSwitch = await page.evaluate(() => (window as any).__perf.stringifyCalls);

  // ── MEASURE a client-side re-transform of all visuals directly, timed in
  //    the app's own context via the Angular component instance if reachable.
  //    Fallback: measure a full dataset refresh (fires 1 /run + 15 transforms).
  const refreshBtn = page.locator('.a-icon-btn:has(i.pi-refresh)').first();
  if (await refreshBtn.count()) {
    const preRun = metrics.runRequests.length;
    await page.evaluate(() => ((window as any).__perfTx = { count: 0, totalMs: 0, maxMs: 0, rows: 0 }));
    const t0 = Date.now();
    await refreshBtn.click({ timeout: 8000 }).catch(() => {});
    // wait for the /run to complete + transforms
    await page.waitForTimeout(2000);
    metrics.refreshMs = Date.now() - t0;
    metrics.transformOnRefresh = await page.evaluate(() => (window as any).__perfTx ?? null);
    metrics.notes.push(`refresh fired ${metrics.runRequests.length - preRun} /run request(s)`);
  }

  // ── Persist ───────────────────────────────────────────────────────────
  try { fs.mkdirSync(OUT, { recursive: true }); } catch {}
  fs.writeFileSync(`${OUT}/perf-audit-report.json`, JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: `${OUT}/perf-audit-final.png` }).catch(() => {});
  console.log('PERF REPORT:\n' + JSON.stringify(metrics, null, 2));

  expect(visualCount).toBeGreaterThan(0);
});
