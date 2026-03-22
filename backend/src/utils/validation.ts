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
export const emojiDensityValues = ['low', 'medium', 'high'] as const;
export const emojiDensitySchema = z.enum(emojiDensityValues);
export const reminderTypeValues = ['follow_up', 'payment', 'meeting', 'custom'] as const;
export const reminderTypeSchema = z.enum(reminderTypeValues);

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

export const aiFollowUpSchema = z.object({
  leadName: z.string().min(1, 'Lead name is required'),
  objective: z.string().min(3, 'Objective is required').max(300, 'Objective is too long'),
  status: leadStatusSchema.optional(),
  daysPassed: z.number().int().nonnegative().optional(),
  tone: followUpToneSchema.optional(),
  stylePreset: followUpStylePresetSchema.optional(),
  conversationMode: conversationModeSchema.optional(),
  emojiDensity: emojiDensitySchema.optional(),
  outputFormat: outputFormatSchema.optional(),
  language: z.enum(['en', 'zh-CN', 'ms']).optional().default('en'),
  variantCount: z.number().int().min(1).max(5).optional().default(3),
});

export const aiPaymentSchema = z.object({
  leadName: z.string().min(1, 'Lead name is required'),
  objective: z.string().min(3, 'Objective is required').max(300, 'Objective is too long'),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional(),
  tone: paymentToneSchema.optional(),
  stylePreset: paymentStylePresetSchema.optional(),
  conversationMode: conversationModeSchema.optional(),
  emojiDensity: emojiDensitySchema.optional(),
  outputFormat: outputFormatSchema.optional(),
  language: z.enum(['en', 'zh-CN', 'ms']).optional().default('en'),
  variantCount: z.number().int().min(1).max(5).optional().default(3),
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
