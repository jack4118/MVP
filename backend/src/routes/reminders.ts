import express, { Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  createReminder,
  dispatchDueReminders,
  deleteReminder,
  getReminderDispatchLogs,
  getReminders,
  getTodayReminders,
  markReminderDone,
  updateReminder,
} from '../services/reminderService';
import { createReminderSchema, updateReminderSchema } from '../utils/validation';

const router = express.Router();

router.use(authenticate);

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const validatedData = createReminderSchema.parse(req.body);
    const reminder = await createReminder(req.userId, validatedData);

    return res.status(201).json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Lead not found') {
      return res.status(404).json({ success: false, error: { message: error.message } });
    }
    next(error);
  }
});

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const view = (req.query.view as 'today' | 'upcoming' | 'all' | undefined) || 'all';
    const status = (req.query.status as 'all' | 'pending' | 'done' | undefined) || 'pending';
    const days = Number(req.query.days || 30);

    const reminders = await getReminders(req.userId, { view, status, days });

    return res.json({
      success: true,
      data: reminders,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/today', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const reminders = await getTodayReminders(req.userId);
    return res.json({ success: true, data: reminders });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/done', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const reminder = await markReminderDone(req.userId, req.params.id);
    return res.json({ success: true, data: reminder });
  } catch (error) {
    if (error instanceof Error && error.message === 'Reminder not found') {
      return res.status(404).json({ success: false, error: { message: error.message } });
    }
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const validatedData = updateReminderSchema.parse(req.body);
    const reminder = await updateReminder(req.userId, req.params.id, validatedData);

    return res.json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Reminder not found') {
      return res.status(404).json({ success: false, error: { message: error.message } });
    }
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const result = await deleteReminder(req.userId, req.params.id);
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'Reminder not found') {
      return res.status(404).json({ success: false, error: { message: error.message } });
    }
    next(error);
  }
});

router.get('/dispatch-logs', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const limit = Number(req.query.limit || 50);
    const logs = await getReminderDispatchLogs(req.userId, limit);
    return res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

router.post('/dispatch/run', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const result = await dispatchDueReminders();
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
