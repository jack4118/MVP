import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createDefaultState, loadWorkflowState, saveWorkflowState } from '../stateStore';
import {
  getNextRunnableAction,
  heartbeatExecutionLease,
  reportExecutionFailure,
  requestManualRepeatRun,
  submitAgentResult,
} from '../orchestrationService';
import { AgentName } from '../types';

const nowIso = (): string => new Date().toISOString();

const withTempState = async (): Promise<{ dir: string; statePath: string }> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ezr-stability-test-'));
  const statePath = path.join(dir, 'state.json');
  process.env.EZR_WORKFLOW_STATE_PATH = statePath;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_APPROVER_CHAT_ID;
  return { dir, statePath };
};

const leaseFor = (agent: AgentName, startedAt: string, leaseExpiresAt: string, attemptNumber = 1) => ({
  agentName: agent,
  leaseOwner: 'test-worker',
  startedAt,
  heartbeatAt: startedAt,
  leaseExpiresAt,
  attemptNumber,
});

test('1) heartbeat refresh keeps lease alive', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_public_qa';
  state.runningAgents = ['agent1'];
  state.attempts.agent1 = 1;
  const startedAt = nowIso();
  const oldExpiry = new Date(Date.now() + 5_000).toISOString();
  state.leases.agent1 = leaseFor('agent1', startedAt, oldExpiry);
  await saveWorkflowState(state);

  await heartbeatExecutionLease({ agent: 'agent1', leaseOwner: 'test-worker-2' });
  const updated = await loadWorkflowState();
  assert.ok(updated.leases.agent1);
  assert.ok(Date.parse(updated.leases.agent1!.leaseExpiresAt) > Date.parse(oldExpiry));
  assert.equal(updated.leases.agent1!.leaseOwner, 'test-worker-2');
  await rm(dir, { recursive: true, force: true });
});

test('2) missing heartbeat marks stale', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_summary';
  state.runningAgents = ['agent3'];
  state.attempts.agent3 = 1;
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const expiredAt = new Date(Date.now() - 5_000).toISOString();
  state.leases.agent3 = leaseFor('agent3', startedAt, expiredAt);
  await saveWorkflowState(state);

  const result = await getNextRunnableAction();
  assert.equal(result.state.runningAgents.includes('agent3'), false);
  assert.equal(result.state.staleAgents.includes('agent3'), true);
  assert.equal(result.state.lastExecutionFailureReason.agent3, 'lease_expired');
  await rm(dir, { recursive: true, force: true });
});

test('3) timeout marks failed', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_summary';
  state.runningAgents = ['agent3'];
  state.attempts.agent3 = 1;
  const startedAt = new Date(Date.now() - 8 * 60_000).toISOString();
  const futureExpiry = new Date(Date.now() + 60_000).toISOString();
  state.leases.agent3 = leaseFor('agent3', startedAt, futureExpiry);
  await saveWorkflowState(state);

  const result = await getNextRunnableAction();
  assert.equal(result.state.lastExecutionFailureReason.agent3, 'execution_timeout');
  assert.equal(result.state.failedAgents.includes('agent3'), true);
  await rm(dir, { recursive: true, force: true });
});

test('4) auto-retry eligible agent retries once', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_public_qa';
  state.runningAgents = ['agent1'];
  state.attempts.agent1 = 1;
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const expiredAt = new Date(Date.now() - 5_000).toISOString();
  state.leases.agent1 = leaseFor('agent1', startedAt, expiredAt, 1);
  await saveWorkflowState(state);

  const result = await getNextRunnableAction();
  assert.equal(result.action.type, 'run_agent');
  assert.deepEqual(result.action.agents, ['agent1']);
  assert.equal(result.state.attempts.agent1, 2);
  await rm(dir, { recursive: true, force: true });
});

test('5) non-retryable agent requires manual repeat-run', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_summary';
  state.runningAgents = ['agent3'];
  state.attempts.agent3 = 1;
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const expiredAt = new Date(Date.now() - 5_000).toISOString();
  state.leases.agent3 = leaseFor('agent3', startedAt, expiredAt, 1);
  await saveWorkflowState(state);

  const blocked = await getNextRunnableAction();
  assert.equal(blocked.state.status, 'blocked');
  assert.equal(blocked.state.retryableAgents.includes('agent3'), false);

  await requestManualRepeatRun({ agent: 'agent3', requestedBy: 'test' });
  const rerun = await getNextRunnableAction();
  assert.equal(rerun.action.type, 'run_agent');
  assert.deepEqual(rerun.action.agents, ['agent3']);
  await rm(dir, { recursive: true, force: true });
});

test('6) retry exhausted blocks workflow', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_public_qa';
  state.runningAgents = ['agent1'];
  state.attempts.agent1 = 2;
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const expiredAt = new Date(Date.now() - 5_000).toISOString();
  state.leases.agent1 = leaseFor('agent1', startedAt, expiredAt, 2);
  await saveWorkflowState(state);

  const result = await getNextRunnableAction();
  assert.equal(result.state.status, 'blocked');
  assert.equal(result.state.lastExecutionFailureReason.agent1, 'retry_exhausted');
  assert.equal(result.state.retryableAgents.includes('agent1'), false);
  await rm(dir, { recursive: true, force: true });
});

test('7) lease released on success', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_summary';
  state.runningAgents = ['agent3'];
  state.attempts.agent3 = 1;
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const expiry = new Date(Date.now() + 60_000).toISOString();
  state.leases.agent3 = leaseFor('agent3', startedAt, expiry, 1);
  await saveWorkflowState(state);

  await submitAgentResult({
    agent: 'agent3',
    result: { status: 'PASS', summary: ['ok'], artifacts: [], rawOutput: null },
  });

  const updated = await loadWorkflowState();
  assert.equal(updated.leases.agent3, undefined);
  assert.equal(updated.runningAgents.includes('agent3'), false);
  await rm(dir, { recursive: true, force: true });
});

test('8) lease released on failure', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_public_qa';
  state.runningAgents = ['agent1'];
  state.attempts.agent1 = 1;
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const expiry = new Date(Date.now() + 60_000).toISOString();
  state.leases.agent1 = leaseFor('agent1', startedAt, expiry, 1);
  await saveWorkflowState(state);

  await reportExecutionFailure({ agent: 'agent1', reason: 'worker_interrupted', detail: 'simulated stop' });
  const updated = await loadWorkflowState();
  assert.equal(updated.leases.agent1, undefined);
  assert.equal(updated.runningAgents.includes('agent1'), false);
  await rm(dir, { recursive: true, force: true });
});

test('9) stale running agent does not block workflow forever', async () => {
  const { dir } = await withTempState();
  const state = createDefaultState();
  state.status = 'running';
  state.currentStage = 'stage_summary';
  state.runningAgents = ['agent3'];
  state.attempts.agent3 = 1;
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const expiredAt = new Date(Date.now() - 5_000).toISOString();
  state.leases.agent3 = leaseFor('agent3', startedAt, expiredAt, 1);
  await saveWorkflowState(state);

  await getNextRunnableAction();
  await requestManualRepeatRun({ agent: 'agent3', requestedBy: 'test' });
  const rerun = await getNextRunnableAction();
  assert.equal(rerun.action.type, 'run_agent');
  assert.deepEqual(rerun.action.agents, ['agent3']);
  await rm(dir, { recursive: true, force: true });
});

test.after(() => {
  delete process.env.EZR_WORKFLOW_STATE_PATH;
});
