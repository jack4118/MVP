import prisma from '../config/database';
import { sendTelegramMessage } from './telegramClient';

const TEMPLATE_TOKEN_KEY = 'EZR_WHATSAPP_TEMPLATE_TOKEN';
const PENDING_TTL_MS = 10 * 60 * 1000;
const EXPIRY_NOTICE_WINDOW_MS = 72 * 60 * 60 * 1000;
const NOTICE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const maskToken = (value: string): string => {
  if (!value) return 'empty';
  if (value.length <= 10) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const parseDateOrNull = (value?: string): Date | null => {
  if (!value) return null;
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
    if (Number.isNaN(endOfDay.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }
    return endOfDay;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }
  return d;
};

const reconcileCredentialStatus = async (credential: {
  key: string;
  status: 'active' | 'expiring' | 'expired' | 'disabled';
  expiresAt: Date | null;
}): Promise<'active' | 'expiring' | 'expired' | 'disabled'> => {
  if (credential.status === 'disabled') {
    return credential.status;
  }
  if (!credential.expiresAt) {
    return credential.status;
  }
  const now = Date.now();
  const expiresAtMs = credential.expiresAt.getTime();
  if (Number.isNaN(expiresAtMs)) {
    return credential.status;
  }
  const nextStatus: 'active' | 'expiring' | 'expired' = expiresAtMs <= now ? 'expired' : 'active';
  if (nextStatus !== credential.status) {
    await prisma.orchestratorCredential.update({
      where: { key: credential.key },
      data: { status: nextStatus },
    });
  }
  return nextStatus;
};

export const bootstrapTemplateTokenFromEnv = async (): Promise<void> => {
  const envToken = process.env.EZR_WHATSAPP_TEMPLATE_TOKEN?.trim();
  if (!envToken) {
    return;
  }

  const existing = await prisma.orchestratorCredential.findUnique({
    where: { key: TEMPLATE_TOKEN_KEY },
  });

  if (existing) {
    return;
  }

  await prisma.orchestratorCredential.create({
    data: {
      key: TEMPLATE_TOKEN_KEY,
      value: envToken,
      status: 'active',
      updatedBy: 'bootstrap:env',
    },
  });
};

export const getTemplateTokenForInjection = async (): Promise<string | null> => {
  const credential = await prisma.orchestratorCredential.findUnique({
    where: { key: TEMPLATE_TOKEN_KEY },
  });

  if (!credential) {
    return null;
  }

  const effectiveStatus = await reconcileCredentialStatus(credential);
  if (effectiveStatus === 'disabled' || effectiveStatus === 'expired') {
    return null;
  }

  return credential.value;
};

export const getTemplateTokenStatus = async (): Promise<string> => {
  const credential = await prisma.orchestratorCredential.findUnique({ where: { key: TEMPLATE_TOKEN_KEY } });
  if (!credential) {
    return 'Template token not set in DB.';
  }
  const effectiveStatus = await reconcileCredentialStatus(credential);

  return [
    'WhatsApp Template Token Status',
    `- key: ${credential.key}`,
    `- status: ${effectiveStatus}`,
    `- token: ${maskToken(credential.value)}`,
    `- expiresAt: ${credential.expiresAt ? credential.expiresAt.toISOString() : 'not set'}`,
    `- updatedAt: ${credential.updatedAt.toISOString()}`,
  ].join('\n');
};

export const setTemplateTokenDirect = async (params: {
  chatId: string;
  token: string;
  expiresOn?: string;
}): Promise<{ masked: string; expiresAt: Date | null }> => {
  const clean = params.token.trim();
  if (!clean) {
    throw new Error('Token is required');
  }

  const expiresAt = parseDateOrNull(params.expiresOn);
  await prisma.orchestratorCredential.upsert({
    where: { key: TEMPLATE_TOKEN_KEY },
    update: {
      value: clean,
      expiresAt,
      status: 'active',
      updatedBy: `telegram:${params.chatId}`,
      lastNotifiedAt: null,
    },
    create: {
      key: TEMPLATE_TOKEN_KEY,
      value: clean,
      expiresAt,
      status: 'active',
      updatedBy: `telegram:${params.chatId}`,
    },
  });

  return {
    masked: maskToken(clean),
    expiresAt,
  };
};

export const setPendingTemplateTokenUpdate = async (params: {
  chatId: string;
  token: string;
  expiresOn?: string;
}): Promise<{ masked: string; expiresAt: Date | null }> => {
  const clean = params.token.trim();
  if (!clean) {
    throw new Error('Token is required');
  }

  const expiresAt = parseDateOrNull(params.expiresOn);
  const pendingExpiry = new Date(Date.now() + PENDING_TTL_MS);

  await prisma.orchestratorPendingUpdate.deleteMany({
    where: {
      key: TEMPLATE_TOKEN_KEY,
      requestedByChatId: params.chatId,
    },
  });

  await prisma.orchestratorPendingUpdate.create({
    data: {
      key: TEMPLATE_TOKEN_KEY,
      pendingValue: clean,
      requestedByChatId: params.chatId,
      expiresAt: pendingExpiry,
    },
  });

  // Stash requested expiry in context table by temporary synthetic key row for simplicity.
  if (expiresAt) {
    await prisma.orchestratorPendingUpdate.create({
      data: {
        key: `${TEMPLATE_TOKEN_KEY}:expiresAt`,
        pendingValue: expiresAt.toISOString(),
        requestedByChatId: params.chatId,
        expiresAt: pendingExpiry,
      },
    });
  }

  return {
    masked: maskToken(clean),
    expiresAt,
  };
};

export const confirmPendingTemplateTokenUpdate = async (chatId: string): Promise<{ masked: string; expiresAt: Date | null }> => {
  const pending = await prisma.orchestratorPendingUpdate.findFirst({
    where: {
      key: TEMPLATE_TOKEN_KEY,
      requestedByChatId: chatId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!pending) {
    throw new Error('No pending token update found. Use /wa_token set first.');
  }

  const pendingExpiryMeta = await prisma.orchestratorPendingUpdate.findFirst({
    where: {
      key: `${TEMPLATE_TOKEN_KEY}:expiresAt`,
      requestedByChatId: chatId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  const expiresAt = pendingExpiryMeta ? new Date(pendingExpiryMeta.pendingValue) : null;

  await prisma.orchestratorCredential.upsert({
    where: { key: TEMPLATE_TOKEN_KEY },
    update: {
      value: pending.pendingValue,
      expiresAt,
      status: 'active',
      updatedBy: `telegram:${chatId}`,
      lastNotifiedAt: null,
    },
    create: {
      key: TEMPLATE_TOKEN_KEY,
      value: pending.pendingValue,
      expiresAt,
      status: 'active',
      updatedBy: `telegram:${chatId}`,
    },
  });

  await prisma.orchestratorPendingUpdate.deleteMany({
    where: {
      requestedByChatId: chatId,
      key: { in: [TEMPLATE_TOKEN_KEY, `${TEMPLATE_TOKEN_KEY}:expiresAt`] },
    },
  });

  return {
    masked: maskToken(pending.pendingValue),
    expiresAt,
  };
};

export const cancelPendingTemplateTokenUpdate = async (chatId: string): Promise<boolean> => {
  const result = await prisma.orchestratorPendingUpdate.deleteMany({
    where: {
      requestedByChatId: chatId,
      key: { in: [TEMPLATE_TOKEN_KEY, `${TEMPLATE_TOKEN_KEY}:expiresAt`] },
    },
  });

  return result.count > 0;
};

export const markTemplateTokenExpiredAndNotify = async (reason: string): Promise<void> => {
  const credential = await prisma.orchestratorCredential.findUnique({ where: { key: TEMPLATE_TOKEN_KEY } });
  if (!credential) {
    return;
  }

  const now = new Date();
  await prisma.orchestratorCredential.update({
    where: { key: TEMPLATE_TOKEN_KEY },
    data: {
      status: 'expired',
      lastNotifiedAt: now,
    },
  });

  await sendTelegramMessage([
    'EzReply Alert: WhatsApp template token expired',
    `Reason: ${reason}`,
    'Please update via Telegram:',
    '- /wa_token set <new_token> [exp=YYYY-MM-DD]',
    '- /wa_token confirm',
  ].join('\n'));
};

export const isWhatsAppTokenExpiredError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const text = error.message.toLowerCase();
  return (
    text.includes('validating access token') ||
    text.includes('session has expired') ||
    text.includes('invalid oauth access token') ||
    text.includes('access token has expired')
  );
};

export const notifyExpiringTemplateTokenIfNeeded = async (): Promise<void> => {
  const credential = await prisma.orchestratorCredential.findUnique({ where: { key: TEMPLATE_TOKEN_KEY } });
  if (!credential || !credential.expiresAt) {
    return;
  }

  const now = new Date();
  const diff = credential.expiresAt.getTime() - now.getTime();
  if (diff > EXPIRY_NOTICE_WINDOW_MS) {
    return;
  }

  const lastNotifiedAt = credential.lastNotifiedAt?.getTime() || 0;
  if (lastNotifiedAt && now.getTime() - lastNotifiedAt < NOTICE_COOLDOWN_MS) {
    return;
  }

  await prisma.orchestratorCredential.update({
    where: { key: TEMPLATE_TOKEN_KEY },
    data: {
      status: diff <= 0 ? 'expired' : 'expiring',
      lastNotifiedAt: now,
    },
  });

  const title = diff <= 0
    ? 'EzReply Alert: WhatsApp template token is expired'
    : 'EzReply Alert: WhatsApp template token expiring soon';

  await sendTelegramMessage([
    title,
    `Token: ${maskToken(credential.value)}`,
    `ExpiresAt: ${credential.expiresAt.toISOString()}`,
    'Update via Telegram:',
    '- /wa_token set <new_token> [exp=YYYY-MM-DD]',
    '- /wa_token confirm',
  ].join('\n'));
};

export const parseWaTokenSetCommand = (command: string): { token: string; expiresOn?: string } => {
  // /wa_token set <token> [exp=YYYY-MM-DD]
  const expMatch = command.match(/\bexp=(\d{4}-\d{2}-\d{2})\b/i);
  const withoutPrefix = command.replace(/^\/wa_token\s+set\s+/i, '').trim();
  const token = withoutPrefix.replace(/\s+exp=\d{4}-\d{2}-\d{2}\s*$/i, '').trim();
  if (!token) {
    throw new Error('Missing token. Usage: /wa_token set <token> [exp=YYYY-MM-DD]');
  }

  return {
    token,
    expiresOn: expMatch?.[1],
  };
};
