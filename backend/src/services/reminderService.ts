import prisma from '../config/database';
import { getWhatsappConnection, sendWhatsAppText } from './whatsappService';

type ReminderFilter = 'all' | 'pending' | 'done';
type DispatchChannel = 'in_app' | 'whatsapp';
type DispatchStatus = 'sent' | 'failed' | 'requires_template' | 'skipped';

const includeLead = {
  lead: {
    select: {
      id: true,
      name: true,
      contact: true,
      status: true,
      userId: true,
    },
  },
};

const getDayRange = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { today, tomorrow };
};

const buildDispatchMessage = (reminder: { type: string; lead: { name: string } }) => {
  switch (reminder.type) {
    case 'payment':
      return `Hi ${reminder.lead.name}, friendly reminder regarding pending payment. Could you share your expected payment date?`;
    case 'meeting':
      return `Hi ${reminder.lead.name}, quick reminder about our meeting follow-up. Could you confirm your available time?`;
    case 'custom':
      return `Hi ${reminder.lead.name}, this is your scheduled follow-up reminder. Please share a quick update when convenient.`;
    case 'follow_up':
    default:
      return `Hi ${reminder.lead.name}, gentle follow-up on our previous discussion. Could you confirm your next-step timeline?`;
  }
};

const isUniqueConstraintError = (error: unknown) => {
  return typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'P2002';
};

const createDispatchLog = async (data: {
  reminderId: string;
  userId: string;
  dispatchKey: string;
  channel: DispatchChannel;
  status: DispatchStatus;
  error?: string | null;
  payload?: Record<string, unknown>;
}) => {
  try {
    return await prisma.reminderDispatchLog.create({
      data: {
        reminderId: data.reminderId,
        userId: data.userId,
        dispatchKey: data.dispatchKey,
        channel: data.channel,
        status: data.status,
        error: data.error || null,
        payload: (data.payload || undefined) as any,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return null;
    }
    throw error;
  }
};

export const createReminder = async (userId: string, data: { leadId: string; type: string; triggerAt: string }) => {
  const lead = await prisma.lead.findFirst({
    where: {
      id: data.leadId,
      userId,
    },
  });

  if (!lead) {
    throw new Error('Lead not found');
  }

  return prisma.reminder.create({
    data: {
      leadId: data.leadId,
      type: data.type,
      triggerAt: new Date(data.triggerAt),
      isDone: false,
    },
    include: includeLead,
  });
};

export const getTodayReminders = async (userId: string) => {
  const { today, tomorrow } = getDayRange();

  return prisma.reminder.findMany({
    where: {
      lead: { userId },
      triggerAt: { gte: today, lt: tomorrow },
      isDone: false,
    },
    include: includeLead,
    orderBy: { triggerAt: 'asc' },
  });
};

export const getReminders = async (
  userId: string,
  options: {
    view?: 'today' | 'upcoming' | 'all';
    status?: ReminderFilter;
    days?: number;
  }
) => {
  const view = options.view || 'all';
  const status = options.status || 'pending';
  const days = Math.min(Math.max(options.days || 30, 1), 365);

  const now = new Date();
  const { today, tomorrow } = getDayRange();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  const where: any = {
    lead: { userId },
  };

  if (status === 'pending') {
    where.isDone = false;
  } else if (status === 'done') {
    where.isDone = true;
  }

  if (view === 'today') {
    where.triggerAt = { gte: today, lt: tomorrow };
  } else if (view === 'upcoming') {
    where.triggerAt = { gte: now, lte: end };
  }

  return prisma.reminder.findMany({
    where,
    include: includeLead,
    orderBy: { triggerAt: 'asc' },
  });
};

export const markReminderDone = async (userId: string, reminderId: string) => {
  const reminder = await prisma.reminder.findFirst({
    where: {
      id: reminderId,
      lead: { userId },
    },
  });

  if (!reminder) {
    throw new Error('Reminder not found');
  }

  return prisma.reminder.update({
    where: { id: reminderId },
    data: { isDone: true },
    include: includeLead,
  });
};

export const updateReminder = async (
  userId: string,
  reminderId: string,
  data: { type?: string; triggerAt?: string; isDone?: boolean }
) => {
  const reminder = await prisma.reminder.findFirst({
    where: {
      id: reminderId,
      lead: { userId },
    },
  });

  if (!reminder) {
    throw new Error('Reminder not found');
  }

  return prisma.reminder.update({
    where: { id: reminderId },
    data: {
      ...(data.type ? { type: data.type } : {}),
      ...(data.triggerAt ? { triggerAt: new Date(data.triggerAt) } : {}),
      ...(typeof data.isDone === 'boolean' ? { isDone: data.isDone } : {}),
    },
    include: includeLead,
  });
};

export const deleteReminder = async (userId: string, reminderId: string) => {
  const reminder = await prisma.reminder.findFirst({
    where: {
      id: reminderId,
      lead: { userId },
    },
  });

  if (!reminder) {
    throw new Error('Reminder not found');
  }

  await prisma.reminder.delete({ where: { id: reminderId } });
  return { deleted: true };
};

export const getReminderDispatchLogs = async (userId: string, limit: number = 50) => {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  return prisma.reminderDispatchLog.findMany({
    where: { userId },
    include: {
      reminder: {
        select: {
          id: true,
          type: true,
          triggerAt: true,
          lead: {
            select: {
              id: true,
              name: true,
              contact: true,
            },
          },
        },
      },
    },
    orderBy: { sentAt: 'desc' },
    take: safeLimit,
  });
};

export const dispatchDueReminders = async () => {
  const now = new Date();
  const dueReminders = await prisma.reminder.findMany({
    where: {
      isDone: false,
      triggerAt: { lte: now },
    },
    include: includeLead,
    orderBy: { triggerAt: 'asc' },
    take: 200,
  });

  let processed = 0;

  for (const reminder of dueReminders) {
    const slot = reminder.triggerAt.toISOString();
    const inAppKey = `${reminder.id}:in_app:${slot}`;

    const inAppLog = await createDispatchLog({
      reminderId: reminder.id,
      userId: reminder.lead.userId,
      dispatchKey: inAppKey,
      channel: 'in_app',
      status: 'sent',
      payload: {
        leadId: reminder.lead.id,
        leadName: reminder.lead.name,
        type: reminder.type,
      },
    });

    if (!inAppLog) {
      continue;
    }

    processed += 1;

    const whatsappKey = `${reminder.id}:whatsapp:${slot}`;
    const contactPhone = reminder.lead.contact?.trim();

    if (!contactPhone) {
      await createDispatchLog({
        reminderId: reminder.id,
        userId: reminder.lead.userId,
        dispatchKey: whatsappKey,
        channel: 'whatsapp',
        status: 'skipped',
        error: 'Lead contact phone is missing',
      });
    } else {
      const connection = await getWhatsappConnection(reminder.lead.userId);

      if (!connection?.isActive) {
        await createDispatchLog({
          reminderId: reminder.id,
          userId: reminder.lead.userId,
          dispatchKey: whatsappKey,
          channel: 'whatsapp',
          status: 'skipped',
          error: 'WhatsApp connection is not active',
        });
      } else {
        const content = buildDispatchMessage(reminder);
        try {
          const result = await sendWhatsAppText(reminder.lead.userId, {
            leadId: reminder.lead.id,
            toPhone: contactPhone,
            content,
          });

          await createDispatchLog({
            reminderId: reminder.id,
            userId: reminder.lead.userId,
            dispatchKey: whatsappKey,
            channel: 'whatsapp',
            status: 'sent',
            payload: {
              messageId: result.messageId,
              toPhone: result.toPhone,
            },
          });
        } catch (error: any) {
          const message = error instanceof Error ? error.message : 'Unknown WhatsApp dispatch error';
          const requiresTemplate = message.toLowerCase().includes('re-engagement message');

          await createDispatchLog({
            reminderId: reminder.id,
            userId: reminder.lead.userId,
            dispatchKey: whatsappKey,
            channel: 'whatsapp',
            status: requiresTemplate ? 'requires_template' : 'failed',
            error: message,
          });
        }
      }
    }

    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        isDone: true,
        lastDispatchedAt: now,
      },
    });
  }

  return {
    processed,
    scanned: dueReminders.length,
  };
};
