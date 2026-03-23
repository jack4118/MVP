import { AgentName } from './types';

type RuntimeMinutesMap = Partial<Record<AgentName, number>>;

const DEFAULT_MAX_ATTEMPTS = Number(process.env.EZR_AGENT_MAX_ATTEMPTS || 2);
const DEFAULT_LEASE_TTL_SECONDS = Number(process.env.EZR_AGENT_LEASE_TTL_SECONDS || 90);
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = Number(process.env.EZR_AGENT_HEARTBEAT_INTERVAL_SECONDS || 45);

const MAX_RUNTIME_MINUTES: RuntimeMinutesMap = {
  agent1: 8,
  agent2: 10,
  agent3: 5,
  agent5: 10,
  agent6: 5,
  agent7: 5,
  agent8: 5,
  agent9: 15,
  agent12: 10,
};

const AUTO_RETRY_AGENTS: AgentName[] = ['agent1', 'agent2', 'agent12'];

const MANUAL_REPEAT_ONLY_AGENTS: AgentName[] = ['agent3', 'agent5', 'agent6', 'agent7', 'agent8', 'agent9'];

export const allExecutionAgents = (): AgentName[] => [
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

export const isExecutionAgent = (agent: AgentName): boolean => allExecutionAgents().includes(agent);

export const getAgentMaxRuntimeMs = (agent: AgentName): number => {
  const minutes = MAX_RUNTIME_MINUTES[agent] || 10;
  return minutes * 60 * 1000;
};

export const getAgentMaxRuntimeMinutes = (agent: AgentName): number => Math.round(getAgentMaxRuntimeMs(agent) / 60000);

export const getLeaseTtlMs = (): number => Math.max(30, DEFAULT_LEASE_TTL_SECONDS) * 1000;

export const getHeartbeatIntervalMs = (): number => Math.max(30, DEFAULT_HEARTBEAT_INTERVAL_SECONDS) * 1000;

export const getMaxAttempts = (): number => Math.max(1, DEFAULT_MAX_ATTEMPTS);

export const isAutoRetryAllowed = (agent: AgentName): boolean => AUTO_RETRY_AGENTS.includes(agent);

export const isManualRepeatOnlyAgent = (agent: AgentName): boolean => MANUAL_REPEAT_ONLY_AGENTS.includes(agent);
