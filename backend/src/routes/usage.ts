import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUsageInfo, upgradeToPro, downgradeToFree } from '../services/planService';
import { trackEvent } from '../services/eventService';

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
    await trackEvent(req.userId, {
      event: 'upgrade_confirmed',
      props: { source: 'usage_upgrade_endpoint' },
    }).catch(() => undefined);
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

router.post('/downgrade', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    await downgradeToFree(req.userId);
    const usageInfo = await getUsageInfo(req.userId);

    res.json({
      success: true,
      message: 'Successfully downgraded to Free plan',
      data: usageInfo,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
