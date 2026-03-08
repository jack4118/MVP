import { z } from 'zod';

export const leadStatusValues = [
  'new',
  'contacted',
  'interested',
  'waiting_reply',
  'not_interested',
  'closed',
] as const;

export const leadStatusSchema = z.enum(leadStatusValues);

export const followUpToneValues = ['polite', 'friendly', 'professional', 'casual'] as const;
export const followUpToneSchema = z.enum(followUpToneValues);

export const paymentToneValues = ['polite', 'friendly', 'professional', 'casual'] as const;
export const paymentToneSchema = z.enum(paymentToneValues);

export const followUpStylePresetValues = ['gentle_nudge', 'value_reminder', 'meeting_request'] as const;
export const paymentStylePresetValues = ['friendly_reminder', 'due_today', 'overdue_escalation'] as const;

export const followUpStylePresetSchema = z.enum(followUpStylePresetValues);
export const paymentStylePresetSchema = z.enum(paymentStylePresetValues);
export const outputFormatValues = ['chat', 'email', 'whatsapp'] as const;
export const outputFormatSchema = z.enum(outputFormatValues);
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

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact: z.string().optional(),
  notes: z.string().optional(),
  status: leadStatusSchema.optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  status: leadStatusSchema.optional(),
});

export const updateLeadStatusSchema = z.object({
  status: leadStatusSchema,
});

export const aiFollowUpSchema = z.object({
  leadName: z.string().min(1, 'Lead name is required'),
  objective: z.string().min(3, 'Objective is required').max(300, 'Objective is too long'),
  status: leadStatusSchema.optional(),
  daysPassed: z.number().int().nonnegative().optional(),
  tone: followUpToneSchema.optional(),
  stylePreset: followUpStylePresetSchema.optional(),
  outputFormat: outputFormatSchema.optional(),
  language: z.enum(['en', 'zh-CN']).optional().default('en'),
});

export const aiPaymentSchema = z.object({
  leadName: z.string().min(1, 'Lead name is required'),
  objective: z.string().min(3, 'Objective is required').max(300, 'Objective is too long'),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional(),
  tone: paymentToneSchema.optional(),
  stylePreset: paymentStylePresetSchema.optional(),
  outputFormat: outputFormatSchema.optional(),
  language: z.enum(['en', 'zh-CN']).optional().default('en'),
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
});
