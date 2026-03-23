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

export interface AgentExecutionResult {
  agent: AgentName;
  status: 'PASS' | 'FAIL' | 'OK';
  summary: string[];
  artifacts: string[];
  loopCount: number;
  rawOutput?: unknown;
  completedAt: string;
}
