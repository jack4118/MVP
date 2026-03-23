import cron from 'node-cron';
import {
  buildAgentPrompt,
  claimExecutionLease,
  heartbeatExecutionLease,
  getNextRunnableAction,
  initializeOrchestrator,
  reportExecutionFailure,
  runCredentialExpiryCheck,
  submitAgentResult,
} from '../orchestration/orchestrationService';
import { runAgentViaCodex } from '../orchestration/agentRunner';
import { getAgentMaxRuntimeMs, getHeartbeatIntervalMs } from '../orchestration/executionPolicy';
import { AgentName } from '../orchestration/types';
import { WorkflowState } from '../orchestration/workflowModel';

const POLL_MS = Number(process.env.EZR_ORCHESTRATOR_WORKER_POLL_MS || 15000);
const LEASE_OWNER = process.env.EZR_ORCHESTRATOR_WORKER_ID || `local-worker:${process.pid}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const inFlightAgents = new Set<AgentName>();

class ExecutionTimeoutError extends Error {
  constructor(public readonly agent: AgentName) {
    super(`${agent} exceeded max runtime`);
  }
}

const withTimeout = async <T>(agent: AgentName, promise: Promise<T>): Promise<T> => {
  const timeoutMs = getAgentMaxRuntimeMs(agent);
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ExecutionTimeoutError(agent)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

const runOneAgent = async (agent: AgentName, state: WorkflowState): Promise<void> => {
  await claimExecutionLease({ agent, leaseOwner: LEASE_OWNER });
  inFlightAgents.add(agent);
  const heartbeatTask = setInterval(async () => {
    try {
      await heartbeatExecutionLease({ agent, leaseOwner: LEASE_OWNER });
    } catch (error) {
      console.error(`[OrchestratorWorker] heartbeat failed for ${agent}`, error);
    }
  }, getHeartbeatIntervalMs());

  try {
    const prompt = await buildAgentPrompt({ state, agent });
    const result = await withTimeout(agent, runAgentViaCodex({ agent, prompt, loopCount: state.loopCount || 0 }));
    await submitAgentResult({ agent, result });
  } catch (error: any) {
    if (error instanceof ExecutionTimeoutError) {
      await reportExecutionFailure({
        agent,
        reason: 'execution_timeout',
        detail: error.message,
      });
    } else {
      await reportExecutionFailure({
        agent,
        reason: 'worker_interrupted',
        detail: error?.message || 'worker execution interrupted',
      });
    }
    throw error;
  } finally {
    clearInterval(heartbeatTask);
    inFlightAgents.delete(agent);
  }
};

const tick = async () => {
  const { state, action } = await getNextRunnableAction();
  if (action.type === 'idle' || action.agents.length === 0) {
    return;
  }

  if (action.type === 'run_agent') {
    await runOneAgent(action.agents[0], state);
    return;
  }

  if (action.type === 'run_parallel') {
    await Promise.all(action.agents.map((agent) => runOneAgent(agent, state)));
  }
};

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[OrchestratorWorker] received ${signal}, reporting interrupted runs`);
  for (const agent of [...inFlightAgents]) {
    try {
      await reportExecutionFailure({
        agent,
        reason: 'worker_interrupted',
        detail: `worker received ${signal}`,
      });
    } catch (error) {
      console.error(`[OrchestratorWorker] failed to report interruption for ${agent}`, error);
    }
  }
  process.exit(0);
};

const startWorker = async () => {
  await initializeOrchestrator();

  cron.schedule('*/15 * * * *', async () => {
    try {
      await runCredentialExpiryCheck();
    } catch (error) {
      console.error('[OrchestratorWorker] credential expiry check failed', error);
    }
  });

  console.log('[OrchestratorWorker] started');

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error('[OrchestratorWorker] tick failed', error);
    }
    await sleep(POLL_MS);
  }
};

startWorker().catch((error) => {
  console.error('[OrchestratorWorker] fatal', error);
  process.exit(1);
});
