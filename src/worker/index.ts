import { closeMonthlyMmr } from '../lib/monthly-mmr';
import { app } from './app';

export default {
  fetch: app.fetch,
  // Closes the monthly MMR standings and creates the drink debts once a month has ended,
  // without anyone opening the app. Closing twice changes nothing.
  async scheduled(_controller, env, context) {
    context.waitUntil(closeMonthlyMmr(env.DB));
  },
} satisfies ExportedHandler<Env>;
