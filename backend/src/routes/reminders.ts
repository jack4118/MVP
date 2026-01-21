import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getTodayReminders, markReminderDone } from '../services/reminderService';

const router = express.Router();

router.use(authenticate);

router.get('/today', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const reminders = await getTodayReminders(req.userId);
    res.json({
      success: true,
      data: reminders,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/done', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const reminder = await markReminderDone(req.userId, req.params.id);
    res.json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Reminder not found') {
      return res.status(404).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

export default router;

