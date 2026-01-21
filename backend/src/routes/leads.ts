import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  updateLeadStatus,
} from '../services/leadService';
import {
  createLeadSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
} from '../utils/validation';
import { getUserPlan, checkLeadLimit, getUsageInfo } from '../services/planService';

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

    // Check lead limit
    const plan = await getUserPlan(req.userId);
    const canCreateLead = await checkLeadLimit(req.userId, plan);

    if (!canCreateLead) {
      const usageInfo = await getUsageInfo(req.userId);
      return res.status(403).json({
        success: false,
        error: {
          message: 'Lead limit reached. Please upgrade to Pro for unlimited leads.',
          code: 'LEAD_LIMIT_REACHED',
        },
        usage: usageInfo,
      });
    }

    const validatedData = createLeadSchema.parse(req.body);
    const lead = await createLead(req.userId, validatedData);
    res.status(201).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const leads = await getLeads(req.userId);
    res.json({
      success: true,
      data: leads,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = updateLeadSchema.parse(req.body);
    const lead = await updateLead(req.userId, req.params.id, validatedData);
    res.json({
      success: true,
      data: lead,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Lead not found') {
      return res.status(404).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

router.put('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = updateLeadStatusSchema.parse(req.body);
    const lead = await updateLeadStatus(req.userId, req.params.id, validatedData.status);
    res.json({
      success: true,
      data: lead,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Lead not found') {
      return res.status(404).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

export default router;

