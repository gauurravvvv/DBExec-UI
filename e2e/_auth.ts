/**
 * Shared login + token helpers for the e2e specs.
 *
 * Extracted after a third copy diverged: the parity spec matched only
 * `"accessToken"` in localStorage and silently got an empty string, so every API
 * call 401'd and the spec failed as "no connection exists". The storage layout
 * differs by how the session was persisted, so both shapes have to be handled —
 * in one place.
 */
import { expect, Page } from '@playwright/test';

export const ORG = 'AIOrg';
export const USER = 'admin_gaurav';
export const PASS = 'Pass@1234';
// Port-agnostic on purpose: the dev stack runs on :4200/:3000 and the
// desktop-style stack on :8755/:9058. Override with DBEXEC_API rather than
// editing this line, so a port change never means a code change.
export const API =
  process.env['DBEXEC_API'] ?? 'http://localhost:9058/api/v1';

export async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#auth-account').fill(ORG);
  await page.locator('#auth-username').fill(USER);
  await page.locator('#auth-password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}

/** The stored access token, however the session happens to be persisted. */
export async function authToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) || '';
      // A JSON blob holding the session. Match accessToken specifically: a naive
      // /"token"/ match picks up refreshToken first, which the API rejects.
      const m = v.match(/"accessToken"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
      // Or the bare JWT under its own key.
      if (v.startsWith('ey') && v.split('.').length === 3) return v;
    }
    return '';
  });
  expect(token, 'could not resolve an auth token from localStorage').toBeTruthy();
  return token;
}

/** The first query-runner connection, which the executor screens need. */
export async function firstConnection(page: Page, tok: string): Promise<any> {
  const res = await page.request.get(`${API}/query-runner/connections`, {
    headers: { 'x-auth-token': tok },
  });
  const body = await res.json();
  const conn = body?.data?.connections?.[0];
  expect(
    conn,
    `no query-runner connection (status ${res.status()}): ${JSON.stringify(body).slice(0, 200)}`,
  ).toBeTruthy();
  return conn;
}

/**
 * Id of a datasource whose schema actually loads.
 *
 * Not simply "the first datasource": this environment accumulates stub records
 * from the migration-import feature, whose stored credentials do not reach a real
 * server, so `GET /datasources/:id/schemas` answers 500. A suite that picks the
 * newest datasource therefore fails on data rather than on code — which is exactly
 * how the editor-parity spec came to report a false regression.
 *
 * Probes each datasource and returns the first that answers 200. Returns null when
 * none can connect, so a caller can skip with a clear message instead of asserting
 * against a broken environment.
 */
export async function connectableDatasourceId(
  page: Page,
  tok: string,
): Promise<string | null> {
  return page.evaluate(
    async ([base, t]) => {
      const h = { 'x-auth-token': t as string };
      const host = document.querySelector('app-add-dataset');
      const comp = (window as any).ng?.getComponent?.(host);
      let rows: any[] = comp?.availableDatasources ?? [];
      if (!rows.length) {
        const r = await fetch(`${base}/datasources?page=1&limit=25`, { headers: h });
        const j = await r.json().catch(() => null);
        const d = j?.data;
        rows = Array.isArray(d) ? d : (d?.rows ?? d?.datasources ?? []);
      }
      for (const d of rows) {
        const s = await fetch(`${base}/datasources/${d.id}/schemas`, { headers: h });
        if (s.status === 200) return d.id as string;
      }
      return null;
    },
    [API, tok],
  );
}
