import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createDefaultState, loadWorkflowState, saveWorkflowState } from '../stateStore';
import {
  claimExecutionLease,
  getNextRunnableAction,
  reportExecutionFailure,
  submitAgentResult,
} from '../orchestrationService';
import { runAgentViaCodex } from '../agentRunner';
import { verifyAgent9Execution } from '../agent9Verifier';

const withTempState = async (): Promise<{ dir: string; statePath: string }> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ezr-exec-plane-test-'));
  const statePath = path.join(dir, 'state.json');
  process.env.EZR_WORKFLOW_STATE_PATH = statePath;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_APPROVER_CHAT_ID;
  return { dir, statePath };
};

const makePendingApproval = () => ({
  approvalId: 'appr_execplane',
  target: 'agent:agent3' as const,
  reason: 'Execute stage summary',
  stage: 'stage_summary' as const,
  requestedAt: new Date().toISOString(),
});

test('1) approved task is claimable by local worker', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_summary';
  state.approvalStatus = 'approved';
  state.pendingApproval = makePendingApproval();
  state.proposedNext = {
    target: 'agent:agent3',
    reason: 'Execute stage summary',
    stage: 'stage_summary',
    requiredAgents: ['agent3'],
  };
  await saveWorkflowState(state);

  const next = await getNextRunnableAction();
  assert.equal(next.action.type, 'run_agent');
  assert.deepEqual(next.action.agents, ['agent3']);

  const claimed = await claimExecutionLease({ agent: 'agent3', leaseOwner: 'worker-A' });
  assert.equal(claimed.runningAgents.includes('agent3'), true);
  assert.equal(claimed.leases.agent3?.leaseOwner, 'worker-A');
  assert.equal(claimed.executionLifecycle.agent3?.state, 'running');

  await rm(dir, { recursive: true, force: true });
});

test('2) claimed task cannot be double-claimed', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_summary';
  state.executionLifecycle.agent3 = {
    state: 'approved',
    workerId: null,
    target: 'agent:agent3',
    approvalId: null,
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    detail: null,
  };
  await saveWorkflowState(state);

  await claimExecutionLease({ agent: 'agent3', leaseOwner: 'worker-A' });
  await assert.rejects(
    claimExecutionLease({ agent: 'agent3', leaseOwner: 'worker-B' }),
    /already claimed/i
  );

  await rm(dir, { recursive: true, force: true });
});

test('3) local worker submits success and state transitions correctly', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_summary';
  state.executionLifecycle.agent3 = {
    state: 'approved',
    workerId: null,
    target: 'agent:agent3',
    approvalId: null,
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    detail: null,
  };
  await saveWorkflowState(state);

  await claimExecutionLease({ agent: 'agent3', leaseOwner: 'worker-A' });
  await submitAgentResult({
    agent: 'agent3',
    leaseOwner: 'worker-A',
    result: { status: 'PASS', summary: ['ok'], artifacts: [], rawOutput: null },
  });

  const updated = await loadWorkflowState();
  assert.equal(updated.executionLifecycle.agent3?.state, 'completed');
  assert.equal(updated.leases.agent3, undefined);

  await rm(dir, { recursive: true, force: true });
});

test('4) local worker submits failure and state transitions correctly', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_summary';
  state.executionLifecycle.agent3 = {
    state: 'approved',
    workerId: null,
    target: 'agent:agent3',
    approvalId: null,
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    detail: null,
  };
  await saveWorkflowState(state);

  await claimExecutionLease({ agent: 'agent3', leaseOwner: 'worker-A' });
  await reportExecutionFailure({ agent: 'agent3', leaseOwner: 'worker-A', reason: 'worker_interrupted', detail: 'boom' });

  const updated = await loadWorkflowState();
  assert.equal(updated.executionLifecycle.agent3?.state, 'failed');
  assert.equal(updated.leases.agent3, undefined);

  await rm(dir, { recursive: true, force: true });
});

test('5) agent9 with patch but no deploy verification -> FAIL', async () => {
  const verification = await verifyAgent9Execution({
    workdir: process.cwd(),
    apiBase: 'https://mvp-backend-rqzt.onrender.com',
    preGit: { headSha: 'aaaaaaaa', upstreamSha: 'aaaaaaaa', dirty: false },
    postGit: { headSha: 'bbbbbbbb', upstreamSha: 'aaaaaaaa', dirty: true },
    rawOutput: {
      AGENT_STATUS: 'SUCCESS',
      PATCH_STATUS: 'YES',
      BUILD_STATUS: 'SUCCESS',
      GIT_BEFORE_SHA: 'aaaaaaaa',
      GIT_AFTER_SHA: 'bbbbbbbb',
      PUSH_STATUS: 'SUCCESS',
      DEPLOY_FRONTEND_STATUS: 'SUCCESS',
      DEPLOY_BACKEND_STATUS: 'SUCCESS',
      LIVE_VERIFY_STATUS: 'FAIL',
      STAGING_READY: 'NO',
      NEXT_AGENT_ALLOWED: 'NO',
    },
  });
  assert.equal(verification.success, false);
});

test('6) agent9 deploy success but live URL fail -> FAIL', async () => {
  process.env.EZR_AGENT9_FRONTEND_LIVE_URL = 'http://127.0.0.1:9';
  process.env.EZR_AGENT9_BACKEND_HEALTH_URL = 'http://127.0.0.1:9/health';
  process.env.CLOUDFLARE_API_TOKEN = 'x';
  process.env.RENDER_API_KEY = 'y';

  const verification = await verifyAgent9Execution({
    workdir: process.cwd(),
    apiBase: 'https://mvp-backend-rqzt.onrender.com',
    preGit: { headSha: 'aaaaaaaa', upstreamSha: '11111111', dirty: false },
    postGit: { headSha: 'bbbbbbbb', upstreamSha: '22222222', dirty: false },
    rawOutput: {
      AGENT_STATUS: 'SUCCESS',
      PATCH_STATUS: 'NO',
      BUILD_STATUS: 'SUCCESS',
      GIT_BEFORE_SHA: 'aaaaaaaa',
      GIT_AFTER_SHA: 'bbbbbbbb',
      PUSH_STATUS: 'SUCCESS',
      DEPLOY_FRONTEND_STATUS: 'SUCCESS',
      DEPLOY_BACKEND_STATUS: 'SUCCESS',
      LIVE_VERIFY_STATUS: 'SUCCESS',
      STAGING_READY: 'YES',
      NEXT_AGENT_ALLOWED: 'YES',
    },
  });

  assert.equal(verification.success, false);
});

test('7) agent9 full success -> only then propose agent12', async () => {
  const { dir } = await withTempState();
  process.env.EZR_AGENT9_REQUIRE_PUSH = 'false';
  process.env.EZR_AGENT9_FRONTEND_LIVE_URL = 'https://example.com';
  process.env.EZR_AGENT9_BACKEND_HEALTH_URL = 'https://example.com';
  process.env.CLOUDFLARE_API_TOKEN = 'x';
  process.env.RENDER_API_KEY = 'y';

  const state = createDefaultState();
  state.currentStage = 'stage_patch_deploy';
  state.status = 'running';
  state.executionLifecycle.agent9 = {
    state: 'approved',
    workerId: null,
    target: 'agent:agent9',
    approvalId: null,
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    detail: null,
  };
  await saveWorkflowState(state);

  await claimExecutionLease({ agent: 'agent9', leaseOwner: 'worker-Z' });
  await submitAgentResult({
    agent: 'agent9',
    leaseOwner: 'worker-Z',
    result: {
      status: 'PASS',
      summary: ['ok'],
      artifacts: [],
      rawOutput: {
        AGENT_STATUS: 'SUCCESS',
        PATCH_STATUS: 'NO',
        BUILD_STATUS: 'SUCCESS',
        GIT_BEFORE_SHA: 'aaaaaaaa',
        GIT_AFTER_SHA: 'aaaaaaaa',
        PUSH_STATUS: 'NOT_REQUIRED',
        DEPLOY_FRONTEND_STATUS: 'SUCCESS',
        DEPLOY_BACKEND_STATUS: 'SUCCESS',
        LIVE_VERIFY_STATUS: 'SUCCESS',
        STAGING_READY: 'YES',
        NEXT_AGENT_ALLOWED: 'YES',
        contractVerification: {
          success: true,
          stagingReady: true,
          summary: ['hard verification passed'],
        },
      },
    },
  });

  const updated = await loadWorkflowState();
  assert.equal(updated.currentStage, 'stage_validation');
  assert.equal(updated.pendingApproval?.target, 'agent:agent12');

  await rm(dir, { recursive: true, force: true });
});

test('8) missing codex locally -> clear execution failure', async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = '';
  const result = await runAgentViaCodex({
    agent: 'agent3',
    prompt: 'Return JSON',
    loopCount: 1,
    cwd: process.cwd(),
  });
  process.env.PATH = originalPath;

  assert.equal(result.status, 'FAIL');
  assert.match((result.summary || []).join(' '), /execution failed|enoent/i);
});

test('9) missing git/deploy credentials -> fail closed', async () => {
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CF_API_TOKEN;
  delete process.env.RENDER_API_KEY;
  process.env.EZR_AGENT9_FRONTEND_LIVE_URL = 'https://example.com';
  process.env.EZR_AGENT9_BACKEND_HEALTH_URL = 'https://example.com';

  const verification = await verifyAgent9Execution({
    workdir: process.cwd(),
    apiBase: 'https://mvp-backend-rqzt.onrender.com',
    preGit: { headSha: 'aaaaaaaa', upstreamSha: '11111111', dirty: false },
    postGit: { headSha: 'bbbbbbbb', upstreamSha: '22222222', dirty: false },
    rawOutput: {
      AGENT_STATUS: 'SUCCESS',
      PATCH_STATUS: 'NO',
      BUILD_STATUS: 'SUCCESS',
      GIT_BEFORE_SHA: 'aaaaaaaa',
      GIT_AFTER_SHA: 'bbbbbbbb',
      PUSH_STATUS: 'SUCCESS',
      DEPLOY_FRONTEND_STATUS: 'SUCCESS',
      DEPLOY_BACKEND_STATUS: 'SUCCESS',
      LIVE_VERIFY_STATUS: 'SUCCESS',
      STAGING_READY: 'YES',
      NEXT_AGENT_ALLOWED: 'YES',
    },
  });

  assert.equal(verification.success, false);
  assert.match(verification.summary.join(' '), /missing cloudflare|missing render/i);
});

test('10) lease owner mismatch cannot submit another worker result', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_summary';
  state.executionLifecycle.agent3 = {
    state: 'approved',
    workerId: null,
    target: 'agent:agent3',
    approvalId: null,
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    detail: null,
  };
  await saveWorkflowState(state);

  await claimExecutionLease({ agent: 'agent3', leaseOwner: 'worker-A' });

  await assert.rejects(
    submitAgentResult({
      agent: 'agent3',
      leaseOwner: 'worker-B',
      result: { status: 'PASS', summary: ['ok'], artifacts: [], rawOutput: null },
    }),
    /lease owner mismatch/i
  );

  await rm(dir, { recursive: true, force: true });
});

test.after(() => {
  delete process.env.EZR_WORKFLOW_STATE_PATH;
});
