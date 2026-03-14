import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  createLead,
  getLeads,
  getLeadById,
  importLeads,
  parseImportedLeadRows,
  updateLead,
  updateLeadStatus,
} from '../services/leadService';
import { refreshLeadMemory } from '../services/aiService';
import {
  createLeadSchema,
  importLeadsSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
} from '../utils/validation';
import { getUserPlan, checkLeadLimit, getUsageInfo, getLeadCount } from '../services/planService';
import { trackEvent } from '../services/eventService';

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
    await trackEvent(req.userId, {
      event: 'lead_created',
      props: { status: lead.status },
    }).catch(() => undefined);
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

router.post('/import', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = importLeadsSchema.parse(req.body);
    const parsedRows = parseImportedLeadRows(validatedData.csvText, validatedData.rows);

    if (!parsedRows.length) {
      return res.status(400).json({
        success: false,
        error: { message: 'No valid contacts found to import.' },
      });
    }

    const plan = await getUserPlan(req.userId);
    const currentLeadCount = await getLeadCount(req.userId);
    const usageInfo = await getUsageInfo(req.userId);
    const remainingSlots = usageInfo.leadLimit === null ? parsedRows.length : Math.max(0, usageInfo.leadLimit - currentLeadCount);

    if (remainingSlots === 0) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Lead limit reached. Please upgrade to Pro for unlimited leads.',
          code: 'LEAD_LIMIT_REACHED',
        },
        usage: usageInfo,
      });
    }

    const rowsToCreate = usageInfo.leadLimit === null ? parsedRows : parsedRows.slice(0, remainingSlots);
    const result = await importLeads(req.userId, rowsToCreate);

    await trackEvent(req.userId, {
      event: 'lead_created',
      props: { status: 'imported', count: result.created.length },
    }).catch(() => undefined);

    return res.status(201).json({
      success: true,
      data: {
        created: result.created,
        importedCount: result.created.length,
        skippedCount: parsedRows.length - rowsToCreate.length,
        totalRows: parsedRows.length,
        plan,
      },
      usage: await getUsageInfo(req.userId),
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

router.post('/:id/memory/refresh', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const memory = await refreshLeadMemory(req.userId, req.params.id);
    const lead = await getLeadById(req.userId, req.params.id);

    return res.json({
      success: true,
      data: {
        lead,
        memory,
      },
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
