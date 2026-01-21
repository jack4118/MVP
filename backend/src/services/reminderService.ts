import prisma from '../config/database';

export const getTodayReminders = async (userId: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const reminders = await prisma.reminder.findMany({
    where: {
      lead: {
        userId,
      },
      triggerAt: {
        gte: today,
        lt: tomorrow,
      },
      isDone: false,
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          contact: true,
          status: true,
        },
      },
    },
    orderBy: {
      triggerAt: 'asc',
    },
  });

  return reminders;
};

export const markReminderDone = async (userId: string, reminderId: string) => {
  const reminder = await prisma.reminder.findFirst({
    where: {
      id: reminderId,
      lead: {
        userId,
      },
    },
  });

  if (!reminder) {
    throw new Error('Reminder not found');
  }

  const updatedReminder = await prisma.reminder.update({
    where: { id: reminderId },
    data: { isDone: true },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          contact: true,
          status: true,
        },
      },
    },
  });

  return updatedReminder;
};

