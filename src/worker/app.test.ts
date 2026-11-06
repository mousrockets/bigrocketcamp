import { exports } from 'cloudflare:workers';
import { expect, test } from 'vitest';

test('the API reports that it is up, with the build it runs', async () => {
  const response = await exports.default.fetch('https://app.test/api/health');

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json<{ status: string; commit: string; deployedAt: string | null }>();
  expect(body).toMatchObject({ status: 'ok', commit: 'test' });
  expect(body.deployedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});
