import express, { NextFunction, Request, Response } from 'express';
import {
  claimApprovedNextAgent,
  getAgentRegistry,
  getWorkflowStatus,
  proposeNextAgentForApproval,
  resetWorkflow,
} from '../orchestration/orchestrationService';
import { createAppError } from '../utils/errors';

const router = express.Router();

router.get('/registry', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return res.json({ success: true, data: getAgentRegistry() });
  } catch (error) {
    return next(error);
  }
});

router.get('/workflow/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await getWorkflowStatus();
    return res.json({ success: true, data: state });
  } catch (error) {
    return next(error);
  }
});

router.post('/workflow/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorAgent, issue, loopStage, pendingAgents } = req.body as {
      actorAgent?: string;
      issue?: string;
      loopStage?: string;
      pendingAgents?: string[];
    };

    if (!actorAgent || !issue) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_RESET_INVALID_REQUEST',
        message: 'actorAgent and issue are required',
      });
    }

    const state = await resetWorkflow({
      actorAgent,
      issue,
      loopStage,
      pendingAgents,
    });

    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 400,
            code: 'ORCHESTRATOR_RESET_FAILED',
            message: error.message || 'Failed to reset workflow',
          })
    );
  }
});

router.post('/proposals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorAgent, completedAgent, resultSummary, proposedNextAgent, why, issue, loopStage } = req.body as {
      actorAgent?: string;
      completedAgent?: string;
      resultSummary?: string[];
      proposedNextAgent?: string;
      why?: string;
      issue?: string;
      loopStage?: string;
    };

    if (!actorAgent || !completedAgent || !proposedNextAgent || !why || !Array.isArray(resultSummary)) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_PROPOSAL_INVALID_REQUEST',
        message: 'actorAgent, completedAgent, resultSummary[], proposedNextAgent, and why are required',
      });
    }

    const result = await proposeNextAgentForApproval({
      actorAgent,
      completedAgent,
      resultSummary,
      proposedNextAgent,
      why,
      issue,
      loopStage,
    });

    return res.status(result.telegram.ok ? 200 : 502).json({
      success: result.telegram.ok,
      data: result.state,
      telegram: result.telegram,
    });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 400,
            code: 'ORCHESTRATOR_PROPOSAL_FAILED',
            message: error.message || 'Failed to propose next agent',
          })
    );
  }
});

router.post('/next/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorAgent } = req.body as { actorAgent?: string };
    if (!actorAgent) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_CLAIM_INVALID_REQUEST',
        message: 'actorAgent is required',
      });
    }

    const result = await claimApprovedNextAgent({ actorAgent });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 409,
            code: 'ORCHESTRATOR_CLAIM_FAILED',
            message: error.message || 'Failed to claim approved next agent',
          })
    );
  }
});

export default router;
