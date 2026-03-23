import { spawnSync } from 'child_process';
import path from 'path';
import { runAgentViaCodex } from '../orchestration/agentRunner';
import { captureGitSnapshot, verifyAgent9Execution } from '../orchestration/agent9Verifier';
import { getAgentMaxRuntimeMs, getHeartbeatIntervalMs } from '../orchestration/executionPolicy';
import { AgentName } from '../orchestration/types';

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
const LEASE_OWNER = process.env.EZR_ORCHESTRATOR_WORKER_ID || `api-worker:${process.pid}`;
const WORKSPACE_ROOT = process.env.EZR_WORKSPACE_ROOT || path.resolve(process.cwd(), '..');
const inFlightAgents = new Set<AgentName>();

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

const codexIsAvailable = (): boolean => {
  const result = spawnSync('codex', ['--version'], {
    env: process.env,
    cwd: WORKSPACE_ROOT,
    stdio: 'ignore',
  });
  return result.status === 0;
};

class ExecutionTimeoutError extends Error {
  constructor(public readonly agent: AgentName) {
    super(`${agent} exceeded max runtime`);
  }
}

const withTimeout = async <T>(agent: AgentName, promise: Promise<T>): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ExecutionTimeoutError(agent)), getAgentMaxRuntimeMs(agent));
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

const reportFailure = async (agent: AgentName, reason: 'execution_timeout' | 'worker_interrupted', detail?: string): Promise<void> => {
  await postJson(`${API_BASE}/api/orchestrator/auto/failure`, {
    agent,
    reason,
    detail: detail || null,
    leaseOwner: LEASE_OWNER,
  });
};

const runOne = async (agent: AgentName, loopCount: number): Promise<void> => {
  await postJson(`${API_BASE}/api/orchestrator/auto/lease/claim`, {
    agent,
    leaseOwner: LEASE_OWNER,
  });

  const heartbeatTask = setInterval(async () => {
    try {
      await postJson(`${API_BASE}/api/orchestrator/auto/lease/heartbeat`, {
        agent,
        leaseOwner: LEASE_OWNER,
      });
    } catch (error) {
      console.error(`[OrchestratorApiWorker] heartbeat failed for ${agent}`, error);
    }
  }, getHeartbeatIntervalMs());

  try {
    inFlightAgents.add(agent);
    const preGit = agent === 'agent9' ? await captureGitSnapshot(WORKSPACE_ROOT) : null;
    const promptResp = await getJson<{ success: boolean; data: { prompt: string } }>(
      `${API_BASE}/api/orchestrator/auto/prompt/${agent}`
    );

    const prompt = promptResp.data.prompt;
    const result = await withTimeout(
      agent,
      runAgentViaCodex({
        agent,
        prompt,
        loopCount,
        cwd: WORKSPACE_ROOT,
      })
    );

    let finalStatus = result.status;
    let finalSummary = [...(result.summary || [])];
    let finalArtifacts = [...(result.artifacts || [])];
    let finalRawOutput = result.rawOutput;

    if (agent === 'agent9') {
      const postGit = await captureGitSnapshot(WORKSPACE_ROOT);
      const verification = await verifyAgent9Execution({
        workdir: WORKSPACE_ROOT,
        apiBase: API_BASE,
        preGit: preGit!,
        postGit,
        rawOutput: result.rawOutput,
      });

      finalStatus = verification.success ? 'PASS' : 'FAIL';
      finalSummary = verification.summary.slice(0, 10);
      finalArtifacts = [
        `git_before_sha:${preGit!.headSha}`,
        `git_after_sha:${postGit.headSha}`,
        `git_before_upstream_sha:${preGit!.upstreamSha || 'none'}`,
        `git_after_upstream_sha:${postGit.upstreamSha || 'none'}`,
      ];
      finalRawOutput = {
        ...(result.rawOutput && typeof result.rawOutput === 'object' ? (result.rawOutput as object) : {}),
        contractVerification: verification,
        gitSnapshot: {
          before: preGit,
          after: postGit,
        },
      };
    }

    const safeSummary = (finalSummary || [])
      .map((line) => String(line).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180))
      .filter(Boolean)
      .slice(0, 10);
    const safeArtifacts = (finalArtifacts || [])
      .map((line) => String(line).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180))
      .filter(Boolean)
      .slice(0, 12);

    await postJson(`${API_BASE}/api/orchestrator/auto/submit`, {
      agent,
      leaseOwner: LEASE_OWNER,
      status: finalStatus,
      summary: safeSummary,
      artifacts: safeArtifacts,
      rawOutput: finalRawOutput,
    });
  } catch (error: any) {
    if (error instanceof ExecutionTimeoutError) {
      await reportFailure(agent, 'execution_timeout', error.message);
      throw error;
    }

    const msg = String(error?.message || error);
    if (msg.includes(' 403 ')) {
      await postJson(`${API_BASE}/api/orchestrator/auto/submit`, {
        agent,
        leaseOwner: LEASE_OWNER,
        status: 'FAIL',
        summary: [`${agent} FAIL`],
        artifacts: [],
        rawOutput: null,
      });
      return;
    }

    await reportFailure(agent, 'worker_interrupted', msg);
    throw error;
  } finally {
    inFlightAgents.delete(agent);
    clearInterval(heartbeatTask);
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
    await runOne(action.agents[0] as AgentName, loopCount);
    return;
  }

  if (action.type === 'run_parallel') {
    for (const agent of action.agents) {
      await runOne(agent as AgentName, loopCount);
      await sleep(400);
    }
  }
};

const main = async () => {
  if (!codexIsAvailable()) {
    throw new Error('Local codex binary is not available. Install codex and ensure it is in PATH.');
  }
  console.log(`[OrchestratorApiWorker] started, api=${API_BASE}`);
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
      console.error('[OrchestratorApiWorker] tick failed', error);
    }
    await sleep(POLL_MS);
  }
};

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[OrchestratorApiWorker] received ${signal}, reporting interrupted runs`);
  for (const agent of [...inFlightAgents]) {
    try {
      await reportFailure(agent, 'worker_interrupted', `worker received ${signal}`);
    } catch (error) {
      console.error(`[OrchestratorApiWorker] failed to report interruption for ${agent}`, error);
    }
  }
  process.exit(0);
};

main().catch((error) => {
  console.error('[OrchestratorApiWorker] fatal', error);
  process.exit(1);
});
