import { UsageInfo } from '../services/api';

const softPaywallEnabled = import.meta.env.VITE_FEATURE_SOFT_PAYWALL !== 'false';

const COPY_GATE_MIN_GENERATED = 3;
const COPY_GATE_LOW_REMAINING = 2;

export const shouldGateCopyForFree = (usageInfo: UsageInfo | null): boolean => {
  if (!softPaywallEnabled || !usageInfo) {
    return false;
  }

  if (usageInfo.plan !== 'free') {
    return false;
  }

  const remaining = usageInfo.aiRemaining;
  const nearLimit = remaining !== null ? remaining <= COPY_GATE_LOW_REMAINING : false;
  const hasValueMoment = usageInfo.aiUsageThisMonth >= COPY_GATE_MIN_GENERATED;

  return nearLimit || hasValueMoment;
};
