import {
  aiApi,
  AiChannel,
  AiGenerationDebug,
  AiStyle,
  AiTone,
  AppLanguage,
  EmojiDensity,
  FollowUpStylePreset,
  Lead,
  LeadStatus,
  PaymentStylePreset,
  User,
} from '../../services/api';
import { Translations } from '../../contexts/LanguageContext';

export const aiPresetsEnabled = import.meta.env.VITE_FEATURE_AI_PRESETS !== 'false';

export type AiPurpose = 'follow-up' | 'payment';
export type GenerationStage = 'ready' | 'thinking' | 'done';

export interface SharedAiConfig {
  goal: string;
  channel: AiChannel;
  style: AiStyle;
  context: string;
  daysPassed: number;
  emojiIntensity: EmojiDensity;
}

export interface AiOption {
  value: string;
  label: string;
}

export const createInitialAiConfig = (
  _purpose: AiPurpose = 'follow-up',
  overrides: Partial<SharedAiConfig> = {}
): SharedAiConfig => ({
  goal: '',
  channel: 'chat',
  style: 'standard',
  context: '',
  daysPassed: 0,
  emojiIntensity: 'medium',
  ...overrides,
});

export const getDefaultPurposeFromLeadStatus = (status?: LeadStatus): AiPurpose =>
  status === 'won' ? 'payment' : 'follow-up';

const PLACEHOLDER_MEMORY_SIGNALS = [
  'replace this with a real customer',
  'replace this with a real customer, whatsapp number, and notes before sending a follow-up.',
  '请先替换成真实客户',
  '请先替换为真实客户',
  'ganti dengan pelanggan sebenar',
];

const normalizeMemoryText = (value?: string | null) => (value || '').trim().toLowerCase();

export const hasPlaceholderLeadMemory = (
  lead: Pick<Lead, 'memorySummary' | 'memoryGoal'>
) => {
  const summary = normalizeMemoryText(lead.memorySummary);
  const goal = normalizeMemoryText(lead.memoryGoal);
  return PLACEHOLDER_MEMORY_SIGNALS.some(
    (signal) => summary.includes(signal) || goal.includes(signal)
  );
};

export const getSanitizedLeadMemoryGoal = (lead: Pick<Lead, 'memorySummary' | 'memoryGoal'>) =>
  hasPlaceholderLeadMemory(lead) ? '' : lead.memoryGoal || '';

export const shouldRefreshLeadMemory = (
  lead: Pick<
    Lead,
    'memorySummary' | 'memoryGoal' | 'memoryUpdatedAt' | 'memoryLanguage' | 'lastInboundAt'
  >,
  language: AppLanguage
) => {
  if (!lead.memorySummary || !lead.memoryUpdatedAt) {
    return true;
  }

  if (lead.memoryLanguage !== language) {
    return true;
  }

  if (hasPlaceholderLeadMemory(lead)) {
    return true;
  }

  const memoryUpdatedAt = new Date(lead.memoryUpdatedAt).getTime();
  if (lead.lastInboundAt) {
    const lastInboundAt = new Date(lead.lastInboundAt).getTime();
    if (Number.isFinite(lastInboundAt) && lastInboundAt > memoryUpdatedAt) {
      return true;
    }
  }

  return Date.now() - memoryUpdatedAt > 1000 * 60 * 60 * 24 * 3;
};

const mapConversationModeToStyle = (value?: string | null): AiStyle => {
  if (value === 'humor' || value === 'banter' || value === 'direct' || value === 'consultative') {
    return value;
  }
  return 'standard';
};

const mapStyleToTone = (style: AiStyle): AiTone => {
  if (style === 'direct') return 'assertive';
  if (style === 'consultative') return 'professional';
  if (style === 'banter') return 'friendly';
  if (style === 'humor') return 'casual';
  return 'polite';
};

const mapStyleToLegacyPreset = (
  style: AiStyle,
  purpose: AiPurpose
): FollowUpStylePreset | PaymentStylePreset => {
  if (purpose === 'payment') {
    if (style === 'direct') return 'due_today';
    if (style === 'consultative') return 'installment_offer';
    if (style === 'banter') return 'friendly_reminder';
    if (style === 'humor') return 'friendly_reminder';
    return 'friendly_reminder';
  }

  if (style === 'direct') return 'deadline_push';
  if (style === 'consultative') return 'meeting_request';
  if (style === 'banter') return 'social_proof';
  if (style === 'humor') return 'value_reminder';
  return 'gentle_nudge';
};

export const getDefaultQuickConfigForLead = (lead: Lead, daysPassed: number): SharedAiConfig =>
  createInitialAiConfig(getDefaultPurposeFromLeadStatus(lead.status), {
    daysPassed,
    goal: getSanitizedLeadMemoryGoal(lead),
    channel: lead.aiOutputFormat || 'whatsapp',
    style: mapConversationModeToStyle(lead.aiConversationMode),
    emojiIntensity: lead.aiEmojiDensity || 'medium',
  });

export const getDefaultConfigFromLeadMemory = (
  lead: Lead,
  current: SharedAiConfig
): Partial<SharedAiConfig> => ({
  goal: getSanitizedLeadMemoryGoal(lead) || current.goal,
  style: mapConversationModeToStyle(lead.aiConversationMode) || current.style,
  emojiIntensity: lead.aiEmojiDensity || current.emojiIntensity,
  channel: lead.aiOutputFormat || current.channel,
});

export const getDefaultConfigFromUserPreferences = (
  user: User | null | undefined,
  current: SharedAiConfig
): Partial<SharedAiConfig> => {
  const mappedEmojiDensity =
    user?.defaultEmojiDensity ||
    (user?.characterEmoji === 'high'
      ? 'high'
      : user?.characterEmoji === 'low'
        ? 'low'
        : 'medium');

  return {
    style: mapConversationModeToStyle(user?.defaultConversationMode) || current.style,
    emojiIntensity: mappedEmojiDensity,
    channel: user?.defaultOutputFormat || current.channel,
    daysPassed: user?.defaultFollowUpDays ?? current.daysPassed,
  };
};

export const getChannelOptions = (t: Translations): AiOption[] => [
  { value: 'chat', label: t.ai.channelChat },
  { value: 'email', label: t.ai.channelEmail },
  { value: 'whatsapp', label: t.ai.channelWhatsapp },
];

export const getStyleOptions = (t: Translations): AiOption[] => [
  { value: 'standard', label: t.ai.styleStandard },
  { value: 'humor', label: t.ai.styleHumor },
  { value: 'banter', label: t.ai.styleBanter },
  { value: 'direct', label: t.ai.styleDirect },
  { value: 'consultative', label: t.ai.styleConsultative },
];

export const getEmojiIntensityOptions = (t: Translations): AiOption[] => [
  { value: 'low', label: t.ai.emojiLow },
  { value: 'medium', label: t.ai.emojiMedium },
  { value: 'high', label: t.ai.emojiHigh },
];

export const getOutputFormatOptions = getChannelOptions;
export const getConversationModeOptions = getStyleOptions;
export const getEmojiOptions = getEmojiIntensityOptions;

export const getToneOptions = (t: Translations): AiOption[] => [
  { value: 'polite', label: t.ai.polite },
  { value: 'friendly', label: t.ai.friendly },
  { value: 'professional', label: t.ai.professional },
  { value: 'casual', label: t.ai.casual },
  { value: 'assertive', label: t.ai.assertive },
  { value: 'empathetic', label: t.ai.empathetic },
  { value: 'urgent', label: t.ai.urgent },
];

export const getHistoryStyleLabel = (
  t: Translations,
  purpose: 'follow_up' | 'payment',
  stylePreset?: string | null
) => {
  if (!stylePreset) {
    return '';
  }

  const styleMap: Record<string, string> = Object.fromEntries(
    getStyleOptions(t).map((option) => [option.value, option.label])
  );
  if (styleMap[stylePreset]) {
    return styleMap[stylePreset];
  }

  if (purpose === 'follow_up') {
    const followUpMap: Record<string, string> = {
      gentle_nudge: t.ai.followUpPresetGentleNudge,
      value_reminder: t.ai.followUpPresetValueReminder,
      meeting_request: t.ai.followUpPresetMeetingRequest,
      deadline_push: t.ai.followUpPresetDeadlinePush,
      social_proof: t.ai.followUpPresetSocialProof,
    };
    return followUpMap[stylePreset] || stylePreset;
  }

  const paymentMap: Record<string, string> = {
    friendly_reminder: t.ai.paymentPresetFriendlyReminder,
    due_today: t.ai.paymentPresetDueToday,
    overdue_escalation: t.ai.paymentPresetOverdueEscalation,
    installment_offer: t.ai.paymentPresetInstallmentOffer,
    soft_final_notice: t.ai.paymentPresetSoftFinalNotice,
  };
  return paymentMap[stylePreset] || stylePreset;
};

export const generateAiMessage = async ({
  config,
  lead,
  language,
}: {
  config: SharedAiConfig;
  lead: Lead;
  language: AppLanguage;
}): Promise<
  Awaited<ReturnType<typeof aiApi.generateFollowUp>> | Awaited<ReturnType<typeof aiApi.generatePayment>>
> => {
  const purpose = getDefaultPurposeFromLeadStatus(lead.status);
  const legacyTone = mapStyleToTone(config.style);
  const legacyPreset = mapStyleToLegacyPreset(config.style, purpose);

  const payload = {
    leadId: lead.id,
    leadName: lead.name,
    goal: config.goal.trim(),
    context: config.context.trim() || undefined,
    channel: config.channel,
    style: config.style,
    daysPassed: config.daysPassed,
    emojiIntensity: config.emojiIntensity,
    objective: config.goal.trim(),
    tone: legacyTone,
    conversationMode: config.style,
    emojiDensity: config.emojiIntensity,
    outputFormat: config.channel,
    language,
    variantCount: 1,
  };

  if (purpose === 'follow-up') {
    const followUpPayload: Parameters<typeof aiApi.generateFollowUp>[0] = {
      ...payload,
      stylePreset: aiPresetsEnabled ? (legacyPreset as FollowUpStylePreset) : undefined,
      status: lead.status,
    };
    return aiApi.generateFollowUp({
      ...followUpPayload,
    });
  }

  const paymentPayload: Parameters<typeof aiApi.generatePayment>[0] = {
    ...payload,
    stylePreset: aiPresetsEnabled ? (legacyPreset as PaymentStylePreset) : undefined,
  };
  return aiApi.generatePayment(paymentPayload);
};

export const getHistoryPurposeLabel = (t: Translations, purpose: 'follow_up' | 'payment') =>
  purpose === 'follow_up' ? t.ai.historyFollowUp : t.ai.historyPayment;

export const getEventPurpose = (purpose: AiPurpose) => (purpose === 'follow-up' ? 'follow_up' : 'payment');

export const resetAiResult = () => ({
  generatedText: '',
  generationDebug: null as AiGenerationDebug | null,
  generationStage: 'ready' as GenerationStage,
});
