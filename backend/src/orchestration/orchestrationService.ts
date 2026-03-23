import { getAgentDefinition, listAgentDefinitions, normalizeAgentName, validateAgentTransition } from './agentRegistry';
import { buildRunContext } from './context';
import { createDefaultState, loadWorkflowState, saveWorkflowState } from './stateStore';
import { extractTelegramCommand, sendTelegramMessage } from './telegramClient';
import { AgentName, WorkflowState } from './types';

const APPROVE_PREFIX = '/approve';

const toIsoNow = (): string => new Date().toISOString();

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

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

const formatApprovalMessage = (state: WorkflowState): string => {
  if (!state.lastCompletedAgent || !state.proposedNextAgent) {
    return 'No pending proposal.';
  }

  const completed = getAgentDefinition(state.lastCompletedAgent).displayName;
  const proposed = getAgentDefinition(state.proposedNextAgent).displayName;
  const summary = state.proposedSummary.length
    ? state.proposedSummary.map((line) => `- ${line}`).join('\n')
    : '- No summary provided';

  return [
    'EzReply Agent Approval Needed',
    '',
    'Completed:',
    completed,
    '',
    'Result Summary:',
    summary,
    '',
    'Proposed Next Agent:',
    proposed,
    '',
    'Why:',
    state.proposedReason || 'No reason provided',
    '',
    'Reply with:',
    `- /approve ${state.proposedNextAgent}`,
    '- /reject',
    '- /status',
    '- /repeat',
    '- /cancel',
  ].join('\n');
};

const formatStatusMessage = (state: WorkflowState): string => {
  const completed = state.completedAgents.length ? state.completedAgents.join(', ') : 'none';
  const pending = state.pendingAgents.length ? state.pendingAgents.join(', ') : 'none';
  const blocked = state.blockedAgents.length ? state.blockedAgents.join(', ') : 'none';
  const lastCompleted = state.lastCompletedAgent || 'none';
  const proposed = state.proposedNextAgent || 'none';

  return [
    'EzReply Orchestrator Status',
    '',
    `Issue: ${state.currentIssue || 'not set'}`,
    `Loop Stage: ${state.currentLoopStage}`,
    `Approval Status: ${state.approvalStatus}`,
    `Last Completed Agent: ${lastCompleted}`,
    `Proposed Next Agent: ${proposed}`,
    `Completed Agents: ${completed}`,
    `Pending Agents: ${pending}`,
    `Blocked Agents: ${blocked}`,
    `Last Error: ${state.lastError || 'none'}`,
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

export const getWorkflowStatus = async (): Promise<WorkflowState> => loadWorkflowState();

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
  state.proposedSummary = params.resultSummary.filter((item) => item && item.trim()).slice(0, 10);
  state.approvalStatus = 'awaiting_approval';
  state.approvedAgent = null;
  state.lastApprovalCommand = null;
  state.lastError = null;
  state.timestamps.lastProposalAt = now;

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
    runContext: ReturnType<typeof buildRunContext>;
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

  const runContext = buildRunContext(state.proposedNextAgent);
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

export const handleTelegramWebhookUpdate = async (body: any): Promise<{
  handled: boolean;
  command?: string | null;
  response?: string;
}> => {
  const { chatId, text } = extractTelegramCommand(body);

  if (!text) {
    return { handled: false, command: null };
  }

  const allowedChatId = process.env.TELEGRAM_APPROVER_CHAT_ID;
  if (!allowedChatId || !chatId || chatId !== allowedChatId) {
    return { handled: false, command: text };
  }

  const state = await loadWorkflowState();
  const command = text.trim().toLowerCase();
  let response = '';

  if (command === '/status') {
    response = formatStatusMessage(state);
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (command === '/repeat') {
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

  if (command === '/cancel') {
    state.approvalStatus = 'cancelled';
    state.currentRunningAgent = null;
    state.approvedAgent = null;
    state.proposedNextAgent = null;
    state.proposedReason = null;
    state.proposedSummary = [];
    state.lastApprovalCommand = '/cancel';
    await saveWorkflowState(state);
    response = 'Workflow cancelled. Agent 0 must propose a new next step.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (command === '/reject') {
    state.approvalStatus = 'rejected';
    state.approvedAgent = null;
    state.lastApprovalCommand = '/reject';
    state.timestamps.lastRejectionAt = toIsoNow();
    await saveWorkflowState(state);
    response = 'Rejected. Agent 0 must propose another next agent.';
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  if (command.startsWith(APPROVE_PREFIX)) {
    const requestedAgentRaw = getApproveTarget(command);
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
    state.lastApprovalCommand = command;
    state.timestamps.lastApprovalAt = toIsoNow();
    state.lastError = null;
    await saveWorkflowState(state);

    response = `${requestedAgent} approved. Agent 0 can now claim and run the next step.`;
    await sendTelegramMessage(response);
    return { handled: true, command, response };
  }

  response = 'Unknown command. Use /approve <agent>, /reject, /status, /repeat, or /cancel.';
  await sendTelegramMessage(response);
  return { handled: true, command, response };
};

export const getAgentRegistry = () => listAgentDefinitions();
