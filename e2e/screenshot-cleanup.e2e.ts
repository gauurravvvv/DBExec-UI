/** Removes the shot_* fields the screenshot sweep creates. */
import { test } from '@playwright/test';

test('remove shot_* fields', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#auth-account').fill('AIOrg');
  await page.locator('#auth-username').fill('admin_gaurav');
  await page.locator('#auth-password').fill('Pass@1234');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45000 });

  const token = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) || '';
      const m = v.match(/"token"\s*:\s*"([^"]+)"/) || (v.startsWith('ey') ? [null, v] : null);
      if (m) return m[1];
    }
    return null;
  });

  const id = '929bdfcc-cc8c-43e2-a18d-b24fb1247cc3';
  const res = await page.request.get(`http://localhost:3000/api/v1/datasets/${id}`, {
    headers: { 'x-auth-token': token || '' },
  });
  const body = await res.json();
  const fields = (body?.data?.fields || body?.data?.datasetFields || []) as any[];
  const mine = fields.filter(f => /^shot_/.test(f.columnToView || f.name || ''));
  console.log(`cleanup: ${mine.length} shot_* field(s)`);
  for (const f of mine) {
    const r = await page.request.delete(
      `http://localhost:3000/api/v1/datasets/${id}/fields/${f.id}`,
      { headers: { 'x-auth-token': token || '' } },
    );
    console.log(`  removed ${f.columnToView || f.name} -> ${r.status()}`);
  }
});
