import prisma from '../config/database';

type ReminderFilter = 'all' | 'pending' | 'done';

const includeLead = {
  lead: {
    select: {
      id: true,
      name: true,
      contact: true,
      status: true,
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
