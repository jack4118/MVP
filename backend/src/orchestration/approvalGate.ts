import { ApprovalTarget, WorkflowState } from './workflowModel';

const toIsoNow = (): string => new Date().toISOString();

export const clearApprovalState = (state: WorkflowState): void => {
  state.pendingApproval = null;
  state.proposedNext = null;
  state.approvalStatus = 'idle';
};

export const setPendingApproval = (
  state: WorkflowState,
  params: { target: ApprovalTarget; reason: string }
): void => {
  const now = toIsoNow();
  state.pendingApproval = {
    target: params.target,
    reason: params.reason,
    stage: state.currentStage,
    requestedAt: now,
  };
  state.proposedNext = {
    target: params.target,
    reason: params.reason,
    stage: state.currentStage,
    requiredAgents: [],
  };
  state.approvalStatus = 'pending';
  state.status = 'waiting_approval';
  state.timestamps.lastProposalAt = now;
};

export const approvePendingTarget = (state: WorkflowState, target: ApprovalTarget): void => {
  if (state.approvalStatus !== 'pending' || !state.pendingApproval) {
    throw new Error(`Cannot approve now. Current approval status is ${state.approvalStatus}.`);
  }

  if (state.pendingApproval.target !== target) {
    throw new Error(`Invalid approve target. Pending target is ${state.pendingApproval.target}.`);
  }

  state.approvalStatus = 'approved';
  state.status = 'running';
  state.timestamps.lastApprovalAt = toIsoNow();
};

export const rejectPendingTarget = (state: WorkflowState): void => {
  state.approvalStatus = 'rejected';
  state.status = 'blocked';
  state.timestamps.lastRejectionAt = toIsoNow();
};

export const cancelWorkflow = (state: WorkflowState): void => {
  state.approvalStatus = 'idle';
  state.pendingApproval = null;
  state.proposedNext = null;
  state.runningAgents = [];
  state.currentRunningAgent = null;
  state.status = 'cancelled';
};
