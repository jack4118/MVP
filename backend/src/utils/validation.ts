import { z } from 'zod';

export const leadStatusValues = [
  'new',
  'waiting_reply',
  'follow_up_due',
  'won',
  'lost',
] as const;

export const leadStatusSchema = z.enum(leadStatusValues);

export const followUpToneValues = ['polite', 'friendly', 'professional', 'casual', 'assertive', 'empathetic', 'urgent'] as const;
export const followUpToneSchema = z.enum(followUpToneValues);

export const paymentToneValues = ['polite', 'friendly', 'professional', 'casual', 'assertive', 'empathetic', 'urgent'] as const;
export const paymentToneSchema = z.enum(paymentToneValues);

export const followUpStylePresetValues = ['gentle_nudge', 'value_reminder', 'meeting_request', 'deadline_push', 'social_proof'] as const;
export const paymentStylePresetValues = ['friendly_reminder', 'due_today', 'overdue_escalation', 'installment_offer', 'soft_final_notice'] as const;

export const followUpStylePresetSchema = z.enum(followUpStylePresetValues);
export const paymentStylePresetSchema = z.enum(paymentStylePresetValues);
export const outputFormatValues = ['chat', 'email', 'whatsapp'] as const;
export const outputFormatSchema = z.enum(outputFormatValues);
export const conversationModeValues = ['standard', 'humor', 'banter', 'direct', 'consultative'] as const;
export const conversationModeSchema = z.enum(conversationModeValues);
export const aiStyleValues = conversationModeValues;
export const aiStyleSchema = conversationModeSchema;
export const emojiDensityValues = ['low', 'medium', 'high'] as const;
export const emojiDensitySchema = z.enum(emojiDensityValues);
export const baseStyleToneValues = ['default', 'professional', 'friendly', 'concise'] as const;
export const baseStyleToneSchema = z.enum(baseStyleToneValues);
export const warmthLevelValues = ['default', 'low', 'medium', 'high'] as const;
export const warmthLevelSchema = z.enum(warmthLevelValues);
export const enthusiasmLevelValues = ['default', 'low', 'medium', 'high'] as const;
export const enthusiasmLevelSchema = z.enum(enthusiasmLevelValues);
export const headersListsLevelValues = ['default', 'minimal', 'structured'] as const;
export const headersListsLevelSchema = z.enum(headersListsLevelValues);
export const characterEmojiValues = ['default', 'low', 'medium', 'high'] as const;
export const characterEmojiSchema = z.enum(characterEmojiValues);
export const reminderTypeValues = ['follow_up', 'payment', 'meeting', 'custom'] as const;
export const reminderTypeSchema = z.enum(reminderTypeValues);
export const quickActionIntentValues = ['follow_up_softly', 'push_for_payment', 'offer_discount', 'close_deal'] as const;
export const quickActionIntentSchema = z.enum(quickActionIntentValues);

export const productEventValues = [
  'ai_generate_clicked',
  'ai_generate_success',
  'ai_generate_failed_limit',
  'copy_clicked',
  'upgrade_modal_opened',
  'upgrade_confirmed',
  'lead_created',
  'first_value_moment',
] as const;

export const productEventSchema = z.enum(productEventValues);

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().max(100).optional().nullable(),
  companyName: z.string().max(120).optional().nullable(),
  industry: z.string().max(120).optional().nullable(),
  hasCompletedOnboarding: z.boolean().optional().nullable(),
  defaultLanguage: z.enum(['en', 'zh-CN', 'ms']).optional().nullable(),
  defaultTone: followUpToneSchema.optional().nullable(),
  defaultConversationMode: conversationModeSchema.optional().nullable(),
  defaultEmojiDensity: emojiDensitySchema.optional().nullable(),
  defaultOutputFormat: outputFormatSchema.optional().nullable(),
  baseStyleTone: baseStyleToneSchema.optional().nullable(),
  characterWarmth: warmthLevelSchema.optional().nullable(),
  characterEnthusiasm: enthusiasmLevelSchema.optional().nullable(),
  characterHeadersLists: headersListsLevelSchema.optional().nullable(),
  characterEmoji: characterEmojiSchema.optional().nullable(),
  customInstructions: z.string().max(2000).optional().nullable(),
  nickname: z.string().max(100).optional().nullable(),
  occupation: z.string().max(120).optional().nullable(),
  aboutYou: z.string().max(1000).optional().nullable(),
  memoryEnabled: z.boolean().optional(),
  recordHistoryEnabled: z.boolean().optional(),
  defaultFollowUpDays: z.number().int().min(0).max(30).optional().nullable(),
  defaultCountryCode: z.string().max(10).optional().nullable(),
  inboxDefaultView: z.enum(['inbox', 'contacts', 'setup']).optional().nullable(),
  notifyNewInbound: z.boolean().optional(),
  notifyReminderDue: z.boolean().optional(),
  notifyDailyDigestHour: z.number().int().min(0).max(23).optional().nullable(),
});

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact: z.string().optional(),
  notes: z.string().optional(),
  status: leadStatusSchema.optional(),
  stage: z.string().max(80).optional(),
  tags: z.array(z.string().max(80)).max(10).optional(),
  closedReason: z.string().max(200, 'closedReason is too long').optional(),
  nextFollowUpAt: z.string().datetime('nextFollowUpAt must be a valid ISO datetime').optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  status: leadStatusSchema.optional(),
  stage: z.string().max(80).optional(),
  tags: z.array(z.string().max(80)).max(10).optional(),
  leadMemory: z.object({
    customer_intent: z.string().min(1).max(240),
    current_status: z.string().min(1).max(240),
    key_issues: z.string().min(1).max(320),
    tone_preference: z.string().min(1).max(120),
    urgency_level: z.enum(['low', 'medium', 'high']),
    next_best_action: z.string().min(1).max(240),
    summary: z.string().min(1).max(320),
  }).optional().nullable(),
  closedReason: z.string().max(200, 'closedReason is too long').optional(),
  nextFollowUpAt: z.string().datetime('nextFollowUpAt must be a valid ISO datetime').optional(),
});

export const updateLeadStatusSchema = z.object({
  status: leadStatusSchema,
});

export const importLeadsSchema = z.object({
  csvText: z.string().optional(),
  rows: z.array(
    z.object({
      name: z.string().min(1, 'Name is required'),
      contact: z.string().optional(),
      notes: z.string().optional(),
      status: leadStatusSchema.optional(),
    })
  ).optional(),
});

export const analyzeConversationSchema = z.object({
  leadId: z.string().min(1, 'leadId is required'),
  conversation: z.string().trim().min(1, 'conversation is required').max(20000, 'conversation is too long'),
  notes: z.string().max(4000, 'notes is too long').optional(),
});

export const aiFollowUpSchema = z.object({
  leadName: z.string().min(1, 'Lead name is required'),
  goal: z.string().min(3, 'Goal is required').max(300, 'Goal is too long').optional(),
  objective: z.string().min(3, 'Objective is required').max(300, 'Objective is too long').optional(),
  context: z.string().max(500, 'Context is too long').optional(),
  channel: outputFormatSchema.optional(),
  style: aiStyleSchema.optional(),
  status: leadStatusSchema.optional(),
  daysPassed: z.number().int().nonnegative().optional(),
  tone: followUpToneSchema.optional(),
  stylePreset: followUpStylePresetSchema.optional(),
  conversationMode: conversationModeSchema.optional(),
  emojiIntensity: emojiDensitySchema.optional(),
  emojiDensity: emojiDensitySchema.optional(),
  outputFormat: outputFormatSchema.optional(),
  language: z.enum(['en', 'zh-CN', 'ms']).optional().default('en'),
  variantCount: z.number().int().min(1).max(5).optional().default(1),
  quickActionIntent: quickActionIntentSchema.optional(),
}).refine((value) => Boolean((value.goal || value.objective || '').trim()), {
  message: 'Goal is required',
  path: ['goal'],
});

export const aiPaymentSchema = z.object({
  leadName: z.string().min(1, 'Lead name is required'),
  goal: z.string().min(3, 'Goal is required').max(300, 'Goal is too long').optional(),
  objective: z.string().min(3, 'Objective is required').max(300, 'Objective is too long').optional(),
  context: z.string().max(500, 'Context is too long').optional(),
  channel: outputFormatSchema.optional(),
  style: aiStyleSchema.optional(),
  daysPassed: z.number().int().nonnegative().optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional(),
  tone: paymentToneSchema.optional(),
  stylePreset: paymentStylePresetSchema.optional(),
  conversationMode: conversationModeSchema.optional(),
  emojiIntensity: emojiDensitySchema.optional(),
  emojiDensity: emojiDensitySchema.optional(),
  outputFormat: outputFormatSchema.optional(),
  language: z.enum(['en', 'zh-CN', 'ms']).optional().default('en'),
  variantCount: z.number().int().min(1).max(5).optional().default(1),
  quickActionIntent: quickActionIntentSchema.optional(),
}).refine((value) => Boolean((value.goal || value.objective || '').trim()), {
  message: 'Goal is required',
  path: ['goal'],
});

export const aiRefineSchema = z.object({
  leadId: z.string().min(1, 'leadId is required'),
  originalText: z.string().min(1, 'originalText is required').max(5000, 'originalText is too long'),
  instruction: z.string().min(1, 'instruction is required').max(500, 'instruction is too long'),
  style: aiStyleSchema.optional(),
  channel: outputFormatSchema.optional(),
  emojiIntensity: emojiDensitySchema.optional(),
  language: z.enum(['en', 'zh-CN', 'ms']).optional().default('en'),
  purpose: z.enum(['follow_up', 'payment']).optional(),
  quickActionIntent: quickActionIntentSchema.optional(),
});

export const eventLogSchema = z.object({
  event: productEventSchema,
  props: z.record(z.string(), z.unknown()).optional(),
});

export const createReminderSchema = z.object({
  leadId: z.string().min(1, 'leadId is required'),
  type: reminderTypeSchema,
  triggerAt: z.string().datetime('triggerAt must be a valid ISO datetime'),
});

export const updateReminderSchema = z.object({
  type: reminderTypeSchema.optional(),
  triggerAt: z.string().datetime('triggerAt must be a valid ISO datetime').optional(),
  isDone: z.boolean().optional(),
});

export const whatsappConnectionSchema = z.object({
  businessAccountId: z.string().min(1, 'businessAccountId is required'),
  phoneNumberId: z.string().min(1, 'phoneNumberId is required'),
  accessToken: z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().min(1, 'accessToken is required').optional()
  ),
});

export const whatsappSendSchema = z.object({
  leadId: z.string().optional(),
  toPhone: z.string().min(6, 'toPhone is required'),
  content: z.string().min(1, 'content is required').max(5000, 'content is too long'),
  conversationPhone: z.string().min(6).optional(),
  clientMessageId: z.string().max(128).optional(),
});

export const whatsappSendMediaSchema = z.object({
  leadId: z.string().optional(),
  toPhone: z.string().min(6, 'toPhone is required'),
  conversationPhone: z.string().min(6).optional(),
  clientMessageId: z.string().max(128).optional(),
  mediaType: z.enum(['image', 'document']),
  mediaUrl: z.string().url('mediaUrl must be a valid URL'),
  caption: z.string().max(1024).optional(),
  filename: z.string().max(255).optional(),
});

export const whatsappSendMediaUploadSchema = z.object({
  leadId: z.string().optional(),
  toPhone: z.string().min(6, 'toPhone is required'),
  conversationPhone: z.string().min(6).optional(),
  clientMessageId: z.string().max(128).optional(),
  mediaType: z.enum(['image', 'document']).optional(),
  caption: z.string().max(1024).optional(),
  filename: z.string().max(255).optional(),
});

export const whatsappMarkReadSchema = z.object({
  phone: z.string().min(6, 'phone is required'),
});
