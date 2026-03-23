import { AgentName } from './types';
import { WorkflowStage } from './workflowModel';

interface AgentPolicy {
  allowed: string[];
  forbidden: string[];
  stages: WorkflowStage[];
}

const POLICY: Record<AgentName, AgentPolicy> = {
  agent0: {
    allowed: ['orchestrate', 'validate_state', 'request_approval'],
    forbidden: ['execute_agent_work'],
    stages: [],
  },
  agent1: {
    allowed: ['analyze_public'],
    forbidden: ['patch_code', 'deploy', 'redefine_strategy'],
    stages: ['stage_public_qa'],
  },
  agent2: {
    allowed: ['analyze_workspace'],
    forbidden: ['patch_code', 'deploy', 'redefine_strategy'],
    stages: ['stage_public_qa'],
  },
  agent3: {
    allowed: ['summarize_and_prioritize'],
    forbidden: ['patch_code', 'deploy'],
    stages: ['stage_summary'],
  },
  agent5: {
    allowed: ['simulate_customer_conversations'],
    forbidden: ['patch_code', 'deploy'],
    stages: ['stage_ai_simulation'],
  },
  agent6: {
    allowed: ['design_product_fix'],
    forbidden: ['patch_code', 'deploy', 'rewrite_ai_policy'],
    stages: ['stage_fix_design'],
  },
  agent7: {
    allowed: ['design_ux_fix'],
    forbidden: ['patch_code', 'deploy'],
    stages: ['stage_fix_design'],
  },
  agent8: {
    allowed: ['define_ai_policy'],
    forbidden: ['patch_code', 'deploy', 'redesign_workflow_routing'],
    stages: ['stage_fix_design'],
  },
  agent9: {
    allowed: ['patch_code', 'build', 'deploy'],
    forbidden: ['redefine_product_strategy'],
    stages: ['stage_patch_deploy'],
  },
  agent12: {
    allowed: ['validate_staging'],
    forbidden: ['patch_code', 'redesign_strategy'],
    stages: ['stage_validation'],
  },
};

export const getAgentPolicy = (agent: AgentName): AgentPolicy => POLICY[agent];

export const isAgentLegalForStage = (agent: AgentName, stage: WorkflowStage): boolean => {
  if (agent === 'agent0') {
    return false;
  }
  return POLICY[agent].stages.includes(stage);
};

export const assertAgentRoleAction = (agent: AgentName, action: string): void => {
  const policy = POLICY[agent];
  if (!policy) {
    throw new Error(`Unknown agent policy: ${agent}`);
  }

  if (!policy.allowed.includes(action)) {
    throw new Error(`${agent} is not allowed to perform action: ${action}`);
  }
};
