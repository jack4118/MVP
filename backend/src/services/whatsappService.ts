import prisma from '../config/database';

const META_GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v22.0';

const sanitizePhone = (phone: string): string => phone.replace(/[^\d]/g, '');

const getGraphUrl = (path: string) => `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${path}`;
const toDateFromUnix = (value?: string | number): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return new Date(n * 1000);
};

export const getWhatsappConnection = async (userId: string) => {
  return prisma.whatsAppConnection.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      businessAccountId: true,
      phoneNumberId: true,
      displayPhone: true,
      isActive: true,
      lastVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

export const upsertWhatsappConnection = async (
  userId: string,
  data: { businessAccountId: string; phoneNumberId: string; accessToken?: string }
) => {
  const existing = await prisma.whatsAppConnection.findUnique({ where: { userId } });

  if (existing) {
    return prisma.whatsAppConnection.update({
      where: { userId },
      data: {
        businessAccountId: data.businessAccountId,
        phoneNumberId: data.phoneNumberId,
        ...(data.accessToken ? { accessToken: data.accessToken } : {}),
        isActive: true,
      },
    });
  }

  if (!data.accessToken) {
    throw new Error('accessToken is required for first-time connection');
  }

  return prisma.whatsAppConnection.create({
    data: {
      userId,
      businessAccountId: data.businessAccountId,
      phoneNumberId: data.phoneNumberId,
      accessToken: data.accessToken,
      isActive: true,
    },
  });
};

export const verifyWhatsappConnection = async (userId: string) => {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error('WhatsApp connection not found');
  }

  const response = await fetch(
    getGraphUrl(`${connection.phoneNumberId}?fields=id,display_phone_number,verified_name`),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
    }
  );

  const payload: any = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || 'Failed to verify WhatsApp connection';
    throw new Error(message);
  }

  const displayPhone = payload?.display_phone_number || null;

  await prisma.whatsAppConnection.update({
    where: { userId },
    data: {
      displayPhone,
      isActive: true,
      lastVerifiedAt: new Date(),
    },
  });

  return {
    connected: true,
    displayPhone,
    verifiedName: payload?.verified_name || null,
  };
};

export const sendWhatsAppText = async (
  userId: string,
  data: { toPhone: string; content: string; leadId?: string }
) => {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error('WhatsApp connection not found');
  }

  const toPhone = sanitizePhone(data.toPhone);
  if (!toPhone) {
    throw new Error('Invalid phone number');
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'text',
    text: {
      body: data.content,
    },
  };

  try {
    const response = await fetch(getGraphUrl(`${connection.phoneNumberId}/messages`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload: any = await response.json();

    if (!response.ok) {
      const message = payload?.error?.message || 'Failed to send WhatsApp message';

      await prisma.whatsAppMessageLog.create({
        data: {
          userId,
          leadId: data.leadId,
          direction: 'outbound',
          fromPhone: connection.displayPhone ? sanitizePhone(connection.displayPhone) : null,
          toPhone,
          content: data.content,
          status: 'failed',
          error: message,
          rawPayload: payload,
        },
      });

      throw new Error(message);
    }

    const messageId = payload?.messages?.[0]?.id || null;

    await prisma.whatsAppMessageLog.create({
      data: {
        userId,
        leadId: data.leadId,
        messageId,
        direction: 'outbound',
        fromPhone: connection.displayPhone ? sanitizePhone(connection.displayPhone) : null,
        toPhone,
        content: data.content,
        status: 'sent',
        error: null,
        externalTimestamp: new Date(),
        rawPayload: payload,
      },
    });

    return {
      sent: true,
      messageId,
      toPhone,
    };
  } catch (error: any) {
    if (!(error instanceof Error)) {
      throw new Error('Failed to send WhatsApp message');
    }
    throw error;
  }
};

export const getWhatsAppMessageLogs = async (userId: string, limit: number = 30) => {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  return prisma.whatsAppMessageLog.findMany({
    where: { userId },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
  });
};

export const getWhatsAppConversationMessages = async (userId: string, phone: string, limit: number = 100) => {
  const safeLimit = Math.min(Math.max(limit, 1), 300);
  const normalized = sanitizePhone(phone);

  return prisma.whatsAppMessageLog.findMany({
    where: {
      userId,
      OR: [{ toPhone: normalized }, { fromPhone: normalized }],
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
    take: safeLimit,
  });
};

export const processWhatsAppWebhook = async (body: any) => {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  let processed = 0;

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      if (change?.field !== 'messages') {
        continue;
      }

      const value = change?.value || {};
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) {
        continue;
      }

      const connections = await prisma.whatsAppConnection.findMany({
        where: { phoneNumberId, isActive: true },
        select: {
          userId: true,
          displayPhone: true,
        },
      });

      if (connections.length === 0) {
        continue;
      }

      for (const connection of connections) {
        const businessPhone = sanitizePhone(value?.metadata?.display_phone_number || connection.displayPhone || '');

        const inboundMessages = Array.isArray(value?.messages) ? value.messages : [];
        for (const message of inboundMessages) {
          const messageId = message?.id as string | undefined;
          const fromPhone = sanitizePhone(message?.from || '');
          const content =
            message?.text?.body ||
            (typeof message?.type === 'string' ? `[${message.type}]` : '[message]');

          if (messageId) {
            const existing = await prisma.whatsAppMessageLog.findFirst({
              where: {
                userId: connection.userId,
                messageId,
                direction: 'inbound',
              },
              select: { id: true },
            });
            if (existing) {
              continue;
            }
          }

          await prisma.whatsAppMessageLog.create({
            data: {
              userId: connection.userId,
              messageId: messageId || null,
              direction: 'inbound',
              fromPhone,
              toPhone: businessPhone || phoneNumberId,
              content,
              status: 'received',
              error: null,
              externalTimestamp: toDateFromUnix(message?.timestamp),
              rawPayload: message,
            },
          });
          processed += 1;
        }

        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const status of statuses) {
          const messageId = status?.id as string | undefined;
          if (!messageId) {
            continue;
          }

          const recipient = sanitizePhone(status?.recipient_id || '');
          const statusValue = String(status?.status || 'sent');
          const errorMessage = Array.isArray(status?.errors) && status.errors.length > 0
            ? status.errors.map((e: any) => e?.title || e?.message).filter(Boolean).join('; ')
            : null;

          const updated = await prisma.whatsAppMessageLog.updateMany({
            where: {
              userId: connection.userId,
              messageId,
            },
            data: {
              status: statusValue,
              error: errorMessage,
              externalTimestamp: toDateFromUnix(status?.timestamp),
              rawPayload: status,
            },
          });

          if (updated.count === 0) {
            await prisma.whatsAppMessageLog.create({
              data: {
                userId: connection.userId,
                messageId,
                direction: 'outbound',
                fromPhone: businessPhone || null,
                toPhone: recipient || 'unknown',
                content: '[status webhook]',
                status: statusValue,
                error: errorMessage,
                externalTimestamp: toDateFromUnix(status?.timestamp),
                rawPayload: status,
              },
            });
          }
          processed += 1;
        }
      }
    }
  }

  return { processed };
};

type LeadLite = {
  id: string;
  name: string;
  contact: string | null;
  status: string;
};

type ContactSummary = {
  phone: string;
  totalMessages: number;
  sentCount: number;
  failedCount: number;
  lastStatus: string;
  lastMessage: string;
  lastError: string | null;
  lastAt: Date;
  lead: {
    id: string;
    name: string;
    status: string;
  } | null;
};

const normalizePhone = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }
  return value.replace(/[^\d]/g, '');
};

const getCounterpartyPhone = (log: { direction: string; toPhone: string; fromPhone: string | null }) => {
  if (log.direction === 'inbound') {
    return normalizePhone(log.fromPhone);
  }
  return normalizePhone(log.toPhone);
};

const pickBestLeadMatch = (phone: string, leads: LeadLite[]): LeadLite | null => {
  const direct = leads.find((lead) => normalizePhone(lead.contact) === phone);
  if (direct) {
    return direct;
  }

  // Fallback for local formats vs country-prefixed formats.
  return (
    leads.find((lead) => {
      const c = normalizePhone(lead.contact);
      return c.length > 7 && (phone.endsWith(c) || c.endsWith(phone));
    }) || null
  );
};

export const getWhatsAppContactSummaries = async (userId: string, limit: number = 50): Promise<ContactSummary[]> => {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const [logs, leads] = await Promise.all([
    prisma.whatsAppMessageLog.findMany({
      where: { userId },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            status: true,
            contact: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.lead.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        status: true,
        contact: true,
      },
    }),
  ]);

  const summaries = new Map<string, ContactSummary>();

  for (const log of logs) {
    const phone = getCounterpartyPhone(log);
    if (!phone) {
      continue;
    }

    const existing = summaries.get(phone);
    if (!existing) {
      const fallbackLead = pickBestLeadMatch(phone, leads);
      summaries.set(phone, {
        phone,
        totalMessages: 1,
        sentCount: ['sent', 'delivered', 'read'].includes(log.status) ? 1 : 0,
        failedCount: log.status === 'failed' ? 1 : 0,
        lastStatus: log.status,
        lastMessage: log.content,
        lastError: log.error,
        lastAt: log.createdAt,
        lead: log.lead
          ? { id: log.lead.id, name: log.lead.name, status: log.lead.status }
          : fallbackLead
            ? { id: fallbackLead.id, name: fallbackLead.name, status: fallbackLead.status }
            : null,
      });
      continue;
    }

    existing.totalMessages += 1;
    if (['sent', 'delivered', 'read'].includes(log.status)) {
      existing.sentCount += 1;
    } else if (log.status === 'failed') {
      existing.failedCount += 1;
    }
  }

  return Array.from(summaries.values())
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, safeLimit);
};

export const getWhatsAppContactSummariesPaged = async (
  userId: string,
  options: { q?: string; page?: number; pageSize?: number } = {}
): Promise<{ items: ContactSummary[]; total: number; page: number; pageSize: number; totalPages: number }> => {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(Math.max(Number(options.pageSize || 20), 1), 100);
  const q = String(options.q || '').trim().toLowerCase();

  const all = await getWhatsAppContactSummaries(userId, 1000);
  const filtered = q.length === 0
    ? all
    : all.filter((item) => {
        const haystack = [
          item.phone,
          item.lead?.name || '',
          item.lead?.status || '',
          item.lastStatus || '',
          item.lastMessage || '',
          item.lastError || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
};
