import { AgentExecutionResult } from './types';

export type ValidationFailureClassification = 'product' | 'ux' | 'ai_policy' | 'environment' | 'unknown';

export interface ClassificationResult {
  type: ValidationFailureClassification;
  routedAgent: 'agent6' | 'agent7' | 'agent8' | null;
  source: 'validator' | 'fallback';
}

const normalize = (value: string): string => value.toLowerCase().trim();

const parseFromRaw = (raw: unknown): ValidationFailureClassification | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const classification = candidate.classification || candidate.failureType || candidate.route;

  if (typeof classification !== 'string') {
    return null;
  }

  const normalized = normalize(classification);
  if (normalized.includes('product')) return 'product';
  if (normalized.includes('ux') || normalized.includes('conversion')) return 'ux';
  if (normalized.includes('policy') || normalized.includes('ai')) return 'ai_policy';
  if (normalized.includes('environment') || normalized.includes('credential') || normalized.includes('infra')) {
    return 'environment';
  }

  return 'unknown';
};

const classifyFromSummary = (summary: string[]): ValidationFailureClassification => {
  const text = normalize(summary.join(' '));

  if (text.includes('environment') || text.includes('credential') || text.includes('token') || text.includes('infra')) {
    return 'environment';
  }
  if (text.includes('ux') || text.includes('conversion') || text.includes('onboarding') || text.includes('copy')) {
    return 'ux';
  }
  if (text.includes('policy') || text.includes('ai output') || text.includes('guardrail')) {
    return 'ai_policy';
  }
  if (text.includes('logic') || text.includes('product') || text.includes('flow') || text.includes('bug')) {
    return 'product';
  }

  return 'unknown';
};

const routeAgent = (type: ValidationFailureClassification): 'agent6' | 'agent7' | 'agent8' | null => {
  if (type === 'product') return 'agent6';
  if (type === 'ux') return 'agent7';
  if (type === 'ai_policy') return 'agent8';
  return null;
};

export const classifyValidationFailure = (result: AgentExecutionResult): ClassificationResult => {
  const fromValidator = parseFromRaw(result.rawOutput);
  if (fromValidator && fromValidator !== 'unknown') {
    return {
      type: fromValidator,
      routedAgent: routeAgent(fromValidator),
      source: 'validator',
    };
  }

  const fallback = classifyFromSummary(result.summary || []);
  return {
    type: fallback,
    routedAgent: routeAgent(fallback),
    source: 'fallback',
  };
};
