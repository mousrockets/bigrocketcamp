import { exports } from 'cloudflare:workers';
import { expect, test } from 'vitest';

test('the API reports that it is up', async () => {
  const response = await exports.default.fetch('https://app.test/api/health');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
