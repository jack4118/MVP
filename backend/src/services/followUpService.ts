import prisma from '../config/database';

export const ACTIVE_LEAD_STATUSES = ['new', 'waiting_reply', 'follow_up_due', 'won', 'lost'] as const;
export type ActiveLeadStatus = (typeof ACTIVE_LEAD_STATUSES)[number];

const legacyStatusMap: Record<string, ActiveLeadStatus> = {
  new: 'new',
  contacted: 'waiting_reply',
  interested: 'follow_up_due',
  waiting_reply: 'waiting_reply',
  not_interested: 'lost',
  closed: 'won',
  follow_up_due: 'follow_up_due',
  won: 'won',
  lost: 'lost',
};

const DEFAULT_RULES = [
  { name: '2 day follow-up', triggerDays: 2, actionType: 'follow_up' },
  { name: '5 day follow-up', triggerDays: 5, actionType: 'follow_up' },
] as const;

export const normalizeLeadStatus = (status?: string | null): ActiveLeadStatus => {
  if (!status) {
    return 'new';
  }

  return legacyStatusMap[status] || 'new';
};

export const isClosedLeadStatus = (status?: string | null) => {
  const normalized = normalizeLeadStatus(status);
  return normalized === 'won' || normalized === 'lost';
};

export const ensureDefaultFollowUpRules = async (userId: string) => {
  const existing = await prisma.followUpRule.findMany({
    where: { userId, isActive: true },
    orderBy: { triggerDays: 'asc' },
  });

  if (existing.length > 0) {
    return existing;
  }

  await prisma.followUpRule.createMany({
    data: DEFAULT_RULES.map((rule) => ({
      userId,
      name: rule.name,
      triggerDays: rule.triggerDays,
      actionType: rule.actionType,
      isActive: true,
    })),
  });

  return prisma.followUpRule.findMany({
    where: { userId, isActive: true },
    orderBy: { triggerDays: 'asc' },
  });
};

export const cancelPendingSystemTasks = async (leadId: string) => {
  await prisma.reminder.updateMany({
    where: {
      leadId,
      isDone: false,
      isSystemTask: true,
    },
    data: {
      isDone: true,
    },
  });
};

export const scheduleNextSystemFollowUp = async (params: {
  userId: string;
  leadId: string;
  stepIndex?: number;
  fromDate?: Date;
  force?: boolean;
}) => {
  const { userId, leadId, stepIndex = 0, fromDate = new Date(), force = false } = params;

  const [lead, rules] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    ensureDefaultFollowUpRules(userId),
  ]);

  if (!lead || isClosedLeadStatus(lead.status)) {
    return null;
  }

  const normalizedStatus = normalizeLeadStatus(lead.status);
  if (!force && normalizedStatus !== 'waiting_reply') {
    return null;
  }

  const rule = rules[stepIndex];
  if (!rule) {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'follow_up_due',
        nextFollowUpAt: null,
      },
    });
    return null;
  }

  const triggerAt = new Date(fromDate);
  triggerAt.setDate(triggerAt.getDate() + rule.triggerDays);

  await prisma.reminder.updateMany({
    where: {
      leadId,
      isDone: false,
      isSystemTask: true,
    },
    data: {
      isDone: true,
    },
  });

  const reminder = await prisma.reminder.create({
    data: {
      leadId,
      type: rule.actionType,
      triggerAt,
      isDone: false,
      isSystemTask: true,
      stepIndex,
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: 'waiting_reply',
      nextFollowUpAt: triggerAt,
    },
  });

  return reminder;
};

