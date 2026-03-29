import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { analyzeConversationToLeadMemory, buildGenerationDebugInfo, generateFollowUpText, generatePaymentText, generateRefinedText, getAiHistory } from '../services/aiService';
import { aiFollowUpSchema, aiPaymentSchema, aiRefineSchema, analyzeConversationSchema } from '../utils/validation';
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

    const generatedResult = await generateFollowUpText(req.userId, leadId, validatedData);
    const followUpStyle = validatedData.style || validatedData.conversationMode || 'standard';
    const followUpEmoji = validatedData.emojiIntensity || validatedData.emojiDensity || 'medium';
    const followUpLanguage = validatedData.language || 'en';
    const followUpChannel = validatedData.channel || validatedData.outputFormat || 'chat';
    const followUpGoal = (validatedData.goal || validatedData.objective || '').trim();
    const followUpContext = (validatedData.context || '').trim();
    const followUpDays = validatedData.daysPassed || 0;
    const debug = buildGenerationDebugInfo(generatedResult.text, {
      goal: followUpGoal,
      context: followUpContext,
      language: followUpLanguage,
      channel: followUpChannel,
      style: followUpStyle,
      daysPassed: followUpDays,
      outputFormat: followUpChannel,
      purpose: 'follow_up',
      tone: validatedData.tone || 'polite',
      conversationMode: followUpStyle,
      emojiPreference: followUpEmoji,
    }, followUpGoal);
    await trackEvent(req.userId, {
      event: 'ai_generate_success',
      props: { purpose: 'follow_up', style: followUpStyle },
    }).catch(() => undefined);
    const usageInfo = await getUsageInfo(req.userId);

    res.json({
        success: true,
        data: {
        text: generatedResult.text,
        variants: generatedResult.variants,
        cutoffSummary: generatedResult.cutoffSummary,
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

    const generatedResult = await generatePaymentText(req.userId, leadId, validatedData);
    const paymentStyle = validatedData.style || validatedData.conversationMode || 'standard';
    const paymentEmoji = validatedData.emojiIntensity || validatedData.emojiDensity || 'medium';
    const paymentLanguage = validatedData.language || 'en';
    const paymentChannel = validatedData.channel || validatedData.outputFormat || 'chat';
    const paymentGoal = (validatedData.goal || validatedData.objective || '').trim();
    const paymentContext = (validatedData.context || '').trim();
    const paymentDays = validatedData.daysPassed || 0;
    const debug = buildGenerationDebugInfo(generatedResult.text, {
      goal: paymentGoal,
      context: paymentContext,
      language: paymentLanguage,
      channel: paymentChannel,
      style: paymentStyle,
      daysPassed: paymentDays,
      outputFormat: paymentChannel,
      purpose: 'payment',
      tone: validatedData.tone || 'polite',
      conversationMode: paymentStyle,
      emojiPreference: paymentEmoji,
    }, paymentGoal);
    await trackEvent(req.userId, {
      event: 'ai_generate_success',
      props: { purpose: 'payment', style: paymentStyle },
    }).catch(() => undefined);
    const usageInfo = await getUsageInfo(req.userId);

    res.json({
        success: true,
        data: {
        text: generatedResult.text,
        variants: generatedResult.variants,
        cutoffSummary: generatedResult.cutoffSummary,
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

router.post('/refine', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = aiRefineSchema.parse(req.body);
    const { leadId } = validatedData;

    const plan = await getUserPlan(req.userId);
    const canUseAi = await checkAiUsageLimit(req.userId, plan);
    if (!canUseAi) {
      const usageInfo = await getUsageInfo(req.userId);
      await trackEvent(req.userId, {
        event: 'ai_generate_failed_limit',
        props: { purpose: validatedData.purpose || 'follow_up', mode: 'refine' },
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

    await getLeadById(req.userId, leadId);
    const generatedResult = await generateRefinedText(req.userId, leadId, validatedData);
    const refineStyle = validatedData.style || 'standard';
    const refineEmoji = validatedData.emojiIntensity || 'medium';
    const refineLanguage = validatedData.language || 'en';
    const refineChannel = validatedData.channel || 'chat';
    const refineGoal = validatedData.instruction.trim();
    const debug = buildGenerationDebugInfo(generatedResult.text, {
      goal: refineGoal,
      context: validatedData.originalText,
      language: refineLanguage,
      channel: refineChannel,
      style: refineStyle,
      daysPassed: 0,
      outputFormat: refineChannel,
      purpose: validatedData.purpose || 'follow_up',
      tone: 'polite',
      conversationMode: refineStyle,
      emojiPreference: refineEmoji,
    }, refineGoal, 'refine');

    await trackEvent(req.userId, {
      event: 'ai_generate_success',
      props: { purpose: validatedData.purpose || 'follow_up', style: refineStyle, mode: 'refine' },
    }).catch(() => undefined);
    const usageInfo = await getUsageInfo(req.userId);

    return res.json({
      success: true,
      data: {
        text: generatedResult.text,
        variants: generatedResult.variants,
        cutoffSummary: generatedResult.cutoffSummary,
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

router.post('/analyze-conversation', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = analyzeConversationSchema.parse(req.body);
    await getLeadById(req.userId, validatedData.leadId);

    const plan = await getUserPlan(req.userId);
    const canUseAi = await checkAiUsageLimit(req.userId, plan);
    if (!canUseAi) {
      const usageInfo = await getUsageInfo(req.userId);
      await trackEvent(req.userId, {
        event: 'ai_generate_failed_limit',
        props: { purpose: 'follow_up', mode: 'analyze_conversation' },
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

    const memory = await analyzeConversationToLeadMemory(req.userId, validatedData);
    await trackEvent(req.userId, {
      event: 'ai_generate_success',
      props: { purpose: 'follow_up', mode: 'analyze_conversation' },
    }).catch(() => undefined);

    return res.json({
      success: true,
      data: {
        leadId: validatedData.leadId,
        memory,
      },
      usage: await getUsageInfo(req.userId),
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
