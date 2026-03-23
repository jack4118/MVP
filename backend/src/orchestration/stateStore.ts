import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { AgentName } from './types';
import { WorkflowState } from './workflowModel';

const STATE_PATH = process.env.EZR_WORKFLOW_STATE_PATH
  ? path.resolve(process.env.EZR_WORKFLOW_STATE_PATH)
  : path.resolve(process.cwd(), 'data', 'ezr-workflow-state.json');

const nowIso = (): string => new Date().toISOString();

const ALL_EXEC_AGENTS: AgentName[] = ['agent1', 'agent2', 'agent3', 'agent5', 'agent6', 'agent7', 'agent8', 'agent9', 'agent12'];

export const WORKFLOW_SCHEMA_VERSION = 2;

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const normalizeStage = (value: unknown): WorkflowState['currentStage'] => {
  const raw = String(value || '');
  if (
    raw === 'stage_public_qa' ||
    raw === 'stage_summary' ||
    raw === 'stage_fix_design' ||
    raw === 'stage_patch_deploy' ||
    raw === 'stage_validation' ||
    raw === 'stage_ai_simulation' ||
    raw === 'completed'
  ) {
    return raw;
  }
  return 'stage_public_qa';
};

export const createDefaultState = (): WorkflowState => {
  const now = nowIso();
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    issueId: '',
    status: 'idle',
    currentStage: 'stage_public_qa',
    loopCount: 1,
    completedAgents: [],
    runningAgents: [],
    failedAgents: [],
    blockedAgents: [],
    proposedNext: null,
    pendingApproval: null,
    approvalStatus: 'idle',
    approvalMessageId: null,
    lastTransitionAt: now,
    transitionLog: [],
    context: {
      reports: {},
      validationResult: null,
      deployStatus: null,
      classification: null,
      flags: {
        aiPolicyChanged: false,
        operatorRequestedAgent5: false,
        releaseReadinessRequiresSimulation: false,
        fixDesignMode: 'parallel',
        recoveryAgent: null,
      },
    },
    agentOutputs: {},
    currentIssue: null,
    currentLoopStage: 'stage_public_qa',
    lastCompletedAgent: null,
    currentRunningAgent: null,
    proposedNextAgent: null,
    proposedReason: null,
    proposedSummary: [],
    approvedAgent: null,
    pendingAgents: [...ALL_EXEC_AGENTS],
    autoMode: true,
    nextAction: null,
    checkpointPolicy: 'critical_only',
    autoRunStatus: 'idle',
    lastTelegramMessageId: null,
    lastApprovalCommand: null,
    lastError: null,
    timestamps: {
      createdAt: now,
      updatedAt: now,
      lastProposalAt: null,
      lastApprovalAt: null,
      lastRejectionAt: null,
      lastWebhookFailureAt: null,
    },
  };
};

const ensureStateDir = async (): Promise<void> => {
  const dir = path.dirname(STATE_PATH);
  await mkdir(dir, { recursive: true });
};

export const getStatePath = (): string => STATE_PATH;

const migrateLegacyState = (parsed: Record<string, unknown>): WorkflowState => {
  const base = createDefaultState();
  const now = nowIso();
  const completedAgents = Array.isArray(parsed.completedAgents) ? (parsed.completedAgents as AgentName[]) : [];
  const blockedAgents = Array.isArray(parsed.blockedAgents) ? (parsed.blockedAgents as AgentName[]) : [];
  const issueId = String(parsed.issueId || parsed.currentIssue || '');
  const currentStage = normalizeStage(parsed.currentStage || parsed.currentLoopStage);

  return {
    ...base,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    issueId,
    status: (parsed.status as WorkflowState['status']) || 'idle',
    currentStage,
    loopCount: Number(parsed.loopCount || 1),
    completedAgents: unique(completedAgents),
    runningAgents: [],
    failedAgents: Array.isArray(parsed.failedAgents) ? unique(parsed.failedAgents as AgentName[]) : [],
    blockedAgents: unique(blockedAgents),
    proposedNext:
      parsed.proposedNext && typeof parsed.proposedNext === 'object'
        ? (parsed.proposedNext as WorkflowState['proposedNext'])
        : null,
    pendingApproval:
      parsed.pendingApproval && typeof parsed.pendingApproval === 'object'
        ? (parsed.pendingApproval as WorkflowState['pendingApproval'])
        : null,
    approvalStatus: (parsed.approvalStatus as WorkflowState['approvalStatus']) || 'idle',
    approvalMessageId: Number(parsed.approvalMessageId || parsed.lastTelegramMessageId || 0) || null,
    lastTransitionAt: String(parsed.lastTransitionAt || now),
    transitionLog: Array.isArray(parsed.transitionLog) ? (parsed.transitionLog as WorkflowState['transitionLog']) : [],
    context:
      parsed.context && typeof parsed.context === 'object'
        ? ({ ...base.context, ...(parsed.context as WorkflowState['context']) } as WorkflowState['context'])
        : base.context,
    agentOutputs:
      parsed.agentOutputs && typeof parsed.agentOutputs === 'object'
        ? (parsed.agentOutputs as WorkflowState['agentOutputs'])
        : {},
    currentIssue: issueId || null,
    currentLoopStage: currentStage,
    lastCompletedAgent: (parsed.lastCompletedAgent as AgentName) || null,
    currentRunningAgent: (parsed.currentRunningAgent as AgentName) || null,
    proposedNextAgent: (parsed.proposedNextAgent as AgentName) || null,
    proposedReason: (parsed.proposedReason as string) || null,
    proposedSummary: Array.isArray(parsed.proposedSummary) ? (parsed.proposedSummary as string[]) : [],
    approvedAgent: (parsed.approvedAgent as AgentName) || null,
    pendingAgents: ALL_EXEC_AGENTS.filter((agent) => !completedAgents.includes(agent)),
    autoMode: parsed.autoMode === undefined ? true : Boolean(parsed.autoMode),
    nextAction: (parsed.nextAction as string) || null,
    checkpointPolicy: parsed.checkpointPolicy === 'all_steps' ? 'all_steps' : 'critical_only',
    autoRunStatus: (parsed.autoRunStatus as WorkflowState['autoRunStatus']) || 'idle',
    lastTelegramMessageId: Number(parsed.lastTelegramMessageId || 0) || null,
    lastApprovalCommand: (parsed.lastApprovalCommand as string) || null,
    lastError: (parsed.lastError as string) || null,
    timestamps: {
      ...base.timestamps,
      ...(parsed.timestamps as WorkflowState['timestamps'] | undefined),
      updatedAt: now,
    },
  };
};

export const normalizeWorkflowState = (state: WorkflowState): WorkflowState => {
  const normalized: WorkflowState = {
    ...state,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    issueId: state.issueId || state.currentIssue || '',
    currentStage: normalizeStage(state.currentStage || state.currentLoopStage),
    completedAgents: unique(state.completedAgents || []),
    runningAgents: unique(state.runningAgents || []),
    failedAgents: unique(state.failedAgents || []),
    blockedAgents: unique(state.blockedAgents || []),
    loopCount: Math.max(1, Number(state.loopCount || 1)),
    transitionLog: Array.isArray(state.transitionLog) ? state.transitionLog.slice(-500) : [],
    timestamps: {
      ...createDefaultState().timestamps,
      ...(state.timestamps || {}),
      updatedAt: nowIso(),
    },
  };

  if (normalized.approvalStatus === 'pending' && !normalized.pendingApproval) {
    normalized.approvalStatus = 'idle';
    normalized.status = normalized.status === 'waiting_approval' ? 'running' : normalized.status;
  }

  if (normalized.runningAgents.length > 0 && normalized.approvalStatus === 'pending') {
    throw new Error('Invalid state: cannot have running agents while approval is pending.');
  }

  return normalized;
};

export const loadWorkflowState = async (): Promise<WorkflowState> => {
  await ensureStateDir();

  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (Number(parsed.schemaVersion || 1) >= WORKFLOW_SCHEMA_VERSION) {
      return normalizeWorkflowState(parsed as unknown as WorkflowState);
    }

    return normalizeWorkflowState(migrateLegacyState(parsed));
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      const initial = createDefaultState();
      await saveWorkflowState(initial);
      return initial;
    }
    throw error;
  }
};

export const saveWorkflowState = async (state: WorkflowState): Promise<void> => {
  await ensureStateDir();
  const normalized = normalizeWorkflowState(state);
  const tempPath = `${STATE_PATH}.tmp`;
  await writeFile(tempPath, JSON.stringify(normalized, null, 2), 'utf8');
  await rename(tempPath, STATE_PATH);
};
