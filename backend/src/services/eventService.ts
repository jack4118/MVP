import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { productEventValues } from '../utils/validation';

export type ProductEvent = (typeof productEventValues)[number];

interface TrackEventData {
  event: ProductEvent;
  props?: Record<string, unknown>;
}

export const trackEvent = async (userId: string, data: TrackEventData) => {
  return prisma.eventLog.create({
    data: {
      userId,
      event: data.event,
      props: data.props as Prisma.InputJsonValue | undefined,
    },
  });
};

export const getDailyEventStats = async (userId: string, days: number = 30) => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await prisma.eventLog.findMany({
    where: {
      userId,
      createdAt: { gte: since },
      event: {
        in: ['ai_generate_clicked', 'ai_generate_success', 'copy_clicked', 'upgrade_confirmed'],
      },
    },
    select: {
      event: true,
      createdAt: true,
      props: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const bucket: Record<string, {
    aiGenerateClicked: number;
    aiGenerateSuccess: number;
    copyClicked: number;
    upgradeConfirmed: number;
    aiSuccessRate: number;
    copyToUpgradeRate: number;
  }> = {};

  for (const log of logs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    if (!bucket[day]) {
      bucket[day] = {
        aiGenerateClicked: 0,
        aiGenerateSuccess: 0,
        copyClicked: 0,
        upgradeConfirmed: 0,
        aiSuccessRate: 0,
        copyToUpgradeRate: 0,
      };
    }

    if (log.event === 'ai_generate_clicked') {
      bucket[day].aiGenerateClicked += 1;
    } else if (log.event === 'ai_generate_success') {
      bucket[day].aiGenerateSuccess += 1;
    } else if (log.event === 'copy_clicked') {
      bucket[day].copyClicked += 1;
    } else if (log.event === 'upgrade_confirmed') {
      bucket[day].upgradeConfirmed += 1;
    }
  }

  return Object.entries(bucket).map(([date, dayData]) => {
    const aiSuccessRate = dayData.aiGenerateClicked
      ? Number((dayData.aiGenerateSuccess / dayData.aiGenerateClicked).toFixed(3))
      : 0;
    const copyToUpgradeRate = dayData.copyClicked
      ? Number((dayData.upgradeConfirmed / dayData.copyClicked).toFixed(3))
      : 0;

    return {
      date,
      ...dayData,
      aiSuccessRate,
      copyToUpgradeRate,
    };
  });
};
