import { AgentName } from './types';
import { ApprovalTarget, WorkflowStage } from './workflowModel';

export interface StageDefinition {
  id: WorkflowStage;
  type: 'single' | 'parallel' | 'terminal';
  agents: AgentName[];
  approvalTarget: ApprovalTarget | null;
  next: WorkflowStage | null;
}

export const STAGE_REGISTRY: Record<WorkflowStage, StageDefinition> = {
  stage_public_qa: {
    id: 'stage_public_qa',
    type: 'parallel',
    agents: ['agent1', 'agent2'],
    approvalTarget: 'group:stage_public_qa',
    next: 'stage_summary',
  },
  stage_summary: {
    id: 'stage_summary',
    type: 'single',
    agents: ['agent3'],
    approvalTarget: 'agent:agent3',
    next: 'stage_fix_design',
  },
  stage_fix_design: {
    id: 'stage_fix_design',
    type: 'parallel',
    agents: ['agent6', 'agent7', 'agent8'],
    approvalTarget: 'group:stage_fix_design',
    next: 'stage_patch_deploy',
  },
  stage_patch_deploy: {
    id: 'stage_patch_deploy',
    type: 'single',
    agents: ['agent9'],
    approvalTarget: 'agent:agent9',
    next: 'stage_validation',
  },
  stage_validation: {
    id: 'stage_validation',
    type: 'single',
    agents: ['agent12'],
    approvalTarget: 'agent:agent12',
    next: null,
  },
  stage_ai_simulation: {
    id: 'stage_ai_simulation',
    type: 'single',
    agents: ['agent5'],
    approvalTarget: 'agent:agent5',
    next: 'completed',
  },
  completed: {
    id: 'completed',
    type: 'terminal',
    agents: [],
    approvalTarget: null,
    next: null,
  },
};

export const getStageDefinition = (stage: WorkflowStage): StageDefinition => STAGE_REGISTRY[stage];

export const requiresAgent = (stage: WorkflowStage, agent: AgentName): boolean => {
  return getStageDefinition(stage).agents.includes(agent);
};
