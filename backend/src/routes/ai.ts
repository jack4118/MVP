import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateFollowUpText, generatePaymentText } from '../services/aiService';
import { aiFollowUpSchema, aiPaymentSchema } from '../utils/validation';
import { getLeadById } from '../services/leadService';
import { getUserPlan, checkAiUsageLimit, getUsageInfo } from '../services/planService';

const router = express.Router();

router.use(authenticate);

router.post('/follow-up', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = aiFollowUpSchema.parse(req.body);
    const leadId = req.body.leadId || '';

    if (!leadId) {
      return res.status(400).json({
        success: false,
        error: { message: 'leadId is required' },
      });
    }

    await getLeadById(req.userId, leadId);

    // Check AI usage limit
    const plan = await getUserPlan(req.userId);
    const canUseAi = await checkAiUsageLimit(req.userId, plan);

    if (!canUseAi) {
      const usageInfo = await getUsageInfo(req.userId);
      return res.status(403).json({
        success: false,
        error: {
          message: 'AI usage limit reached. Please upgrade to Pro for unlimited AI messages.',
          code: 'AI_LIMIT_REACHED',
        },
        usage: usageInfo,
      });
    }

    const generatedText = await generateFollowUpText(req.userId, leadId, validatedData);
    const usageInfo = await getUsageInfo(req.userId);

    res.json({
      success: true,
      data: {
        text: generatedText,
      },
      usage: usageInfo,
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

router.post('/payment', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = aiPaymentSchema.parse(req.body);
    const leadId = req.body.leadId || '';

    if (!leadId) {
      return res.status(400).json({
        success: false,
        error: { message: 'leadId is required' },
      });
    }

    await getLeadById(req.userId, leadId);

    // Check AI usage limit
    const plan = await getUserPlan(req.userId);
    const canUseAi = await checkAiUsageLimit(req.userId, plan);

    if (!canUseAi) {
      const usageInfo = await getUsageInfo(req.userId);
      return res.status(403).json({
        success: false,
        error: {
          message: 'AI usage limit reached. Please upgrade to Pro for unlimited AI messages.',
          code: 'AI_LIMIT_REACHED',
        },
        usage: usageInfo,
      });
    }

    const generatedText = await generatePaymentText(req.userId, leadId, validatedData);
    const usageInfo = await getUsageInfo(req.userId);

    res.json({
      success: true,
      data: {
        text: generatedText,
      },
      usage: usageInfo,
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

