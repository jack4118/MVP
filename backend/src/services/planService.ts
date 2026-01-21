import prisma from '../config/database';

export type Plan = 'free' | 'pro';

export interface UsageInfo {
  plan: Plan;
  leadCount: number;
  leadLimit: number | null; // null means unlimited
  aiUsageThisMonth: number;
  aiLimit: number | null; // null means unlimited
  canCreateLead: boolean;
  canUseAi: boolean;
}

const FREE_PLAN_LEAD_LIMIT = 5;
const FREE_PLAN_AI_LIMIT = 10;

export const getUserPlan = async (userId: string): Promise<Plan> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const plan = (user.plan as Plan) || 'free';
  console.log(`[getUserPlan] User: ${userId}, Plan from DB: ${user.plan}, Returned: ${plan}`);
  return plan;
};

export const getLeadCount = async (userId: string): Promise<number> => {
  return await prisma.lead.count({
    where: { userId },
  });
};

export const getMonthlyAiUsage = async (userId: string): Promise<number> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return await prisma.aiLog.count({
    where: {
      userId,
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
  });
};

export const checkLeadLimit = async (userId: string, plan: Plan): Promise<boolean> => {
  if (plan === 'pro') {
    return true; // Unlimited for Pro
  }

  const leadCount = await getLeadCount(userId);
  return leadCount < FREE_PLAN_LEAD_LIMIT;
};

export const checkAiUsageLimit = async (userId: string, plan: Plan): Promise<boolean> => {
  if (plan === 'pro') {
    return true; // Unlimited for Pro
  }

  const aiUsage = await getMonthlyAiUsage(userId);
  const canUse = aiUsage < FREE_PLAN_AI_LIMIT;
  console.log(`[checkAiUsageLimit] User: ${userId}, Plan: ${plan}, AI Usage: ${aiUsage}, Limit: ${FREE_PLAN_AI_LIMIT}, Can Use: ${canUse}`);
  return canUse;
};

export const getUsageInfo = async (userId: string): Promise<UsageInfo> => {
  const plan = await getUserPlan(userId);
  const leadCount = await getLeadCount(userId);
  const aiUsageThisMonth = await getMonthlyAiUsage(userId);

  const leadLimit = plan === 'pro' ? null : FREE_PLAN_LEAD_LIMIT;
  const aiLimit = plan === 'pro' ? null : FREE_PLAN_AI_LIMIT;

  const canCreateLead = await checkLeadLimit(userId, plan);
  const canUseAi = await checkAiUsageLimit(userId, plan);

  return {
    plan,
    leadCount,
    leadLimit,
    aiUsageThisMonth,
    aiLimit,
    canCreateLead,
    canUseAi,
  };
};

export const upgradeToPro = async (userId: string): Promise<void> => {
  await prisma.user.update({
    where: { id: userId },
    data: { plan: 'pro' },
  });
};

export const downgradeToFree = async (userId: string): Promise<void> => {
  await prisma.user.update({
    where: { id: userId },
    data: { plan: 'free' },
  });
};

