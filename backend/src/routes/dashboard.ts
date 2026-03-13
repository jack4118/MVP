import express, { Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getDashboardSummary } from '../services/dashboardService';

const router = express.Router();

router.use(authenticate);

router.get('/summary', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const summary = await getDashboardSummary(req.userId);
    return res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

export default router;
