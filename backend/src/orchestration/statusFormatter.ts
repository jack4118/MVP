import { WorkflowState } from './workflowModel';

const csvOrNone = (items: string[]): string => (items.length ? items.join(', ') : 'none');

export const formatStatusMessage = (state: WorkflowState): string => {
  const proposed = state.proposedNext ? state.proposedNext.target : 'none';

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
    '- /status',
    '- /cancel',
  ].join('\n');
};
