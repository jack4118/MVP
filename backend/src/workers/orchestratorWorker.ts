import cron from 'node-cron';
import {
  buildAgentPrompt,
  getNextRunnableAction,
  initializeOrchestrator,
  runCredentialExpiryCheck,
  submitAgentResult,
} from '../orchestration/orchestrationService';
import { runAgentViaCodex } from '../orchestration/agentRunner';

const POLL_MS = Number(process.env.EZR_ORCHESTRATOR_WORKER_POLL_MS || 15000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runOneAgent = async (agent: any, state: any): Promise<void> => {
  const prompt = await buildAgentPrompt({ state, agent });
  const result = await runAgentViaCodex({ agent, prompt, loopCount: state.loopCount || 0 });
  await submitAgentResult({ agent, result });
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
