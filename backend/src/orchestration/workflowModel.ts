import { AgentExecutionResult, AgentName } from './types';

export type WorkflowStatus = 'idle' | 'running' | 'waiting_approval' | 'blocked' | 'completed' | 'cancelled';
export type ExecutionFailureReason = 'execution_timeout' | 'lease_expired' | 'worker_interrupted' | 'retry_exhausted';

export type WorkflowStage =
  | 'stage_public_qa'
  | 'stage_summary'
  | 'stage_fix_design'
  | 'stage_patch_deploy'
  | 'stage_validation'
  | 'stage_ai_simulation'
  | 'completed';

export type ApprovalStatus = 'idle' | 'pending' | 'approved' | 'rejected';

export type ApprovalTarget =
  | 'group:stage_public_qa'
  | 'group:stage_fix_design'
  | 'agent:agent3'
  | 'agent:agent5'
  | 'agent:agent6'
  | 'agent:agent7'
  | 'agent:agent8'
  | 'agent:agent9'
  | 'agent:agent12';

export interface ProposedNext {
  target: ApprovalTarget;
  reason: string;
  stage: WorkflowStage;
  requiredAgents: AgentName[];
}

export interface PendingApproval {
  approvalId: string;
  target: ApprovalTarget;
  reason: string;
  stage: WorkflowStage;
  requestedAt: string;
}

export interface TransitionLogEntry {
  fromStage: WorkflowStage;
  toStage: WorkflowStage;
  trigger: string;
  proposedNext: ApprovalTarget | null;
  approvalStatus: ApprovalStatus;
  operatorCommand: string | null;
  timestamp: string;
}

export interface WorkflowContext {
  reports: Partial<Record<AgentName, string[]>>;
  validationResult: {
    status: 'PASS' | 'FAIL' | 'OK';
    summary: string[];
    classification?: 'product' | 'ux' | 'ai_policy' | 'environment' | 'unknown';
  } | null;
  deployStatus: {
    success: boolean;
    stagingReady: boolean;
    summary: string[];
  } | null;
  classification: {
    type: 'product' | 'ux' | 'ai_policy' | 'environment' | 'unknown';
    routedAgent: 'agent6' | 'agent7' | 'agent8' | null;
    source: 'validator' | 'fallback';
  } | null;
  flags: {
    aiPolicyChanged: boolean;
    operatorRequestedAgent5: boolean;
    releaseReadinessRequiresSimulation: boolean;
    fixDesignMode: 'parallel' | 'single_agent_recovery';
    recoveryAgent: 'agent6' | 'agent7' | 'agent8' | null;
  };
}

export interface WorkflowTimestamps {
  createdAt: string;
  updatedAt: string;
  lastProposalAt: string | null;
  lastApprovalAt: string | null;
  lastRejectionAt: string | null;
  lastWebhookFailureAt: string | null;
}

export interface AgentExecutionLease {
  agentName: AgentName;
  leaseOwner: string;
  startedAt: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
  attemptNumber: number;
}

export interface WorkflowState {
  schemaVersion: number;
  issueId: string;
  status: WorkflowStatus;
  currentStage: WorkflowStage;
  loopCount: number;

  completedAgents: AgentName[];
  runningAgents: AgentName[];
  failedAgents: AgentName[];
  blockedAgents: AgentName[];
  staleAgents: AgentName[];
  retryableAgents: AgentName[];

  proposedNext: ProposedNext | null;
  pendingApproval: PendingApproval | null;
  approvalStatus: ApprovalStatus;
  approvalMessageId: number | null;

  lastTransitionAt: string;
  transitionLog: TransitionLogEntry[];

  context: WorkflowContext;
  agentOutputs: Partial<Record<AgentName, AgentExecutionResult>>;
  attempts: Partial<Record<AgentName, number>>;
  leases: Partial<Record<AgentName, AgentExecutionLease>>;
  lastExecutionFailureReason: Partial<Record<AgentName, ExecutionFailureReason>>;

  // Legacy compatibility surface (deprecated)
  currentIssue: string | null;
  currentLoopStage: string;
  lastCompletedAgent: AgentName | null;
  currentRunningAgent: AgentName | null;
  proposedNextAgent: AgentName | null;
  proposedReason: string | null;
  proposedSummary: string[];
  approvedAgent: AgentName | null;
  pendingAgents: AgentName[];
  autoMode: boolean;
  nextAction: string | null;
  checkpointPolicy: 'critical_only' | 'all_steps';
  autoRunStatus: 'idle' | 'running' | 'awaiting_approval' | 'stopped' | 'done' | 'failed';
  lastTelegramMessageId: number | null;
  lastApprovalCommand: string | null;
  lastError: string | null;
  timestamps: WorkflowTimestamps;
}

export interface RunnableAction {
  type: 'run_agent' | 'run_parallel' | 'idle';
  agents: AgentName[];
  reason: string;
}
