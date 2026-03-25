import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import prisma from '../../config/database';
import { runAgentsInParallel } from '../../workers/orchestratorApiWorker';
import {
  buildAgentPrompt,
  getNextRunnableAction,
  handleTelegramWebhookUpdate,
} from '../orchestrationService';
import { createDefaultState, saveWorkflowState } from '../stateStore';
import { getTemplateTokenStatus, setTemplateTokenDirect } from '../credentialService';
import { AgentName } from '../types';

const withTempState = async (): Promise<{ dir: string; statePath: string }> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ezr-minimal-fixes-test-'));
  const statePath = path.join(dir, 'state.json');
  process.env.EZR_WORKFLOW_STATE_PATH = statePath;
  return { dir, statePath };
};

test('1) runAgentsInParallel starts work concurrently', async () => {
  const events: string[] = [];
  const runner = async (agent: AgentName): Promise<void> => {
    events.push(`start:${agent}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
    events.push(`finish:${agent}`);
  };

  await runAgentsInParallel(['agent1', 'agent2', 'agent3'], runner);
  const firstFinishIndex = events.findIndex((entry) => entry.startsWith('finish:'));
  const startCountBeforeFirstFinish = events.slice(0, firstFinishIndex).filter((entry) => entry.startsWith('start:')).length;
  assert.equal(startCountBeforeFirstFinish, 3);
});

test('2) getNextRunnableAction filters stale approved agents from wrong stage', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_patch_deploy';
  state.executionLifecycle.agent2 = {
    state: 'approved',
    workerId: null,
    target: null,
    approvalId: null,
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    detail: 'stale approved',
  };
  state.executionLifecycle.agent9 = {
    state: 'approved',
    workerId: null,
    target: 'agent:agent9',
    approvalId: null,
    claimedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    detail: 'current stage approved',
  };
  await saveWorkflowState(state);

  const result = await getNextRunnableAction();
  assert.equal(result.action.type, 'run_agent');
  assert.deepEqual(result.action.agents, ['agent9']);

  await rm(dir, { recursive: true, force: true });
});

test('3) /status uses reconciled workflow state', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_summary';
  state.runningAgents = ['agent3'];
  state.currentRunningAgent = 'agent3';
  state.attempts.agent3 = 1;
  const now = Date.now();
  state.leases.agent3 = {
    agentName: 'agent3',
    leaseOwner: 'worker-stale',
    startedAt: new Date(now - 10 * 60 * 1000).toISOString(),
    heartbeatAt: new Date(now - 10 * 60 * 1000).toISOString(),
    leaseExpiresAt: new Date(now - 8 * 60 * 1000).toISOString(),
    attemptNumber: 1,
  };
  await saveWorkflowState(state);

  const originalFetch = global.fetch;
  const originalEnvToken = process.env.EZR_WHATSAPP_TEMPLATE_TOKEN;
  delete process.env.EZR_WHATSAPP_TEMPLATE_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_APPROVER_CHAT_ID = '123';
  global.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    }) as any) as typeof fetch;

  const result = await handleTelegramWebhookUpdate({
    message: { chat: { id: 123 }, text: '/status' },
  });
  assert.match(result.response || '', /Running: none/i);

  global.fetch = originalFetch;
  process.env.EZR_WHATSAPP_TEMPLATE_TOKEN = originalEnvToken;
  await rm(dir, { recursive: true, force: true });
});

test('4) token status reconciles to expired when expiresAt has passed', async () => {
  const prismaAny = prisma as any;
  const originalCredential = prismaAny.orchestratorCredential;
  let updatedStatus: string | null = null;

  prismaAny.orchestratorCredential = {
    findUnique: async () => ({
      key: 'EZR_WHATSAPP_TEMPLATE_TOKEN',
      value: 'abc123456789xyz',
      status: 'active',
      expiresAt: new Date(Date.now() - 60_000),
      updatedAt: new Date(),
    }),
    update: async ({ data }: any) => {
      updatedStatus = data.status;
      return {};
    },
  };

  const status = await getTemplateTokenStatus();
  assert.equal(updatedStatus, 'expired');
  assert.match(status, /status: expired/i);

  prismaAny.orchestratorCredential = originalCredential;
});

test('5) direct /wa_token set upserts token immediately with end-of-day expiry', async () => {
  const prismaAny = prisma as any;
  const originalCredential = prismaAny.orchestratorCredential;
  let capturedUpdate: any = null;

  prismaAny.orchestratorCredential = {
    upsert: async (args: any) => {
      capturedUpdate = args;
      return {};
    },
  };

  const saved = await setTemplateTokenDirect({
    chatId: '123',
    token: 'new-token-value',
    expiresOn: '2026-03-30',
  });

  assert.ok(saved.expiresAt);
  assert.equal(saved.expiresAt?.getHours(), 23);
  assert.equal(saved.expiresAt?.getMinutes(), 59);
  assert.equal(capturedUpdate.update.status, 'active');
  assert.equal(capturedUpdate.update.value, 'new-token-value');

  prismaAny.orchestratorCredential = originalCredential;
});

test('6) handoff context for agent3 includes agent1/agent2 outputs', async () => {
  const state = createDefaultState();
  state.currentStage = 'stage_summary';
  state.agentOutputs.agent1 = {
    agent: 'agent1',
    status: 'PASS',
    summary: ['agent1 finding'],
    artifacts: ['a1-artifact'],
    loopCount: state.loopCount,
    completedAt: new Date().toISOString(),
  };
  state.agentOutputs.agent2 = {
    agent: 'agent2',
    status: 'PASS',
    summary: ['agent2 finding'],
    artifacts: ['a2-artifact'],
    loopCount: state.loopCount,
    completedAt: new Date().toISOString(),
  };

  const prompt = await buildAgentPrompt({ state, agent: 'agent3' });
  assert.match(prompt, /"expected":\["agent1","agent2"\]/);
  assert.match(prompt, /"missing":\[\]/);
});

test('7) handoff context for agent9 includes completeness metadata and fail-fast on missing', async () => {
  const state = createDefaultState();
  state.currentStage = 'stage_patch_deploy';
  state.agentOutputs.agent6 = {
    agent: 'agent6',
    status: 'PASS',
    summary: ['agent6 design'],
    artifacts: ['a6-artifact'],
    loopCount: state.loopCount,
    completedAt: new Date().toISOString(),
  };

  const prompt = await buildAgentPrompt({ state, agent: 'agent9' });
  assert.match(prompt, /"expected":\["agent6","agent7","agent8"\]/);
  assert.match(prompt, /"missing":\["agent7","agent8"\]/);
  assert.match(prompt, /Fail fast with status FAIL/i);
});

test('8) handoff extends to agent6/7/8 and agent12', async () => {
  const prismaAny = prisma as any;
  const originalCredential = prismaAny.orchestratorCredential;
  prismaAny.orchestratorCredential = {
    findUnique: async () => null,
  };

  const state = createDefaultState();
  state.currentStage = 'stage_fix_design';
  state.agentOutputs.agent3 = {
    agent: 'agent3',
    status: 'PASS',
    summary: ['summary output'],
    artifacts: ['summary-artifact'],
    loopCount: state.loopCount,
    completedAt: new Date().toISOString(),
  };
  state.agentOutputs.agent9 = {
    agent: 'agent9',
    status: 'PASS',
    summary: ['deploy done'],
    artifacts: ['deploy-artifact'],
    loopCount: state.loopCount,
    completedAt: new Date().toISOString(),
  };

  const promptAgent6 = await buildAgentPrompt({ state, agent: 'agent6' });
  assert.match(promptAgent6, /"expected":\["agent3"\]/);
  const promptAgent12 = await buildAgentPrompt({ state, agent: 'agent12' });
  assert.match(promptAgent12, /"expected":\["agent9"\]/);

  prismaAny.orchestratorCredential = originalCredential;
});

test.after(() => {
  delete process.env.EZR_WORKFLOW_STATE_PATH;
});
