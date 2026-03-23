import cron from 'node-cron';
import { dispatchDueReminders } from './reminderService';
import { runCredentialExpiryCheck } from '../orchestration/orchestrationService';

let task: cron.ScheduledTask | null = null;
let orchestratorTokenCheckTask: cron.ScheduledTask | null = null;

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

  // Every 15 minutes
  orchestratorTokenCheckTask = cron.schedule('*/15 * * * *', async () => {
    try {
      await runCredentialExpiryCheck();
    } catch (error) {
      console.error('[ReminderWorker] credential expiry check failed', error);
    }
  });

  console.log('[ReminderWorker] started');
};

export const stopReminderWorker = () => {
  if (task) {
    task.stop();
    task = null;
  }
  if (orchestratorTokenCheckTask) {
    orchestratorTokenCheckTask.stop();
    orchestratorTokenCheckTask = null;
  }
};
