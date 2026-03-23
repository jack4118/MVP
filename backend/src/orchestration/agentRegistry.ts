import { AgentDefinition, AgentName } from './types';

export const ALL_AGENT_NAMES: AgentName[] = [
  'agent0',
  'agent1',
  'agent2',
  'agent3',
  'agent5',
  'agent6',
  'agent7',
  'agent8',
  'agent9',
  'agent12',
];

const registry: Record<AgentName, AgentDefinition> = {
  agent0: {
    name: 'agent0',
    displayName: 'Agent 0',
    role: 'Orchestrator and controller',
    allowedActions: [
      'Manage workflow state',
      'Propose next agent',
      'Send Telegram approval request',
      'Wait for approval before progression',
    ],
    forbiddenActions: [
      'Auto-run next agent without approval',
      'Skip registry validation',
    ],
    requiredInputs: ['Current workflow state', 'Latest completed agent output'],
    expectedOutputs: ['Approval request', 'Validated next agent proposal'],
    requiresApprovalBeforeRun: false,
    enforceStaging: false,
  },
  agent1: {
    name: 'agent1',
    displayName: 'Agent 1',
    role: 'Public QA',
    allowedActions: ['Analyze public flows', 'Report QA findings from staging'],
    forbiddenActions: ['Patch code directly', 'Deploy infrastructure'],
    requiredInputs: ['Issue statement', 'Staging URL'],
    expectedOutputs: ['QA report', 'Prioritized defects list'],
    requiresApprovalBeforeRun: true,
    enforceStaging: true,
  },
  agent2: {
    name: 'agent2',
    displayName: 'Agent 2',
    role: 'App and workspace QA',
    allowedActions: ['Analyze app/workspace behaviors on staging'],
    forbiddenActions: ['Patch code directly', 'Redefine product strategy'],
    requiredInputs: ['Issue statement', 'Staging URL'],
    expectedOutputs: ['Workspace QA report', 'Repro steps'],
    requiresApprovalBeforeRun: true,
    enforceStaging: true,
  },
  agent3: {
    name: 'agent3',
    displayName: 'Agent 3',
    role: 'Summary generator',
    allowedActions: ['Summarize findings and decisions'],
    forbiddenActions: ['Patch code directly', 'Deploy'],
    requiredInputs: ['Previous agent outputs'],
    expectedOutputs: ['Concise synthesis and recommended branch'],
    requiresApprovalBeforeRun: true,
    enforceStaging: false,
  },
  agent5: {
    name: 'agent5',
    displayName: 'Agent 5',
    role: 'Real customer simulator',
    allowedActions: ['Simulate customer journeys on staging', 'Stress test user-facing reliability'],
    forbiddenActions: ['Patch code directly', 'Deploy'],
    requiredInputs: ['Staging URL', 'WhatsApp testing placeholders'],
    expectedOutputs: ['Simulation findings', 'Failure patterns and evidence'],
    requiresApprovalBeforeRun: true,
    enforceStaging: true,
  },
  agent6: {
    name: 'agent6',
    displayName: 'Agent 6',
    role: 'Product fix designer',
    allowedActions: ['Design product fixes', 'Define change plan and acceptance criteria'],
    forbiddenActions: ['Patch code directly', 'Deploy'],
    requiredInputs: ['Validated findings', 'Product constraints'],
    expectedOutputs: ['Product fix design', 'Implementation requirements'],
    requiresApprovalBeforeRun: true,
    enforceStaging: false,
  },
  agent7: {
    name: 'agent7',
    displayName: 'Agent 7',
    role: 'UX and conversion fix designer',
    allowedActions: ['Design UX/conversion improvements', 'Specify UX acceptance criteria'],
    forbiddenActions: ['Patch code directly', 'Deploy'],
    requiredInputs: ['User journey findings', 'Conversion goals'],
    expectedOutputs: ['UX fix specification', 'Copy and flow recommendations'],
    requiresApprovalBeforeRun: true,
    enforceStaging: false,
  },
  agent8: {
    name: 'agent8',
    displayName: 'Agent 8',
    role: 'AI policy builder',
    allowedActions: ['Design AI policy and governance constraints'],
    forbiddenActions: ['Deploy', 'Execute runtime code patches'],
    requiredInputs: ['AI behavior findings', 'Compliance constraints'],
    expectedOutputs: ['Policy specification', 'Safety guardrail checklist'],
    requiresApprovalBeforeRun: true,
    enforceStaging: false,
  },
  agent9: {
    name: 'agent9',
    displayName: 'Agent 9',
    role: 'Patch, build, and deploy executor',
    allowedActions: ['Patch code', 'Build artifacts', 'Deploy to target environment'],
    forbiddenActions: ['Redefine product strategy', 'Override approved scope'],
    requiredInputs: ['Approved implementation scope', 'Technical design outputs'],
    expectedOutputs: ['Code changes', 'Build/deploy status', 'Release notes'],
    requiresApprovalBeforeRun: true,
    enforceStaging: false,
  },
  agent12: {
    name: 'agent12',
    displayName: 'Agent 12',
    role: 'Staging validator',
    allowedActions: ['Validate fixes on staging', 'Confirm regressions are absent'],
    forbiddenActions: ['Propose product redesign', 'Deploy'],
    requiredInputs: ['Staging URL', 'Test placeholders', 'Acceptance criteria'],
    expectedOutputs: ['Validation report', 'Pass/fail summary'],
    requiresApprovalBeforeRun: true,
    enforceStaging: true,
  },
};

export const normalizeAgentName = (value: string): AgentName | null => {
  const normalized = value.trim().toLowerCase();
  if ((ALL_AGENT_NAMES as string[]).includes(normalized)) {
    return normalized as AgentName;
  }
  return null;
};

export const getAgentDefinition = (name: AgentName): AgentDefinition => registry[name];

export const listAgentDefinitions = (): AgentDefinition[] => ALL_AGENT_NAMES.map((agent) => registry[agent]);

export const validateAgentTransition = (proposed: AgentName): { ok: boolean; reason?: string } => {
  const agent = registry[proposed];
  if (!agent) {
    return { ok: false, reason: `Unknown agent: ${proposed}` };
  }

  if (!agent.requiresApprovalBeforeRun) {
    return { ok: false, reason: `${agent.displayName} is not an approval-gated execution target` };
  }

  return { ok: true };
};
