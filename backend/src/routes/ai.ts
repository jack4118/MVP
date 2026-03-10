import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { buildGenerationDebugInfo, generateFollowUpText, generatePaymentText, getAiHistory } from '../services/aiService';
import { aiFollowUpSchema, aiPaymentSchema } from '../utils/validation';
import { getLeadById } from '../services/leadService';
import { getUserPlan, checkAiUsageLimit, getUsageInfo } from '../services/planService';
import { trackEvent } from '../services/eventService';

const router = express.Router();

router.use(authenticate);

router.get('/history', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const limit = Number(req.query.limit || 20);
    const purpose = (req.query.purpose as 'follow_up' | 'payment' | 'all' | undefined) || 'all';

    const history = await getAiHistory(req.userId, { limit, purpose });

    return res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

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
      await trackEvent(req.userId, {
        event: 'ai_generate_failed_limit',
        props: { purpose: 'follow_up' },
      }).catch(() => undefined);
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
    const followUpMode = validatedData.conversationMode || 'standard';
    const followUpTone = validatedData.tone || 'polite';
    const followUpEmoji = validatedData.emojiDensity || 'medium';
    const followUpLanguage = validatedData.language || 'en';
    const followUpFormat = validatedData.outputFormat || 'chat';
    const debug = buildGenerationDebugInfo(generatedText, {
      language: followUpLanguage,
      outputFormat: followUpFormat,
      purpose: 'follow_up',
      tone: followUpTone,
      conversationMode: followUpMode,
      emojiPreference: followUpEmoji,
    }, validatedData.objective);
    await trackEvent(req.userId, {
      event: 'ai_generate_success',
      props: { purpose: 'follow_up', stylePreset: validatedData.stylePreset || 'gentle_nudge' },
    }).catch(() => undefined);
    const usageInfo = await getUsageInfo(req.userId);

    res.json({
      success: true,
      data: {
        text: generatedText,
        debug,
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
    console.log(`[AI Limit Check] User ID: ${req.userId}, Plan: ${plan}`);
    const canUseAi = await checkAiUsageLimit(req.userId, plan);
    console.log(`[AI Limit Check] Can use AI: ${canUseAi}`);

    if (!canUseAi) {
      const usageInfo = await getUsageInfo(req.userId);
      console.log(`[AI Limit Check] Usage info:`, JSON.stringify(usageInfo, null, 2));
      await trackEvent(req.userId, {
        event: 'ai_generate_failed_limit',
        props: { purpose: 'payment' },
      }).catch(() => undefined);
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
    const paymentMode = validatedData.conversationMode || 'standard';
    const paymentTone = validatedData.tone || 'polite';
    const paymentEmoji = validatedData.emojiDensity || 'medium';
    const paymentLanguage = validatedData.language || 'en';
    const paymentFormat = validatedData.outputFormat || 'chat';
    const debug = buildGenerationDebugInfo(generatedText, {
      language: paymentLanguage,
      outputFormat: paymentFormat,
      purpose: 'payment',
      tone: paymentTone,
      conversationMode: paymentMode,
      emojiPreference: paymentEmoji,
    }, validatedData.objective);
    await trackEvent(req.userId, {
      event: 'ai_generate_success',
      props: { purpose: 'payment', stylePreset: validatedData.stylePreset || 'friendly_reminder' },
    }).catch(() => undefined);
    const usageInfo = await getUsageInfo(req.userId);

    res.json({
      success: true,
      data: {
        text: generatedText,
        debug,
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
