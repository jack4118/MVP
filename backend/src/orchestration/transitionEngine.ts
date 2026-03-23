import { classifyValidationFailure } from './classification';
import { getStageDefinition } from './stageRegistry';
import { AgentName } from './types';
import { appendTransitionLog } from './transitionLogger';
import { ApprovalTarget, ProposedNext, RunnableAction, WorkflowStage, WorkflowState } from './workflowModel';

const toIsoNow = (): string => new Date().toISOString();

const completedThisLoop = (state: WorkflowState, agent: AgentName): boolean => {
  const output = state.agentOutputs[agent];
  return Boolean(output && output.loopCount === state.loopCount);
};

const requiredAgentsForStage = (state: WorkflowState, stage: WorkflowStage): AgentName[] => {
  if (
    stage === 'stage_fix_design' &&
    state.context.flags.fixDesignMode === 'single_agent_recovery' &&
    state.context.flags.recoveryAgent
  ) {
    return [state.context.flags.recoveryAgent];
  }

  return getStageDefinition(stage).agents;
};

const toAgentTarget = (agent: AgentName): ApprovalTarget => `agent:${agent}` as ApprovalTarget;

const shouldRunAiSimulation = (state: WorkflowState): boolean => {
  return Boolean(
    state.context.flags.aiPolicyChanged ||
      state.context.flags.operatorRequestedAgent5 ||
      state.context.flags.releaseReadinessRequiresSimulation
  );
};

export const getMissingAgents = (state: WorkflowState, stage: WorkflowStage): AgentName[] => {
  return requiredAgentsForStage(state, stage).filter((agent) => !completedThisLoop(state, agent));
};

export const isStageComplete = (state: WorkflowState, stage: WorkflowStage): boolean => {
  if (stage === 'completed') {
    return true;
  }

  const missing = getMissingAgents(state, stage);
  if (missing.length > 0) {
    return false;
  }

  if (stage === 'stage_patch_deploy') {
    return Boolean(state.context.deployStatus?.success && state.context.deployStatus?.stagingReady);
  }

  if (stage === 'stage_validation') {
    return completedThisLoop(state, 'agent12');
  }

  return true;
};

const transitionToStage = (state: WorkflowState, toStage: WorkflowStage, trigger: string): void => {
  const from = state.currentStage;
  state.currentStage = toStage;
  state.currentLoopStage = toStage;
  appendTransitionLog(state, {
    fromStage: from,
    toStage,
    trigger,
    proposedNext: state.proposedNext?.target || null,
    approvalStatus: state.approvalStatus,
    operatorCommand: state.lastApprovalCommand,
  });
};

export const evaluateState = (state: WorkflowState): void => {
  let advanced = true;

  while (advanced) {
    advanced = false;

    if (state.status === 'cancelled' || state.status === 'blocked' || state.status === 'completed') {
      return;
    }

    if (!isStageComplete(state, state.currentStage)) {
      return;
    }

    if (state.currentStage === 'stage_public_qa') {
      transitionToStage(state, 'stage_summary', 'all_required_agents_completed');
      advanced = true;
      continue;
    }

    if (state.currentStage === 'stage_summary') {
      state.context.flags.fixDesignMode = 'parallel';
      state.context.flags.recoveryAgent = null;
      transitionToStage(state, 'stage_fix_design', 'stage_summary_completed');
      advanced = true;
      continue;
    }

    if (state.currentStage === 'stage_fix_design') {
      transitionToStage(state, 'stage_patch_deploy', 'all_required_agents_completed');
      advanced = true;
      continue;
    }

    if (state.currentStage === 'stage_patch_deploy') {
      transitionToStage(state, 'stage_validation', 'deploy_success_and_staging_ready');
      advanced = true;
      continue;
    }

    if (state.currentStage === 'stage_validation') {
      const validationOutput = state.agentOutputs.agent12;
      if (!validationOutput || validationOutput.loopCount !== state.loopCount) {
        return;
      }

      if (validationOutput.status === 'PASS') {
        if (shouldRunAiSimulation(state)) {
          transitionToStage(state, 'stage_ai_simulation', 'validation_pass_requires_simulation');
        } else {
          transitionToStage(state, 'completed', 'validation_pass');
          state.status = 'completed';
          state.approvalStatus = 'idle';
          state.pendingApproval = null;
          state.proposedNext = null;
        }
        advanced = true;
        continue;
      }

      const classification = classifyValidationFailure(validationOutput);
      state.context.validationResult = {
        status: validationOutput.status,
        summary: validationOutput.summary || [],
        classification: classification.type,
      };
      state.context.classification = classification;

      if (classification.type === 'environment' || !classification.routedAgent) {
        state.status = 'blocked';
        state.lastError = 'Validator reported environment/manual intervention issue.';
        state.blockedAgents = ['agent6', 'agent7', 'agent8'];
        return;
      }

      state.loopCount += 1;
      state.context.flags.fixDesignMode = 'single_agent_recovery';
      state.context.flags.recoveryAgent = classification.routedAgent;
      transitionToStage(state, 'stage_fix_design', `validation_fail_route_${classification.type}`);
      advanced = true;
      continue;
    }

    if (state.currentStage === 'stage_ai_simulation') {
      transitionToStage(state, 'completed', 'ai_simulation_completed');
      state.status = 'completed';
      state.approvalStatus = 'idle';
      state.pendingApproval = null;
      state.proposedNext = null;
      advanced = true;
    }
  }
};

const currentStageTarget = (state: WorkflowState): ApprovalTarget | null => {
  if (state.currentStage === 'completed') {
    return null;
  }

  if (state.currentStage === 'stage_fix_design' && state.context.flags.fixDesignMode === 'single_agent_recovery') {
    if (!state.context.flags.recoveryAgent) {
      return null;
    }
    return toAgentTarget(state.context.flags.recoveryAgent);
  }

  return getStageDefinition(state.currentStage).approvalTarget;
};

export const determineProposedNext = (state: WorkflowState): ProposedNext | null => {
  if (state.status === 'completed' || state.status === 'cancelled' || state.status === 'blocked') {
    return null;
  }

  const target = currentStageTarget(state);
  if (!target) {
    return null;
  }

  const required = target.startsWith('group:')
    ? requiredAgentsForStage(state, state.currentStage)
    : target.startsWith('agent:')
      ? [target.replace('agent:', '') as AgentName]
      : [];

  return {
    target,
    stage: state.currentStage,
    requiredAgents: required,
    reason: `Execute required work for ${state.currentStage}`,
  };
};

export const canProposeNextStage = (state: WorkflowState): boolean => {
  return (
    state.runningAgents.length === 0 &&
    state.approvalStatus === 'idle' &&
    !state.pendingApproval &&
    state.status !== 'completed' &&
    state.status !== 'cancelled' &&
    state.status !== 'blocked'
  );
};

export const canExecuteApprovedTarget = (state: WorkflowState, target: ApprovalTarget): boolean => {
  if (state.approvalStatus !== 'approved' || !state.pendingApproval) {
    return false;
  }
  if (state.pendingApproval.target !== target) {
    return false;
  }
  if (state.runningAgents.length > 0) {
    return false;
  }
  if (state.status !== 'running' && state.status !== 'waiting_approval') {
    return false;
  }

  const expected = currentStageTarget(state);
  return expected === target;
};

export const runnableActionForTarget = (state: WorkflowState, target: ApprovalTarget): RunnableAction => {
  if (target === 'group:stage_public_qa' || target === 'group:stage_fix_design') {
    const agents = getMissingAgents(state, state.currentStage).filter((agent) => !state.runningAgents.includes(agent));
    if (agents.length === 0) {
      return { type: 'idle', agents: [], reason: 'target already complete' };
    }
    return { type: 'run_parallel', agents, reason: `${state.currentStage} parallel execution` };
  }

  const agent = target.replace('agent:', '') as AgentName;
  if (state.runningAgents.includes(agent)) {
    return { type: 'idle', agents: [], reason: `${agent} already running` };
  }
  if (completedThisLoop(state, agent)) {
    return { type: 'idle', agents: [], reason: `${agent} already completed` };
  }

  return { type: 'run_agent', agents: [agent], reason: `${agent} approved for ${state.currentStage}` };
};

export const updateLegacyProjection = (state: WorkflowState): void => {
  state.currentIssue = state.issueId;
  state.currentLoopStage = state.currentStage;
  state.currentRunningAgent = state.runningAgents[0] || null;
  state.lastTelegramMessageId = state.approvalMessageId;
  state.proposedNextAgent = state.proposedNext?.target.startsWith('agent:')
    ? (state.proposedNext.target.replace('agent:', '') as AgentName)
    : null;
  state.proposedReason = state.proposedNext?.reason || null;
  state.proposedSummary = [];
  state.pendingAgents = (['agent1', 'agent2', 'agent3', 'agent5', 'agent6', 'agent7', 'agent8', 'agent9', 'agent12'] as AgentName[])
    .filter((agent) => !state.completedAgents.includes(agent));
  state.autoMode = true;
  state.nextAction = state.proposedNext?.target || null;
  state.autoRunStatus =
    state.status === 'completed'
      ? 'done'
      : state.status === 'cancelled'
        ? 'stopped'
        : state.status === 'blocked'
          ? 'failed'
          : state.status === 'waiting_approval'
            ? 'awaiting_approval'
            : 'running';
  state.timestamps.updatedAt = toIsoNow();
};
