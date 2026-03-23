import { ApprovalStatus, ApprovalTarget, TransitionLogEntry, WorkflowStage, WorkflowState } from './workflowModel';

const TRANSITION_LOG_LIMIT = 500;

export const appendTransitionLog = (
  state: WorkflowState,
  params: {
    fromStage: WorkflowStage;
    toStage: WorkflowStage;
    trigger: string;
    proposedNext: ApprovalTarget | null;
    approvalStatus: ApprovalStatus;
    operatorCommand?: string | null;
  }
): void => {
  const entry: TransitionLogEntry = {
    fromStage: params.fromStage,
    toStage: params.toStage,
    trigger: params.trigger,
    proposedNext: params.proposedNext,
    approvalStatus: params.approvalStatus,
    operatorCommand: params.operatorCommand || null,
    timestamp: new Date().toISOString(),
  };

  state.transitionLog = [...state.transitionLog, entry].slice(-TRANSITION_LOG_LIMIT);
  state.lastTransitionAt = entry.timestamp;
};
