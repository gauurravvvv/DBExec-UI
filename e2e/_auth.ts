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
export const API = 'http://localhost:3000/api/v1';

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
