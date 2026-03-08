import express, { Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { eventLogSchema } from '../utils/validation';
import { getDailyEventStats, trackEvent } from '../services/eventService';

const router = express.Router();

router.use(authenticate);

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = eventLogSchema.parse(req.body);
    await trackEvent(req.userId, validatedData);

    return res.status(201).json({
      success: true,
      data: { tracked: true },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stats/daily', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const requestedDays = Number(req.query.days || 30);
    const days = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 1), 90) : 30;

    const stats = await getDailyEventStats(req.userId, days);

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
