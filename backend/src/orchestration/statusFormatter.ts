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

export const formatCompactStatusCard = (state: WorkflowState): string => {
  const running = csvOrNone(state.runningAgents);
  const pending = state.pendingApproval?.target || state.proposedNext?.target || 'none';
  return [
    `Status: ${state.status}`,
    `Stage: ${state.currentStage}`,
    `Running: ${running}`,
    `Pending: ${pending}`,
    `Error: ${short(state.lastError, 120)}`,
  ].join('\n');
};

export const formatCompactApprovalCard = (state: WorkflowState): string => {
  const pending = state.pendingApproval;
  const issue = short(state.issueId, 80);
  const target = pending?.target || 'none';
  const reason = short(pending?.reason || 'none', 140);
  return ['Approval needed', `Issue: ${issue}`, `Stage: ${state.currentStage}`, `Target: ${target}`, `Reason: ${reason}`].join(
    '\n'
  );
};
