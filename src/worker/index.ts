import { readRoster } from '../lib/club';
import { closeMonthlyMmr } from '../lib/monthly-mmr';
import { app } from './app';
import { sendDailyReminders } from './reminders';

export default {
  fetch: app.fetch,
  scheduled(controller, env, context) {
    // Closes the monthly MMR standings and creates the drink debts once a month has ended,
    // without anyone opening the app. Closing twice changes nothing.
    context.waitUntil(readRoster(env.DB).then((roster) => closeMonthlyMmr(env.DB, roster)));
    // Sends the daily reminders whose hour has come.
    context.waitUntil(sendDailyReminders(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
