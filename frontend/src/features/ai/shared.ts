import {
  aiApi,
  AiGenerationDebug,
  AiTone,
  AppLanguage,
  ConversationMode,
  EmojiDensity,
  FollowUpStylePreset,
  Lead,
  LeadStatus,
  OutputFormat,
  PaymentStylePreset,
} from '../../services/api';
import { Translations } from '../../contexts/LanguageContext';

export const aiPresetsEnabled = import.meta.env.VITE_FEATURE_AI_PRESETS !== 'false';

export type AiPurpose = 'follow-up' | 'payment';
export type GenerationStage = 'ready' | 'thinking' | 'done';

export interface SharedAiConfig {
  purpose: AiPurpose;
  objective: string;
  outputFormat: OutputFormat;
  daysPassed: number;
  tone: AiTone;
  amount: number;
  dueDate: string;
  conversationMode: ConversationMode;
  emojiDensity: EmojiDensity;
  followUpStylePreset: FollowUpStylePreset;
  paymentStylePreset: PaymentStylePreset;
}

export interface AiOption {
  value: string;
  label: string;
}

export const createInitialAiConfig = (
  purpose: AiPurpose = 'follow-up',
  overrides: Partial<SharedAiConfig> = {}
): SharedAiConfig => ({
  purpose,
  objective: '',
  outputFormat: 'chat',
  daysPassed: 0,
  tone: 'polite',
  amount: 0,
  dueDate: '',
  conversationMode: 'standard',
  emojiDensity: 'medium',
  followUpStylePreset: 'gentle_nudge',
  paymentStylePreset: 'friendly_reminder',
  ...overrides,
});

export const getDefaultPurposeFromLeadStatus = (status?: LeadStatus): AiPurpose =>
  status === 'won' ? 'payment' : 'follow-up';

export const getDefaultQuickConfigForLead = (lead: Lead, daysPassed: number): SharedAiConfig =>
  createInitialAiConfig(getDefaultPurposeFromLeadStatus(lead.status), {
    daysPassed,
    outputFormat: 'whatsapp',
  });

export const getPurposeOptions = (t: Translations): AiOption[] => [
  { value: 'follow-up', label: t.ai.followUp },
  { value: 'payment', label: t.ai.payment },
];

export const getOutputFormatOptions = (t: Translations): AiOption[] => [
  { value: 'chat', label: t.ai.formatChat },
  { value: 'email', label: t.ai.formatEmail },
  { value: 'whatsapp', label: t.ai.formatWhatsapp },
];

export const getToneOptions = (t: Translations): AiOption[] => [
  { value: 'polite', label: t.ai.polite },
  { value: 'friendly', label: t.ai.friendly },
  { value: 'professional', label: t.ai.professional },
  { value: 'casual', label: t.ai.casual },
  { value: 'assertive', label: t.ai.assertive },
  { value: 'empathetic', label: t.ai.empathetic },
  { value: 'urgent', label: t.ai.urgent },
];

export const getConversationModeOptions = (t: Translations): AiOption[] => [
  { value: 'standard', label: t.ai.replyModeStandard },
  { value: 'humor', label: t.ai.replyModeHumor },
  { value: 'banter', label: t.ai.replyModeBanter },
  { value: 'direct', label: t.ai.replyModeDirect },
  { value: 'consultative', label: t.ai.replyModeConsultative },
];

export const getEmojiOptions = (t: Translations): AiOption[] => [
  { value: 'low', label: t.ai.emojiLow },
  { value: 'medium', label: t.ai.emojiMedium },
  { value: 'high', label: t.ai.emojiHigh },
];

export const getFollowUpPresetOptions = (t: Translations): AiOption[] => [
  { value: 'gentle_nudge', label: t.ai.followUpPresetGentleNudge },
  { value: 'value_reminder', label: t.ai.followUpPresetValueReminder },
  { value: 'meeting_request', label: t.ai.followUpPresetMeetingRequest },
  { value: 'deadline_push', label: t.ai.followUpPresetDeadlinePush },
  { value: 'social_proof', label: t.ai.followUpPresetSocialProof },
];

export const getPaymentPresetOptions = (t: Translations): AiOption[] => [
  { value: 'friendly_reminder', label: t.ai.paymentPresetFriendlyReminder },
  { value: 'due_today', label: t.ai.paymentPresetDueToday },
  { value: 'overdue_escalation', label: t.ai.paymentPresetOverdueEscalation },
  { value: 'installment_offer', label: t.ai.paymentPresetInstallmentOffer },
  { value: 'soft_final_notice', label: t.ai.paymentPresetSoftFinalNotice },
];

export const getHistoryStyleLabel = (
  t: Translations,
  purpose: 'follow_up' | 'payment',
  stylePreset?: string | null
) => {
  if (!stylePreset) {
    return '';
  }

  if (purpose === 'follow_up') {
    const followUpMap: Record<string, string> = Object.fromEntries(
      getFollowUpPresetOptions(t).map((option) => [option.value, option.label])
    );
    return followUpMap[stylePreset] || stylePreset;
  }

  const paymentMap: Record<string, string> = Object.fromEntries(
    getPaymentPresetOptions(t).map((option) => [option.value, option.label])
  );
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
  if (config.purpose === 'follow-up') {
    return aiApi.generateFollowUp({
      leadId: lead.id,
      leadName: lead.name,
      objective: config.objective.trim(),
      status: lead.status,
      daysPassed: config.daysPassed,
      tone: config.tone,
      stylePreset: aiPresetsEnabled ? config.followUpStylePreset : undefined,
      conversationMode: config.conversationMode,
      emojiDensity: config.emojiDensity,
      outputFormat: config.outputFormat,
      language,
      variantCount: 3,
    });
  }

  return aiApi.generatePayment({
    leadId: lead.id,
    leadName: lead.name,
    objective: config.objective.trim(),
    amount: config.amount > 0 ? config.amount : undefined,
    dueDate: config.dueDate || undefined,
    tone: config.tone,
    stylePreset: aiPresetsEnabled ? config.paymentStylePreset : undefined,
    conversationMode: config.conversationMode,
    emojiDensity: config.emojiDensity,
    outputFormat: config.outputFormat,
    language,
    variantCount: 3,
  });
};

export const getHistoryPurposeLabel = (t: Translations, purpose: 'follow_up' | 'payment') =>
  purpose === 'follow_up' ? t.ai.historyFollowUp : t.ai.historyPayment;

export const getEventPurpose = (purpose: AiPurpose) => (purpose === 'follow-up' ? 'follow_up' : 'payment');

export const resetAiResult = () => ({
  generatedText: '',
  generationDebug: null as AiGenerationDebug | null,
  generationStage: 'ready' as GenerationStage,
});
