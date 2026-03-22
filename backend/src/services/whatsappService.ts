import prisma from '../config/database';
import { cancelPendingSystemTasks, normalizeLeadStatus, scheduleNextSystemFollowUp } from './followUpService';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

const META_GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v22.0';
const WHATSAPP_TRANSCRIPTION_MODEL = process.env.WHATSAPP_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
const WHATSAPP_TRANSCRIPTION_TIMEOUT_MS = Number(process.env.WHATSAPP_TRANSCRIPTION_TIMEOUT_MS || 12000);
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const sanitizePhone = (phone: string): string => phone.replace(/[^\d]/g, '');

const getGraphUrl = (path: string) => `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${path}`;

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs: number = WHATSAPP_TRANSCRIPTION_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeTranscriptionError = (error: unknown): string => {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'AUDIO_TRANSCRIPTION_TIMEOUT';
  }
  if (error instanceof Error && error.message) {
    return `AUDIO_TRANSCRIPTION_FAILED: ${error.message}`;
  }
  return 'AUDIO_TRANSCRIPTION_FAILED';
};

const resolveInboundAudioContent = async (
  accessToken: string,
  message: any
): Promise<{ content: string; transcriptionStatus: 'success' | 'failed'; transcriptionError: string | null }> => {
  const mediaId = message?.audio?.id;
  if (!mediaId) {
    return {
      content: '[audio]',
      transcriptionStatus: 'failed',
      transcriptionError: 'AUDIO_MEDIA_ID_MISSING',
    };
  }

  if (!openaiClient) {
    return {
      content: '[audio]',
      transcriptionStatus: 'failed',
      transcriptionError: 'OPENAI_API_KEY_MISSING',
    };
  }

  try {
    const metaResponse = await fetchWithTimeout(
      getGraphUrl(String(mediaId)),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const metaPayload: any = await metaResponse.json();

    if (!metaResponse.ok || !metaPayload?.url) {
      return {
        content: '[audio]',
        transcriptionStatus: 'failed',
        transcriptionError: metaPayload?.error?.message || 'AUDIO_MEDIA_META_FETCH_FAILED',
      };
    }

    const mediaResponse = await fetchWithTimeout(metaPayload.url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!mediaResponse.ok) {
      return {
        content: '[audio]',
        transcriptionStatus: 'failed',
        transcriptionError: `AUDIO_MEDIA_DOWNLOAD_FAILED_${mediaResponse.status}`,
      };
    }

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    const file = await toFile(buffer, `whatsapp-audio-${mediaId}`, {
      type: metaPayload?.mime_type || 'audio/ogg',
    });

    const transcription = await openaiClient.audio.transcriptions.create({
      model: WHATSAPP_TRANSCRIPTION_MODEL,
      file,
    });

    const transcriptText = (transcription.text || '').trim();
    if (!transcriptText) {
      return {
        content: '[audio]',
        transcriptionStatus: 'failed',
        transcriptionError: 'AUDIO_TRANSCRIPTION_EMPTY',
      };
    }

    return {
      content: transcriptText,
      transcriptionStatus: 'success',
      transcriptionError: null,
    };
  } catch (error) {
    return {
      content: '[audio]',
      transcriptionStatus: 'failed',
      transcriptionError: normalizeTranscriptionError(error),
    };
  }
};
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

const normalizePhone = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }
  return value.replace(/[^\d]/g, '');
};

const phonesLikelyMatch = (left: string | null | undefined, right: string | null | undefined) => {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) {
    return false;
  }
  return a === b || a.endsWith(b) || b.endsWith(a);
};

const resolveLeadForPhone = async (userId: string, phone: string) => {
  const leads = await prisma.lead.findMany({
    where: {
      userId,
      contact: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  return leads.find((lead) => phonesLikelyMatch(lead.contact, phone)) || null;
};

const deriveLeadNameFromPhone = (phone: string) => {
  const normalized = normalizePhone(phone);
  const suffix = normalized.slice(-4) || normalized || 'Lead';
  return `WhatsApp Lead ${suffix}`;
};

const inferInquirySignals = (content: string, industry?: string | null) => {
  const text = (content || '').toLowerCase();
  const normalizedIndustry = (industry || '').toLowerCase();
  const tags = new Set<string>(['inquiry']);
  let stage = 'inquiry';

  if (/(price|pricing|quote|package|berapa|harga|价|多少钱|报价)/.test(text)) {
    tags.add('pricing');
  }

  if (/(book|booking|reserve|slot|confirm|deposit|订|预定|booking)/.test(text)) {
    stage = 'booking';
    tags.add('booking');
  }

  if (normalizedIndustry.includes('photo') || normalizedIndustry.includes('wedding') || normalizedIndustry.includes('摄影')) {
    if (/(wedding|婚礼|婚紗)/.test(text)) {
      tags.add('wedding');
    }
    if (/(family|家庭)/.test(text)) {
      tags.add('family');
    }
    if (/(event|corporate|活动|企业)/.test(text)) {
      tags.add('event');
    }
    if (/(studio|portrait|写真|人像)/.test(text)) {
      tags.add('portrait');
    }
  }

  return {
    stage,
    tags: Array.from(tags),
  };
};

const ensureInboundFollowUpReminder = async (leadId: string, followUpDays: number) => {
  const existing = await prisma.reminder.findFirst({
    where: {
      leadId,
      type: 'follow_up',
      isDone: false,
      triggerAt: { gte: new Date() },
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  const triggerAt = new Date();
  triggerAt.setDate(triggerAt.getDate() + Math.max(1, followUpDays || 1));

  await prisma.reminder.create({
    data: {
      leadId,
      type: 'follow_up',
      triggerAt,
      isSystemTask: true,
      stepIndex: 0,
      nextDispatchAt: triggerAt,
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      nextFollowUpAt: triggerAt,
    },
  });
};

const updateConversationState = async (params: {
  userId: string;
  phone: string;
  leadId?: string | null;
  messageId?: string | null;
  preview?: string | null;
  status?: string | null;
  error?: string | null;
  direction: 'inbound' | 'outbound';
  messageAt: Date;
  markUnread?: boolean;
}) => {
  const phone = normalizePhone(params.phone);
  if (!phone) {
    return null;
  }

  const existing = await prisma.whatsAppConversationState.findUnique({
    where: {
      userId_phone: {
        userId: params.userId,
        phone,
      },
    },
  });

  const data = {
    leadId: params.leadId ?? existing?.leadId ?? null,
    lastMessageId: params.messageId ?? existing?.lastMessageId ?? null,
    lastMessagePreview: params.preview ?? existing?.lastMessagePreview ?? null,
    lastDirection: params.direction,
    lastStatus: params.status ?? existing?.lastStatus ?? null,
    lastError: params.error ?? null,
    lastMessageAt: params.messageAt,
    lastInboundAt: params.direction === 'inbound' ? params.messageAt : existing?.lastInboundAt ?? null,
    lastOutboundAt: params.direction === 'outbound' ? params.messageAt : existing?.lastOutboundAt ?? null,
    unreadCount: params.direction === 'inbound'
      ? params.markUnread === false
        ? existing?.unreadCount ?? 0
        : (existing?.unreadCount ?? 0) + 1
      : existing?.unreadCount ?? 0,
  };

  return prisma.whatsAppConversationState.upsert({
    where: {
      userId_phone: {
        userId: params.userId,
        phone,
      },
    },
    update: data,
    create: {
      userId: params.userId,
      phone,
      ...data,
    },
  });
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
  data: {
    toPhone: string;
    content: string;
    leadId?: string;
    scheduleFollowUp?: boolean;
    conversationPhone?: string;
    clientMessageId?: string;
  }
) => {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error('WhatsApp connection not found');
  }

  const toPhone = sanitizePhone(data.conversationPhone || data.toPhone);
  if (!toPhone) {
    throw new Error('Invalid phone number');
  }

  if (data.clientMessageId) {
    const existing = await prisma.whatsAppMessageLog.findFirst({
      where: {
        userId,
        toPhone,
        direction: 'outbound',
        messageId: data.clientMessageId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && existing.status !== 'failed') {
      return {
        sent: true,
        messageId: existing.messageId,
        toPhone,
        deduped: true,
      };
    }
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
          messageId: data.clientMessageId || null,
          direction: 'outbound',
          messageType: 'text',
          transcriptionStatus: 'not_applicable',
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

    const serverMessageId = payload?.messages?.[0]?.id || null;
    const messageId = data.clientMessageId || serverMessageId;

    const messageAt = new Date();

    await prisma.whatsAppMessageLog.create({
      data: {
        userId,
        leadId: data.leadId,
        messageId,
        direction: 'outbound',
        messageType: 'text',
        transcriptionStatus: 'not_applicable',
        fromPhone: connection.displayPhone ? sanitizePhone(connection.displayPhone) : null,
        toPhone,
        content: data.content,
        status: 'sent',
        error: null,
        externalTimestamp: messageAt,
        rawPayload: {
          ...payload,
          clientMessageId: data.clientMessageId || null,
          serverMessageId,
        },
      },
    });

    const resolvedLeadId = data.leadId || (await resolveLeadForPhone(userId, toPhone))?.id || null;
    await updateConversationState({
      userId,
      phone: toPhone,
      leadId: resolvedLeadId,
      messageId,
      preview: data.content,
      status: 'sent',
      error: null,
      direction: 'outbound',
      messageAt,
    });

    if (resolvedLeadId) {
      await prisma.lead.update({
        where: { id: resolvedLeadId },
        data: {
          status: 'waiting_reply',
          lastActivityAt: messageAt,
          lastOutboundAt: messageAt,
        },
      });

      if (data.scheduleFollowUp !== false) {
        await scheduleNextSystemFollowUp({
          userId,
          leadId: resolvedLeadId,
          stepIndex: 0,
          fromDate: messageAt,
          force: true,
        });
      }
    }

    return {
      sent: true,
      messageId,
      serverMessageId,
      clientMessageId: data.clientMessageId || null,
      toPhone,
    };
  } catch (error: any) {
    if (!(error instanceof Error)) {
      throw new Error('Failed to send WhatsApp message');
    }
    throw error;
  }
};

export const sendWhatsAppMedia = async (
  userId: string,
  data: {
    toPhone: string;
    mediaType: 'image' | 'document';
    mediaUrl: string;
    caption?: string;
    filename?: string;
    leadId?: string;
    conversationPhone?: string;
    clientMessageId?: string;
  }
) => {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error('WhatsApp connection not found');
  }

  const toPhone = sanitizePhone(data.conversationPhone || data.toPhone);
  if (!toPhone) {
    throw new Error('Invalid phone number');
  }

  if (data.clientMessageId) {
    const existing = await prisma.whatsAppMessageLog.findFirst({
      where: {
        userId,
        toPhone,
        direction: 'outbound',
        messageId: data.clientMessageId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && existing.status !== 'failed') {
      return {
        sent: true,
        messageId: existing.messageId,
        toPhone,
        deduped: true,
      };
    }
  }

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: data.mediaType,
  };

  if (data.mediaType === 'image') {
    body.image = {
      link: data.mediaUrl,
      caption: data.caption || undefined,
    };
  } else {
    body.document = {
      link: data.mediaUrl,
      caption: data.caption || undefined,
      filename: data.filename || undefined,
    };
  }

  const response = await fetch(getGraphUrl(`${connection.phoneNumberId}/messages`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload: any = await response.json();
  const content = data.caption || `[${data.mediaType}] ${data.mediaUrl}`;

  if (!response.ok) {
    const message = payload?.error?.message || `Failed to send WhatsApp ${data.mediaType}`;
    await prisma.whatsAppMessageLog.create({
      data: {
        userId,
        leadId: data.leadId,
        messageId: data.clientMessageId || null,
        direction: 'outbound',
        messageType: data.mediaType,
        transcriptionStatus: 'not_applicable',
        fromPhone: connection.displayPhone ? sanitizePhone(connection.displayPhone) : null,
        toPhone,
        content,
        status: 'failed',
        error: message,
        rawPayload: payload,
      },
    });
    throw new Error(message);
  }

  const serverMessageId = payload?.messages?.[0]?.id || null;
  const messageId = data.clientMessageId || serverMessageId;
  const messageAt = new Date();

  await prisma.whatsAppMessageLog.create({
    data: {
      userId,
      leadId: data.leadId,
      messageId,
      direction: 'outbound',
      messageType: data.mediaType,
      transcriptionStatus: 'not_applicable',
      fromPhone: connection.displayPhone ? sanitizePhone(connection.displayPhone) : null,
      toPhone,
      content,
      status: 'sent',
      error: null,
      externalTimestamp: messageAt,
      rawPayload: {
        ...payload,
        mediaType: data.mediaType,
        mediaUrl: data.mediaUrl,
        clientMessageId: data.clientMessageId || null,
        serverMessageId,
      },
    },
  });

  const resolvedLeadId = data.leadId || (await resolveLeadForPhone(userId, toPhone))?.id || null;
  await updateConversationState({
    userId,
    phone: toPhone,
    leadId: resolvedLeadId,
    messageId,
    preview: content,
    status: 'sent',
    error: null,
    direction: 'outbound',
    messageAt,
  });

  return {
    sent: true,
    messageId,
    serverMessageId,
    clientMessageId: data.clientMessageId || null,
    toPhone,
  };
};

const inferMediaTypeFromMime = (mimeType: string | null | undefined): 'image' | 'document' => {
  if (!mimeType) {
    return 'document';
  }
  return mimeType.toLowerCase().startsWith('image/') ? 'image' : 'document';
};

export const sendWhatsAppUploadedMedia = async (
  userId: string,
  data: {
    toPhone: string;
    mediaType?: 'image' | 'document';
    fileBuffer: Buffer;
    mimeType?: string;
    caption?: string;
    filename?: string;
    leadId?: string;
    conversationPhone?: string;
    clientMessageId?: string;
  }
) => {
  const connection = await prisma.whatsAppConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error('WhatsApp connection not found');
  }

  const toPhone = sanitizePhone(data.conversationPhone || data.toPhone);
  if (!toPhone) {
    throw new Error('Invalid phone number');
  }

  if (data.clientMessageId) {
    const existing = await prisma.whatsAppMessageLog.findFirst({
      where: {
        userId,
        toPhone,
        direction: 'outbound',
        messageId: data.clientMessageId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && existing.status !== 'failed') {
      return {
        sent: true,
        messageId: existing.messageId,
        toPhone,
        deduped: true,
      };
    }
  }

  const normalizedMediaType = data.mediaType || inferMediaTypeFromMime(data.mimeType);
  const normalizedFilename = data.filename || `upload-${Date.now()}`;
  const normalizedMimeType = data.mimeType || (normalizedMediaType === 'image' ? 'image/jpeg' : 'application/octet-stream');

  const uploadForm = new FormData();
  uploadForm.append('messaging_product', 'whatsapp');
  uploadForm.append('type', normalizedMimeType);
  uploadForm.append('file', new Blob([data.fileBuffer], { type: normalizedMimeType }), normalizedFilename);

  const uploadResponse = await fetch(getGraphUrl(`${connection.phoneNumberId}/media`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
    },
    body: uploadForm,
  });
  const uploadPayload: any = await uploadResponse.json();
  if (!uploadResponse.ok || !uploadPayload?.id) {
    const message = uploadPayload?.error?.message || 'Failed to upload WhatsApp media';
    throw new Error(message);
  }

  const messageBody: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: normalizedMediaType,
  };

  if (normalizedMediaType === 'image') {
    messageBody.image = {
      id: uploadPayload.id,
      caption: data.caption || undefined,
    };
  } else {
    messageBody.document = {
      id: uploadPayload.id,
      caption: data.caption || undefined,
      filename: normalizedFilename,
    };
  }

  const sendResponse = await fetch(getGraphUrl(`${connection.phoneNumberId}/messages`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messageBody),
  });
  const sendPayload: any = await sendResponse.json();
  const content = data.caption || `[${normalizedMediaType}] ${normalizedFilename}`;

  if (!sendResponse.ok) {
    const message = sendPayload?.error?.message || `Failed to send WhatsApp ${normalizedMediaType}`;
    await prisma.whatsAppMessageLog.create({
      data: {
        userId,
        leadId: data.leadId,
        messageId: data.clientMessageId || null,
        direction: 'outbound',
        messageType: normalizedMediaType,
        transcriptionStatus: 'not_applicable',
        fromPhone: connection.displayPhone ? sanitizePhone(connection.displayPhone) : null,
        toPhone,
        content,
        status: 'failed',
        error: message,
        rawPayload: { sendPayload, uploadPayload },
      },
    });
    throw new Error(message);
  }

  const serverMessageId = sendPayload?.messages?.[0]?.id || null;
  const messageId = data.clientMessageId || serverMessageId;
  const messageAt = new Date();

  await prisma.whatsAppMessageLog.create({
    data: {
      userId,
      leadId: data.leadId,
      messageId,
      direction: 'outbound',
      messageType: normalizedMediaType,
      transcriptionStatus: 'not_applicable',
      fromPhone: connection.displayPhone ? sanitizePhone(connection.displayPhone) : null,
      toPhone,
      content,
      status: 'sent',
      error: null,
      externalTimestamp: messageAt,
      rawPayload: {
        sendPayload,
        mediaType: normalizedMediaType,
        mediaId: uploadPayload.id,
        filename: normalizedFilename,
        mimeType: normalizedMimeType,
        clientMessageId: data.clientMessageId || null,
        serverMessageId,
      },
    },
  });

  const resolvedLeadId = data.leadId || (await resolveLeadForPhone(userId, toPhone))?.id || null;
  await updateConversationState({
    userId,
    phone: toPhone,
    leadId: resolvedLeadId,
    messageId,
    preview: content,
    status: 'sent',
    error: null,
    direction: 'outbound',
    messageAt,
  });

  return {
    sent: true,
    messageId,
    serverMessageId,
    clientMessageId: data.clientMessageId || null,
    toPhone,
  };
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
          accessToken: true,
          displayPhone: true,
          user: {
            select: {
              industry: true,
              defaultFollowUpDays: true,
            },
          },
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
          const messageType = typeof message?.type === 'string' ? String(message.type) : 'text';
          let content =
            message?.text?.body ||
            (messageType ? `[${messageType}]` : '[message]');
          let transcriptionStatus: 'pending' | 'success' | 'failed' | 'not_applicable' =
            messageType === 'audio' ? 'pending' : 'not_applicable';
          let transcriptionError: string | null = null;

          if (messageType === 'audio') {
            const audioResult = await resolveInboundAudioContent(connection.accessToken, message);
            content = audioResult.content;
            transcriptionStatus = audioResult.transcriptionStatus;
            transcriptionError = audioResult.transcriptionError;
          }

          let resolvedLead = await resolveLeadForPhone(connection.userId, fromPhone);
          const messageAt = toDateFromUnix(message?.timestamp) || new Date();
          const inferredSignals = inferInquirySignals(content, connection.user?.industry);

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

          if (!resolvedLead) {
            resolvedLead = await prisma.lead.create({
              data: {
                userId: connection.userId,
                name: deriveLeadNameFromPhone(fromPhone),
                contact: fromPhone,
                status: 'follow_up_due',
                stage: inferredSignals.stage,
                tags: inferredSignals.tags,
                lastActivityAt: messageAt,
                lastInboundAt: messageAt,
              },
            });

            await ensureInboundFollowUpReminder(
              resolvedLead.id,
              connection.user?.defaultFollowUpDays ?? 1
            );
          }

          await prisma.whatsAppMessageLog.create({
            data: {
              userId: connection.userId,
              leadId: resolvedLead.id,
              messageId: messageId || null,
              direction: 'inbound',
              messageType,
              transcriptionStatus,
              transcriptionError,
              fromPhone,
              toPhone: businessPhone || phoneNumberId,
              content,
              status: 'received',
              error: null,
              externalTimestamp: messageAt,
              rawPayload: message,
            },
          });

          await updateConversationState({
            userId: connection.userId,
            phone: fromPhone,
            leadId: resolvedLead.id,
            messageId: messageId || null,
            preview: content,
            status: 'received',
            error: null,
            direction: 'inbound',
            messageAt,
            markUnread: true,
          });

          await prisma.lead.update({
            where: { id: resolvedLead.id },
            data: {
              status: 'follow_up_due',
              stage: inferredSignals.stage,
              tags: inferredSignals.tags,
              lastActivityAt: messageAt,
              lastInboundAt: messageAt,
            },
          });

          await cancelPendingSystemTasks(resolvedLead.id);
          await ensureInboundFollowUpReminder(
            resolvedLead.id,
            connection.user?.defaultFollowUpDays ?? 1
          );
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
          const statusAt = toDateFromUnix(status?.timestamp) || new Date();
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
              externalTimestamp: statusAt,
              rawPayload: status,
            },
          });

          if (updated.count === 0) {
            await prisma.whatsAppMessageLog.create({
              data: {
                userId: connection.userId,
                messageId,
                direction: 'outbound',
                messageType: 'status',
                transcriptionStatus: 'not_applicable',
                fromPhone: businessPhone || null,
                toPhone: recipient || 'unknown',
                content: '[status webhook]',
                status: statusValue,
                error: errorMessage,
                externalTimestamp: statusAt,
                rawPayload: status,
              },
            });
          }

          await updateConversationState({
            userId: connection.userId,
            phone: recipient,
            messageId,
            status: statusValue,
            error: errorMessage,
            direction: 'outbound',
            messageAt: statusAt,
          });
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
  unreadCount: number;
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

  const [logs, leads, states] = await Promise.all([
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
    prisma.whatsAppConversationState.findMany({
      where: { userId },
      orderBy: [{ lastMessageAt: 'desc' }],
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
        unreadCount: 0,
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

  for (const state of states) {
    const phone = normalizePhone(state.phone);
    if (!phone) {
      continue;
    }

    const existing = summaries.get(phone);
    if (existing) {
      existing.unreadCount = state.unreadCount;
      existing.lastStatus = state.lastStatus || existing.lastStatus;
      existing.lastMessage = state.lastMessagePreview || existing.lastMessage;
      existing.lastError = state.lastError || existing.lastError;
      existing.lastAt = state.lastMessageAt || existing.lastAt;
      if (!existing.lead && state.leadId) {
        const matchedLead = leads.find((lead) => lead.id === state.leadId);
        if (matchedLead) {
          existing.lead = { id: matchedLead.id, name: matchedLead.name, status: matchedLead.status };
        }
      }
      continue;
    }

    const fallbackLead = state.leadId
      ? leads.find((lead) => lead.id === state.leadId) || null
      : pickBestLeadMatch(phone, leads);

    summaries.set(phone, {
      phone,
      totalMessages: 0,
      sentCount: 0,
      failedCount: 0,
      unreadCount: state.unreadCount,
      lastStatus: state.lastStatus || 'received',
      lastMessage: state.lastMessagePreview || '',
      lastError: state.lastError,
      lastAt: state.lastMessageAt || state.updatedAt,
      lead: fallbackLead
        ? { id: fallbackLead.id, name: fallbackLead.name, status: fallbackLead.status }
        : null,
    });
  }

  return Array.from(summaries.values())
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, safeLimit);
};

export const markWhatsAppConversationRead = async (userId: string, phone: string) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error('Invalid phone number');
  }

  return prisma.whatsAppConversationState.upsert({
    where: {
      userId_phone: {
        userId,
        phone: normalizedPhone,
      },
    },
    update: {
      unreadCount: 0,
      lastReadAt: new Date(),
    },
    create: {
      userId,
      phone: normalizedPhone,
      unreadCount: 0,
      lastReadAt: new Date(),
    },
  });
};

export const getUnreadConversationSummary = async (userId: string) => {
  const [states, aggregate] = await Promise.all([
    prisma.whatsAppConversationState.findMany({
      where: {
        userId,
        unreadCount: { gt: 0 },
      },
      orderBy: [{ lastMessageAt: 'desc' }],
      take: 10,
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    }),
    prisma.whatsAppConversationState.aggregate({
      where: {
        userId,
        unreadCount: { gt: 0 },
      },
      _sum: { unreadCount: true },
      _count: { _all: true },
    }),
  ]);

  return {
    unreadMessages: aggregate._sum.unreadCount || 0,
    unreadConversations: aggregate._count._all || 0,
    latestUnread: states.map((state) => ({
      phone: state.phone,
      unreadCount: state.unreadCount,
      lastMessagePreview: state.lastMessagePreview,
      lastMessageAt: state.lastMessageAt,
      lastStatus: state.lastStatus,
      lead: state.lead
        ? { id: state.lead.id, name: state.lead.name, status: normalizeLeadStatus(state.lead.status) }
        : null,
    })),
  };
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
