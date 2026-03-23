import { getAgentDefinition } from './agentRegistry';
import { getTemplateTokenForInjection } from './credentialService';
import { AgentName, RunContext } from './types';

const CREDENTIAL_INJECTION_AGENTS: AgentName[] = ['agent5', 'agent12'];
const DEPLOYMENT_AGENT: AgentName = 'agent9';

const requireStagingFor = (agent: AgentName): boolean => getAgentDefinition(agent).enforceStaging;

export const buildRunContext = async (agent: AgentName): Promise<RunContext> => {
  const stagingUrl = process.env.EZR_STAGING_URL || null;
  const mustUseStaging = requireStagingFor(agent);
  const deployFrontendTarget = process.env.EZR_DEPLOY_FE_TARGET || 'cloudflare';
  const deployBackendTarget = process.env.EZR_DEPLOY_BE_TARGET || 'render';

  if (mustUseStaging && !stagingUrl) {
    throw new Error(`EZR_STAGING_URL is required for ${agent}`);
  }

  const templateToken = CREDENTIAL_INJECTION_AGENTS.includes(agent)
    ? await getTemplateTokenForInjection()
    : null;

  const placeholders = {
    whatsappTemplateToken: CREDENTIAL_INJECTION_AGENTS.includes(agent)
      ? templateToken
      : null,
    phoneNumberId: CREDENTIAL_INJECTION_AGENTS.includes(agent)
      ? process.env.EZR_PHONE_NUMBER_ID || null
      : null,
    wabaId: CREDENTIAL_INJECTION_AGENTS.includes(agent)
      ? process.env.EZR_WABA_ID || null
      : null,
    testPhone: CREDENTIAL_INJECTION_AGENTS.includes(agent)
      ? process.env.EZR_TEST_PHONE || null
      : null,
  };

  const constraints: string[] = [];

  if (mustUseStaging) {
    constraints.push('Use staging URL as source of truth. Do not rely on local screenshots unless explicitly requested.');
  }

  if (CREDENTIAL_INJECTION_AGENTS.includes(agent)) {
    constraints.push('Use injected placeholders only. Do not expose real secrets in outputs.');
  }

  if (mustUseStaging || CREDENTIAL_INJECTION_AGENTS.includes(agent)) {
    constraints.push('Test mobile flows in addition to desktop.');
  }

  if (agent === DEPLOYMENT_AGENT) {
    if (deployFrontendTarget.toLowerCase() !== 'cloudflare' || deployBackendTarget.toLowerCase() !== 'render') {
      throw new Error('Agent 9 deployment targets must be frontend=cloudflare and backend=render');
    }

    constraints.push('Deploy frontend to Cloudflare.');
    constraints.push('Deploy backend to Render.');
  }

  return {
    agent,
    stagingUrl,
    enforceMobileTesting: mustUseStaging || CREDENTIAL_INJECTION_AGENTS.includes(agent),
    deployTargets: {
      frontend: agent === DEPLOYMENT_AGENT ? deployFrontendTarget : null,
      backend: agent === DEPLOYMENT_AGENT ? deployBackendTarget : null,
    },
    placeholders,
    constraints,
  };
};
