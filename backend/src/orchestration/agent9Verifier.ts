import { execFile } from 'child_process';
import { promisify } from 'util';
import { parseAgent9ContractResult, Agent9ContractResult } from './agent9Contract';

const execFileAsync = promisify(execFile);

export interface GitSnapshot {
  headSha: string;
  upstreamSha: string | null;
  dirty: boolean;
}

export interface Agent9VerificationInput {
  workdir: string;
  apiBase: string;
  preGit: GitSnapshot;
  postGit: GitSnapshot;
  rawOutput: unknown;
}

export interface Agent9VerificationResult {
  success: boolean;
  stagingReady: boolean;
  summary: string[];
  contract: Agent9ContractResult | null;
  checks: Record<string, string>;
}

const isDeployStatusPass = (value: string): boolean => value === 'SUCCESS' || value === 'NOT_REQUIRED';

const runGit = async (args: string[], cwd: string): Promise<string> => {
  const result = await execFileAsync('git', args, { cwd, env: process.env });
  return String(result.stdout || '').trim();
};

const httpOk = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
    });
    return response.ok;
  } catch {
    return false;
  }
};

const detectRawContractPayload = (rawOutput: unknown): unknown => {
  if (!rawOutput || typeof rawOutput !== 'object') {
    return null;
  }
  const source = rawOutput as Record<string, unknown>;
  if (source.parsed && typeof source.parsed === 'object') {
    return source.parsed;
  }
  return source;
};

const ensureShaLike = (value: string): boolean => /^[a-f0-9]{7,40}$/i.test(String(value || '').trim());

export const captureGitSnapshot = async (cwd: string): Promise<GitSnapshot> => {
  const headSha = await runGit(['rev-parse', 'HEAD'], cwd);
  let upstreamSha: string | null = null;
  try {
    upstreamSha = await runGit(['rev-parse', '--verify', '@{u}'], cwd);
  } catch {
    upstreamSha = null;
  }

  const porcelain = await runGit(['status', '--porcelain'], cwd);
  return {
    headSha,
    upstreamSha: upstreamSha || null,
    dirty: Boolean(porcelain.trim()),
  };
};

export const verifyAgent9Execution = async (input: Agent9VerificationInput): Promise<Agent9VerificationResult> => {
  const checks: Record<string, string> = {};
  const summary: string[] = [];

  const payload = detectRawContractPayload(input.rawOutput);
  const parsed = parseAgent9ContractResult(payload);
  if (!parsed.ok) {
    return {
      success: false,
      stagingReady: false,
      summary: [`Agent9 contract invalid: ${parsed.reason}`],
      contract: null,
      checks: {
        contract: 'FAIL',
      },
    };
  }

  const contract = parsed.value;
  checks.contract = 'SUCCESS';

  if (!ensureShaLike(input.preGit.headSha) || !ensureShaLike(input.postGit.headSha)) {
    checks.git_snapshot = 'FAIL';
    summary.push('Git snapshot missing valid HEAD SHA.');
  } else {
    checks.git_snapshot = 'SUCCESS';
  }

  if (contract.GIT_BEFORE_SHA && contract.GIT_BEFORE_SHA !== input.preGit.headSha) {
    checks.git_before_sha_match = 'FAIL';
    summary.push('Contract GIT_BEFORE_SHA does not match local pre-run HEAD.');
  } else {
    checks.git_before_sha_match = 'SUCCESS';
  }

  if (contract.GIT_AFTER_SHA && contract.GIT_AFTER_SHA !== input.postGit.headSha) {
    checks.git_after_sha_match = 'FAIL';
    summary.push('Contract GIT_AFTER_SHA does not match local post-run HEAD.');
  } else {
    checks.git_after_sha_match = 'SUCCESS';
  }

  if (contract.PATCH_STATUS === 'YES') {
    if (input.preGit.headSha === input.postGit.headSha && !input.postGit.dirty) {
      checks.patch_change = 'FAIL';
      summary.push('PATCH_STATUS=YES but no local patch/commit detected.');
    } else {
      checks.patch_change = 'SUCCESS';
    }
  } else {
    checks.patch_change = 'NOT_REQUIRED';
  }

  checks.build = contract.BUILD_STATUS;
  if (contract.BUILD_STATUS !== 'SUCCESS') {
    summary.push('Build status is not SUCCESS.');
  }

  const requirePush = String(process.env.EZR_AGENT9_REQUIRE_PUSH || 'true').toLowerCase() !== 'false';
  if (requirePush) {
    const patchRequired = contract.PATCH_STATUS === 'YES';
    if (!patchRequired) {
      // No code patch means push may legitimately be skipped.
      checks.push = contract.PUSH_STATUS === 'SUCCESS' || contract.PUSH_STATUS === 'NOT_REQUIRED' ? contract.PUSH_STATUS : 'FAIL';
      if (checks.push === 'FAIL') {
        summary.push('Push status must be SUCCESS or NOT_REQUIRED when PATCH_STATUS=NO.');
      }
    } else if (contract.PUSH_STATUS !== 'SUCCESS') {
      checks.push = 'FAIL';
      summary.push('Push status is not SUCCESS.');
    } else {
      const upstreamAdvanced = input.preGit.upstreamSha !== input.postGit.upstreamSha;
      if (!upstreamAdvanced) {
        checks.push = 'FAIL';
        summary.push('PUSH_STATUS=SUCCESS but upstream SHA did not advance.');
      } else {
        checks.push = 'SUCCESS';
      }
    }
  } else {
    checks.push = contract.PUSH_STATUS;
  }

  const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
  const renderToken = process.env.RENDER_API_KEY;
  if (!cfToken) {
    checks.cloudflare_credentials = 'FAIL';
    summary.push('Missing Cloudflare deploy credentials (CLOUDFLARE_API_TOKEN/CF_API_TOKEN).');
  } else {
    checks.cloudflare_credentials = 'SUCCESS';
  }

  if (!renderToken) {
    checks.render_credentials = 'FAIL';
    summary.push('Missing Render deploy credentials (RENDER_API_KEY).');
  } else {
    checks.render_credentials = 'SUCCESS';
  }

  checks.deploy_frontend = contract.DEPLOY_FRONTEND_STATUS;
  checks.deploy_backend = contract.DEPLOY_BACKEND_STATUS;
  if (!isDeployStatusPass(contract.DEPLOY_FRONTEND_STATUS)) {
    summary.push('Frontend deploy status is neither SUCCESS nor NOT_REQUIRED.');
  }
  if (!isDeployStatusPass(contract.DEPLOY_BACKEND_STATUS)) {
    summary.push('Backend deploy status is neither SUCCESS nor NOT_REQUIRED.');
  }

  const frontendLiveUrl = process.env.EZR_AGENT9_FRONTEND_LIVE_URL || process.env.EZR_STAGING_URL || '';
  const backendHealthUrl = process.env.EZR_AGENT9_BACKEND_HEALTH_URL || `${input.apiBase.replace(/\/+$/, '')}/health`;

  const frontendLiveOk = frontendLiveUrl ? await httpOk(frontendLiveUrl) : false;
  const backendLiveOk = backendHealthUrl ? await httpOk(backendHealthUrl) : false;

  checks.live_frontend = frontendLiveOk ? 'SUCCESS' : 'FAIL';
  checks.live_backend = backendLiveOk ? 'SUCCESS' : 'FAIL';
  if (!frontendLiveOk) {
    summary.push(`Frontend live verification failed (${frontendLiveUrl || 'missing URL'}).`);
  }
  if (!backendLiveOk) {
    summary.push(`Backend health verification failed (${backendHealthUrl || 'missing URL'}).`);
  }

  checks.live_verify = contract.LIVE_VERIFY_STATUS;
  if (contract.LIVE_VERIFY_STATUS !== 'SUCCESS') {
    summary.push('Contract LIVE_VERIFY_STATUS is not SUCCESS.');
  }

  const pass =
    checks.contract === 'SUCCESS' &&
    checks.git_snapshot === 'SUCCESS' &&
    checks.git_before_sha_match === 'SUCCESS' &&
    checks.git_after_sha_match === 'SUCCESS' &&
    (checks.patch_change === 'SUCCESS' || checks.patch_change === 'NOT_REQUIRED') &&
    checks.build === 'SUCCESS' &&
    checks.push === 'SUCCESS' &&
    checks.cloudflare_credentials === 'SUCCESS' &&
    checks.render_credentials === 'SUCCESS' &&
    isDeployStatusPass(checks.deploy_frontend) &&
    isDeployStatusPass(checks.deploy_backend) &&
    checks.live_frontend === 'SUCCESS' &&
    checks.live_backend === 'SUCCESS' &&
    checks.live_verify === 'SUCCESS' &&
    contract.AGENT_STATUS === 'SUCCESS' &&
    contract.STAGING_READY === 'YES' &&
    contract.NEXT_AGENT_ALLOWED === 'YES';

  if (summary.length === 0) {
    summary.push('Agent9 hard verification passed.');
  }

  return {
    success: pass,
    stagingReady: pass,
    summary,
    contract,
    checks,
  };
};
