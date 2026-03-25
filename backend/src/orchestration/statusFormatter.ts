import { getStageDefinition } from './stageRegistry';
import { AgentName } from './types';
import { WorkflowState } from './workflowModel';

const csvOrNone = (items: string[]): string => (items.length ? items.join(', ') : 'none');

export const formatStatusMessage = (state: WorkflowState): string => {
  const proposed = state.proposedNext ? state.proposedNext.target : 'none';
  const attempts = Object.entries(state.attempts || {})
    .map(([agent, count]) => `${agent}:${count}`)
    .join(', ');

  return [
    'EzReply Status',
    '',
    `Issue: ${state.issueId || 'none'}`,
    `CurrentStage: ${state.currentStage}`,
    `Status: ${state.status}`,
    `Approval: ${state.approvalStatus}`,
    `ProposedNext: ${proposed}`,
    `Completed: ${csvOrNone(state.completedAgents)}`,
    `Running: ${csvOrNone(state.runningAgents)}`,
    `Retryable: ${csvOrNone(state.retryableAgents)}`,
    `Stale: ${csvOrNone(state.staleAgents)}`,
    `Attempts: ${attempts || 'none'}`,
    `Blocked: ${csvOrNone(state.blockedAgents)}`,
    `Loop: ${state.loopCount}`,
    `Error: ${state.lastError || 'none'}`,
  ].join('\n');
};

export const formatApprovalMessage = (state: WorkflowState): string => {
  const pending = state.pendingApproval;
  const proposed = pending ? pending.target : 'none';
  const reason = pending ? pending.reason : 'none';

  return [
    'EzReply Approval Needed',
    '',
    'Issue:',
    state.issueId || 'none',
    '',
    'Current Stage:',
    state.currentStage,
    '',
    'Completed:',
    csvOrNone(state.completedAgents),
    '',
    'Proposed Next:',
    proposed,
    '',
    'Why:',
    reason,
    '',
    'Reply with:',
    `- /approve ${proposed}`,
    '- /reject',
    '- /repeat-run <agent>',
    '- /status',
    '- /cancel',
  ].join('\n');
};

const short = (value: string | null | undefined, max = 160): string => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) {
    return 'none';
  }
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
};

const requiredAgentsForCurrentStage = (state: WorkflowState): AgentName[] => {
  if (state.currentStage === 'stage_fix_design' && state.context.flags.fixDesignMode === 'single_agent_recovery') {
    return state.context.flags.recoveryAgent ? [state.context.flags.recoveryAgent] : [];
  }
  return getStageDefinition(state.currentStage).agents;
};

const stageCompletion = (state: WorkflowState): { done: number; total: number; completedAgents: AgentName[] } => {
  const required = requiredAgentsForCurrentStage(state);
  const completedAgents = required.filter((agent) => {
    const output = state.agentOutputs[agent];
    return Boolean(output && output.loopCount === state.loopCount);
  });
  return {
    done: completedAgents.length,
    total: required.length,
    completedAgents,
  };
};

const runningLeaseOwner = (state: WorkflowState): string => {
  const runningAgent = state.runningAgents[0];
  if (!runningAgent) {
    return 'none';
  }
  return state.leases[runningAgent]?.leaseOwner || 'none';
};

export const formatCompactStatusCard = (state: WorkflowState): string => {
  const running = csvOrNone(state.runningAgents);
  const pending = state.pendingApproval?.target || state.proposedNext?.target || 'none';
  const progress = stageCompletion(state);
  const completed = progress.completedAgents.length ? progress.completedAgents.join(', ') : 'none';
  const nextReason = short(state.pendingApproval?.reason || state.proposedNext?.reason || 'none', 100);
  return [
    `Status: ${state.status}`,
    `Stage: ${state.currentStage}`,
    `Running: ${running}`,
    `LeaseOwner: ${runningLeaseOwner(state)}`,
    `CompletedThisStage: ${progress.done}/${progress.total}`,
    `CompletedAgents: ${completed}`,
    `LastCompleted: ${state.lastCompletedAgent || 'none'}`,
    `Pending: ${pending}`,
    `NextReason: ${nextReason}`,
    `Error: ${short(state.lastError, 120)}`,
  ].join('\n');
};

export const formatCompactApprovalCard = (state: WorkflowState): string => {
  const pending = state.pendingApproval;
  const issue = short(state.issueId, 80);
  const target = pending?.target || 'none';
  const reason = short(pending?.reason || 'none', 140);
  const progress = stageCompletion(state);
  const completed = progress.completedAgents.length ? progress.completedAgents.join(', ') : 'none';
  return [
    'Approval needed',
    `Issue: ${issue}`,
    `Stage: ${state.currentStage}`,
    `CompletedThisStage: ${progress.done}/${progress.total}`,
    `CompletedAgents: ${completed}`,
    `LastCompleted: ${state.lastCompletedAgent || 'none'}`,
    `Target: ${target}`,
    `Reason: ${reason}`,
  ].join('\n');
};
