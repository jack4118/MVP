import prisma from '../config/database';
import { normalizeLeadStatus } from './followUpService';

const endOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const getSuggestedActions = (status: string, reminderType?: string) => {
  if (reminderType === 'payment' || status === 'won') {
    return ['payment_reminder', 'mark_won', 'snooze'];
  }

  if (status === 'follow_up_due') {
    return ['send_follow_up', 'ask_budget', 'mark_won', 'snooze'];
  }

  if (status === 'waiting_reply') {
    return ['send_follow_up', 'snooze'];
  }

  return ['send_follow_up', 'mark_won', 'snooze'];
};

export const getDashboardSummary = async (userId: string) => {
  const now = new Date();
  const todayEnd = endOfDay(now);
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const [tasks, recentlyReplied, leadCounts, connection, sentMessagesCount] = await Promise.all([
    prisma.reminder.findMany({
      where: {
        lead: { userId },
        isDone: false,
        triggerAt: { lte: todayEnd },
      },
      include: {
        lead: true,
      },
      orderBy: { triggerAt: 'asc' },
      take: 50,
    }),
    prisma.lead.findMany({
      where: {
        userId,
        lastInboundAt: { gte: threeDaysAgo },
      },
      orderBy: { lastInboundAt: 'desc' },
      take: 10,
    }),
    prisma.lead.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    }),
    prisma.whatsAppConnection.findUnique({
      where: { userId },
      select: { id: true, isActive: true, displayPhone: true },
    }),
    prisma.whatsAppMessageLog.count({
      where: {
        userId,
        direction: 'outbound',
        status: { in: ['sent', 'delivered', 'read'] },
      },
    }),
  ]);

  const overdueFollowUps = tasks.filter((task) => task.triggerAt < now && task.type === 'follow_up');
  const waitingPayment = tasks.filter((task) => task.type === 'payment' || normalizeLeadStatus(task.lead.status) === 'won');

  return {
    todayTasks: tasks.map((task) => ({
      id: task.id,
      type: task.type,
      triggerAt: task.triggerAt,
      isOverdue: task.triggerAt < now,
      isSystemTask: task.isSystemTask,
      lead: {
        id: task.lead.id,
        name: task.lead.name,
        contact: task.lead.contact,
        status: normalizeLeadStatus(task.lead.status),
        nextFollowUpAt: task.lead.nextFollowUpAt,
        lastInboundAt: task.lead.lastInboundAt,
        lastOutboundAt: task.lead.lastOutboundAt,
      },
      suggestedActions: getSuggestedActions(normalizeLeadStatus(task.lead.status), task.type),
    })),
    overdueFollowUps: overdueFollowUps.length,
    waitingPayment: waitingPayment.length,
    recentlyReplied: recentlyReplied.map((lead) => ({
      id: lead.id,
      name: lead.name,
      contact: lead.contact,
      status: normalizeLeadStatus(lead.status),
      lastInboundAt: lead.lastInboundAt,
    })),
    pipeline: leadCounts.reduce<Record<string, number>>((acc, item) => {
      acc[normalizeLeadStatus(item.status)] = item._count.status;
      return acc;
    }, {}),
    onboarding: {
      hasConnectedWhatsApp: !!connection?.isActive,
      connectedDisplayPhone: connection?.displayPhone || null,
      hasLeads: leadCounts.some((item) => item._count.status > 0),
      hasSentFollowUp: sentMessagesCount > 0,
      totalLeads: leadCounts.reduce((sum, item) => sum + item._count.status, 0),
      sentMessagesCount,
    },
  };
};
