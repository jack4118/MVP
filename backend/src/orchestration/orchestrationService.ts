import { getAgentDefinition, listAgentDefinitions, normalizeAgentName, validateAgentTransition } from './agentRegistry';
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
import { extractTelegramCommand, sendTelegramMessage } from './telegramClient';
import { AgentExecutionResult, AgentName, RunnableAction, WorkflowState } from './types';

const APPROVE_PREFIX = '/approve';
const WA_TOKEN_SET_PREFIX = '/wa_token set';

const AUTO_FLOW_LABELS = {
  group12: 'Run Agent 1 and Agent 2',
  agent3: 'Run Agent 3',
  group678: 'Run Agent 6, Agent 7, Agent 8',
  approve9: 'Approval checkpoint for Agent 9',
  agent9: 'Run Agent 9',
  approve12: 'Approval checkpoint for Agent 12',
  agent12: 'Run Agent 12',
  done: 'Flow completed',
} as const;

type AutoStep = keyof typeof AUTO_FLOW_LABELS;

const toIsoNow = (): string => new Date().toISOString();

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));
const TELEGRAM_MESSAGE_LIMIT = 3900;
const SUMMARY_LINE_LIMIT = 220;
const SUMMARY_COUNT_LIMIT = 8;

const ensureOrchestrator = (actorAgent: string): void => {
  if (actorAgent.trim().toLowerCase() !== 'agent0') {
    throw new Error('Only Agent 0 can mutate orchestration state');
  }
};

const parseAgent = (value: string, field: string): AgentName => {
  const agent = normalizeAgentName(value);
  if (!agent) {
    throw new Error(`Invalid ${field}. Expected one of: agent1, agent2, agent3, agent5, agent6, agent7, agent8, agent9, agent12`);
  }
  return agent;
};

const hasCurrentLoopOutput = (state: WorkflowState, agent: AgentName): boolean => {
  const output = state.agentOutputs[agent];
  return Boolean(output && output.loopCount === state.loopCount);
};

const setAutoStep = (state: WorkflowState, step: AutoStep): void => {
  state.nextAction = step;
  state.currentLoopStage = AUTO_FLOW_LABELS[step];
};

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const clampText = (value: string, maxLen: number): string => {
  const cleaned = cleanText(value);
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLen - 3))}...`;
};

const sanitizeSummary = (items: string[]): string[] =>
  items
    .map((line) => clampText(line || '', SUMMARY_LINE_LIMIT))
    .filter(Boolean)
    .slice(0, SUMMARY_COUNT_LIMIT);

const toPromptContextSummary = (state: WorkflowState) => {
  const compactOutputs = Object.fromEntries(
    Object.entries(state.agentOutputs).map(([agent, output]) => [
      agent,
      {
        status: output.status,
        summary: sanitizeSummary(output.summary || []),
        artifacts: (output.artifacts || []).slice(0, 10),
        loopCount: output.loopCount,
        completedAt: output.completedAt,
      },
    ]),
  );

  return {
    currentIssue: state.currentIssue,
    loopCount: state.loopCount,
    nextAction: state.nextAction,
    approvalStatus: state.approvalStatus,
    outputs: compactOutputs,
  };
};

const ensureTelegramLimit = (message: string): string => {
  if (message.length <= TELEGRAM_MESSAGE_LIMIT) {
    return message;
  }
  return `${message.slice(0, TELEGRAM_MESSAGE_LIMIT - 40)}\n\n[truncated for Telegram length]`;
};

const formatApprovalMessage = (state: WorkflowState): string => {
  if (!state.lastCompletedAgent || !state.proposedNextAgent) {
    return 'No pending proposal.';
  }

  const completed = getAgentDefinition(state.lastCompletedAgent).displayName;
  const proposed = getAgentDefinition(state.proposedNextAgent).displayName;
  const summaryLines = sanitizeSummary(state.proposedSummary);
  const summary = summaryLines.length
    ? summaryLines.map((line) => `- ${line}`).join('\n')
    : '- No summary provided';

  return ensureTelegramLimit([
    'EzReply Approval Needed',
    '',
    `Done: ${completed}`,
    `Next: ${proposed}`,
    `Why: ${clampText(state.proposedReason || 'No reason provided', 260)}`,
    '',
    'Summary:',
    summary,
    '',
    'Reply:',
    `/approve ${state.proposedNextAgent}`,
    '/reject  /status  /repeat  /cancel',
  ].join('\n'));
};

const formatStatusMessage = (state: WorkflowState): string => {
  const completed = state.completedAgents.length ? state.completedAgents.slice(0, 6).join(', ') : 'none';
  const pending = state.pendingAgents.length ? state.pendingAgents.slice(0, 6).join(', ') : 'none';
  const blocked = state.blockedAgents.length ? state.blockedAgents.join(', ') : 'none';
  const lastCompleted = state.lastCompletedAgent || 'none';
  const proposed = state.proposedNextAgent || 'none';
  const pendingSuffix = state.pendingAgents.length > 6 ? ` (+${state.pendingAgents.length - 6} more)` : '';
  const completedSuffix = state.completedAgents.length > 6 ? ` (+${state.completedAgents.length - 6} more)` : '';

  return [
    'EzReply Status',
    '',
    `Issue: ${clampText(state.currentIssue || 'not set', 120)}`,
    `Stage: ${state.currentLoopStage}`,
    `Approval: ${state.approvalStatus}`,
    `Auto: ${state.autoMode ? 'on' : 'off'} (${state.autoRunStatus})`,
    `NextAction: ${state.nextAction || 'none'}`,
    `LastDone: ${lastCompleted}`,
    `Proposed: ${proposed}`,
    `Completed: ${completed}${completedSuffix}`,
    `Pending: ${pending}${pendingSuffix}`,
    `Blocked: ${blocked}`,
    `Loop: ${state.loopCount}`,
    `Error: ${clampText(state.lastError || 'none', 180)}`,
  ].join('\n');
};

const getApproveTarget = (text: string): string | null => {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }
  return parts[1];
};

const assertValidProposal = (proposedNextAgent: AgentName): void => {
  if (proposedNextAgent === 'agent0') {
    throw new Error('Agent 0 is orchestrator-only and cannot be proposed as next execution target');
  }

  const transition = validateAgentTransition(proposedNextAgent);
  if (!transition.ok) {
    throw new Error(transition.reason || 'Proposed next agent failed validation');
  }
};

const maybeAdvanceAutoStep = (state: WorkflowState): void => {
  if (!state.autoMode || !state.nextAction) {
    return;
  }

  const step = state.nextAction as AutoStep;

  if (step === 'group12') {
    if (hasCurrentLoopOutput(state, 'agent1') && hasCurrentLoopOutput(state, 'agent2')) {
      setAutoStep(state, 'agent3');
    }
    return;
  }

  if (step === 'agent3') {
    if (hasCurrentLoopOutput(state, 'agent3')) {
      setAutoStep(state, 'group678');
    }
    return;
  }

  if (step === 'group678') {
    if (hasCurrentLoopOutput(state, 'agent6') && hasCurrentLoopOutput(state, 'agent7') && hasCurrentLoopOutput(state, 'agent8')) {
      setAutoStep(state, 'approve9');
    }
    return;
  }

  if (step === 'agent9') {
    if (hasCurrentLoopOutput(state, 'agent9')) {
      setAutoStep(state, 'approve12');
    }
    return;
  }

  if (step === 'agent12') {
    const output = state.agentOutputs.agent12;
    if (!output || output.loopCount !== state.loopCount) {
      return;
    }

    if (output.status === 'FAIL') {
      state.loopCount += 1;
      setAutoStep(state, 'group678');
      return;
    }

    state.autoRunStatus = 'done';
    state.autoMode = false;
    setAutoStep(state, 'done');
  }
};

const summarizeFromAgents = (state: WorkflowState, agents: AgentName[]): string[] => {
  return sanitizeSummary(
    agents
    .map((agent) => state.agentOutputs[agent])
    .filter((output): output is AgentExecutionResult => Boolean(output))
    .flatMap((output) => output.summary)
  );
};

const proposeCheckpointIfNeeded = async (state: WorkflowState): Promise<void> => {
  if (!state.autoMode || !state.nextAction) {
    return;
  }

  if (state.approvalStatus === 'awaiting_approval' || state.approvalStatus === 'approved') {
    return;
  }

  if (state.nextAction === 'approve9') {
    const summary = summarizeFromAgents(state, ['agent6', 'agent7', 'agent8']);
    state.lastCompletedAgent = 'agent8';
    state.proposedNextAgent = 'agent9';
    state.proposedReason = 'Auto checkpoint: run Agent 9 for patch/build/deploy after design phase.';
    state.proposedSummary = summary;
    state.approvalStatus = 'awaiting_approval';
    state.autoRunStatus = 'awaiting_approval';
    state.timestamps.lastProposalAt = toIsoNow();

    const sendResult = await sendTelegramMessage(formatApprovalMessage(state));
    if (!sendResult.ok) {
      state.approvalStatus = 'blocked_webhook';
      state.lastError = sendResult.error || 'Telegram send failed';
      state.timestamps.lastWebhookFailureAt = toIsoNow();
      state.blockedAgents = unique([...state.blockedAgents, 'agent9']);
      return;
    }

    state.lastTelegramMessageId = sendResult.messageId;
    return;
  }

  if (state.nextAction === 'approve12') {
    const summary = summarizeFromAgents(state, ['agent9']);
    state.lastCompletedAgent = 'agent9';
    state.proposedNextAgent = 'agent12';
    state.proposedReason = 'Auto checkpoint: run Agent 12 for staging validation.';
    state.proposedSummary = summary;
    state.approvalStatus = 'awaiting_approval';
    state.autoRunStatus = 'awaiting_approval';
    state.timestamps.lastProposalAt = toIsoNow();

    const sendResult = await sendTelegramMessage(formatApprovalMessage(state));
    if (!sendResult.ok) {
      state.approvalStatus = 'blocked_webhook';
      state.lastError = sendResult.error || 'Telegram send failed';
      state.timestamps.lastWebhookFailureAt = toIsoNow();
      state.blockedAgents = unique([...state.blockedAgents, 'agent12']);
      return;
    }

    state.lastTelegramMessageId = sendResult.messageId;
  }
};

export const initializeOrchestrator = async (): Promise<void> => {
  await bootstrapTemplateTokenFromEnv();
};

export const getWorkflowStatus = async (): Promise<WorkflowState> => {
  const state = await loadWorkflowState();
  maybeAdvanceAutoStep(state);
  await proposeCheckpointIfNeeded(state);
  await saveWorkflowState(state);
  return state;
};

export const resetWorkflow = async (params: {
  actorAgent: string;
  issue: string;
  loopStage?: string;
  pendingAgents?: string[];
}): Promise<WorkflowState> => {
  ensureOrchestrator(params.actorAgent);

  const base = createDefaultState();
  const pendingAgents = params.pendingAgents?.length
    ? params.pendingAgents.map((agent) => parseAgent(agent, 'pendingAgents')).filter((agent) => agent !== 'agent0')
    : base.pendingAgents;

  const nextState: WorkflowState = {
    ...base,
    currentIssue: params.issue.trim(),
    currentLoopStage: params.loopStage?.trim() || 'triage',
    pendingAgents: unique(pendingAgents),
  };

  await saveWorkflowState(nextState);
  return nextState;
};

export const startAutoRun = async (params: {
  actorAgent: string;
  issue: string;
  checkpointPolicy?: 'critical_only' | 'all_steps';
}): Promise<WorkflowState> => {
  ensureOrchestrator(params.actorAgent);
  const state = await loadWorkflowState();

  state.currentIssue = params.issue;
  state.autoMode = true;
  state.autoRunStatus = 'running';
  state.checkpointPolicy = params.checkpointPolicy || 'critical_only';
  state.loopCount = 1;
  state.approvalStatus = 'idle';
  state.proposedNextAgent = null;
  state.proposedReason = null;
  state.proposedSummary = [];
  state.approvedAgent = null;
  state.currentRunningAgent = null;
  state.completedAgents = [];
  state.lastApprovalCommand = null;
  state.lastError = null;
  state.lastTelegramMessageId = null;
  state.pendingAgents = ['agent1', 'agent2', 'agent3', 'agent5', 'agent6', 'agent7', 'agent8', 'agent9', 'agent12'];
  state.blockedAgents = [];
  state.agentOutputs = {};
  state.context = {};
  state.timestamps.lastProposalAt = null;
  state.timestamps.lastApprovalAt = null;
  state.timestamps.lastRejectionAt = null;
  state.timestamps.lastWebhookFailureAt = null;
  setAutoStep(state, 'group12');

  await saveWorkflowState(state);
  return state;
};

export const stopAutoRun = async (params: { actorAgent: string }): Promise<WorkflowState> => {
  ensureOrchestrator(params.actorAgent);
  const state = await loadWorkflowState();
  state.autoMode = false;
  state.autoRunStatus = 'stopped';
  state.nextAction = null;
  state.currentLoopStage = 'stopped';
  await saveWorkflowState(state);
  return state;
};

export const getNextRunnableAction = async (): Promise<{ state: WorkflowState; action: RunnableAction }> => {
  const state = await loadWorkflowState();
  maybeAdvanceAutoStep(state);
  await proposeCheckpointIfNeeded(state);

  if (!state.autoMode || state.autoRunStatus === 'done' || state.autoRunStatus === 'stopped') {
    await saveWorkflowState(state);
    return { state, action: { type: 'idle', agents: [], reason: 'auto mode disabled or done' } };
  }

  if (state.currentRunningAgent) {
    await saveWorkflowState(state);
    return { state, action: { type: 'idle', agents: [], reason: 'agent currently running' } };
  }

  if (state.approvalStatus === 'awaiting_approval') {
    await saveWorkflowState(state);
    return { state, action: { type: 'idle', agents: [], reason: 'waiting for telegram approval' } };
  }

  if (state.approvalStatus === 'approved' && state.proposedNextAgent) {
    const nextAgent = state.proposedNextAgent;
    state.currentRunningAgent = nextAgent;
    state.approvalStatus = 'in_progress';
    state.autoRunStatus = 'running';

    if (nextAgent === 'agent9') {
      setAutoStep(state, 'agent9');
    } else if (nextAgent === 'agent12') {
      setAutoStep(state, 'agent12');
    }

    state.pendingAgents = state.pendingAgents.filter((item) => item !== nextAgent);
    state.approvedAgent = null;
    state.proposedNextAgent = null;
    state.proposedReason = null;
    state.proposedSummary = [];

    await saveWorkflowState(state);
    return { state, action: { type: 'run_agent', agents: [nextAgent], reason: 'approved checkpoint' } };
  }

  const step = state.nextAction as AutoStep | null;
  if (!step) {
    await saveWorkflowState(state);
    return { state, action: { type: 'idle', agents: [], reason: 'no next action' } };
  }

  if (step === 'group12') {
    const group: AgentName[] = ['agent1', 'agent2'];
    const agents: AgentName[] = group.filter((a) => !hasCurrentLoopOutput(state, a));
    if (agents.length === 0) {
      await saveWorkflowState(state);
      return { state, action: { type: 'idle', agents: [], reason: 'group12 complete' } };
    }
    await saveWorkflowState(state);
    return { state, action: { type: 'run_parallel', agents, reason: 'initial QA pair' } };
  }

  if (step === 'agent3' && !hasCurrentLoopOutput(state, 'agent3')) {
    state.currentRunningAgent = 'agent3';
    await saveWorkflowState(state);
    return { state, action: { type: 'run_agent', agents: ['agent3'], reason: 'summary step' } };
  }

  if (step === 'group678') {
    const group: AgentName[] = ['agent6', 'agent7', 'agent8'];
    const agents: AgentName[] = group.filter((a) => !hasCurrentLoopOutput(state, a));
    if (agents.length === 0) {
      await saveWorkflowState(state);
      return { state, action: { type: 'idle', agents: [], reason: 'group678 complete' } };
    }
    await saveWorkflowState(state);
    return { state, action: { type: 'run_parallel', agents, reason: 'design trio' } };
  }

  if (step === 'agent9' && !hasCurrentLoopOutput(state, 'agent9')) {
    state.currentRunningAgent = 'agent9';
    await saveWorkflowState(state);
    return { state, action: { type: 'run_agent', agents: ['agent9'], reason: 'deploy step' } };
  }

  if (step === 'agent12' && !hasCurrentLoopOutput(state, 'agent12')) {
    state.currentRunningAgent = 'agent12';
    await saveWorkflowState(state);
    return { state, action: { type: 'run_agent', agents: ['agent12'], reason: 'staging validation step' } };
  }

  await saveWorkflowState(state);
  return { state, action: { type: 'idle', agents: [], reason: 'no runnable action' } };
};

export const buildAgentPrompt = async (params: { state: WorkflowState; agent: AgentName }): Promise<string> => {
  const definition = getAgentDefinition(params.agent);
  const runContext = await buildRunContext(params.agent);

  return [
    `You are ${definition.displayName} (${params.agent}).`,
    `Role: ${definition.role}`,
    `Current Issue: ${params.state.currentIssue || 'not provided'}`,
    `Allowed Actions: ${definition.allowedActions.join('; ')}`,
    `Forbidden Actions: ${definition.forbiddenActions.join('; ')}`,
    `Required Inputs: ${definition.requiredInputs.join('; ')}`,
    `Expected Outputs: ${definition.expectedOutputs.join('; ')}`,
    `Staging URL: ${runContext.stagingUrl || 'n/a'}`,
    `Constraints: ${runContext.constraints.join(' | ')}`,
    'Upstream context summary:',
    JSON.stringify(toPromptContextSummary(params.state), null, 2),
    'Output JSON only with fields: status (PASS|FAIL|OK), summary (string[]), artifacts (string[]).',
  ].join('\n');
};

export const submitAgentResult = async (params: {
  agent: AgentName;
  result: Pick<AgentExecutionResult, 'status' | 'summary' | 'artifacts' | 'rawOutput'>;
}): Promise<WorkflowState> => {
  const state = await loadWorkflowState();

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
  state.lastCompletedAgent = params.agent;
  state.currentRunningAgent = null;
  state.completedAgents = unique([...state.completedAgents, params.agent]);
  state.pendingAgents = state.pendingAgents.filter((item) => item !== params.agent);
  state.context[`${params.agent}:status`] = normalized.status;
  state.context[`${params.agent}:summary`] = normalized.summary;

  if (state.autoMode) {
    state.autoRunStatus = 'running';
    maybeAdvanceAutoStep(state);
    await proposeCheckpointIfNeeded(state);
  }

  await saveWorkflowState(state);
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
  const proposedNextAgent = parseAgent(params.proposedNextAgent, 'proposedNextAgent');
  assertValidProposal(proposedNextAgent);

  const state = await loadWorkflowState();
  const now = toIsoNow();

  state.currentIssue = params.issue?.trim() || state.currentIssue;
  state.currentLoopStage = params.loopStage?.trim() || state.currentLoopStage || 'triage';
  state.lastCompletedAgent = completedAgent;
  state.currentRunningAgent = null;
  state.proposedNextAgent = proposedNextAgent;
  state.proposedReason = params.why.trim();
  state.proposedSummary = sanitizeSummary(params.resultSummary);
  state.approvalStatus = 'awaiting_approval';
  state.approvedAgent = null;
  state.lastApprovalCommand = null;
  state.lastError = null;
  state.timestamps.lastProposalAt = now;
  state.autoRunStatus = state.autoMode ? 'awaiting_approval' : state.autoRunStatus;

  state.completedAgents = unique([...state.completedAgents, completedAgent]);
  state.pendingAgents = state.pendingAgents.filter((agent) => agent !== completedAgent);
  state.blockedAgents = state.blockedAgents.filter((agent) => agent !== proposedNextAgent);

  const approvalMessage = formatApprovalMessage(state);
  const sendResult = await sendTelegramMessage(approvalMessage);

  if (!sendResult.ok) {
    state.approvalStatus = 'blocked_webhook';
    state.lastError = sendResult.error || 'Telegram webhook failure';
    state.timestamps.lastWebhookFailureAt = now;
    state.blockedAgents = unique([...state.blockedAgents, proposedNextAgent]);
    await saveWorkflowState(state);
    return {
      state,
      telegram: {
        ok: false,
        error: sendResult.error || 'Telegram send failed',
      },
    };
  }

  state.lastTelegramMessageId = sendResult.messageId;
  await saveWorkflowState(state);

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

  if (state.approvalStatus !== 'approved') {
    throw new Error('No approved next agent available. Wait for /approve <agent>.');
  }

  if (!state.proposedNextAgent || !state.approvedAgent) {
    throw new Error('Approval state is inconsistent: missing proposed or approved agent.');
  }

  if (state.proposedNextAgent !== state.approvedAgent) {
    throw new Error(`Approved agent ${state.approvedAgent} does not match proposed agent ${state.proposedNextAgent}.`);
  }

  assertValidProposal(state.proposedNextAgent);

  const runContext = await buildRunContext(state.proposedNextAgent);
  const registry = getAgentDefinition(state.proposedNextAgent);

  state.currentRunningAgent = state.proposedNextAgent;
  state.approvalStatus = 'in_progress';
  state.pendingAgents = state.pendingAgents.filter((agent) => agent !== state.currentRunningAgent);
  state.approvedAgent = null;
  state.proposedNextAgent = null;
  state.proposedReason = null;
  state.proposedSummary = [];
  state.lastError = null;

  await saveWorkflowState(state);

  return {
    state,
    execution: {
      nextAgent: state.currentRunningAgent,
      registry,
      runContext,
    },
  };
};

export const runCredentialExpiryCheck = async (): Promise<void> => {
  await notifyExpiringTemplateTokenIfNeeded();
};

export const handleTelegramWebhookUpdate = async (body: any): Promise<{
  handled: boolean;
  command?: string | null;
  response?: string;
}> => {
  await initializeOrchestrator();

  const { chatId, text } = extractTelegramCommand(body);

  if (!text) {
    return { handled: false, command: null };
  }

  const allowedChatId = process.env.TELEGRAM_APPROVER_CHAT_ID;
  if (!allowedChatId || !chatId || chatId !== allowedChatId) {
    return { handled: false, command: text };
  }

  const state = await loadWorkflowState();
  const command = text.trim();
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
        chatId,
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
      const saved = await confirmPendingTemplateTokenUpdate(chatId);
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
    const cancelled = await cancelPendingTemplateTokenUpdate(chatId);
    response = cancelled ? 'Pending token update cancelled.' : 'No pending token update found.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized === '/status') {
    response = formatStatusMessage(state);
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized === '/repeat') {
    if (!state.proposedNextAgent) {
      response = 'No proposed next agent available to repeat.';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    const approvalMessage = formatApprovalMessage(state);
    const sendResult = await sendTelegramMessage(approvalMessage);

    if (!sendResult.ok) {
      state.approvalStatus = 'blocked_webhook';
      state.lastError = sendResult.error || 'Telegram send failed during /repeat';
      state.timestamps.lastWebhookFailureAt = toIsoNow();
      await saveWorkflowState(state);
      response = `Repeat failed: ${state.lastError}`;
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    state.lastTelegramMessageId = sendResult.messageId;
    await saveWorkflowState(state);
    response = 'Approval prompt repeated.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized === '/cancel') {
    state.approvalStatus = 'cancelled';
    state.currentRunningAgent = null;
    state.approvedAgent = null;
    state.proposedNextAgent = null;
    state.proposedReason = null;
    state.proposedSummary = [];
    state.lastApprovalCommand = '/cancel';
    state.autoRunStatus = state.autoMode ? 'stopped' : state.autoRunStatus;
    await saveWorkflowState(state);
    response = 'Workflow cancelled. Agent 0 must propose a new next step.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized === '/reject') {
    state.approvalStatus = 'rejected';
    state.approvedAgent = null;
    state.lastApprovalCommand = '/reject';
    state.timestamps.lastRejectionAt = toIsoNow();
    state.autoRunStatus = state.autoMode ? 'running' : state.autoRunStatus;
    await saveWorkflowState(state);
    response = 'Rejected. Agent 0 must propose another next agent.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (normalized.startsWith(APPROVE_PREFIX)) {
    const requestedAgentRaw = getApproveTarget(normalized);
    if (!requestedAgentRaw) {
      response = 'Invalid approve command. Use: /approve agent1';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    const requestedAgent = normalizeAgentName(requestedAgentRaw);
    if (!requestedAgent || requestedAgent === 'agent0') {
      response = 'Invalid agent in /approve command. Valid options: agent1, agent2, agent3, agent5, agent6, agent7, agent8, agent9, agent12';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    if (state.approvalStatus !== 'awaiting_approval') {
      response = `Cannot approve now. Current status is ${state.approvalStatus}.`;
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    if (!state.proposedNextAgent) {
      response = 'No proposed next agent found. Ask Agent 0 to propose one first.';
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    if (state.proposedNextAgent !== requestedAgent) {
      response = [
        `Proposed next agent is ${state.proposedNextAgent}, not ${requestedAgent}.`,
        'Valid responses:',
        `- /approve ${state.proposedNextAgent}`,
        '- /reject',
        '- /status',
      ].join('\n');
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    const transition = validateAgentTransition(requestedAgent);
    if (!transition.ok) {
      response = `Approval rejected by registry: ${transition.reason}`;
      await sendTelegramMessage(response);
      return { handled: true, command, response };
    }

    state.approvalStatus = 'approved';
    state.approvedAgent = requestedAgent;
    state.lastApprovalCommand = normalized;
    state.timestamps.lastApprovalAt = toIsoNow();
    state.lastError = null;
    state.autoRunStatus = state.autoMode ? 'running' : state.autoRunStatus;
    await saveWorkflowState(state);

    response = `${requestedAgent} approved. Agent 0 can now claim and run the next step.`;
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  response = 'Unknown command. Use /approve <agent>, /reject, /status, /repeat, /cancel, /wa_token status, /wa_token set, /wa_token confirm, /wa_token cancel.';
  await sendTelegramMessage(response);
  return { handled: true, command, response };
};

export const getAgentRegistry = () => listAgentDefinitions();
