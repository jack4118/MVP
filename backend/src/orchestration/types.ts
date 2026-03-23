export type AgentName =
  | 'agent0'
  | 'agent1'
  | 'agent2'
  | 'agent3'
  | 'agent5'
  | 'agent6'
  | 'agent7'
  | 'agent8'
  | 'agent9'
  | 'agent12';

export interface AgentDefinition {
  name: AgentName;
  displayName: string;
  role: string;
  allowedActions: string[];
  forbiddenActions: string[];
  requiredInputs: string[];
  expectedOutputs: string[];
  requiresApprovalBeforeRun: boolean;
  enforceStaging: boolean;
}

export type ApprovalStatus =
  | 'idle'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'blocked_webhook'
  | 'in_progress';

export interface WorkflowState {
  currentIssue: string | null;
  currentLoopStage: string;
  lastCompletedAgent: AgentName | null;
  currentRunningAgent: AgentName | null;
  proposedNextAgent: AgentName | null;
  proposedReason: string | null;
  proposedSummary: string[];
  approvalStatus: ApprovalStatus;
  approvedAgent: AgentName | null;
  completedAgents: AgentName[];
  pendingAgents: AgentName[];
  blockedAgents: AgentName[];
  lastTelegramMessageId: number | null;
  lastApprovalCommand: string | null;
  lastError: string | null;
  timestamps: {
    createdAt: string;
    updatedAt: string;
    lastProposalAt: string | null;
    lastApprovalAt: string | null;
    lastRejectionAt: string | null;
    lastWebhookFailureAt: string | null;
  };
}

export interface TelegramSendResult {
  ok: boolean;
  messageId: number | null;
  error?: string;
}

export interface RunContext {
  agent: AgentName;
  stagingUrl: string | null;
  enforceMobileTesting: boolean;
  deployTargets: {
    frontend: string | null;
    backend: string | null;
  };
  placeholders: {
    whatsappTemplateToken: string | null;
    phoneNumberId: string | null;
    wabaId: string | null;
    testPhone: string | null;
  };
  constraints: string[];
}
