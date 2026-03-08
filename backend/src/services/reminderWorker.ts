import cron from 'node-cron';
import { dispatchDueReminders } from './reminderService';

let task: cron.ScheduledTask | null = null;

export const startReminderWorker = () => {
  const enabled = process.env.REMINDER_WORKER_ENABLED !== 'false';
  if (!enabled) {
    return;
  }

  if (task) {
    return;
  }

  // Every minute
  task = cron.schedule('* * * * *', async () => {
    try {
      const result = await dispatchDueReminders();
      if (result.scanned > 0) {
        console.log(`[ReminderWorker] scanned=${result.scanned} processed=${result.processed}`);
      }
    } catch (error) {
      console.error('[ReminderWorker] dispatch failed', error);
    }
  });

  console.log('[ReminderWorker] started');
};

export const stopReminderWorker = () => {
  if (task) {
    task.stop();
    task = null;
  }
};
