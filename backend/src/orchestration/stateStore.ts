import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { ALL_AGENT_NAMES } from './agentRegistry';
import { WorkflowState } from './types';

const STATE_PATH = process.env.EZR_WORKFLOW_STATE_PATH
  ? path.resolve(process.env.EZR_WORKFLOW_STATE_PATH)
  : path.resolve(process.cwd(), 'data', 'ezr-workflow-state.json');

const nowIso = (): string => new Date().toISOString();

export const createDefaultState = (): WorkflowState => {
  const now = nowIso();
  return {
    currentIssue: null,
    currentLoopStage: 'idle',
    lastCompletedAgent: null,
    currentRunningAgent: null,
    proposedNextAgent: null,
    proposedReason: null,
    proposedSummary: [],
    approvalStatus: 'idle',
    approvedAgent: null,
    completedAgents: [],
    pendingAgents: ALL_AGENT_NAMES.filter((agent) => agent !== 'agent0'),
    blockedAgents: [],
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

export const loadWorkflowState = async (): Promise<WorkflowState> => {
  await ensureStateDir();

  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as WorkflowState;
    return parsed;
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

  const updatedState: WorkflowState = {
    ...state,
    timestamps: {
      ...state.timestamps,
      updatedAt: nowIso(),
    },
  };

  const tempPath = `${STATE_PATH}.tmp`;
  await writeFile(tempPath, JSON.stringify(updatedState, null, 2), 'utf8');
  await rename(tempPath, STATE_PATH);
};
