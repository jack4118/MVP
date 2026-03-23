import express, { NextFunction, Request, Response } from 'express';
import {
  buildAgentPrompt,
  claimApprovedNextAgent,
  claimExecutionLease,
  getAgentRegistry,
  getNextRunnableAction,
  getWorkflowStatus,
  heartbeatExecutionLease,
  proposeNextAgentForApproval,
  reportExecutionFailure,
  requestManualRepeatRun,
  resetWorkflow,
  startAutoRun,
  stopAutoRun,
  submitAgentResult,
} from '../orchestration/orchestrationService';
import { createAppError } from '../utils/errors';
import { normalizeAgentName } from '../orchestration/agentRegistry';

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

router.post('/auto/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorAgent, issue, checkpointPolicy } = req.body as {
      actorAgent?: string;
      issue?: string;
      checkpointPolicy?: 'critical_only' | 'all_steps';
    };

    if (!actorAgent || !issue) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_AUTO_START_INVALID_REQUEST',
        message: 'actorAgent and issue are required',
      });
    }

    const state = await startAutoRun({ actorAgent, issue, checkpointPolicy });
    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 400,
            code: 'ORCHESTRATOR_AUTO_START_FAILED',
            message: error.message || 'Failed to start auto run',
          })
    );
  }
});

router.post('/auto/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorAgent } = req.body as { actorAgent?: string };
    if (!actorAgent) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_AUTO_STOP_INVALID_REQUEST',
        message: 'actorAgent is required',
      });
    }
    const state = await stopAutoRun({ actorAgent });
    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 400,
            code: 'ORCHESTRATOR_AUTO_STOP_FAILED',
            message: error.message || 'Failed to stop auto run',
          })
    );
  }
});

router.get('/auto/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await getWorkflowStatus();
    return res.json({
      success: true,
      data: {
        autoMode: state.autoMode,
        autoRunStatus: state.autoRunStatus,
        nextAction: state.nextAction,
        approvalStatus: state.approvalStatus,
        proposedNextAgent: state.proposedNextAgent,
        currentRunningAgent: state.currentRunningAgent,
        loopCount: state.loopCount,
        recentOutputs: state.agentOutputs,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/auto/next-action', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getNextRunnableAction();
    return res.json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/auto/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent, status, summary, artifacts, rawOutput, leaseOwner } = req.body as {
      agent?: string;
      status?: 'PASS' | 'FAIL' | 'OK';
      summary?: string[];
      artifacts?: string[];
      rawOutput?: unknown;
      leaseOwner?: string;
    };

    if (!agent || !status) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_AUTO_SUBMIT_INVALID_REQUEST',
        message: 'agent and status are required',
      });
    }

    const normalizedAgent = normalizeAgentName(agent);
    if (!normalizedAgent) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_AUTO_SUBMIT_INVALID_AGENT',
        message: 'Invalid agent',
      });
    }

    const state = await submitAgentResult({
      agent: normalizedAgent,
      leaseOwner,
      result: {
        status,
        summary: Array.isArray(summary) ? summary : [],
        artifacts: Array.isArray(artifacts) ? artifacts : [],
        rawOutput,
      },
    });

    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 400,
            code: 'ORCHESTRATOR_AUTO_SUBMIT_FAILED',
            message: error.message || 'Failed to submit agent result',
          })
    );
  }
});

router.post('/auto/lease/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent, leaseOwner } = req.body as { agent?: string; leaseOwner?: string };
    if (!agent || !leaseOwner) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_LEASE_CLAIM_INVALID_REQUEST',
        message: 'agent and leaseOwner are required',
      });
    }

    const normalizedAgent = normalizeAgentName(agent);
    if (!normalizedAgent || normalizedAgent === 'agent0') {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_LEASE_CLAIM_INVALID_AGENT',
        message: 'Invalid agent',
      });
    }
    const state = await claimExecutionLease({ agent: normalizedAgent, leaseOwner });
    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 409,
            code: 'ORCHESTRATOR_LEASE_CLAIM_FAILED',
            message: error.message || 'Failed to claim lease',
          })
    );
  }
});

router.post('/auto/execution/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent, workerId } = req.body as { agent?: string; workerId?: string };
    if (!agent || !workerId) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_EXECUTION_CLAIM_INVALID_REQUEST',
        message: 'agent and workerId are required',
      });
    }
    const normalizedAgent = normalizeAgentName(agent);
    if (!normalizedAgent || normalizedAgent === 'agent0') {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_EXECUTION_CLAIM_INVALID_AGENT',
        message: 'Invalid agent',
      });
    }
    const state = await claimExecutionLease({ agent: normalizedAgent, leaseOwner: workerId });
    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 409,
            code: 'ORCHESTRATOR_EXECUTION_CLAIM_FAILED',
            message: error.message || 'Failed to claim execution',
          })
    );
  }
});

router.post('/auto/lease/heartbeat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent, leaseOwner } = req.body as { agent?: string; leaseOwner?: string };
    if (!agent) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_LEASE_HEARTBEAT_INVALID_REQUEST',
        message: 'agent is required',
      });
    }
    const normalizedAgent = normalizeAgentName(agent);
    if (!normalizedAgent || normalizedAgent === 'agent0') {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_LEASE_HEARTBEAT_INVALID_AGENT',
        message: 'Invalid agent',
      });
    }
    const state = await heartbeatExecutionLease({ agent: normalizedAgent, leaseOwner });
    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 409,
            code: 'ORCHESTRATOR_LEASE_HEARTBEAT_FAILED',
            message: error.message || 'Failed to heartbeat lease',
          })
    );
  }
});

router.post('/auto/failure', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent, reason, detail, leaseOwner } = req.body as {
      agent?: string;
      reason?: 'execution_timeout' | 'lease_expired' | 'worker_interrupted';
      detail?: string;
      leaseOwner?: string;
    };
    if (!agent || !reason) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_FAILURE_INVALID_REQUEST',
        message: 'agent and reason are required',
      });
    }
    const normalizedAgent = normalizeAgentName(agent);
    if (!normalizedAgent || normalizedAgent === 'agent0') {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_FAILURE_INVALID_AGENT',
        message: 'Invalid agent',
      });
    }
    const state = await reportExecutionFailure({ agent: normalizedAgent, reason, detail, leaseOwner });
    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 409,
            code: 'ORCHESTRATOR_FAILURE_REPORT_FAILED',
            message: error.message || 'Failed to report execution failure',
          })
    );
  }
});

router.post('/auto/repeat-run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent, requestedBy } = req.body as { agent?: string; requestedBy?: string };
    if (!agent) {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_REPEAT_RUN_INVALID_REQUEST',
        message: 'agent is required',
      });
    }
    const normalizedAgent = normalizeAgentName(agent);
    if (!normalizedAgent || normalizedAgent === 'agent0') {
      throw createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_REPEAT_RUN_INVALID_AGENT',
        message: 'Invalid agent',
      });
    }
    const state = await requestManualRepeatRun({
      agent: normalizedAgent,
      requestedBy: requestedBy || 'api',
    });
    return res.json({ success: true, data: state });
  } catch (error: any) {
    return next(
      error.statusCode
        ? error
        : createAppError({
            statusCode: 409,
            code: 'ORCHESTRATOR_REPEAT_RUN_FAILED',
            message: error.message || 'Failed to schedule repeat-run',
          })
    );
  }
});

router.get('/auto/prompt/:agent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = req.params.agent;
    const normalizedAgent = normalizeAgentName(agent);
    if (!normalizedAgent) {
      throw new Error('Invalid agent');
    }
    const state = await getWorkflowStatus();
    const prompt = await buildAgentPrompt({ state, agent: normalizedAgent });
    return res.json({ success: true, data: { agent: normalizedAgent, prompt } });
  } catch (error: any) {
    return next(
      createAppError({
        statusCode: 400,
        code: 'ORCHESTRATOR_PROMPT_BUILD_FAILED',
        message: error.message || 'Failed to build prompt',
      })
    );
  }
});

export default router;
