import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createDefaultState, saveWorkflowState } from '../stateStore';
import { getNextRunnableAction, handleTelegramWebhookUpdate, submitAgentResult } from '../orchestrationService';
import { determineProposedNext, evaluateState, getMissingAgents, isStageComplete } from '../transitionEngine';
import { WorkflowState } from '../workflowModel';
import { AgentName } from '../types';

const completeAgent = (
  state: WorkflowState,
  agent: AgentName,
  status: 'PASS' | 'FAIL' | 'OK' = 'PASS',
  rawOutput?: unknown
): void => {
  state.agentOutputs[agent] = {
    agent,
    status,
    summary: [`${agent} ${status}`],
    artifacts: [],
    loopCount: state.loopCount,
    completedAt: new Date().toISOString(),
    rawOutput,
  };
  if (!state.completedAgents.includes(agent)) {
    state.completedAgents.push(agent);
  }
};

const withTempState = async (): Promise<{ dir: string; statePath: string }> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ezr-orch-test-'));
  const statePath = path.join(dir, 'state.json');
  process.env.EZR_WORKFLOW_STATE_PATH = statePath;
  return { dir, statePath };
};

test('1) agent1 complete only -> stage not complete', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_public_qa';
  completeAgent(state, 'agent1');
  assert.equal(isStageComplete(state, 'stage_public_qa'), false);
  assert.deepEqual(getMissingAgents(state, 'stage_public_qa'), ['agent2']);
});

test('2) agent1 + agent2 complete -> propose agent3', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_public_qa';
  completeAgent(state, 'agent1');
  completeAgent(state, 'agent2');
  evaluateState(state);
  assert.equal(state.currentStage, 'stage_summary');
  assert.equal(determineProposedNext(state)?.target, 'agent:agent3');
});

test('3) agent3 complete -> propose fix design group', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_summary';
  completeAgent(state, 'agent3');
  evaluateState(state);
  assert.equal(state.currentStage, 'stage_fix_design');
  assert.equal(determineProposedNext(state)?.target, 'group:stage_fix_design');
});

test('4) only agent6 complete -> do not propose agent9', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_fix_design';
  completeAgent(state, 'agent6');
  assert.equal(isStageComplete(state, 'stage_fix_design'), false);
  assert.notEqual(determineProposedNext(state)?.target, 'agent:agent9');
});

test('5) agent6+7+8 complete -> propose agent9', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_fix_design';
  completeAgent(state, 'agent6');
  completeAgent(state, 'agent7');
  completeAgent(state, 'agent8');
  evaluateState(state);
  assert.equal(state.currentStage, 'stage_patch_deploy');
  assert.equal(determineProposedNext(state)?.target, 'agent:agent9');
});

test('6) agent9 without deploy success -> do not propose agent12', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_patch_deploy';
  completeAgent(state, 'agent9');
  state.context.deployStatus = { success: false, stagingReady: true, summary: ['deploy failed'] };
  assert.equal(isStageComplete(state, 'stage_patch_deploy'), false);
  assert.equal(determineProposedNext(state)?.target, 'agent:agent9');
});

test('7) agent9 with deploy success -> propose agent12', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_patch_deploy';
  completeAgent(state, 'agent9');
  state.context.deployStatus = { success: true, stagingReady: true, summary: ['ok'] };
  evaluateState(state);
  assert.equal(state.currentStage, 'stage_validation');
  assert.equal(determineProposedNext(state)?.target, 'agent:agent12');
});

test('8) agent12 PASS -> workflow completed', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_validation';
  completeAgent(state, 'agent12', 'PASS');
  evaluateState(state);
  assert.equal(state.currentStage, 'completed');
  assert.equal(state.status, 'completed');
});

test('9) agent12 FAIL product issue -> propose agent6', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_validation';
  completeAgent(state, 'agent12', 'FAIL', { classification: 'product_logic_issue' });
  evaluateState(state);
  assert.equal(state.currentStage, 'stage_fix_design');
  assert.equal(state.context.flags.fixDesignMode, 'single_agent_recovery');
  assert.equal(determineProposedNext(state)?.target, 'agent:agent6');
});

test('10) agent12 FAIL environment issue -> blocked_manual_intervention', async () => {
  await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_validation';
  completeAgent(state, 'agent12', 'FAIL', { classification: 'environment_credentials' });
  evaluateState(state);
  assert.equal(state.status, 'blocked');
  assert.match(state.lastError || '', /manual intervention/i);
});

test('11) invalid /approve target rejected', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'waiting_approval';
  state.approvalStatus = 'pending';
  state.currentStage = 'stage_patch_deploy';
  state.pendingApproval = {
    target: 'agent:agent9',
    reason: 'Deploy',
    stage: 'stage_patch_deploy',
    requestedAt: new Date().toISOString(),
  };
  state.proposedNext = {
    target: 'agent:agent9',
    reason: 'Deploy',
    stage: 'stage_patch_deploy',
    requiredAgents: ['agent9'],
  };
  await saveWorkflowState(state);

  const originalFetch = global.fetch;
  process.env.EZR_WHATSAPP_TEMPLATE_TOKEN = '';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_APPROVER_CHAT_ID = '123';
  global.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    }) as any) as typeof fetch;

  const result = await handleTelegramWebhookUpdate({
    message: { chat: { id: 123 }, text: '/approve agent:agent12' },
  });
  assert.match(result.response || '', /pending target is agent:agent9/i);

  global.fetch = originalFetch;
  await rm(dir, { recursive: true, force: true });
});

test('12) approval pending prevents execution', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'waiting_approval';
  state.approvalStatus = 'pending';
  state.pendingApproval = {
    target: 'group:stage_public_qa',
    reason: 'Start QA',
    stage: 'stage_public_qa',
    requestedAt: new Date().toISOString(),
  };
  await saveWorkflowState(state);

  const result = await getNextRunnableAction();
  assert.equal(result.action.type, 'idle');
  assert.match(result.action.reason, /waiting for telegram approval/i);
  await rm(dir, { recursive: true, force: true });
});

test('13) duplicate concurrent execution blocked', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.currentStage = 'stage_summary';
  completeAgent(state, 'agent3', 'PASS');
  await saveWorkflowState(state);

  await assert.rejects(
    submitAgentResult({
      agent: 'agent3',
      result: {
        status: 'PASS',
        summary: ['duplicate'],
        artifacts: [],
        rawOutput: null,
      },
    }),
    /duplicate concurrent execution blocked/i
  );
  await rm(dir, { recursive: true, force: true });
});

test.after(() => {
  delete process.env.EZR_WORKFLOW_STATE_PATH;
});
