import { getAgentDefinition, listAgentDefinitions, normalizeAgentName } from './agentRegistry';
import { isAgentLegalForStage } from './agentPolicyRegistry';
import { approvePendingTarget, cancelWorkflow, rejectPendingTarget, setPendingApproval } from './approvalGate';
import { buildRunContext } from './context';
import {
  bootstrapTemplateTokenFromEnv,
  cancelPendingTemplateTokenUpdate,
  confirmPendingTemplateTokenUpdate,
  getTemplateTokenStatus,
  notifyExpiringTemplateTokenIfNeeded,
  parseWaTokenSetCommand,
  setPendingTemplateTokenUpdate,
} from './credentialService';
import { createDefaultState, loadWorkflowState, saveWorkflowState } from './stateStore';
import { formatCompactApprovalCard, formatCompactStatusCard } from './statusFormatter';
import {
  answerTelegramCallbackQuery,
  extractTelegramUpdate,
  sendTelegramMessage,
  TelegramReplyMarkup,
} from './telegramClient';
import {
  consumeTelegramCallbackRecord,
  createTelegramCallbackData,
  loadTelegramCallbackRecord,
  TelegramCallbackAction,
} from './telegramCallbackRegistry';
import {
  getAgentMaxRuntimeMinutes,
  getAgentMaxRuntimeMs,
  getLeaseTtlMs,
  getMaxAttempts,
  isAutoRetryAllowed,
  isManualRepeatOnlyAgent,
} from './executionPolicy';
import {
  canExecuteApprovedTarget,
  canProposeNextStage,
  determineProposedNext,
  evaluateState,
  runnableActionForTarget,
  updateLegacyProjection,
} from './transitionEngine';
import { AgentExecutionResult, AgentName } from './types';
import { ApprovalTarget, ExecutionFailureReason, RunnableAction, WorkflowState } from './workflowModel';

const APPROVE_PREFIX = '/approve';
const START_RUN_PREFIX = '/start-run';
const WA_TOKEN_SET_PREFIX = '/wa_token set';
const REPEAT_RUN_PREFIX = '/repeat-run';

const toIsoNow = (): string => new Date().toISOString();

const EXECUTION_AGENT_ORDER: AgentName[] = ['agent1', 'agent2', 'agent3', 'agent5', 'agent6', 'agent7', 'agent8', 'agent9', 'agent12'];

const ensureOrchestrator = (actorAgent: string): void => {
  if (actorAgent.trim().toLowerCase() !== 'agent0') {
    throw new Error('Only Agent 0 can mutate orchestration state');
  }
};

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const sanitizeSummary = (items: string[]): string[] =>
  (items || [])
    .map((line) => cleanText(String(line || '')))
    .filter(Boolean)
    .slice(0, 10);

const parseIsoMs = (value: string | undefined | null): number => {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseRepeatRunAgent = (command: string): AgentName | null => {
  const parts = command.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }
  const parsed = normalizeAgentName(parts[1]);
  if (!parsed || parsed === 'agent0') {
    return null;
  }
  return parsed;
};

const parseStartRunIssue = (command: string): string | null => {
  const trimmed = command.trim();
  if (!trimmed.toLowerCase().startsWith(START_RUN_PREFIX)) {
    return null;
  }
  const issue = trimmed.slice(START_RUN_PREFIX.length).trim();
  return issue.length > 0 ? issue : null;
};

const hasActiveRun = (state: WorkflowState): boolean => {
  return state.status === 'running' || state.status === 'waiting_approval' || state.status === 'blocked';
};

const buildApprovalReplyMarkup = (state: WorkflowState): TelegramReplyMarkup | undefined => {
  const pending = state.pendingApproval;
  if (!pending || state.approvalStatus !== 'pending') {
    return undefined;
  }

  return {
    inline_keyboard: [
      [
        {
          text: 'Approve',
          callback_data: createTelegramCallbackData({
            action: 'approve',
            issueId: state.issueId,
            stage: state.currentStage,
            status: state.status,
            target: pending.target,
            approvalId: pending.approvalId,
            messageId: state.approvalMessageId,
          }),
        },
        {
          text: 'Reject',
          callback_data: createTelegramCallbackData({
            action: 'reject',
            issueId: state.issueId,
            stage: state.currentStage,
            status: state.status,
            target: pending.target,
            approvalId: pending.approvalId,
            messageId: state.approvalMessageId,
          }),
        },
      ],
      [
        {
          text: 'Status',
          callback_data: createTelegramCallbackData({
            action: 'status',
            issueId: state.issueId,
            stage: state.currentStage,
            status: state.status,
            target: pending.target,
            approvalId: pending.approvalId,
            messageId: state.approvalMessageId,
          }),
        },
      ],
    ],
  };
};

const buildStatusReplyMarkup = (state: WorkflowState): TelegramReplyMarkup => {
  return {
    inline_keyboard: [
      [
        {
          text: 'Status',
          callback_data: createTelegramCallbackData({
            action: 'status',
            issueId: state.issueId,
            stage: state.currentStage,
            status: state.status,
            target: state.pendingApproval?.target || null,
            approvalId: state.pendingApproval?.approvalId || null,
            messageId: null,
          }),
        },
      ],
    ],
  };
};

const sendApprovalCard = async (state: WorkflowState): Promise<{ ok: boolean; messageId: number | null; error?: string }> => {
  const message = formatCompactApprovalCard(state);
  return await sendTelegramMessage(message, {
    replyMarkup: buildApprovalReplyMarkup(state),
  });
};

const sendStatusCard = async (state: WorkflowState): Promise<{ ok: boolean; messageId: number | null; error?: string }> => {
  return await sendTelegramMessage(formatCompactStatusCard(state), {
    replyMarkup: buildStatusReplyMarkup(state),
  });
};

const buildExecutionIssueMessage = (
  agent: AgentName,
  issue: 'timeout' | 'stale' | 'interrupted',
  attempts: number,
  maxAttempts: number
): string => {
  return [
    'EzReply Execution Issue',
    '',
    'Agent:',
    agent,
    '',
    'Issue:',
    issue,
    '',
    'Attempts:',
    `${attempts}/${maxAttempts}`,
    '',
    'Next:',
    `- /repeat-run ${agent}`,
    '- /status',
    '- /cancel',
  ].join('\n');
};

const maybeSendExecutionIssueAlert = async (
  agent: AgentName,
  reason: ExecutionFailureReason,
  attempts: number,
  maxAttempts: number
): Promise<void> => {
  const issue: 'timeout' | 'stale' | 'interrupted' =
    reason === 'execution_timeout' ? 'timeout' : reason === 'lease_expired' ? 'stale' : 'interrupted';
  await sendTelegramMessage(buildExecutionIssueMessage(agent, issue, attempts, maxAttempts));
};

const maybeSendAutoRetryInfoAlert = async (agent: AgentName, attempts: number, maxAttempts: number): Promise<void> => {
  await sendTelegramMessage(
    [
      'EzReply Auto-Retry',
      '',
      `Agent: ${agent}`,
      `Attempts: ${attempts}/${maxAttempts}`,
      'Action: automatic retry queued.',
      '',
      'Use /status for details.',
    ].join('\n')
  );
};

const parseAgent = (value: string, field: string): AgentName => {
  const agent = normalizeAgentName(value);
  if (!agent || agent === 'agent0') {
    throw new Error(`Invalid ${field}. Expected one of: ${EXECUTION_AGENT_ORDER.join(', ')}`);
  }
  return agent;
};

const parseApprovalTarget = (value: string): ApprovalTarget | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('agent:') || normalized.startsWith('group:')) {
    return normalized as ApprovalTarget;
  }
  if (normalized === 'stage_public_qa' || normalized === 'group:stage_public_qa') {
    return 'group:stage_public_qa';
  }
  if (normalized === 'stage_fix_design' || normalized === 'group:stage_fix_design') {
    return 'group:stage_fix_design';
  }
  const asAgent = normalizeAgentName(normalized);
  if (asAgent && asAgent !== 'agent0') {
    return `agent:${asAgent}` as ApprovalTarget;
  }
  return null;
};

const getApproveTarget = (text: string): string | null => {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }
  return parts[1];
};

const removeLease = (state: WorkflowState, agent: AgentName): void => {
  delete state.leases[agent];
};

const markExecutionLifecycle = (
  state: WorkflowState,
  agent: AgentName,
  params: {
    state: 'waiting_approval' | 'approved' | 'claimed' | 'running' | 'completed' | 'failed' | 'blocked';
    workerId?: string | null;
    target?: ApprovalTarget | null;
    approvalId?: string | null;
    detail?: string | null;
  }
): void => {
  const previous = state.executionLifecycle[agent];
  const now = toIsoNow();
  state.executionLifecycle[agent] = {
    state: params.state,
    workerId: params.workerId === undefined ? previous?.workerId || null : params.workerId,
    target: params.target === undefined ? previous?.target || null : params.target,
    approvalId: params.approvalId === undefined ? previous?.approvalId || null : params.approvalId,
    claimedAt:
      params.state === 'claimed'
        ? now
        : previous?.claimedAt || null,
    startedAt:
      params.state === 'running'
        ? now
        : previous?.startedAt || null,
    completedAt:
      params.state === 'completed'
        ? now
        : previous?.completedAt || null,
    failedAt:
      params.state === 'failed' || params.state === 'blocked'
        ? now
        : previous?.failedAt || null,
    detail: params.detail === undefined ? previous?.detail || null : params.detail,
  };
};

const claimLeaseForAgent = (state: WorkflowState, agent: AgentName, leaseOwner: string): void => {
  const now = Date.now();
  const attemptNumber = (state.attempts[agent] || 0) || 1;
  const nowIso = new Date(now).toISOString();
  state.leases[agent] = {
    agentName: agent,
    leaseOwner: cleanText(leaseOwner || 'unknown'),
    startedAt: nowIso,
    heartbeatAt: nowIso,
    leaseExpiresAt: new Date(now + getLeaseTtlMs()).toISOString(),
    attemptNumber,
  };
};

const heartbeatLeaseForAgent = (state: WorkflowState, agent: AgentName, leaseOwner?: string): void => {
  const lease = state.leases[agent];
  if (!lease) {
    throw new Error(`No active lease for ${agent}`);
  }
  if (leaseOwner && lease.leaseOwner !== cleanText(leaseOwner)) {
    throw new Error(`Lease owner mismatch for ${agent}. Current owner is ${lease.leaseOwner}.`);
  }
  const now = Date.now();
  lease.heartbeatAt = new Date(now).toISOString();
  lease.leaseExpiresAt = new Date(now + getLeaseTtlMs()).toISOString();
};

const prepareRunningLease = (state: WorkflowState, agent: AgentName): void => {
  state.attempts[agent] = (state.attempts[agent] || 0) + 1;
  claimLeaseForAgent(state, agent, 'pending_claim');
  state.retryableAgents = state.retryableAgents.filter((item) => item !== agent);
  state.staleAgents = state.staleAgents.filter((item) => item !== agent);
  state.failedAgents = state.failedAgents.filter((item) => item !== agent);
  markExecutionLifecycle(state, agent, {
    state: 'running',
    workerId: null,
    detail: 'lease prepared',
  });
  if (state.status === 'blocked') {
    state.status = 'running';
    state.lastError = null;
  }
};

const markRetryExhausted = (state: WorkflowState, agent: AgentName, attempts: number, maxAttempts: number): void => {
  state.lastExecutionFailureReason[agent] = 'retry_exhausted';
  state.failedAgents = unique([...state.failedAgents, agent]);
  state.blockedAgents = unique([...state.blockedAgents, agent]);
  state.retryableAgents = state.retryableAgents.filter((item) => item !== agent);
  state.status = 'blocked';
  state.lastError = `${agent} retry exhausted (${attempts}/${maxAttempts}). Manual intervention required.`;
  markExecutionLifecycle(state, agent, {
    state: 'failed',
    detail: state.lastError,
  });
};

const handleExecutionFailureState = async (
  state: WorkflowState,
  agent: AgentName,
  reason: ExecutionFailureReason,
  detail?: string
): Promise<void> => {
  const maxAttempts = getMaxAttempts();
  const attempts = state.attempts[agent] || 0;
  state.runningAgents = state.runningAgents.filter((item) => item !== agent);
  state.currentRunningAgent = state.runningAgents[0] || null;
  removeLease(state, agent);
  markExecutionLifecycle(state, agent, {
    state: 'failed',
    detail: detail || reason,
  });
  state.lastExecutionFailureReason[agent] = reason;
  state.context.reports[agent] = sanitizeSummary([detail || reason, `attempt ${attempts}/${maxAttempts}`]);

  if (reason === 'lease_expired') {
    state.staleAgents = unique([...state.staleAgents, agent]);
  }

  if (!isAutoRetryAllowed(agent)) {
    state.retryableAgents = state.retryableAgents.filter((item) => item !== agent);
    if (attempts >= maxAttempts) {
      markRetryExhausted(state, agent, attempts, maxAttempts);
    } else {
      state.failedAgents = unique([...state.failedAgents, agent]);
      state.blockedAgents = unique([...state.blockedAgents, agent]);
      state.status = 'blocked';
      state.lastError = `${agent} failed with ${reason}. Use /repeat-run ${agent} (${attempts}/${maxAttempts}).`;
    }
    await maybeSendExecutionIssueAlert(agent, reason, attempts, maxAttempts);
    return;
  }

  if (attempts < maxAttempts) {
    state.retryableAgents = unique([...state.retryableAgents, agent]);
    state.failedAgents = unique([...state.failedAgents, agent]);
    state.blockedAgents = state.blockedAgents.filter((item) => item !== agent);
    state.status = state.status === 'blocked' ? 'running' : state.status;
    await maybeSendExecutionIssueAlert(agent, reason, attempts, maxAttempts);
    await maybeSendAutoRetryInfoAlert(agent, attempts + 1, maxAttempts);
    return;
  }

  markRetryExhausted(state, agent, attempts, maxAttempts);
  await maybeSendExecutionIssueAlert(agent, reason, attempts, maxAttempts);
};

const maybeHandleExpiredRunningExecutions = async (state: WorkflowState): Promise<void> => {
  if (state.runningAgents.length === 0) {
    return;
  }

  const now = Date.now();
  const running = [...state.runningAgents];
  for (const agent of running) {
    const lease = state.leases[agent];
    if (!lease) {
      await handleExecutionFailureState(state, agent, 'lease_expired', 'missing execution lease');
      continue;
    }

    const startedAtMs = parseIsoMs(lease.startedAt);
    const leaseExpiresAtMs = parseIsoMs(lease.leaseExpiresAt);
    if (startedAtMs > 0 && now - startedAtMs > getAgentMaxRuntimeMs(agent)) {
      await handleExecutionFailureState(state, agent, 'execution_timeout', 'agent execution exceeded max runtime');
      continue;
    }

    if (leaseExpiresAtMs > 0 && now > leaseExpiresAtMs) {
      await handleExecutionFailureState(state, agent, 'lease_expired', 'heartbeat lease expired');
    }
  }
};

const extractDeployStatus = (result: Pick<AgentExecutionResult, 'status' | 'summary' | 'rawOutput'>): {
  success: boolean;
  stagingReady: boolean;
  summary: string[];
} => {
  let success = result.status === 'PASS';
  let stagingReady = result.status === 'PASS';
  let summary = sanitizeSummary(result.summary || []);

  if (result.rawOutput && typeof result.rawOutput === 'object') {
    const raw = result.rawOutput as Record<string, unknown>;
    if (raw.contractVerification && typeof raw.contractVerification === 'object') {
      const contractVerification = raw.contractVerification as {
        success?: boolean;
        stagingReady?: boolean;
        summary?: string[];
      };
      if (typeof contractVerification.success === 'boolean') {
        success = contractVerification.success;
      }
      if (typeof contractVerification.stagingReady === 'boolean') {
        stagingReady = contractVerification.stagingReady;
      }
      if (Array.isArray(contractVerification.summary)) {
        summary = sanitizeSummary(contractVerification.summary);
      }
    }
    if (typeof raw.deploySuccess === 'boolean') {
      success = raw.deploySuccess;
    }
    if (typeof raw.stagingReady === 'boolean') {
      stagingReady = raw.stagingReady;
    }
  }

  const joined = (result.summary || []).join(' ').toLowerCase();
  if (joined.includes('deploy failed')) {
    success = false;
  }
  if (joined.includes('staging not ready')) {
    stagingReady = false;
  }

  return { success, stagingReady, summary };
};

const ensureNoPendingApprovalExecution = (state: WorkflowState): void => {
  if (state.approvalStatus === 'pending' && state.pendingApproval) {
    throw new Error('Execution blocked while approval is pending.');
  }
};

const syncAndSave = async (state: WorkflowState): Promise<WorkflowState> => {
  updateLegacyProjection(state);
  await saveWorkflowState(state);
  return state;
};

const proposeNextAndNotifyIfNeeded = async (state: WorkflowState): Promise<void> => {
  evaluateState(state);
  if (!canProposeNextStage(state)) {
    return;
  }

  const next = determineProposedNext(state);
  if (!next) {
    return;
  }

  setPendingApproval(state, {
    target: next.target,
    reason: next.reason,
  });
  next.requiredAgents.forEach((agent) =>
    markExecutionLifecycle(state, agent, {
      state: 'waiting_approval',
      workerId: null,
      target: next.target,
      approvalId: state.pendingApproval?.approvalId || null,
      detail: `awaiting telegram approval for ${next.target}`,
    })
  );
  state.proposedNext = next;

  const sendResult = await sendApprovalCard(state);
  if (!sendResult.ok) {
    state.status = 'blocked';
    state.lastError = sendResult.error || 'Telegram send failed';
    state.timestamps.lastWebhookFailureAt = toIsoNow();
    state.blockedAgents = unique([...state.blockedAgents, ...next.requiredAgents]);
    return;
  }

  state.approvalMessageId = sendResult.messageId;
  state.lastTelegramMessageId = sendResult.messageId;
};

const submitAgentResultInternal = async (
  state: WorkflowState,
  params: {
    agent: AgentName;
    result: Pick<AgentExecutionResult, 'status' | 'summary' | 'artifacts' | 'rawOutput'>;
  }
): Promise<void> => {
  ensureNoPendingApprovalExecution(state);
  const rawSource =
    params.result.rawOutput && typeof params.result.rawOutput === 'object'
      ? (params.result.rawOutput as Record<string, unknown>).source
      : null;
  const isLegacyBypass = rawSource === 'legacy_proposal_endpoint';

  if (!isAgentLegalForStage(params.agent, state.currentStage)) {
    throw new Error(`${params.agent} cannot run in current stage ${state.currentStage}`);
  }

  if (!isLegacyBypass && !state.runningAgents.includes(params.agent) && !state.leases[params.agent]) {
    throw new Error(`${params.agent} has not been claimed by a worker and cannot submit results.`);
  }

  if (!state.runningAgents.includes(params.agent)) {
    const existing = state.agentOutputs[params.agent];
    if (existing && existing.loopCount === state.loopCount) {
      throw new Error(`Duplicate concurrent execution blocked for ${params.agent}`);
    }
  }

  const normalized: AgentExecutionResult = {
    agent: params.agent,
    status: params.result.status,
    summary: sanitizeSummary(params.result.summary || []),
    artifacts: params.result.artifacts || [],
    rawOutput: params.result.rawOutput,
    loopCount: state.loopCount,
    completedAt: toIsoNow(),
  };

  state.agentOutputs[params.agent] = normalized;
  state.runningAgents = state.runningAgents.filter((agent) => agent !== params.agent);
  state.currentRunningAgent = state.runningAgents[0] || null;
  removeLease(state, params.agent);
  state.retryableAgents = state.retryableAgents.filter((agent) => agent !== params.agent);
  state.staleAgents = state.staleAgents.filter((agent) => agent !== params.agent);
  state.blockedAgents = state.blockedAgents.filter((agent) => agent !== params.agent);
  state.lastCompletedAgent = params.agent;
  state.completedAgents = unique([...state.completedAgents, params.agent]);
  state.pendingAgents = EXECUTION_AGENT_ORDER.filter((agent) => !state.completedAgents.includes(agent));
  state.context.reports[params.agent] = normalized.summary;

  if (normalized.status === 'FAIL') {
    state.failedAgents = unique([...state.failedAgents, params.agent]);
  }

  if (params.agent === 'agent9') {
    state.context.deployStatus = extractDeployStatus(params.result);
  }

  if (params.agent === 'agent12') {
    state.context.validationResult = {
      status: normalized.status,
      summary: normalized.summary,
    };
  }

  state.status = 'running';
  await proposeNextAndNotifyIfNeeded(state);
};

export const initializeOrchestrator = async (): Promise<void> => {
  await bootstrapTemplateTokenFromEnv();
};

export const getWorkflowStatus = async (): Promise<WorkflowState> => {
  const state = await loadWorkflowState();
  await maybeHandleExpiredRunningExecutions(state);
  evaluateState(state);
  await syncAndSave(state);
  return state;
};

export const resetWorkflow = async (params: {
  actorAgent: string;
  issue: string;
  loopStage?: string;
  pendingAgents?: string[];
}): Promise<WorkflowState> => {
  ensureOrchestrator(params.actorAgent);

  const state = createDefaultState();
  state.issueId = cleanText(params.issue);
  state.currentIssue = state.issueId;
  state.status = 'running';
  state.currentStage = 'stage_public_qa';
  state.currentLoopStage = 'stage_public_qa';
  state.loopCount = 1;
  state.pendingAgents = EXECUTION_AGENT_ORDER;
  state.context.flags.fixDesignMode = 'parallel';
  state.context.flags.recoveryAgent = null;
  state.lastError = null;

  await proposeNextAndNotifyIfNeeded(state);
  await syncAndSave(state);
  return state;
};

export const startAutoRun = async (params: {
  actorAgent: string;
  issue: string;
  checkpointPolicy?: 'critical_only' | 'all_steps';
}): Promise<WorkflowState> => {
  return resetWorkflow({
    actorAgent: params.actorAgent,
    issue: params.issue,
  });
};

export const stopAutoRun = async (params: { actorAgent: string }): Promise<WorkflowState> => {
  ensureOrchestrator(params.actorAgent);
  const state = await loadWorkflowState();
  state.status = 'cancelled';
  state.approvalStatus = 'idle';
  state.pendingApproval = null;
  state.proposedNext = null;
  state.runningAgents = [];
  state.currentRunningAgent = null;
  state.retryableAgents = [];
  state.leases = {};
  await syncAndSave(state);
  return state;
};

export const getNextRunnableAction = async (): Promise<{ state: WorkflowState; action: RunnableAction }> => {
  const state = await loadWorkflowState();
  await maybeHandleExpiredRunningExecutions(state);
  evaluateState(state);

  if (state.status === 'completed' || state.status === 'cancelled' || state.status === 'blocked') {
    await syncAndSave(state);
    return { state, action: { type: 'idle', agents: [], reason: `workflow ${state.status}` } };
  }

  if (state.runningAgents.length > 0) {
    await syncAndSave(state);
    return { state, action: { type: 'idle', agents: [], reason: 'agent currently running' } };
  }

  if (state.approvalStatus === 'pending') {
    await syncAndSave(state);
    return { state, action: { type: 'idle', agents: [], reason: 'waiting for telegram approval' } };
  }

  const approvedAgentsAwaitingClaim = EXECUTION_AGENT_ORDER.filter(
    (agent) => state.executionLifecycle[agent]?.state === 'approved'
  );
  if (approvedAgentsAwaitingClaim.length > 0 && state.runningAgents.length === 0) {
    const action: RunnableAction =
      approvedAgentsAwaitingClaim.length === 1
        ? { type: 'run_agent', agents: approvedAgentsAwaitingClaim, reason: 'approved execution awaiting local worker claim' }
        : { type: 'run_parallel', agents: approvedAgentsAwaitingClaim, reason: 'approved parallel execution awaiting local worker claim' };
    await syncAndSave(state);
    return { state, action };
  }

  if (state.retryableAgents.length > 0) {
    const agent = state.retryableAgents[0];
    if (state.currentStage !== 'completed' && isAgentLegalForStage(agent, state.currentStage)) {
      markExecutionLifecycle(state, agent, {
        state: 'approved',
        workerId: null,
        target: `agent:${agent}` as ApprovalTarget,
        approvalId: null,
        detail: `${agent} auto-retry approved`,
      });
      await syncAndSave(state);
      return { state, action: { type: 'run_agent', agents: [agent], reason: `${agent} auto-retry` } };
    }
    state.retryableAgents = state.retryableAgents.filter((item) => item !== agent);
  }

  if (state.approvalStatus === 'approved' && state.pendingApproval) {
    const target = state.pendingApproval.target;
    if (!canExecuteApprovedTarget(state, target)) {
      await syncAndSave(state);
      return { state, action: { type: 'idle', agents: [], reason: 'approved target is no longer executable' } };
    }

    const action = runnableActionForTarget(state, target);
    if (action.type === 'idle') {
      state.approvalStatus = 'idle';
      state.pendingApproval = null;
      state.proposedNext = null;
      await proposeNextAndNotifyIfNeeded(state);
      await syncAndSave(state);
      return { state, action };
    }

    action.agents.forEach((agent) =>
      markExecutionLifecycle(state, agent, {
        state: 'approved',
        workerId: null,
        target,
        approvalId: state.pendingApproval?.approvalId || null,
        detail: `approved target ${target}`,
      })
    );
    state.approvalStatus = 'idle';
    state.pendingApproval = null;
    state.proposedNext = null;
    state.status = 'running';
    await syncAndSave(state);
    return { state, action };
  }

  await proposeNextAndNotifyIfNeeded(state);
  await syncAndSave(state);
  return { state, action: { type: 'idle', agents: [], reason: 'no approved execution target' } };
};

export const buildAgentPrompt = async (params: { state: WorkflowState; agent: AgentName }): Promise<string> => {
  const definition = getAgentDefinition(params.agent);
  const runContext = await buildRunContext(params.agent);

  const base = [
    `You are ${definition.displayName} (${params.agent}).`,
    `Role: ${definition.role}`,
    `Current Issue: ${params.state.issueId || 'not provided'}`,
    `Current Stage: ${params.state.currentStage}`,
    `Allowed Actions: ${definition.allowedActions.join('; ')}`,
    `Forbidden Actions: ${definition.forbiddenActions.join('; ')}`,
    `Required Inputs: ${definition.requiredInputs.join('; ')}`,
    `Expected Outputs: ${definition.expectedOutputs.join('; ')}`,
    `Max Runtime Minutes: ${getAgentMaxRuntimeMinutes(params.agent)}`,
    `Staging URL: ${runContext.stagingUrl || 'n/a'}`,
    `Constraints: ${runContext.constraints.join(' | ')}`,
    'Output JSON only with fields: status (PASS|FAIL|OK), summary (string[]), artifacts (string[]), classification (optional).',
  ];

  if (params.agent === 'agent9') {
    base.push('Agent9 contract fields are mandatory and must be in the JSON root exactly:');
    base.push('AGENT_STATUS, PATCH_STATUS, BUILD_STATUS, GIT_BEFORE_SHA, GIT_AFTER_SHA, PUSH_STATUS, DEPLOY_FRONTEND_STATUS, DEPLOY_BACKEND_STATUS, LIVE_VERIFY_STATUS, STAGING_READY, NEXT_AGENT_ALLOWED');
    base.push('Allowed values:');
    base.push('- AGENT_STATUS: SUCCESS|FAIL');
    base.push('- PATCH_STATUS: YES|NO');
    base.push('- BUILD_STATUS: SUCCESS|FAIL');
    base.push('- PUSH_STATUS/DEPLOY_FRONTEND_STATUS/DEPLOY_BACKEND_STATUS: SUCCESS|FAIL|NOT_REQUIRED');
    base.push('- LIVE_VERIFY_STATUS: SUCCESS|FAIL');
    base.push('- STAGING_READY/NEXT_AGENT_ALLOWED: YES|NO');
    base.push('Do not omit any contract field.');
    base.push('Agent9 execution rules (strict):');
    base.push('- Run `git rev-parse HEAD` before making changes and set that exact value in GIT_BEFORE_SHA.');
    base.push('- After patch/build/deploy flow completes, run `git rev-parse HEAD` again and set exact value in GIT_AFTER_SHA.');
    base.push('- If PATCH_STATUS=YES then PUSH_STATUS must be SUCCESS after a real push.');
    base.push('- If PATCH_STATUS=NO then PUSH_STATUS can be NOT_REQUIRED.');
    base.push('- DEPLOY_FRONTEND_STATUS/DEPLOY_BACKEND_STATUS must reflect real deployment commands/triggers, not intent.');
    base.push('- LIVE_VERIFY_STATUS=SUCCESS only if real URLs respond OK after deploy.');
    base.push('- If any hard check fails, set AGENT_STATUS=FAIL, STAGING_READY=NO, NEXT_AGENT_ALLOWED=NO.');
  }

  return base.join('\n');
};

export const submitAgentResult = async (params: {
  agent: AgentName;
  leaseOwner?: string;
  result: Pick<AgentExecutionResult, 'status' | 'summary' | 'artifacts' | 'rawOutput'>;
}): Promise<WorkflowState> => {
  const state = await loadWorkflowState();
  const lease = state.leases[params.agent];
  if (lease && params.leaseOwner && lease.leaseOwner !== cleanText(params.leaseOwner)) {
    throw new Error(`Lease owner mismatch for ${params.agent}. Current owner is ${lease.leaseOwner}.`);
  }
  await submitAgentResultInternal(state, params);
  markExecutionLifecycle(state, params.agent, {
    state: params.result.status === 'FAIL' ? 'failed' : 'completed',
    workerId: lease?.leaseOwner || params.leaseOwner || null,
    detail: sanitizeSummary(params.result.summary || []).join(' | ') || null,
  });
  if (params.agent === 'agent9') {
    const deploy = state.context.deployStatus;
    if (deploy?.success && deploy?.stagingReady) {
      await sendTelegramMessage(
        [
          'Agent9 completed',
          `Patch: ${state.context.deployStatus?.summary.join(' ').toLowerCase().includes('patch') ? 'yes' : 'unknown'}`,
          `Build: ${params.result.status === 'PASS' ? 'success' : 'fail'}`,
          `Push: ${deploy.summary.join(' ').toLowerCase().includes('push') ? 'success' : 'unknown'}`,
          'Backend deploy: success',
          'Frontend deploy: success',
          'Live verify: success',
          `Staging ready: ${deploy.stagingReady ? 'yes' : 'no'}`,
        ].join('\n')
      );
    } else {
      await sendTelegramMessage(
        [
          'Agent9 failed',
          `Reason: ${(deploy?.summary || sanitizeSummary(params.result.summary || [])).join(' | ') || 'unknown failure'}`,
        ].join('\n')
      );
    }
  }
  await syncAndSave(state);
  return state;
};

export const claimExecutionLease = async (params: { agent: AgentName; leaseOwner: string }): Promise<WorkflowState> => {
  const state = await loadWorkflowState();
  await maybeHandleExpiredRunningExecutions(state);
  if (!isAgentLegalForStage(params.agent, state.currentStage)) {
    throw new Error(`${params.agent} is not legal for current stage ${state.currentStage}`);
  }
  const owner = cleanText(params.leaseOwner);
  const existingLease = state.leases[params.agent];
  if (existingLease && existingLease.leaseOwner !== owner) {
    throw new Error(`${params.agent} is already claimed by ${existingLease.leaseOwner}`);
  }

  let lifecycle = state.executionLifecycle[params.agent];
  if ((!lifecycle || lifecycle.state !== 'approved') && state.runningAgents.includes(params.agent) && !state.leases[params.agent]) {
    markExecutionLifecycle(state, params.agent, {
      state: 'approved',
      workerId: null,
      target: null,
      approvalId: null,
      detail: 'legacy running state bridged to approved claim',
    });
    lifecycle = state.executionLifecycle[params.agent];
  }

  if (!lifecycle || lifecycle.state !== 'approved') {
    throw new Error(`${params.agent} is not approved for claim`);
  }

  if (!state.runningAgents.includes(params.agent)) {
    state.runningAgents = unique([...state.runningAgents, params.agent]);
    state.currentRunningAgent = state.runningAgents[0] || null;
    state.status = 'running';
  }

  if (!state.leases[params.agent]) {
    state.attempts[params.agent] = (state.attempts[params.agent] || 0) + 1;
    markExecutionLifecycle(state, params.agent, {
      state: 'claimed',
      workerId: owner,
      detail: 'claimed by local worker',
    });
  }
  claimLeaseForAgent(state, params.agent, owner);
  markExecutionLifecycle(state, params.agent, {
    state: 'running',
    workerId: owner,
    detail: 'running on local worker',
  });

  if (params.agent === 'agent9') {
    await sendTelegramMessage(`Agent9 claimed by local worker ${owner}`);
  }
  await syncAndSave(state);
  return state;
};

export const heartbeatExecutionLease = async (params: { agent: AgentName; leaseOwner?: string }): Promise<WorkflowState> => {
  const state = await loadWorkflowState();
  if (!state.runningAgents.includes(params.agent)) {
    throw new Error(`${params.agent} is not running`);
  }
  heartbeatLeaseForAgent(state, params.agent, params.leaseOwner);
  await syncAndSave(state);
  return state;
};

export const reportExecutionFailure = async (params: {
  agent: AgentName;
  reason: Exclude<ExecutionFailureReason, 'retry_exhausted'>;
  detail?: string;
  leaseOwner?: string;
}): Promise<WorkflowState> => {
  const state = await loadWorkflowState();
  const lease = state.leases[params.agent];
  if (lease && params.leaseOwner && lease.leaseOwner !== cleanText(params.leaseOwner)) {
    throw new Error(`Lease owner mismatch for ${params.agent}. Current owner is ${lease.leaseOwner}.`);
  }
  if (!state.runningAgents.includes(params.agent) && !state.leases[params.agent]) {
    await syncAndSave(state);
    return state;
  }
  await handleExecutionFailureState(state, params.agent, params.reason, params.detail);
  if (params.agent === 'agent9') {
    await sendTelegramMessage(
      ['Agent9 failed', `Reason: ${params.detail || params.reason}`].join('\n')
    );
  }
  await syncAndSave(state);
  return state;
};

export const requestManualRepeatRun = async (params: { agent: AgentName; requestedBy: string }): Promise<WorkflowState> => {
  const state = await loadWorkflowState();
  if (state.runningAgents.length > 0) {
    throw new Error('Cannot repeat-run while another agent is running.');
  }
  if (state.status === 'cancelled' || state.status === 'completed') {
    throw new Error(`Cannot repeat-run while workflow is ${state.status}.`);
  }
  if (state.currentStage === 'completed') {
    throw new Error('Cannot repeat-run at completed stage.');
  }
  if (!isAgentLegalForStage(params.agent, state.currentStage)) {
    throw new Error(`${params.agent} cannot run in current stage ${state.currentStage}`);
  }
  const allowedManual = isManualRepeatOnlyAgent(params.agent) || isAutoRetryAllowed(params.agent);
  if (!allowedManual) {
    throw new Error(`${params.agent} is not configured for repeat-run.`);
  }
  const target = `agent:${params.agent}` as ApprovalTarget;

  state.pendingApproval = {
    approvalId: `appr_${Math.random().toString(36).slice(2, 10)}`,
    target,
    reason: `Manual repeat-run requested by ${params.requestedBy}`,
    stage: state.currentStage,
    requestedAt: toIsoNow(),
  };
  state.proposedNext = {
    target,
    reason: 'Manual repeat-run requested by operator',
    stage: state.currentStage,
    requiredAgents: [params.agent],
  };
  state.approvalStatus = 'approved';
  state.status = 'running';
  markExecutionLifecycle(state, params.agent, {
    state: 'approved',
    workerId: null,
    target,
    approvalId: state.pendingApproval.approvalId,
    detail: `manual repeat-run approved by ${params.requestedBy}`,
  });
  state.retryableAgents = state.retryableAgents.filter((agent) => agent !== params.agent);
  state.blockedAgents = state.blockedAgents.filter((agent) => agent !== params.agent);
  if (state.lastExecutionFailureReason[params.agent] === 'retry_exhausted') {
    state.lastError = null;
  }
  await syncAndSave(state);
  return state;
};

export const proposeNextAgentForApproval = async (params: {
  actorAgent: string;
  completedAgent: string;
  resultSummary: string[];
  proposedNextAgent: string;
  why: string;
  issue?: string;
  loopStage?: string;
}): Promise<{ state: WorkflowState; telegram: { ok: boolean; error?: string } }> => {
  ensureOrchestrator(params.actorAgent);
  const completedAgent = parseAgent(params.completedAgent, 'completedAgent');

  const state = await loadWorkflowState();
  if (params.issue) {
    state.issueId = cleanText(params.issue);
  }

  await submitAgentResultInternal(state, {
    agent: completedAgent,
    result: {
      status: 'OK',
      summary: params.resultSummary || [],
      artifacts: [],
      rawOutput: { source: 'legacy_proposal_endpoint' },
    },
  });

  const expected = state.pendingApproval?.target || determineProposedNext(state)?.target;
  const requestedTarget = parseApprovalTarget(params.proposedNextAgent);
  if (!requestedTarget) {
    throw new Error('Invalid proposedNextAgent target.');
  }
  if (!expected) {
    throw new Error('No deterministic next step available for proposal.');
  }
  if (requestedTarget !== expected) {
    throw new Error(`Invalid proposal target ${requestedTarget}. Expected deterministic target ${expected}.`);
  }

  if (!state.pendingApproval) {
    setPendingApproval(state, {
      target: requestedTarget,
      reason: cleanText(params.why || 'Operator proposed next action'),
    });
  }

  const sendResult = await sendApprovalCard(state);
  if (!sendResult.ok) {
    state.status = 'blocked';
    state.lastError = sendResult.error || 'Telegram send failed';
    state.timestamps.lastWebhookFailureAt = toIsoNow();
    await syncAndSave(state);
    return { state, telegram: { ok: false, error: state.lastError || undefined } };
  }

  state.approvalMessageId = sendResult.messageId;
  await syncAndSave(state);
  return { state, telegram: { ok: true } };
};

export const claimApprovedNextAgent = async (params: {
  actorAgent: string;
}): Promise<{
  state: WorkflowState;
  execution: {
    nextAgent: AgentName;
    registry: ReturnType<typeof getAgentDefinition>;
    runContext: Awaited<ReturnType<typeof buildRunContext>>;
  };
}> => {
  ensureOrchestrator(params.actorAgent);
  const state = await loadWorkflowState();

  if (state.approvalStatus !== 'approved' || !state.pendingApproval) {
    throw new Error('No approved next target available.');
  }
  if (state.pendingApproval.target.startsWith('group:')) {
    throw new Error('Claim endpoint supports single agent targets only. Use auto/next-action for groups.');
  }

  const target = state.pendingApproval.target;
  if (!canExecuteApprovedTarget(state, target)) {
    throw new Error('Approved target is no longer executable.');
  }

  const agent = target.replace('agent:', '') as AgentName;
  const runContext = await buildRunContext(agent);
  const registry = getAgentDefinition(agent);

  state.runningAgents = [agent];
  state.currentRunningAgent = agent;
  state.approvalStatus = 'idle';
  state.pendingApproval = null;
  state.proposedNext = null;
  state.status = 'running';
  prepareRunningLease(state, agent);

  await syncAndSave(state);

  return {
    state,
    execution: {
      nextAgent: agent,
      registry,
      runContext,
    },
  };
};

export const runCredentialExpiryCheck = async (): Promise<void> => {
  await notifyExpiringTemplateTokenIfNeeded();
};

const validateMutatingCallbackAgainstState = (
  state: WorkflowState,
  record: {
    issueId: string;
    stage: WorkflowState['currentStage'];
    target: ApprovalTarget | null;
    approvalId: string | null;
    status: WorkflowState['status'];
  }
): { ok: true } | { ok: false; reason: string } => {
  if (state.issueId !== record.issueId) {
    return { ok: false, reason: 'Outdated button, tap Status.' };
  }
  if (state.currentStage !== record.stage) {
    return { ok: false, reason: 'Outdated button, tap Status.' };
  }
  if (state.status !== record.status && state.status !== 'waiting_approval' && state.status !== 'running') {
    return { ok: false, reason: 'Outdated button, tap Status.' };
  }
  if (!state.pendingApproval || state.approvalStatus !== 'pending') {
    return { ok: false, reason: 'No active approval request. Tap Status.' };
  }
  if (state.pendingApproval.target !== record.target) {
    return { ok: false, reason: 'Target already changed. Tap Status.' };
  }
  if (state.pendingApproval.approvalId !== record.approvalId) {
    return { ok: false, reason: 'Approval request changed. Tap Status.' };
  }
  return { ok: true };
};

const handleTelegramCallbackAction = async (params: {
  action: TelegramCallbackAction;
  callbackData: string;
  callbackQueryId: string;
}): Promise<{ handled: boolean; command: string; response: string }> => {
  const loaded = loadTelegramCallbackRecord(params.callbackData);
  if (!loaded.ok) {
    const reason = 'Outdated button, tap Status.';
    await answerTelegramCallbackQuery(params.callbackQueryId, reason);
    await sendTelegramMessage(reason);
    return { handled: true, command: `callback:${params.action}`, response: reason };
  }

  const { cbid, record } = loaded;
  const state = await loadWorkflowState();
  let response = '';

  if (record.action !== params.action) {
    response = 'Outdated button, tap Status.';
    await answerTelegramCallbackQuery(params.callbackQueryId, response);
    await sendTelegramMessage(response);
    return { handled: true, command: `callback:${params.action}`, response };
  }

  if (params.action === 'status') {
    await answerTelegramCallbackQuery(params.callbackQueryId, 'Status refreshed');
    await sendStatusCard(state);
    return { handled: true, command: 'callback:status', response: 'Status refreshed.' };
  }

  if (consumeTelegramCallbackRecord(cbid).ok === false) {
    response = 'Button already handled. Tap Status.';
    await answerTelegramCallbackQuery(params.callbackQueryId, response);
    await sendTelegramMessage(response);
    return { handled: true, command: `callback:${params.action}`, response };
  }

  const validation = validateMutatingCallbackAgainstState(state, record);
  if (!validation.ok) {
    await answerTelegramCallbackQuery(params.callbackQueryId, validation.reason);
    await sendTelegramMessage(validation.reason);
    return { handled: true, command: `callback:${params.action}`, response: validation.reason };
  }

  if (params.action === 'approve') {
    approvePendingTarget(state, record.target as ApprovalTarget, record.approvalId || undefined);
    state.lastApprovalCommand = `/approve ${record.target}`;
    await syncAndSave(state);
    response = `${record.target} approved.`;
    await answerTelegramCallbackQuery(params.callbackQueryId, 'Approved');
    await sendTelegramMessage(response);
    return { handled: true, command: 'callback:approve', response };
  }

  rejectPendingTarget(state);
  state.lastApprovalCommand = '/reject';
  await syncAndSave(state);
  response = 'Rejected. Workflow remains blocked until Agent 0 proposes a valid new target.';
  await answerTelegramCallbackQuery(params.callbackQueryId, 'Rejected');
  await sendTelegramMessage(response);
  return { handled: true, command: 'callback:reject', response };
};

const handleTelegramTextCommand = async (params: {
  chatId: string;
  command: string;
}): Promise<{ handled: boolean; command: string; response: string }> => {
  const state = await loadWorkflowState();
  const command = params.command.trim();
  const normalized = command.toLowerCase();
  let response = '';

  if (normalized === '/wa_token status') {
    response = await getTemplateTokenStatus();
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized.startsWith(WA_TOKEN_SET_PREFIX)) {
    try {
      const parsed = parseWaTokenSetCommand(command);
      const pending = await setPendingTemplateTokenUpdate({
        chatId: params.chatId,
        token: parsed.token,
        expiresOn: parsed.expiresOn,
      });

      response = [
        'Pending token update created (valid for 10 minutes).',
        `Token: ${pending.masked}`,
        `ExpiresAt: ${pending.expiresAt ? pending.expiresAt.toISOString() : 'not set'}`,
        'Reply /wa_token confirm to save or /wa_token cancel to discard.',
      ].join('\n');
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    } catch (error: any) {
      response = error.message || 'Failed to stage token update.';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }
  }

  if (normalized === '/wa_token confirm') {
    try {
      const saved = await confirmPendingTemplateTokenUpdate(params.chatId);
      response = [
        'Template token updated successfully.',
        `Token: ${saved.masked}`,
        `ExpiresAt: ${saved.expiresAt ? saved.expiresAt.toISOString() : 'not set'}`,
      ].join('\n');
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    } catch (error: any) {
      response = error.message || 'No pending update to confirm.';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }
  }

  if (normalized === '/wa_token cancel') {
    const cancelled = await cancelPendingTemplateTokenUpdate(params.chatId);
    response = cancelled ? 'Pending token update cancelled.' : 'No pending token update found.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized.startsWith(START_RUN_PREFIX)) {
    const issue = parseStartRunIssue(command);
    if (!issue) {
      response = 'Usage: /start-run <issue>';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }
    if (hasActiveRun(state)) {
      response = `Cannot start a new run while current run is ${state.status}. Use /status first.`;
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    const started = await startAutoRun({
      actorAgent: 'agent0',
      issue,
      checkpointPolicy: 'critical_only',
    });

    await sendTelegramMessage(`Run started.\nIssue: ${started.issueId}\nStage: ${started.currentStage}`);
    response = started.pendingApproval ? 'Run started and approval sent.' : 'Run started.';
    return { handled: true, command, response };
  }

  if (normalized === '/status') {
    await sendStatusCard(state);
    response = formatCompactStatusCard(state);
    return { handled: true, command, response };
  }

  if (normalized === '/repeat') {
    if (!state.pendingApproval) {
      response = 'No pending approval target to repeat.';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }
    const sendResult = await sendApprovalCard(state);
    if (!sendResult.ok) {
      state.status = 'blocked';
      state.lastError = sendResult.error || 'Telegram send failed during /repeat';
      state.timestamps.lastWebhookFailureAt = toIsoNow();
      await syncAndSave(state);
      response = `Repeat failed: ${state.lastError}`;
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }
    state.approvalMessageId = sendResult.messageId;
    await syncAndSave(state);
    response = 'Approval prompt repeated.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized.startsWith(REPEAT_RUN_PREFIX)) {
    const repeatAgent = parseRepeatRunAgent(normalized);
    if (!repeatAgent) {
      response = 'Invalid repeat-run command. Use: /repeat-run <agent>';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }
    try {
      await requestManualRepeatRun({ agent: repeatAgent, requestedBy: `telegram:${params.chatId}` });
      response = `Repeat-run scheduled for ${repeatAgent}.`;
    } catch (error: any) {
      response = error.message || `Failed to repeat-run ${repeatAgent}.`;
    }
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized === '/cancel') {
    cancelWorkflow(state);
    state.lastApprovalCommand = '/cancel';
    await syncAndSave(state);
    response = 'Workflow cancelled.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized === '/reject') {
    rejectPendingTarget(state);
    state.lastApprovalCommand = '/reject';
    await syncAndSave(state);
    response = 'Rejected. Workflow remains blocked until Agent 0 proposes a valid new target.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized.startsWith(APPROVE_PREFIX)) {
    const raw = getApproveTarget(normalized);
    if (!raw) {
      response = 'Invalid approve command. Use: /approve <agent:agentX|group:stage_x>';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    const target = parseApprovalTarget(raw);
    if (!target) {
      response = 'Invalid approve target.';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }
    if (!state.pendingApproval || state.approvalStatus !== 'pending') {
      response = `Cannot approve now. Current approval status is ${state.approvalStatus}.`;
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }
    if (state.pendingApproval.target !== target) {
      response = `Invalid approve target. Pending target is ${state.pendingApproval.target}.`;
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    approvePendingTarget(state, target, state.pendingApproval.approvalId);
    state.lastApprovalCommand = `/approve ${target}`;
    await syncAndSave(state);
    response = `${target} approved.`;
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  response =
    'Unknown command. Use /start-run <issue>, /approve <target>, /reject, /status, /repeat, /repeat-run <agent>, /cancel, /wa_token status, /wa_token set, /wa_token confirm, /wa_token cancel.';
  await sendTelegramMessage(response);
  return { handled: true, command, response };
};

export const handleTelegramWebhookUpdate = async (body: any): Promise<{
  handled: boolean;
  command?: string | null;
  response?: string;
}> => {
  await initializeOrchestrator();

  const { chatId, text, callbackData, callbackQueryId } = extractTelegramUpdate(body);
  if (!text && !(callbackData && callbackQueryId)) {
    return { handled: false, command: null };
  }

  const allowedChatId = process.env.TELEGRAM_APPROVER_CHAT_ID;
  if (!allowedChatId || !chatId || chatId !== allowedChatId) {
    return { handled: false, command: text || callbackData || null };
  }

  if (callbackData && callbackQueryId) {
    const loaded = loadTelegramCallbackRecord(callbackData);
    const action = loaded.ok ? loaded.record.action : 'status';
    return await handleTelegramCallbackAction({
      action,
      callbackData,
      callbackQueryId,
    });
  }

  if (!text) {
    return { handled: false, command: null };
  }

  return await handleTelegramTextCommand({
    chatId,
    command: text,
  });
};

export const getAgentRegistry = () => listAgentDefinitions();
