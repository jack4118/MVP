import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUsageInfo, upgradeToPro } from '../services/planService';

const router = express.Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const usageInfo = await getUsageInfo(req.userId);

    res.json({
      success: true,
      data: usageInfo,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upgrade', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    await upgradeToPro(req.userId);
    const usageInfo = await getUsageInfo(req.userId);

    res.json({
      success: true,
      message: 'Successfully upgraded to Pro plan',
      data: usageInfo,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

