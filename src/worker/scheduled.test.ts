import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { expect, test } from 'vitest';
import worker from './index';

test('the hourly task closes ended months on its own', async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM monthly_mmr_results'),
    env.DB.prepare("UPDATE monthly_mmr_policy SET starts_month = '2026-09' WHERE id = 1"),
  ]);
  const context = createExecutionContext();
  await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: '5 * * * *' }), env, context);
  await waitOnExecutionContext(context);
  const closed = await env.DB.prepare('SELECT month FROM monthly_mmr_results ORDER BY month').all<{ month: string }>();
  expect(closed.results.map((row) => row.month)).toContain('2026-09');
});
