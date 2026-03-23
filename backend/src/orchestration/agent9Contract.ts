export type BinaryStatus = 'SUCCESS' | 'FAIL';
export type YesNo = 'YES' | 'NO';
export type OptionalStatus = 'SUCCESS' | 'FAIL' | 'NOT_REQUIRED';

export interface Agent9ContractResult {
  AGENT_STATUS: BinaryStatus;
  PATCH_STATUS: YesNo;
  BUILD_STATUS: BinaryStatus;
  GIT_BEFORE_SHA: string;
  GIT_AFTER_SHA: string;
  PUSH_STATUS: OptionalStatus;
  DEPLOY_FRONTEND_STATUS: OptionalStatus;
  DEPLOY_BACKEND_STATUS: OptionalStatus;
  LIVE_VERIFY_STATUS: BinaryStatus;
  STAGING_READY: YesNo;
  NEXT_AGENT_ALLOWED: YesNo;
}

const normalize = (value: unknown): string => String(value || '').trim().toUpperCase();

const parseBinary = (value: unknown): BinaryStatus | null => {
  const v = normalize(value);
  if (v === 'SUCCESS' || v === 'FAIL') {
    return v;
  }
  return null;
};

const parseYesNo = (value: unknown): YesNo | null => {
  const v = normalize(value);
  if (v === 'YES' || v === 'NO') {
    return v;
  }
  return null;
};

const parseOptional = (value: unknown): OptionalStatus | null => {
  const v = normalize(value);
  if (v === 'SUCCESS' || v === 'FAIL' || v === 'NOT_REQUIRED') {
    return v;
  }
  return null;
};

export const parseAgent9ContractResult = (raw: unknown): { ok: true; value: Agent9ContractResult } | { ok: false; reason: string } => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'agent9 contract payload missing' };
  }

  const source = raw as Record<string, unknown>;
  const parsed: Agent9ContractResult = {
    AGENT_STATUS: parseBinary(source.AGENT_STATUS) || 'FAIL',
    PATCH_STATUS: parseYesNo(source.PATCH_STATUS) || 'NO',
    BUILD_STATUS: parseBinary(source.BUILD_STATUS) || 'FAIL',
    GIT_BEFORE_SHA: String(source.GIT_BEFORE_SHA || '').trim(),
    GIT_AFTER_SHA: String(source.GIT_AFTER_SHA || '').trim(),
    PUSH_STATUS: parseOptional(source.PUSH_STATUS) || 'FAIL',
    DEPLOY_FRONTEND_STATUS: parseOptional(source.DEPLOY_FRONTEND_STATUS) || 'FAIL',
    DEPLOY_BACKEND_STATUS: parseOptional(source.DEPLOY_BACKEND_STATUS) || 'FAIL',
    LIVE_VERIFY_STATUS: parseBinary(source.LIVE_VERIFY_STATUS) || 'FAIL',
    STAGING_READY: parseYesNo(source.STAGING_READY) || 'NO',
    NEXT_AGENT_ALLOWED: parseYesNo(source.NEXT_AGENT_ALLOWED) || 'NO',
  };

  const required = [
    'AGENT_STATUS',
    'PATCH_STATUS',
    'BUILD_STATUS',
    'GIT_BEFORE_SHA',
    'GIT_AFTER_SHA',
    'PUSH_STATUS',
    'DEPLOY_FRONTEND_STATUS',
    'DEPLOY_BACKEND_STATUS',
    'LIVE_VERIFY_STATUS',
    'STAGING_READY',
    'NEXT_AGENT_ALLOWED',
  ];

  for (const key of required) {
    if (!(key in source)) {
      return { ok: false, reason: `agent9 contract missing field: ${key}` };
    }
  }

  return { ok: true, value: parsed };
};
