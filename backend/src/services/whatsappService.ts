import prisma from '../config/database';

const META_GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v22.0';

const sanitizePhone = (phone: string): string => phone.replace(/[^\d]/g, '');

const getGraphUrl = (path: string) => `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${path}`;

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
  data: { businessAccountId: string; phoneNumberId: string; accessToken: string }
) => {
  return prisma.whatsAppConnection.upsert({
    where: { userId },
    update: {
      businessAccountId: data.businessAccountId,
      phoneNumberId: data.phoneNumberId,
      accessToken: data.accessToken,
      isActive: true,
    },
    create: {
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
          toPhone,
          content: data.content,
          status: 'failed',
          error: message,
        },
      });

      throw new Error(message);
    }

    const messageId = payload?.messages?.[0]?.id || null;

    await prisma.whatsAppMessageLog.create({
      data: {
        userId,
        leadId: data.leadId,
        toPhone,
        content: data.content,
        status: 'sent',
        error: null,
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
