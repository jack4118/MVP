import { runAgentViaCodex } from '../orchestration/agentRunner';

type NextActionResponse = {
  success: boolean;
  data?: {
    state: { loopCount?: number };
    action: {
      type: 'run_agent' | 'run_parallel' | 'idle';
      agents: string[];
      reason: string;
    };
  };
};

const API_BASE = process.env.EZR_ORCHESTRATOR_API_BASE || 'https://mvp-backend-rqzt.onrender.com';
const POLL_MS = Number(process.env.EZR_ORCHESTRATOR_WORKER_POLL_MS || 15000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ezreply-orchestrator-worker/1.0',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${url} failed: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
};

const runOne = async (agent: string, loopCount: number): Promise<void> => {
  const promptResp = await getJson<{ success: boolean; data: { prompt: string } }>(
    `${API_BASE}/api/orchestrator/auto/prompt/${agent}`
  );

  const prompt = promptResp.data.prompt;
  const result = await runAgentViaCodex({
    agent: agent as any,
    prompt,
    loopCount,
  });

  const safeSummary = (result.summary || [])
    .map((line) => String(line).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 6);
  const safeArtifacts = (result.artifacts || [])
    .map((line) => String(line).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 6);

  try {
    await postJson(`${API_BASE}/api/orchestrator/auto/submit`, {
      agent,
      status: result.status,
      summary: safeSummary,
      artifacts: safeArtifacts,
      // Keep payload small to avoid upstream edge blocking on oversized bodies.
      rawOutput: null,
    });
  } catch (error: any) {
    const msg = String(error?.message || error);
    if (!msg.includes(' 403 ')) {
      throw error;
    }

    // Fallback for aggressive edge filtering: retry with minimal safe payload.
    await postJson(`${API_BASE}/api/orchestrator/auto/submit`, {
      agent,
      status: result.status,
      summary: [`${agent} ${result.status}`],
      artifacts: [],
      rawOutput: null,
    });
  }
};

const tick = async (): Promise<void> => {
  const next = await getJson<NextActionResponse>(`${API_BASE}/api/orchestrator/auto/next-action`);
  const action = next.data?.action;
  const loopCount = next.data?.state?.loopCount || 0;

  if (!action || action.type === 'idle' || action.agents.length === 0) {
    return;
  }

  if (action.type === 'run_agent') {
    await runOne(action.agents[0], loopCount);
    return;
  }

  if (action.type === 'run_parallel') {
    for (const agent of action.agents) {
      await runOne(agent, loopCount);
      await sleep(400);
    }
  }
};

const main = async () => {
  console.log(`[OrchestratorApiWorker] started, api=${API_BASE}`);
  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error('[OrchestratorApiWorker] tick failed', error);
    }
    await sleep(POLL_MS);
  }
};

main().catch((error) => {
  console.error('[OrchestratorApiWorker] fatal', error);
  process.exit(1);
});
