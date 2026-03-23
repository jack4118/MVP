import crypto from 'crypto';
import { ApprovalTarget, WorkflowStage, WorkflowStatus } from './workflowModel';

export type TelegramCallbackAction = 'approve' | 'reject' | 'status';

export interface TelegramCallbackContext {
  action: TelegramCallbackAction;
  issueId: string;
  stage: WorkflowStage;
  status: WorkflowStatus;
  target: ApprovalTarget | null;
  approvalId: string | null;
  messageId: number | null;
}

interface CallbackRecord extends TelegramCallbackContext {
  cbid: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

const CALLBACK_TTL_MS = Number(process.env.EZR_TELEGRAM_CALLBACK_TTL_MS || 24 * 60 * 60 * 1000);
const registry = new Map<string, CallbackRecord>();

const secret = (): string => {
  return process.env.EZR_TELEGRAM_CALLBACK_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'ezr-telegram-callback-secret';
};

const toSig = (value: string): string => {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url').slice(0, 10);
};

const compact = (value: string): string => value.slice(0, 12);

const purgeExpired = (): void => {
  const now = Date.now();
  for (const [key, record] of registry.entries()) {
    if (record.expiresAt <= now) {
      registry.delete(key);
    }
  }
};

export const createTelegramCallbackData = (context: TelegramCallbackContext): string => {
  purgeExpired();
  const cbid = compact(crypto.randomBytes(9).toString('base64url'));
  const signedCore = `v1|a:${context.action}|c:${cbid}`;
  const sig = toSig(signedCore);
  const now = Date.now();
  registry.set(cbid, {
    cbid,
    ...context,
    createdAt: now,
    expiresAt: now + CALLBACK_TTL_MS,
    used: false,
  });
  return `${signedCore}|s:${sig}`;
};

const parseData = (value: string): { version: string; action: string; cbid: string; sig: string } | null => {
  const parts = value.split('|');
  if (parts.length !== 4) {
    return null;
  }

  const [version, actionPart, cbidPart, sigPart] = parts;
  if (!version || !actionPart.startsWith('a:') || !cbidPart.startsWith('c:') || !sigPart.startsWith('s:')) {
    return null;
  }

  return {
    version,
    action: actionPart.slice(2),
    cbid: cbidPart.slice(2),
    sig: sigPart.slice(2),
  };
};

export const loadTelegramCallbackRecord = (callbackData: string):
  | { ok: true; cbid: string; record: CallbackRecord }
  | { ok: false; reason: string } => {
  purgeExpired();
  const parsed = parseData(callbackData);
  if (!parsed || parsed.version !== 'v1') {
    return { ok: false, reason: 'invalid callback payload' };
  }

  const core = `v1|a:${parsed.action}|c:${parsed.cbid}`;
  if (toSig(core) !== parsed.sig) {
    return { ok: false, reason: 'invalid callback signature' };
  }

  const record = registry.get(parsed.cbid);
  if (!record) {
    return { ok: false, reason: 'callback expired or not found' };
  }

  if (record.action !== parsed.action) {
    return { ok: false, reason: 'callback action mismatch' };
  }

  if (record.expiresAt <= Date.now()) {
    registry.delete(parsed.cbid);
    return { ok: false, reason: 'callback expired' };
  }

  return { ok: true, cbid: parsed.cbid, record };
};

export const consumeTelegramCallbackRecord = (cbid: string): { ok: true } | { ok: false; reason: string } => {
  const record = registry.get(cbid);
  if (!record) {
    return { ok: false, reason: 'callback expired or not found' };
  }

  if (record.used) {
    return { ok: false, reason: 'callback already handled' };
  }

  record.used = true;
  registry.set(cbid, record);
  return { ok: true };
};

export const isTelegramCallbackUsed = (cbid: string): boolean => {
  const record = registry.get(cbid);
  return Boolean(record?.used);
};
