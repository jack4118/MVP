import OpenAI from 'openai';
import prisma from '../config/database';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Language = 'en' | 'zh-CN' | 'ms';
type OutputFormat = 'chat' | 'email' | 'whatsapp';
type ConversationMode = 'standard' | 'humor' | 'banter' | 'direct' | 'consultative';
type AiStyle = ConversationMode;
type QuickActionIntent = 'follow_up_softly' | 'push_for_payment' | 'offer_discount' | 'close_deal';
type TurnType = 'first_turn' | 'ongoing_reply' | 'follow_up' | 'clarification' | 'topic_shift' | 'conversation_restart';
type ConversationStage =
  | 'new_inbound'
  | 'fresh_inbound_inquiry'
  | 'active_discussion'
  | 'follow_up'
  | 'quotation_payment'
  | 'quotation_payment_stage';

type FollowUpTone = 'polite' | 'friendly' | 'professional' | 'casual' | 'assertive' | 'empathetic' | 'urgent';
type PaymentTone = 'polite' | 'friendly' | 'professional' | 'casual' | 'assertive' | 'empathetic' | 'urgent';

type FollowUpStylePreset = 'gentle_nudge' | 'value_reminder' | 'meeting_request' | 'deadline_push' | 'social_proof';
type PaymentStylePreset = 'friendly_reminder' | 'due_today' | 'overdue_escalation' | 'installment_offer' | 'soft_final_notice';

export interface FollowUpData {
  leadName: string;
  goal?: string;
  objective?: string;
  context?: string;
  channel?: OutputFormat;
  style?: AiStyle;
  status?: string;
  daysPassed?: number;
  variantCount?: number;
  tone?: FollowUpTone;
  stylePreset?: FollowUpStylePreset;
  conversationMode?: ConversationMode;
  emojiIntensity?: EmojiPreference;
  emojiDensity?: EmojiPreference;
  outputFormat?: OutputFormat;
  language?: Language;
  quickActionIntent?: QuickActionIntent;
  intentType?: string;
  conversationStage?: ConversationStage;
  latestCustomerMessage?: string;
  businessFacts?: unknown;
  unknownFacts?: unknown;
}

export interface PaymentData {
  leadName: string;
  goal?: string;
  objective?: string;
  context?: string;
  channel?: OutputFormat;
  style?: AiStyle;
  amount?: number;
  dueDate?: string;
  variantCount?: number;
  tone?: PaymentTone;
  stylePreset?: PaymentStylePreset;
  conversationMode?: ConversationMode;
  emojiIntensity?: EmojiPreference;
  emojiDensity?: EmojiPreference;
  outputFormat?: OutputFormat;
  language?: Language;
  quickActionIntent?: QuickActionIntent;
  intentType?: string;
  conversationStage?: ConversationStage;
  latestCustomerMessage?: string;
  businessFacts?: unknown;
  unknownFacts?: unknown;
}

export interface RefineData {
  originalText: string;
  instruction: string;
  style?: AiStyle;
  channel?: OutputFormat;
  emojiIntensity?: EmojiPreference;
  language?: Language;
  purpose?: 'follow_up' | 'payment';
  quickActionIntent?: QuickActionIntent;
}

type AiErrorKind = 'quota' | 'auth' | 'timeout' | 'unknown';
type EmojiPreference = 'low' | 'medium' | 'high';

interface DraftConfig {
  goal?: string;
  context?: string;
  channel?: OutputFormat;
  style?: AiStyle;
  daysPassed?: number;
  language: Language;
  outputFormat: OutputFormat;
  purpose: 'follow_up' | 'payment';
  tone: FollowUpTone | PaymentTone;
  conversationMode: ConversationMode;
  emojiPreference: EmojiPreference;
}

interface GreetingPolicyContext {
  hasOutboundGreetingInLast24h: boolean;
  hasInboundReplyInLast24h: boolean;
  hasHistory: boolean;
  allowGreeting: boolean;
  turnType: TurnType;
  minutesSinceLastMessage: number | null;
  lastInboundSnippet: string | null;
  lastOutboundSnippet: string | null;
  activeTopicAnchor: string | null;
  supportsLightCodeSwitch: boolean;
}

interface ChatLogLite {
  direction: 'inbound' | 'outbound';
  content: string | null;
  createdAt: Date;
}

export interface GenerationDebugInfo {
  requested: {
    goal: string;
    context: string;
    language: Language;
    channel: OutputFormat;
    style: AiStyle;
    daysPassed: number;
    emojiIntensity: EmojiPreference;
  };
  checks: {
    emojiCount: number;
    emojiMin: number;
    emojiMax: number;
    emojiInRange: boolean;
    styleSignalDetected: boolean;
    goalCoverageRatio: number;
    goalCoveragePass: boolean;
  };
  mode?: 'initial' | 'refine';
  emojiRule?: string;
  tokenEstimate?: {
    promptChars: number;
    promptTokensApprox: number;
    responseTokenBudget: number;
  };
}

export interface AiGenerationBundle {
  text: string;
  variants: string[];
  cutoffSummary: string | null;
  memorySummary?: string | null;
  memoryGoal?: string | null;
}

const presetsEnabled = process.env.FEATURE_AI_PRESETS !== 'false';

const classifyAiError = (error: any): AiErrorKind => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const status = Number(error?.status || error?.response?.status || 0);

  if (code.includes('insufficient_quota') || message.includes('quota')) {
    return 'quota';
  }

  if (status === 401 || code.includes('invalid_api_key') || message.includes('api key')) {
    return 'auth';
  }

  if (status === 408 || code.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }

  return 'unknown';
};

const splitObjectives = (objective: string): string[] => {
  return objective
    .split(/\r?\n|,|;|，|；|、|\band\b|\bthen\b|&/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part, index, arr) => arr.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === index)
    .slice(0, 6);
};

const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

const extractHanChars = (text: string): string[] => {
  return Array.from(text).filter((ch) => /[\u4e00-\u9fff]/.test(ch));
};

const getObjectiveCoverageRatio = (message: string, objectiveItems: string[]): number => {
  if (objectiveItems.length === 0) {
    return 1;
  }

  const normalizedMessage = normalize(message);
  let matched = 0;

  for (const item of objectiveItems) {
    const normalizedItem = normalize(item);
    const itemHanChars = Array.from(new Set(extractHanChars(normalizedItem)));
    const itemTokens = normalizedItem
      .split(/[^a-z0-9\u4e00-\u9fff]+/i)
      .filter((token) => token.length >= 2);

    const directMatch = normalizedMessage.includes(normalizedItem);
    const tokenMatch = itemTokens.some((token) => normalizedMessage.includes(token));
    const hanMatch =
      itemHanChars.length > 0
        ? itemHanChars.filter((char) => normalizedMessage.includes(char)).length / itemHanChars.length >= 0.6
        : false;
    if (directMatch || tokenMatch || hanMatch) {
      matched += 1;
    }
  }

  return matched / objectiveItems.length;
};

const detectEmojiPreference = (objective: string): EmojiPreference => {
  const text = objective.toLowerCase();
  const highSignals = [
    'emoji',
    'emojis',
    '多点emoji',
    '多一点emoji',
    '多一点表情',
    '多点表情',
    '可爱一点',
    '活泼一点',
  ];

  if (highSignals.some((signal) => text.includes(signal))) {
    return 'high';
  }

  return 'medium';
};

const getFollowUpPresetFragment = (preset: FollowUpStylePreset, isChinese: boolean): string => {
  if (isChinese) {
    switch (preset) {
      case 'deadline_push':
        return '强调目标有明确时间窗口，要求对方给出具体时间，不拖延。';
      case 'social_proof':
        return '以“类似客户已完成同一步骤”为背景，增强对方行动信心。';
      case 'value_reminder':
        return '重点强调你之前提供的价值和下一步收益。';
      case 'meeting_request':
        return '重点是提出一个低压力的简短沟通邀请（例如 10 分钟）。';
      case 'gentle_nudge':
      default:
        return '重点是轻提醒，给对方空间，避免催促感。';
    }
  }

  switch (preset) {
    case 'deadline_push':
      return 'Emphasize a clear time window and ask for a concrete date to avoid delays.';
    case 'social_proof':
      return 'Use light social proof (similar clients already completed this step) to encourage action.';
    case 'value_reminder':
      return 'Focus on reminding them of value already delivered and a small next benefit.';
    case 'meeting_request':
      return 'Focus on proposing a low-pressure short call (for example 10 minutes).';
    case 'gentle_nudge':
    default:
      return 'Focus on a gentle nudge with low pressure and clear empathy.';
  }
};

const getPaymentPresetFragment = (preset: PaymentStylePreset, isChinese: boolean): string => {
  if (isChinese) {
    switch (preset) {
      case 'installment_offer':
        return '提供分期或部分先付方案，降低对方一次性付款压力。';
      case 'soft_final_notice':
        return '明确说明这是最后一次友善提醒，语气克制但边界清晰。';
      case 'due_today':
        return '重点说明今天到期，并给出友好的付款确认请求。';
      case 'overdue_escalation':
        return '语气更坚定但保持礼貌，要求确认付款时间。';
      case 'friendly_reminder':
      default:
        return '语气温和友好，强调协作关系和付款提醒。';
    }
  }

  switch (preset) {
    case 'installment_offer':
      return 'Offer a partial/installment option to reduce payment friction while securing commitment.';
    case 'soft_final_notice':
      return 'Position it as a final friendly reminder with clear boundaries and next step.';
    case 'due_today':
      return 'Focus on payment due today and a friendly confirmation request.';
    case 'overdue_escalation':
      return 'Be firmer while remaining respectful, and ask for a concrete payment date.';
    case 'friendly_reminder':
    default:
      return 'Keep it warm and collaborative while clearly reminding payment is pending.';
  }
};

const mapFollowUpTone = (tone: FollowUpTone): 'soft' | 'professional' | 'firm' => {
  if (tone === 'assertive' || tone === 'urgent') {
    return 'firm';
  }
  if (tone === 'empathetic' || tone === 'friendly' || tone === 'casual') {
    return 'soft';
  }
  if (tone === 'professional') {
    return 'professional';
  }
  return 'soft';
};

const mapPaymentTone = (tone: PaymentTone): 'professional' | 'firm' => {
  if (tone === 'casual' || tone === 'friendly' || tone === 'assertive' || tone === 'urgent') {
    return 'firm';
  }
  return 'professional';
};

const getToneInstruction = (
  language: Language,
  tone: FollowUpTone | PaymentTone,
  purpose: 'follow_up' | 'payment'
): string => {
  if (language === 'zh-CN') {
    switch (tone) {
      case 'friendly':
        return '语气要求：友好亲切，像熟人沟通，但不要油腻。';
      case 'professional':
        return '语气要求：专业清晰，表达稳重，避免口水话。';
      case 'casual':
        return purpose === 'payment'
          ? '语气要求：自然直接，略微强势，但必须保持分寸和礼貌。'
          : '语气要求：轻松随意，像真人聊天，不要太正式。';
      case 'assertive':
        return '语气要求：明确、有执行力，直接要求对方给出时间或结论。';
      case 'empathetic':
        return '语气要求：先共情再推进，保持温柔但要有明确请求。';
      case 'urgent':
        return '语气要求：强调紧迫性和时间节点，避免拖延但不攻击。';
      case 'polite':
      default:
        return '语气要求：礼貌克制，温和但不软弱。';
    }
  }

  if (language === 'ms') {
    switch (tone) {
      case 'friendly':
        return 'Nada: mesra dan hangat seperti manusia sebenar, tanpa berbunyi dibuat-buat.';
      case 'professional':
        return 'Nada: profesional, jelas, dan kemas.';
      case 'casual':
        return purpose === 'payment'
          ? 'Nada: santai tetapi tegas, masih sopan dan bersempadan.'
          : 'Nada: santai, natural, kurang formal.';
      case 'assertive':
        return 'Nada: jelas dan tegas, minta tindakan serta masa yang spesifik.';
      case 'empathetic':
        return 'Nada: mulakan dengan empati, kemudian teruskan kepada permintaan yang jelas.';
      case 'urgent':
        return 'Nada: ada rasa segera dan deadline, tetapi kekal sopan.';
      case 'polite':
      default:
        return 'Nada: sopan, tenang, dan berhemah.';
    }
  }

  switch (tone) {
    case 'friendly':
      return 'Tone requirement: friendly and warm, like a real human relationship, without sounding cheesy.';
    case 'professional':
      return 'Tone requirement: professional, clear, and composed.';
    case 'casual':
      return purpose === 'payment'
        ? 'Tone requirement: casual but firm; direct without crossing boundaries.'
        : 'Tone requirement: casual and relaxed, like a real chat, not formal business copy.';
    case 'assertive':
      return 'Tone requirement: assertive and action-oriented; ask for a concrete date or decision.';
    case 'empathetic':
      return 'Tone requirement: empathetic first, then move clearly to the ask.';
    case 'urgent':
      return 'Tone requirement: urgent and time-sensitive without being rude or threatening.';
    case 'polite':
    default:
      return 'Tone requirement: polite, measured, and respectful without sounding weak.';
  }
};

const getMalaysiaVoiceInstruction = (language: Language): string => {
  if (language === 'zh-CN') {
    return '地域语感：使用马来西亚华语 WhatsApp 常见口吻。自然、接地气，可用“这边、方便、先对齐、安排一下、回我一下”。避免中国大陆官腔；不使用“贵司、烦请知悉”这类生硬词。';
  }
  if (language === 'ms') {
    return 'Regional voice: guna gaya Malaysia (BM harian) seperti “boleh”, “nanti”, “sekejap”, “ya”, “terima kasih”. Boleh campur sedikit gaya pasar secara sopan; elakkan gaya terlalu baku.';
  }
  return 'Regional voice: use Malaysian conversational English naturally (for example: "can", "ya", "let me know", "settle", "appreciate", optional light "lah"). Avoid US/UK formal corporate tone.';
};

const getConversationContinuitySystemPrompt = (): string => {
  return [
    'You are a conversational assistant for natural, ongoing chat in a Malaysian multilingual context.',
    'Treat the chat as continuous by default.',
    'For non-first turns, do not greet again, do not re-introduce, and do not reset context.',
    'Anchor each reply to the latest user message and recent active topic.',
    'Prefer direct continuation over helpdesk-style acknowledgements.',
    'Keep replies concise unless detail is explicitly requested.',
    'Match user language naturally (English, Chinese, Bahasa Melayu); use only light code-switching when prior messages already mix languages.',
    'Avoid scripted openers such as: "Hello, nice to meet you", "How may I assist you today", "Thank you for your message".',
  ].join('\n');
};

const getTurnPolicyInstruction = (language: Language, context: GreetingPolicyContext): string => {
  const turnLine = `Turn type: ${context.turnType}.`;
  const starterLine = context.allowGreeting
    ? 'Greeting allowed only if it feels natural and very brief.'
    : 'Greeting is not allowed in this turn. Continue directly from the current topic.';
  const anchor = context.activeTopicAnchor
    ? `Use this as the first context anchor: "${context.activeTopicAnchor}".`
    : language === 'zh-CN'
      ? '必须在首句提到上条消息中的具体事项作为上下文锚点。'
      : language === 'ms'
        ? 'Ayat pertama mesti ada anchor konteks yang spesifik daripada mesej terbaru.'
        : 'First sentence must include one concrete context anchor from the latest message.';
  const style = context.supportsLightCodeSwitch
    ? language === 'zh-CN'
      ? '用户近期有混合语言习惯，可轻微中英/中马来夹写，但不要刻意。'
      : language === 'ms'
        ? 'Pengguna campur bahasa secara natural; boleh code-switch ringan sahaja.'
        : 'User naturally mixes languages; light code-switch is allowed when organic.'
    : language === 'zh-CN'
      ? '保持当前主语言，不要强行切换语言。'
      : language === 'ms'
        ? 'Kekalkan bahasa utama semasa, jangan paksa campur bahasa.'
        : 'Keep the dominant language; do not force code-switching.';

  if (language === 'zh-CN') {
    return [
      `续聊规则：${turnLine}`,
      starterLine,
      anchor,
      style,
      '默认简短回复（1-4句），避免客服腔和重复客套。',
    ].join(' ');
  }

  if (language === 'ms') {
    return [
      `Polisi kesinambungan: ${turnLine}`,
      starterLine,
      anchor,
      style,
      'Balasan default mesti ringkas (1-4 ayat), natural, bukan skrip helpdesk.',
    ].join(' ');
  }

  return [
    `Continuity policy: ${turnLine}`,
    starterLine,
    anchor,
    style,
    'Default to concise chat replies (1-4 sentences) and avoid customer-service script language.',
  ].join(' ');
};

const createFollowUpFallback = (
  data: FollowUpData & { objective: string },
  daysPassed: number,
  isChinese: boolean,
  preset: FollowUpStylePreset
): string => {
  if (isChinese) {
    if (preset === 'deadline_push') {
      return `你好 ${data.leadName}，\n\n想确认一下“${data.objective}”这件事，我们这边需要在这周内把时间敲定。\n\n方便的话直接回我一个可执行时间，我好马上安排。`;
    }

    if (preset === 'social_proof') {
      return `你好 ${data.leadName}，\n\n这边跟进一下“${data.objective}”。最近几位客户也是先确认这个节点，后面推进会顺很多。\n\n你这边如果没问题，方便回我一个预计时间吗？`;
    }

    if (preset === 'value_reminder') {
      return `你好 ${data.leadName}，\n\n想简短跟进一下。上次我们讨论的方案主要是为了帮你更稳定地推进当前目标（${data.objective}）。\n\n如果你愿意，我可以按你的节奏继续配合。你这周看什么时候方便回复我一句？`;
    }

    if (preset === 'meeting_request') {
      return `你好 ${data.leadName}，\n\n希望你近况顺利。${daysPassed > 0 ? `距离上次沟通已经 ${daysPassed} 天，` : ''}我想确认一下你这边关于“${data.objective}”的进展。\n\n如果方便，我们可以约一个 10 分钟的简短沟通，你看这两天哪个时间合适？`;
    }

    return `你好 ${data.leadName}，\n\n希望你一切顺利。${daysPassed > 0 ? `距离上次沟通已经 ${daysPassed} 天，` : ''}我来轻轻跟进一下，看你这边关于“${data.objective}”是否需要我补充任何信息。\n\n你方便时回复我一句就好。`;
  }

  if (preset === 'deadline_push') {
    return `Hi ${data.leadName},\n\nQuick follow-up on ${data.objective}. We need to lock a timeline this week so the next step does not slip.\n\nCould you share one concrete date I can work with?`;
  }

  if (preset === 'social_proof') {
    return `Hi ${data.leadName},\n\nFollowing up on ${data.objective}. Similar clients who confirmed this step early were able to move much faster after that.\n\nIf it works for you, can you share your expected timing?`;
  }

  if (preset === 'value_reminder') {
    return `Hi ${data.leadName},\n\nQuick follow-up from my side. The approach we discussed is meant to help you move this forward on ${data.objective} with less back-and-forth.\n\nIf helpful, I can tailor the next step to your timeline. Would you like me to send a short suggested plan?`;
  }

  if (preset === 'meeting_request') {
    return `Hi ${data.leadName},\n\nHope you are doing well. ${daysPassed > 0 ? `It has been ${daysPassed} day${daysPassed > 1 ? 's' : ''} since we last spoke, ` : ''}and I wanted to check in on ${data.objective}.\n\nWould a quick 10-minute call this week be useful to align on next steps?`;
  }

  return `Hi ${data.leadName},\n\nHope all is well. ${daysPassed > 0 ? `It has been ${daysPassed} day${daysPassed > 1 ? 's' : ''} since our last message, ` : ''}so I wanted to send a gentle follow-up on ${data.objective} and see if you need anything from me.\n\nWould you like me to resend a short summary?`;
};

const createPaymentFallback = (
  data: PaymentData & { objective: string },
  isChinese: boolean,
  preset: PaymentStylePreset,
  daysOverdue: number
): string => {
  const amountText = data.amount ? (isChinese ? `${data.amount.toFixed(2)} 元` : `$${data.amount.toFixed(2)}`) : null;

  if (isChinese) {
    if (preset === 'installment_offer') {
      return `你好 ${data.leadName}，\n\n关于${amountText ? amountText : '这笔'}款项，这边想确认一下你的安排。\n\n如果一次性不方便，我们也可以先部分处理或分期，你看哪种方式更合适？`;
    }

    if (preset === 'soft_final_notice') {
      return `你好 ${data.leadName}，\n\n这边做最后一次友善提醒：${amountText ? `${amountText} 的` : ''}款项目前仍未处理。\n\n麻烦你今天内回复一个明确付款时间，方便我这边完成记录。`;
    }

    if (preset === 'due_today') {
      return `你好 ${data.leadName}，\n\n温馨提醒，${amountText ? `${amountText} 的` : ''}款项今天到期。\n\n若你已安排付款请忽略；如方便，也请回复我确认一下时间。谢谢。`;
    }

    if (preset === 'overdue_escalation') {
      return `你好 ${data.leadName}，\n\n关于${amountText ? amountText : '该笔'}款项（${data.objective}），当前已逾期 ${daysOverdue} 天。\n\n麻烦你确认一下预计付款日期，以便我这边安排后续记录。感谢配合。`;
    }

    return `你好 ${data.leadName}，\n\n友好提醒一下，${amountText ? `${amountText} 的` : ''}款项目前仍待处理（${data.objective}）。\n\n如你已完成付款请忽略这条信息；若尚未处理，方便的话请告知预计时间。`;
  }

  if (preset === 'installment_offer') {
    return `Hi ${data.leadName},\n\nQuick reminder about ${amountText ? `${amountText}` : 'the pending payment'}.\n\nIf full payment today is not convenient, we can do a partial/installment plan. Which option works best for you?`;
  }

  if (preset === 'soft_final_notice') {
    return `Hi ${data.leadName},\n\nThis is a final friendly reminder for ${amountText ? `${amountText}` : 'the pending payment'}.\n\nPlease confirm a clear payment date today so I can close the record on my side.`;
  }

  if (preset === 'due_today') {
    return `Hi ${data.leadName},\n\nFriendly reminder that ${amountText ? `${amountText} ` : ''}payment is due today.\n\nIf you have already sent it, please ignore this message. If not, could you share a quick confirmation when processed?`;
  }

  if (preset === 'overdue_escalation') {
    return `Hi ${data.leadName},\n\nA quick note that ${amountText ? `${amountText} ` : ''}payment is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.\n\nCould you confirm the exact payment date so I can update our records?`;
  }

  return `Hi ${data.leadName},\n\nFriendly reminder regarding ${amountText ? `${amountText} ` : 'the pending '}payment for the completed work on ${data.objective}.\n\nIf already paid, please disregard this note. If still pending, could you share an estimated payment date?`;
};

const estimateTokenCount = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

const getEmojiRuleText = (emojiPreference: EmojiPreference, language: Language): string => {
  if (language === 'zh-CN') {
    if (emojiPreference === 'low') return 'emoji 规则：可用 0-1 个，最多 1 个，若有 emoji 请放在结尾。';
    if (emojiPreference === 'high') return 'emoji 规则：使用 1-3 个，不可超过 3 个，不要每句都放。';
    return 'emoji 规则：使用 1-2 个，自然分布。';
  }
  if (language === 'ms') {
    if (emojiPreference === 'low') return 'Peraturan emoji: guna 0-1 emoji sahaja, maksimum 1, dan letak di hujung jika digunakan.';
    if (emojiPreference === 'high') return 'Peraturan emoji: guna 1-3 emoji sahaja, maksimum 3, jangan letak pada setiap ayat.';
    return 'Peraturan emoji: guna 1-2 emoji secara semula jadi.';
  }
  if (emojiPreference === 'low') return 'Emoji rule: use 0-1 emoji only (max 1), and if used place it at the end.';
  if (emojiPreference === 'high') return 'Emoji rule: use 1-3 emojis only (max 3), do not place emoji in every sentence.';
  return 'Emoji rule: use 1-2 emojis naturally.';
};

const buildPromptDebugPayload = (args: {
  id: string;
  purpose: 'follow_up' | 'payment';
  mode: 'initial' | 'refine';
  normalizedConfig: Record<string, unknown>;
  system: string;
  user: string;
  emojiRule: string;
  responseTokenBudget: number;
}) => {
  const promptChars = args.system.length + args.user.length;
  const promptTokensApprox = estimateTokenCount(args.system) + estimateTokenCount(args.user);
  return {
    id: args.id,
    purpose: args.purpose,
    mode: args.mode,
    normalizedConfig: args.normalizedConfig,
    emojiRule: args.emojiRule,
    tokenEstimate: {
      promptChars,
      promptTokensApprox,
      responseTokenBudget: args.responseTokenBudget,
    },
    prompt: {
      system: args.system,
      user: args.user,
    },
  };
};

const buildWhatsappHumanSystemPrompt = (emojiIntensity: EmojiPreference, language: Language): string => {
  const languageLock =
    language === 'zh-CN'
      ? 'Chinese only'
      : language === 'ms'
        ? 'Bahasa Melayu only'
        : 'English only';
  const emojiRule =
    emojiIntensity === 'low'
      ? 'Use 0-1 emoji total (max 1). If used, place it near the end.'
      : emojiIntensity === 'high'
        ? 'Use 1-3 emojis total (max 3). Keep them natural and not in every line.'
        : 'Use 1-2 emojis total. Keep them natural.';

  return [
    'ROLE:',
    'You are an AI sales assistant writing exactly one send-ready WhatsApp reply for a real seller.',
    '',
    'CORE OBJECTIVE:',
    'Write a natural, human-sounding WhatsApp reply that:',
    '1. responds to the customer\'s latest message correctly,',
    '2. fits the conversation stage,',
    '3. helps move the chat toward conversion,',
    '4. stays concise and easy to reply to.',
    '',
    'CHANNEL:',
    'WhatsApp',
    '',
    'MESSAGE PRIORITY:',
    'Follow this order strictly:',
    '1. Respond to the customer\'s latest message first.',
    '2. If the latest message includes a direct question, answer that question before anything else.',
    '3. Briefly acknowledge the customer\'s intent or situation.',
    '4. Move the chat forward with one clear next step.',
    '5. Keep the message concise and easy to answer.',
    '',
    'DECISION RULES:',
    '- The latest customer message is the highest-priority signal.',
    '- Never write a follow-up or re-engagement style reply if the customer has just sent a fresh inbound inquiry.',
    '- If the customer asks about availability, price, package, location, timing, payment, delivery, booking, or any other direct issue, address it first.',
    '- If exact information is missing, do not invent facts. Give a safe reply and ask only for the minimum detail needed.',
    '- Use follow-up language only when the chat is actually inactive and the latest customer message is not a fresh inquiry.',
    '- If the customer shows buying intent, reduce friction and suggest one concrete next step.',
    '- If the customer sounds hesitant, lower pressure and keep the CTA light.',
    '',
    'ANTI-HALLUCINATION RULES:',
    '- Do not invent availability, pricing, package details, delivery time, discounts, payment status, or promises.',
    '- Use only facts supported by conversation context, latest customer message, and known business facts.',
    '- If a key fact is unknown, say so naturally or ask one simple clarification.',
    '',
    'WHATSAPP STYLE RULES:',
    '- Sound like a real person texting, not an email or scripted bot.',
    '- Be concise, warm, natural, and context-aware.',
    '- Use short, clear sentences.',
    '- Avoid corporate phrasing, canned templates, and generic closings.',
    '- Avoid sounding overly polished or robotic.',
    '',
    'CTA RULES:',
    '- Include only one clear next-step CTA.',
    '- CTA must be easy to answer.',
    '- Do not stack multiple unrelated questions.',
    '- Do not pressure, guilt, or manipulate.',
    '',
    'FOLLOW-UP GUARDRAILS:',
    '- If the latest customer message asks a direct question, answer that question first.',
    '- Do not switch into follow-up language before answering that latest direct question.',
    '- Do not use re-engagement wording like "just checking", "still interested", or equivalents unless stage is follow-up and latest customer message is not a fresh inquiry.',
    '',
    'EMOJI RULES:',
    `- ${emojiRule}`,
    '- Never spam emojis.',
    '- Keep emojis natural for WhatsApp.',
    '- If emoji intensity is low, use none or at most one emoji.',
    '',
    'TRILINGUAL LANGUAGE RULES:',
    `- Output must follow LANGUAGE LOCK: ${languageLock} strictly.`,
    '- Supported languages: English, Chinese, Bahasa Melayu.',
    '- Match the customer\'s dominant language in the latest customer message unless language lock overrides it.',
    '- If customer uses mixed language, keep the reply mainly in the locked language, using only common mixed terms if natural.',
    '- Never translate names, brands, package names, dates, times, currencies, addresses, or quoted customer wording unless necessary.',
    '',
    'CHINESE STYLE RULES:',
    '- Prefer natural chat phrasing over formal service language.',
    '- Keep sentence flow smooth and easy to reply to.',
    '',
    'BAHASA MELAYU STYLE RULES:',
    '- Use simple, conversational Malay.',
    '- Avoid textbook or overly official tone.',
    '',
    'ENGLISH STYLE RULES:',
    '- Use natural spoken business-chat English.',
    '- Avoid email-like openings and closings.',
    '',
    'OUTPUT CONTRACT:',
    '- Return exactly one final customer-facing WhatsApp message.',
    '- Return only the message text.',
    '- No labels, no explanation, no markdown, no multiple versions, no meta commentary.',
  ].join('\n');
};

const generateCompletion = async (
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number }
) => {
  return openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: options?.maxTokens ?? 120,
  });
};

const getAdvisorPersona = (language: Language): string => {
  if (language === 'zh-CN') {
    return [
      '你是一位资深增长顾问和沟通策略专家，具备高水平商业判断。',
      '你的风格：温和、聪明、专业、克制，不咄咄逼人，像真人在微信里说话。',
      '你的目标：在保护关系的前提下，提高对方回复与行动概率，优先达成用户给定的具体目标。',
      '写作原则：',
      '- 同理心开场，降低心理压力',
      '- 表达清晰，避免空话、套话、官腔和复杂术语',
      '- 必须围绕 objective 产出具体请求，不要泛泛而谈',
      '- 给出低门槛下一步（容易回复，最好是时间点或是/否问题）',
      '- 语气坚定但礼貌，不操控、不施压',
      '- 句子短、信息密度高、可直接发送',
      '- 禁止使用夸张营销词：如“显著提升”“最大化收益”等',
    ].join('\n');
  }

  if (language === 'ms') {
    return [
      'Anda ialah penasihat pertumbuhan kanan dan pakar strategi komunikasi berpengalaman.',
      'Gaya anda profesional, jelas, sopan, dan natural seperti manusia sebenar.',
      'Matlamat anda: tingkatkan kebarangkalian respons sambil menepati objective pengguna dengan tepat.',
      'Prinsip penulisan:',
      '- Mulakan dengan empati ringkas, tanpa tekanan',
      '- Elakkan ayat klise, jargon, dan tuntutan melampau',
      '- Objective mesti diterjemah kepada satu permintaan yang spesifik',
      '- Hujung mesej mesti mudah dibalas (ya/tidak atau jangka masa)',
      '- Ringkas, praktikal, dan terus boleh dihantar',
    ].join('\n');
  }

  return [
    'You are a senior growth advisor and elite communication strategist with strong business judgment.',
    'Your style is gentle, intelligent, highly professional, and conversationally human.',
    'Your goal is to increase response probability while prioritizing the user objective exactly.',
    'Writing principles:',
    '- Start with empathy to reduce pressure',
    '- Be clear and specific; avoid fluff, buzzwords, and corporate jargon',
    '- Keep objective-first: convert objective into one concrete ask',
    '- Offer a low-friction next step that is easy to reply to (time estimate or yes/no)',
    '- Be firm without sounding pushy or manipulative',
    '- Keep sentences concise and immediately sendable',
    '- Avoid exaggerated marketing claims',
  ].join('\n');
};

const getObjectiveDirective = (
  objective: string,
  language: Language,
  objectiveItems: string[],
  purpose: 'follow_up' | 'payment'
): string => {
  const hasMultiple = objectiveItems.length > 1;
  if (language === 'zh-CN') {
    if (hasMultiple) {
      return [
        `多目标列表：${objectiveItems.map((item, idx) => `${idx + 1}. ${item}`).join('；')}`,
        '请按“主目标 + 次目标”的结构写。',
        purpose === 'payment' ? '主目标优先确认付款时间；其余目标用简短清单覆盖。' : '主目标放在前两行并提出明确请求；次目标用简短清单带过。',
        '最终内容必须覆盖每一个目标，不要遗漏。',
        '不要冗长，不要机械罗列。',
      ].join('\n');
    }
    return [
      `目标是：${objective}`,
      '先把目标翻译成一个明确请求，再写消息。',
      '请求必须具体，例如：确认预计日期、确认本周/下周、确认是否已完成。',
      '不要只说“跟进一下”，要说清楚你要对方回复什么。',
    ].join('\n');
  }

  if (language === 'ms') {
    if (hasMultiple) {
      return [
        `Senarai objektif: ${objectiveItems.map((item, idx) => `${idx + 1}. ${item}`).join('; ')}`,
        'Guna struktur “objektif utama + objektif tambahan”.',
        purpose === 'payment'
          ? 'Objektif utama mesti fokus kepada pengesahan bayaran dahulu.'
          : 'Objektif utama mesti muncul awal dengan permintaan jelas.',
        'Objektif tambahan boleh dalam senarai ringkas, tanpa terlalu panjang.',
        'Mesej akhir mesti meliputi semua objektif, jangan tertinggal.',
      ].join('\n');
    }
    return [
      `Objektif: ${objective}`,
      'Tukarkan objektif kepada satu permintaan yang jelas sebelum menulis.',
      'Permintaan mesti spesifik, contohnya tarikh anggaran atau minggu sasaran.',
      'Elakkan ayat umum seperti “sekadar follow up”.',
    ].join('\n');
  }

  if (hasMultiple) {
    return [
      `Objective list: ${objectiveItems.map((item, idx) => `${idx + 1}. ${item}`).join('; ')}`,
      'Use a “primary objective + secondary objectives” structure.',
      purpose === 'payment'
        ? 'Primary objective must confirm payment timing first.'
        : 'Primary objective must appear early with a clear ask.',
      'Secondary objectives can be compact checklist style.',
      'Final message must cover every objective item.',
    ].join('\n');
  }

  return [
    `Objective: ${objective}`,
    'Translate objective into one explicit ask before writing.',
    'Ask must be specific, for example expected date, this week/next week timing, or completion status.',
    'Do not stay generic like “just following up”; state exactly what reply is needed.',
  ].join('\n');
};

const getFormatInstruction = (outputFormat: OutputFormat, language: Language): string => {
  if (language === 'zh-CN') {
    if (outputFormat === 'email') {
      return '输出格式为邮件：包含“主题：...”，然后是称呼、正文和结尾签名。';
    }
    if (outputFormat === 'whatsapp') {
      return '输出格式为 WhatsApp：口语化、像真人发消息。3-6 行短句；可用 0-2 个自然 emoji；不要邮件式签名，不要“主题：”。';
    }
    return '输出格式为日常聊天消息：自然、简短。';
  }

  if (language === 'ms') {
    if (outputFormat === 'email') {
      return 'Format e-mel: sertakan “Subjek: ...”, sapaan, isi, dan penutup ringkas.';
    }
    if (outputFormat === 'whatsapp') {
      return 'Format WhatsApp: gaya perbualan manusia, 3-6 baris ringkas, 0-2 emoji semula jadi, tanpa gaya surat rasmi.';
    }
    return 'Format mesej chat ringkas dan natural.';
  }

  if (outputFormat === 'email') {
    return 'Output as email format: include "Subject: ...", greeting, body, and sign-off.';
  }
  if (outputFormat === 'whatsapp') {
    return 'Output as WhatsApp style: human conversational lines (3-6 short lines), optional 0-2 natural emojis, no formal email sign-off, no subject line.';
  }
  return 'Output as a regular chat message: natural and concise.';
};

const getEmojiInstruction = (
  _outputFormat: OutputFormat,
  language: Language,
  emojiPreference: EmojiPreference
): string => {
  return getEmojiRuleText(emojiPreference, language);
};

const getHardConstraints = (language: Language, outputFormat: OutputFormat): string => {
  if (language === 'zh-CN') {
    const common = [
      '硬性要求：',
      '1) 不要输出“WhatsApp:”或“Email:”等标签',
      '2) 不要写“期待你的回复”这类模板化结尾',
      '3) 优先使用贴近日常沟通的自然表达',
    ];
    if (outputFormat === 'whatsapp') {
      common.push('4) 开头问候可选，不要在短时间内重复问候；优先自然续接上一轮对话');
      common.push('5) 必须给出清晰请求，并以易回复问题结尾');
    }
    return common.join('\n');
  }

  if (language === 'ms') {
    const common = [
      'Syarat wajib:',
      '1) Jangan keluarkan label seperti “WhatsApp:” atau “Email:”',
      '2) Elakkan penutup template seperti “menunggu balasan anda”',
      '3) Gunakan frasa percakapan sebenar, bukan skrip kaku',
    ];
    if (outputFormat === 'whatsapp') {
      common.push('4) Sapaan di awal adalah pilihan; jangan ulang sapaan dalam tempoh singkat');
      common.push('5) Mesti ada permintaan jelas dan ditutup dengan soalan mudah dibalas');
    }
    return common.join('\\n');
  }

  const common = [
    'Hard constraints:',
    '1) Do not output labels like "WhatsApp:" or "Email:"',
    '2) Avoid templated closings like "looking forward to your reply"',
    '3) Prefer natural spoken phrasing over formal script-like wording',
  ];
  if (outputFormat === 'whatsapp') {
    common.push('4) Greeting is optional; do not repeat greeting in short intervals');
    common.push('5) Keep a concrete ask and end with an easy reply question');
  }
  return common.join('\n');
};

const REPLY_POLICY_BANNED: Record<Language, string[]> = {
  en: [
    'just checking in',
    'this one',
    'let me know if any questions',
    'follow up this',
  ],
  'zh-CN': [
    '再跟进一下',
    '这个跟进',
    '有需要随时联系',
  ],
  ms: [
    'follow up ni',
    'details',
    'continue later',
  ],
};

const REPLY_POLICY_VAGUE_TERMS: Record<Language, string[]> = {
  en: ['details', 'option', 'options', 'follow up this'],
  'zh-CN': ['细节', '选项', '这个跟进'],
  ms: ['details', 'option', 'options', 'follow up ni'],
};

const REPLY_POLICY_SOFTENERS: Record<Language, string[]> = {
  en: ['no rush'],
  'zh-CN': ['不急'],
  ms: ['tak urgent'],
};

const REPLY_POLICY_CTA_PATTERNS: Record<Language, RegExp[]> = {
  en: [/\bcan you\b/i, /\bcould you\b/i, /\bwant me to\b/i, /\blet me know\b/i, /\bconfirm\b/i],
  'zh-CN': [/要不要/u, /可以.*吗/u, /确认/u, /回我/u],
  ms: [/\bnak saya\b/i, /\bboleh\b/i, /\bconfirm\b/i, /\bbalas\b/i, /\bsahkan\b/i],
};

const tokenizeForPolicy = (text: string): string[] => {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return [];
  }
  const cjkUnits = (compact.match(/[\u4e00-\u9fff]+/gu) || []).flatMap((chunk) => chunk.split(''));
  const latinUnits = compact.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g) || [];
  const malayUnits = compact.match(/[A-Za-z]+(?:-[A-Za-z]+)*/g) || [];
  const merged = [...cjkUnits, ...latinUnits, ...malayUnits]
    .map((item) => item.trim())
    .filter(Boolean);
  return merged;
};

const countPolicyWords = (text: string): number => tokenizeForPolicy(text).length;

const countSofteners = (text: string, language: Language): number => {
  const lower = text.toLowerCase();
  return REPLY_POLICY_SOFTENERS[language].reduce((count, phrase) => (
    lower.includes(phrase.toLowerCase()) ? count + 1 : count
  ), 0);
};

const countCtaSignals = (text: string, language: Language): number => {
  const patterns = REPLY_POLICY_CTA_PATTERNS[language];
  const phraseHits = patterns.reduce((count, regex) => (regex.test(text) ? count + 1 : count), 0);
  const questionHits = (text.match(/\?/g) || []).length + (text.match(/？/g) || []).length;
  return Math.max(phraseHits, questionHits);
};

const countContextAnchors = (text: string, language: Language): number => {
  let count = 0;
  count += (text.match(/"[^"]{2,}"/g) || []).length;
  count += (text.match(/“[^”]{2,}”/gu) || []).length;
  count += (text.match(/'[^']{2,}'/g) || []).length;
  count += (text.match(/\b(?:today|tomorrow|yesterday|quote|meeting)\b/gi) || []).length;
  count += (text.match(/\b\d{1,2}\s?(?:am|pm)\b/gi) || []).length;
  count += (text.match(/\b\d{1,2}[:.]\d{2}\b/g) || []).length;

  if (language === 'ms') {
    count += (text.match(/\b(?:hari tu|esok|semalam|quotation|pukul)\b/gi) || []).length;
  }
  if (language === 'zh-CN') {
    count += (text.match(/(?:明天|昨天|报价|上次|今天)/gu) || []).length;
    count += (text.match(/\d+点/gu) || []).length;
  }

  return count;
};

const sanitizePolicyBannedPhrases = (text: string, language: Language): string => {
  let next = text;
  for (const phrase of REPLY_POLICY_BANNED[language]) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = next.replace(new RegExp(escaped, 'gi'), '');
  }
  return next.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
};

interface ReplyPolicyCheck {
  valid: boolean;
  violations: string[];
}

const checkReplyPolicy = (text: string, language: Language): ReplyPolicyCheck => {
  const violations: string[] = [];
  const words = countPolicyWords(text);
  const softenerCount = countSofteners(text, language);
  const ctaCount = countCtaSignals(text, language);
  const hasBanned = REPLY_POLICY_BANNED[language].some((phrase) => text.toLowerCase().includes(phrase.toLowerCase()));
  const vagueFound = REPLY_POLICY_VAGUE_TERMS[language].some((term) => text.toLowerCase().includes(term.toLowerCase()));
  const anchorCount = countContextAnchors(text, language);

  if (words > 30) {
    violations.push(`word_count>${words}`);
  }
  if (softenerCount > 1) {
    violations.push(`too_many_softeners>${softenerCount}`);
  }
  if (ctaCount > 1) {
    violations.push(`too_many_cta>${ctaCount}`);
  }
  if (anchorCount === 0) {
    violations.push('missing_context_anchor');
  }
  if (anchorCount > 1) {
    violations.push(`too_many_context_anchors>${anchorCount}`);
  }
  if (hasBanned) {
    violations.push('contains_banned_phrase');
  }
  if (vagueFound) {
    violations.push('contains_vague_terms');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
};

const buildPolicyRewritePrompt = (text: string, language: Language, violations: string[]): string => {
  if (language === 'zh-CN') {
    return [
      '请重写这条消息并严格通过以下规则：',
      '- 最多 30 个词',
      '- 最多 1 个缓和词（例如“不急”）',
      '- 最多 1 个 CTA（只问一件事）',
      '- 必须包含且仅包含 1 个上下文锚点（例如上次报价、明天3点、hari tu）',
      '- 删除禁用短语',
      '- 删除模糊词（如 details / option）',
      `当前问题：${violations.join(', ')}`,
      '',
      '原文：',
      text,
      '',
      '只输出最终消息。',
    ].join('\n');
  }
  if (language === 'ms') {
    return [
      'Tulis semula mesej ini dan patuhi semua polisi:',
      '- Maksimum 30 perkataan',
      '- Maksimum 1 softener (contoh: tak urgent)',
      '- Maksimum 1 CTA (satu soalan/tindakan sahaja)',
      '- Mesti ada tepat 1 context anchor (contoh: quote hari tu, esok 3pm)',
      '- Buang frasa dilarang',
      '- Buang perkataan kabur (details, option)',
      `Isu semasa: ${violations.join(', ')}`,
      '',
      'Asal:',
      text,
      '',
      'Output mesej akhir sahaja.',
    ].join('\n');
  }
  return [
    'Rewrite this message and pass all policy checks:',
    '- Max 30 words',
    '- Max 1 softener',
    '- Max 1 CTA (single ask only)',
    '- Include exactly 1 context anchor (example: quote from earlier, tomorrow 3pm, hari tu)',
    '- Remove banned phrases',
    '- Remove vague words (details, option, options)',
    `Current issues: ${violations.join(', ')}`,
    '',
    'Original:',
    text,
    '',
    'Return only the final sendable message.',
  ].join('\n');
};

const getConversationModeInstruction = (
  language: Language,
  mode: ConversationMode,
  purpose: 'follow_up' | 'payment'
): string => {
  if (mode === 'standard') {
    return language === 'zh-CN'
      ? '风格模式：标准专业。像真人沟通，稳重自然。'
      : language === 'ms'
        ? 'Mod gaya: standard profesional. Natural dan kemas.'
        : 'Style mode: standard professional. Keep it natural and business-like.';
  }

  if (mode === 'humor') {
    return language === 'zh-CN'
      ? '风格模式：幽默。至少加入一句轻松、有点机灵的人味表达，但不能影响清晰请求，不能轻浮。'
      : language === 'ms'
        ? 'Mod gaya: humor ringan. Mesti ada sedikit unsur lucu atau selamba, tetapi permintaan kekal jelas.'
        : 'Style mode: light humor. Include a small touch of wit or playful phrasing, while keeping the ask clear.';
  }

  if (mode === 'direct') {
    return language === 'zh-CN'
      ? '风格模式：直接。短句、直奔主题、不要铺垫。第二行必须是明确请求。'
      : language === 'ms'
        ? 'Mod gaya: direct. Ayat ringkas, terus kepada point, permintaan jelas pada awal mesej.'
        : 'Style mode: direct. Use short lines, get to the point fast, and place the ask early.';
  }

  if (mode === 'consultative') {
    return language === 'zh-CN'
      ? '风格模式：顾问式。先给一条判断，再给一条建议行动，最后确认对方时间。'
      : language === 'ms'
        ? 'Mod gaya: konsultatif. Beri cadangan ringkas dahulu, kemudian minta komitmen masa.'
        : 'Style mode: consultative. Give a short recommendation first, then ask for commitment timing.';
  }

  if (purpose === 'payment') {
    return language === 'zh-CN'
      ? '风格模式：斗嘴。要有熟人间轻微调侃感，不是普通礼貌文案；但必须保持尊重与边界，优先确认付款时间。'
      : language === 'ms'
        ? 'Mod gaya: banter. Mesti terasa seperti gurauan santai antara kenalan, tetapi kekal hormat dan utamakan masa bayaran.'
        : 'Style mode: playful banter. It should feel like light teasing between familiar people, not standard polite copy; still respectful and payment-timing first.';
  }

  return language === 'zh-CN'
    ? '风格模式：斗嘴。必须写出熟人之间轻松斗嘴的感觉，不要退回普通商务客气话；但要有礼貌，不攻击，不嘲讽。'
    : language === 'ms'
      ? 'Mod gaya: banter. Mesti terasa santai macam kawan rapat, bukan mesej standard; jangan kasar atau menyindir.'
      : 'Style mode: playful banter. Make it noticeably playful and familiar, not a standard business message; no insults or sarcasm.';
};

const countEmojis = (text: string): number => {
  const matches = text.match(/\p{Extended_Pictographic}/gu);
  return matches ? matches.length : 0;
};

const getEmojiRange = (
  _outputFormat: OutputFormat,
  emojiPreference: EmojiPreference
): { min: number; max: number } => {
  if (emojiPreference === 'low') {
    return { min: 0, max: 1 };
  }
  if (emojiPreference === 'high') {
    return { min: 1, max: 3 };
  }
  return { min: 1, max: 2 };
};

const needsEmojiRewrite = (text: string, outputFormat: OutputFormat, emojiPreference: EmojiPreference): boolean => {
  const emojiCount = countEmojis(text);
  const { min, max } = getEmojiRange(outputFormat, emojiPreference);
  return emojiCount < min || emojiCount > max;
};

const hasModeSignal = (text: string, language: Language, mode: ConversationMode): boolean => {
  if (mode === 'standard') {
    return true;
  }

  const lower = text.toLowerCase();
  const humorSignals =
    language === 'zh-CN'
      ? ['哈哈', '开个玩笑', '别介意', '😄', '😂', '😅']
      : language === 'ms'
        ? ['gurau', 'hehe', 'selamba', 'lawak', '😄', '😂', '😅']
        : ['just kidding', 'kidding', 'haha', 'lol', '😄', '😂', '😅'];
  const banterSignals =
    language === 'zh-CN'
      ? ['你这', '我可', '懂的都懂', '嘿', '哈', '😏', '😜']
      : language === 'ms'
        ? ['jangan buat-buat', 'santai je', 'eh', 'lah', 'sikit-sikit', 'nak tanya', 'ke mana', '😏', '😜']
        : ['you know me', 'come on', 'hey now', 'hey ', 'just checking in', 'no need to', '😏', '😜'];

  if (mode === 'direct') {
    const compact = lower.replace(/\s+/g, ' ');
    return /when|date|time|bila|bila boleh|boleh|can|could|please|什么时候|何时|几时|确认|请|sahkan|sila/.test(compact);
  }

  if (mode === 'consultative') {
    return /建议|建议你|可以先|可先|能否|方便|cadangan|bagaimana jika|boleh kita|boleh|suggest|recommend|you can|we can|could you|can you|next step|langkah seterusnya|so we can|supaya|to help|为了更快/.test(lower);
  }

  if ((mode === 'humor' || mode === 'banter') && countEmojis(text) >= 1) {
    return true;
  }

  const signals = mode === 'humor' ? humorSignals : banterSignals;
  return signals.some((signal) => lower.includes(signal));
};

const clampEmojiCount = (text: string, max: number): string => {
  let emojiSeen = 0;
  let result = '';
  for (const ch of text) {
    if (/\p{Extended_Pictographic}/u.test(ch)) {
      if (emojiSeen < max) {
        result += ch;
      }
      emojiSeen += 1;
      continue;
    }
    result += ch;
  }
  return result;
};

const ensureEmojiRange = (text: string, outputFormat: OutputFormat, emojiPreference: EmojiPreference): string => {
  const { min, max } = getEmojiRange(outputFormat, emojiPreference);
  let result = clampEmojiCount(text, max);
  let count = countEmojis(result);
  if (count >= min) {
    return result;
  }

  const emojiPool = ['🙂', '😊', '🙏', '✨', '👍'];
  while (count < min) {
    result = `${result} ${emojiPool[count % emojiPool.length]}`;
    count += 1;
  }

  if (emojiPreference === 'low' && countEmojis(result) === 1) {
    const chars = Array.from(result);
    const nonEmojiChars: string[] = [];
    let emojiChar = '';
    for (const ch of chars) {
      if (/\p{Extended_Pictographic}/u.test(ch) && !emojiChar) {
        emojiChar = ch;
      } else if (!/\p{Extended_Pictographic}/u.test(ch)) {
        nonEmojiChars.push(ch);
      }
    }
    if (emojiChar) {
      result = `${nonEmojiChars.join('').trimEnd()} ${emojiChar}`.trim();
    }
  }

  return result;
};

const isLanguageMatch = (text: string, language: Language): boolean => {
  if (!text.trim()) return false;
  if (language === 'zh-CN') {
    return /[\u4e00-\u9fff]/.test(text);
  }
  return true;
};

const enforceLanguageLock = async (
  systemPrompt: string,
  text: string,
  language: Language
): Promise<string> => {
  if (isLanguageMatch(text, language)) {
    return text;
  }

  const langLabel = language === 'zh-CN' ? 'Simplified Chinese' : language === 'ms' ? 'Bahasa Melayu' : 'English';
  const rewritePrompt = [
    `Rewrite the message below in ${langLabel}.`,
    'Keep the same meaning and keep it WhatsApp-natural.',
    'Return only the rewritten message.',
    '',
    text,
  ].join('\n');
  const completion = await generateCompletion(systemPrompt, rewritePrompt, { maxTokens: 120 });
  const rewritten = cleanGeneratedMessage(completion.choices[0]?.message?.content || '');
  return rewritten || text;
};

const buildRewritePrompt = (draft: string, config: DraftConfig): string => {
  const toneInstruction = getToneInstruction(config.language, config.tone, config.purpose);
  const emojiInstruction = getEmojiInstruction(config.outputFormat, config.language, config.emojiPreference);
  const formatInstruction = getFormatInstruction(config.outputFormat, config.language);
  const modeInstruction = getConversationModeInstruction(config.language, config.conversationMode, config.purpose);

  if (config.language === 'zh-CN') {
    return [
      '请重写下面这条消息，让它严格符合配置。',
      '保留原始 objective，不要改成别的请求。',
      '如果当前草稿不够像所选模式，就大胆改写，而不是只做小修小补。',
      `- ${toneInstruction}`,
      `- ${modeInstruction}`,
      `- ${emojiInstruction}`,
      `- 格式要求：${formatInstruction}`,
      '- 保持可直接发送，不要添加解释。',
      '',
      '草稿：',
      draft,
    ].join('\n');
  }

  if (config.language === 'ms') {
    return [
      'Tulis semula mesej di bawah supaya benar-benar ikut konfigurasi.',
      'Kekalkan objective asal; jangan tukar permintaan utama.',
      'Jika draf sekarang tidak cukup menepati mod yang dipilih, ubah dengan jelas, bukan sekadar edit kecil.',
      `- ${toneInstruction}`,
      `- ${modeInstruction}`,
      `- ${emojiInstruction}`,
      `- Keperluan format: ${formatInstruction}`,
      '- Hasil akhir mesti terus boleh dihantar, tanpa penjelasan tambahan.',
      '',
      'Draf:',
      draft,
    ].join('\n');
  }

  return [
    'Rewrite the draft below so it strictly matches the selected configuration.',
    'Preserve the original objective and core ask.',
    'If the draft does not clearly reflect the selected mode, rewrite it decisively instead of making tiny edits.',
    `- ${toneInstruction}`,
    `- ${modeInstruction}`,
    `- ${emojiInstruction}`,
    `- Format requirement: ${formatInstruction}`,
    '- Output only the final sendable message.',
    '',
    'Draft:',
    draft,
  ].join('\n');
};

const validateBusinessDraft = async (
  systemPrompt: string,
  draft: string,
  config: DraftConfig,
  objective: string,
  currentHour: number,
  greetingPolicy: GreetingPolicyContext
): Promise<string> => {
  let current = draft;
  let attempt = 0;

  while (attempt < 2) {
    const issues: string[] = [];

    if (containsWrongTimeGreeting(current, config.language, currentHour)) {
      issues.push(
        config.language === 'zh-CN'
          ? '当前本地时间不适合使用“早安/早上好/早”这类早晨问候。'
          : config.language === 'ms'
            ? 'Sapaan yang digunakan tidak sesuai dengan waktu tempatan semasa.'
            : 'The greeting is inappropriate for the current local time.'
      );
    }

    if (!hasConcreteReplyAsk(current, config.language)) {
      issues.push(
        config.language === 'zh-CN'
          ? '消息缺少一个具体、容易回复的请求或时间问题。'
          : config.language === 'ms'
            ? 'Mesej tiada permintaan yang cukup spesifik dan mudah dibalas.'
            : 'The message lacks a concrete, easy-to-answer ask.'
      );
    }

    if (
      config.outputFormat === 'whatsapp' &&
      (greetingPolicy.hasOutboundGreetingInLast24h || greetingPolicy.hasInboundReplyInLast24h) &&
      startsWithGreeting(current)
    ) {
      issues.push(
        config.language === 'zh-CN'
          ? '过去 24 小时已问候过或客户刚回复，本条不应再次以问候开头。请直接承接正文。'
          : config.language === 'ms'
            ? 'Dalam 24 jam ini sudah ada sapaan atau pelanggan baru balas. Jangan mula semula dengan sapaan.'
            : 'A greeting was already used recently or the customer just replied. Do not start this message with another greeting.'
      );
    }

    if (issues.length === 0) {
      break;
    }

    const rewritten = await generateCompletion(systemPrompt, buildBusinessValidationPrompt(current, config.language, issues, objective));
    const next = cleanGeneratedMessage(rewritten.choices[0]?.message?.content || '');
    if (!next.trim()) {
      break;
    }
    current = next;
    attempt += 1;
  }

  return enforceGreetingPolicy(current, greetingPolicy);
};

const rewriteDraftToMatchConfig = async (
  systemPrompt: string,
  draft: string,
  config: DraftConfig
): Promise<string> => {
  const rewritten = await generateCompletion(systemPrompt, buildRewritePrompt(draft, config));
  return cleanGeneratedMessage(rewritten.choices[0]?.message?.content || '');
};

const enforceDraftConfig = async (
  systemPrompt: string,
  initialText: string,
  config: DraftConfig
): Promise<string> => {
  let current = initialText;
  let attempts = 0;

  while (attempts < 3) {
    const emojiInvalid = needsEmojiRewrite(current, config.outputFormat, config.emojiPreference);
    const modeInvalid = !hasModeSignal(current, config.language, config.conversationMode);
    if (!emojiInvalid && !modeInvalid) {
      break;
    }

    const rewritten = await rewriteDraftToMatchConfig(systemPrompt, current, config);
    if (!rewritten.trim()) {
      break;
    }
    current = rewritten;
    attempts += 1;
  }

  const formatAdjusted = enforceOutputFormatConsistency(current, config.outputFormat);
  return ensureEmojiRange(formatAdjusted, config.outputFormat, config.emojiPreference);
};

const enforceReplyPolicy = async (
  systemPrompt: string,
  draft: string,
  language: Language
): Promise<string> => {
  let current = sanitizePolicyBannedPhrases(draft, language);
  let check = checkReplyPolicy(current, language);
  let attempts = 0;

  while (!check.valid && attempts < 2) {
    const rewritten = await generateCompletion(systemPrompt, buildPolicyRewritePrompt(current, language, check.violations));
    const next = sanitizePolicyBannedPhrases(cleanGeneratedMessage(rewritten.choices[0]?.message?.content || ''), language);
    if (!next.trim()) {
      break;
    }
    current = next;
    check = checkReplyPolicy(current, language);
    attempts += 1;
  }

  if (check.valid) {
    return current;
  }

  const words = tokenizeForPolicy(current);
  if (words.length > 30) {
    const clipped = words.slice(0, 30).join(' ');
    current = clipped.endsWith('?') || clipped.endsWith('？') ? clipped : `${clipped}?`;
  }
  current = sanitizePolicyBannedPhrases(current, language);
  return current;
};

const getObjectiveCoverageThreshold = (objectiveItems: string[]): number => (objectiveItems.length > 1 ? 0.9 : 1);

const enforceObjectiveCoverage = async (
  systemPrompt: string,
  draft: string,
  language: Language,
  purpose: 'follow_up' | 'payment',
  objectiveItems: string[]
): Promise<string> => {
  const threshold = getObjectiveCoverageThreshold(objectiveItems);
  let current = draft;
  let coverage = getObjectiveCoverageRatio(current, objectiveItems);
  let attempt = 0;

  while (coverage < threshold && attempt < 2) {
    const objectiveList = objectiveItems.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
    const rewritePrompt =
      language === 'zh-CN'
        ? `请重写下面消息，确保完全覆盖所有目标项，不遗漏。\n目标项：\n${objectiveList}\n要求：\n- 每个目标都要在正文里明确提到\n- ${purpose === 'payment' ? '优先先确认付款时间，再覆盖其他目标' : '先覆盖主目标，再覆盖次目标'}\n- 输出可直接发送的消息，不加解释\n\n原文：\n${current}`
        : language === 'ms'
          ? `Tulis semula mesej ini supaya semua objektif diliputi tanpa tertinggal.\nSenarai objektif:\n${objectiveList}\nSyarat:\n- Setiap objektif mesti disebut dengan jelas\n- ${purpose === 'payment' ? 'Utamakan pengesahan masa bayaran dahulu' : 'Utamakan objektif utama dahulu'}\n- Output mesej siap hantar sahaja\n\nDraf:\n${current}`
          : `Rewrite this message to fully cover every objective item with no omissions.\nObjective items:\n${objectiveList}\nRequirements:\n- Explicitly cover each objective in the message\n- ${purpose === 'payment' ? 'Prioritize payment timing first, then remaining items' : 'Prioritize the primary objective first'}\n- Output only the final sendable message\n\nDraft:\n${current}`;

    const completion = await generateCompletion(systemPrompt, rewritePrompt);
    const rewritten = cleanGeneratedMessage(completion.choices[0]?.message?.content || '');
    if (!rewritten.trim()) {
      break;
    }
    current = rewritten;
    coverage = getObjectiveCoverageRatio(current, objectiveItems);
    attempt += 1;
  }

  return current;
};

export const buildGenerationDebugInfo = (
  text: string,
  config: DraftConfig,
  goal: string,
  mode: 'initial' | 'refine' = 'initial'
): GenerationDebugInfo => {
  const objectiveItems = splitObjectives(goal);
  const objectiveCoverageRatio = getObjectiveCoverageRatio(text, objectiveItems);
  const objectiveCoveragePass = objectiveCoverageRatio >= getObjectiveCoverageThreshold(objectiveItems);
  const emojiCount = countEmojis(text);
  const emojiRange = getEmojiRange(config.outputFormat, config.emojiPreference);
  return {
    requested: {
      goal: config.goal || '',
      context: config.context || '',
      language: config.language,
      channel: config.channel || config.outputFormat,
      style: config.style || config.conversationMode,
      daysPassed: config.daysPassed || 0,
      emojiIntensity: config.emojiPreference,
    },
    checks: {
      emojiCount,
      emojiMin: emojiRange.min,
      emojiMax: emojiRange.max,
      emojiInRange: emojiCount >= emojiRange.min && emojiCount <= emojiRange.max,
      styleSignalDetected: hasModeSignal(text, config.language, config.conversationMode),
      goalCoverageRatio: Number(objectiveCoverageRatio.toFixed(3)),
      goalCoveragePass: objectiveCoveragePass,
    },
    mode,
    emojiRule: getEmojiRuleText(config.emojiPreference, config.language),
    tokenEstimate: {
      promptChars: 0,
      promptTokensApprox: 0,
      responseTokenBudget: 120,
    },
  };
};

const getChineseWhatsappHumanStyle = (purpose: 'follow_up' | 'payment'): string => {
  if (purpose === 'payment') {
    return [
      '中文 WhatsApp 真人口吻目标（必须遵守）：',
      '结构：',
      '1) 第一段：简短称呼 + 轻松开场（可带 1 个自然 emoji）',
      '2) 第二段：明确本次要确认的事情（具体到时间/金额/动作）',
      '3) 第三段：说明你们安排原因（简短一两句）',
      '4) 第四段：给对方留空间 + 请求一个可执行回复（例如预计日期）',
      '',
      '示例语气（仅学习语气，不要照抄）：',
      '老板早安😊',
      '想确认一下这笔款项预计这周还是下周方便安排？',
      '我们这边要先排期处理进度，所以想先和你对齐时间。',
      '方便的话回我一个大概时间就好，感谢你🙏',
      '',
      '禁用表达：显著提升、最大化收益、探讨下一步计划、模板化收尾',
    ].join('\n');
  }

  return [
    '中文 WhatsApp 真人口吻目标（必须遵守）：',
    '结构：',
    '1) 第一段：简短称呼 + 轻松问候（可带 1-2 个自然 emoji）',
    '2) 第二段：直接说明这次跟进要确认什么（objective 必须落地成问题）',
    '3) 第三段：说明你们为什么需要这个信息（简短真实）',
    '4) 第四段：给对方缓冲 + 友善收尾',
    '',
    '示例语气（仅学习语气，不要照抄）：',
    '老板早安😊',
    '想确认一下 2025 年做账文件大概这几天还是下周方便交给我们呢？',
    '我们这边需要先排期，文件如果能早一点准备好，就能更快开始处理👍',
    '如果你现在还在整理也没关系，回我一个大概时间就好，谢谢你🙏',
    '',
    '禁用表达：显著提升、实现更高效率和收益、期待你的回复、明显 AI 模板腔',
  ].join('\n');
};

const cleanGeneratedMessage = (text: string): string => {
  return text
    .replace(/^(WhatsApp|Email|Chat)\s*:\s*/im, '')
    .replace(/^\s*主题\s*:\s*/im, '主题: ')
    .replace(/^\s*Subject\s*:\s*/im, 'Subject: ')
    .trim();
};

const enforceOutputFormatConsistency = (text: string, outputFormat: OutputFormat): string => {
  if (outputFormat === 'whatsapp' || outputFormat === 'chat') {
    return text
      .replace(/^\s*(subject|subjek|主题)\s*:\s*.*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return text;
};

const getMalayWhatsappHumanStyle = (purpose: 'follow_up' | 'payment'): string => {
  if (purpose === 'payment') {
    return [
      'Gaya WhatsApp Bahasa Melayu (wajib):',
      '1) Mulakan dengan sapaan ringkas dan mesra',
      '2) Nyatakan isu bayaran secara jelas',
      '3) Terangkan sebab perlukan pengesahan masa',
      '4) Akhiri dengan soalan yang mudah dijawab',
      'Elakkan ayat terlalu formal atau bunyi robotik.',
    ].join('\n');
  }

  return [
    'Gaya WhatsApp Bahasa Melayu (wajib):',
    '1) Sapaan ringkas dan mesra',
    '2) Nyatakan follow-up yang spesifik berdasarkan objective',
    '3) Jelaskan sebab perlukan maklum balas',
    '4) Minta satu tindakan atau masa anggaran yang jelas',
    'Elakkan ayat klise dan terlalu formal.',
  ].join('\\n');
};

const formatFallbackMessage = (
  baseMessage: string,
  outputFormat: OutputFormat,
  language: Language,
  leadName: string,
  subject: string
): string => {
  const isChinese = language === 'zh-CN';
  const isMalay = language === 'ms';
  if (outputFormat === 'email') {
    const signOff = isChinese ? '此致\n敬礼' : isMalay ? 'Salam hormat' : 'Best regards';
    return `${isChinese ? '主题' : isMalay ? 'Subjek' : 'Subject'}: ${subject}\n\n${baseMessage}\n\n${signOff}`;
  }

  if (outputFormat === 'whatsapp') {
    const emojiTail = detectEmojiPreference(baseMessage) === 'high'
      ? (isChinese ? '\n感谢你🙏😊' : isMalay ? '\nTerima kasih 🙏😊' : '\nThanks a lot 🙏😊')
      : (isChinese ? '\n谢谢～😊' : isMalay ? '\nTerima kasih 😊' : '\nThanks! 😊');
    if (isChinese || isMalay) {
      return `Hi ${leadName}，\n${baseMessage.replace(/\n\n/g, '\n')}${emojiTail}`;
    }
    return `Hi ${leadName},\n${baseMessage.replace(/\n\n/g, '\n')}${emojiTail}`;
  }

  return baseMessage;
};

const normalizePhoneForAi = (value?: string | null): string => (value || '').replace(/[^\d]/g, '');

const phonesLikelyMatchForAi = (left?: string | null, right?: string | null): boolean => {
  const normalizedLeft = normalizePhoneForAi(left);
  const normalizedRight = normalizePhoneForAi(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(normalizedRight) ||
    normalizedRight.endsWith(normalizedLeft)
  );
};

const trimSnippet = (value: string, max: number = 120) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
};

const parseTaggedSection = (payload: string, tag: string) => {
  const match = payload.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match?.[1]?.trim() || '';
};

const leadStructuredMemorySchema = z.object({
  customer_intent: z.string().min(1).max(240),
  current_status: z.string().min(1).max(240),
  key_issues: z.string().min(1).max(320),
  tone_preference: z.string().min(1).max(120),
  urgency_level: z.enum(['low', 'medium', 'high']),
  next_best_action: z.string().min(1).max(240),
  summary: z.string().min(1).max(320),
});

type LeadStructuredMemory = z.infer<typeof leadStructuredMemorySchema>;

interface LeadMemorySnapshot {
  summary: string | null;
  goal: string | null;
  tone: FollowUpTone | PaymentTone | null;
  conversationMode: ConversationMode | null;
  emojiDensity: EmojiPreference | null;
  outputFormat: OutputFormat | null;
  structured: LeadStructuredMemory | null;
  language: Language | null;
  updatedAt: Date | null;
}

interface UserAiContext {
  displayName: string | null;
  companyName: string | null;
  industry: string | null;
  nickname: string | null;
  occupation: string | null;
  aboutYou: string | null;
  customInstructions: string | null;
  memoryEnabled: boolean;
  recordHistoryEnabled: boolean;
  baseStyleTone: 'default' | 'professional' | 'friendly' | 'concise' | null;
  characterWarmth: 'default' | 'low' | 'medium' | 'high' | null;
  characterEnthusiasm: 'default' | 'low' | 'medium' | 'high' | null;
  characterHeadersLists: 'default' | 'minimal' | 'structured' | null;
  characterEmoji: 'default' | 'low' | 'medium' | 'high' | null;
  defaultTone: FollowUpTone | PaymentTone | null;
  defaultConversationMode: ConversationMode | null;
  defaultEmojiDensity: EmojiPreference | null;
  defaultOutputFormat: OutputFormat | null;
}

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kuala_Lumpur';

const normalizeBaseStyleTone = (value?: string | null): UserAiContext['baseStyleTone'] => {
  if (!value) return null;
  if (value === 'default' || value === 'professional' || value === 'friendly' || value === 'concise') {
    return value;
  }
  return null;
};

const normalizeCharacterLevel = (value?: string | null): 'default' | 'low' | 'medium' | 'high' | null => {
  if (!value) return null;
  if (value === 'default' || value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return null;
};

const normalizeHeadersListsLevel = (value?: string | null): 'default' | 'minimal' | 'structured' | null => {
  if (!value) return null;
  if (value === 'default' || value === 'minimal' || value === 'structured') {
    return value;
  }
  return null;
};

const deriveToneFromBaseStyle = (baseStyleTone: UserAiContext['baseStyleTone']): FollowUpTone | PaymentTone | null => {
  if (!baseStyleTone || baseStyleTone === 'default') return null;
  if (baseStyleTone === 'professional') return 'professional';
  if (baseStyleTone === 'friendly') return 'friendly';
  return 'assertive';
};

const deriveConversationModeFromHeaders = (headersLevel: UserAiContext['characterHeadersLists']): ConversationMode | null => {
  if (!headersLevel || headersLevel === 'default') return null;
  return headersLevel === 'structured' ? 'consultative' : 'direct';
};

const deriveEmojiFromCharacterEmoji = (value: UserAiContext['characterEmoji']): EmojiPreference | null => {
  if (!value || value === 'default') return null;
  return value;
};

const getUserAiContext = async (userId: string): Promise<UserAiContext> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      displayName: true,
      companyName: true,
      industry: true,
      nickname: true,
      occupation: true,
      aboutYou: true,
      customInstructions: true,
      memoryEnabled: true,
      recordHistoryEnabled: true,
      baseStyleTone: true,
      characterWarmth: true,
      characterEnthusiasm: true,
      characterHeadersLists: true,
      characterEmoji: true,
      defaultTone: true,
      defaultConversationMode: true,
      defaultEmojiDensity: true,
      defaultOutputFormat: true,
    },
  });

  const baseStyleTone = normalizeBaseStyleTone(user?.baseStyleTone);
  const characterHeadersLists = normalizeHeadersListsLevel(user?.characterHeadersLists);
  const characterEmoji = normalizeCharacterLevel(user?.characterEmoji);
  const defaultTone = normalizeTonePreference(user?.defaultTone) || deriveToneFromBaseStyle(baseStyleTone);
  const defaultConversationMode =
    normalizeConversationModePreference(user?.defaultConversationMode) || deriveConversationModeFromHeaders(characterHeadersLists);
  const defaultEmojiDensity =
    normalizeEmojiPreferenceValue(user?.defaultEmojiDensity) || deriveEmojiFromCharacterEmoji(characterEmoji);
  const defaultOutputFormat = normalizeOutputFormatValue(user?.defaultOutputFormat);

  return {
    displayName: user?.displayName || null,
    companyName: user?.companyName || null,
    industry: user?.industry || null,
    nickname: user?.nickname || null,
    occupation: user?.occupation || null,
    aboutYou: user?.aboutYou || null,
    customInstructions: user?.customInstructions || null,
    memoryEnabled: user?.memoryEnabled ?? true,
    recordHistoryEnabled: user?.recordHistoryEnabled ?? true,
    baseStyleTone,
    characterWarmth: normalizeCharacterLevel(user?.characterWarmth),
    characterEnthusiasm: normalizeCharacterLevel(user?.characterEnthusiasm),
    characterHeadersLists,
    characterEmoji,
    defaultTone,
    defaultConversationMode,
    defaultEmojiDensity,
    defaultOutputFormat,
  };
};

const getCurrentLocalContext = (language: Language, timeZone: string = APP_TIMEZONE) => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'long',
  });

  const parts = formatter.formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const hour = Number(pick('hour') || '0');
  const dateText = `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
  const weekday = pick('weekday');

  const period =
    hour < 5 ? 'late_night'
    : hour < 12 ? 'morning'
    : hour < 18 ? 'afternoon'
    : hour < 22 ? 'evening'
    : 'night';

  const guidance =
    language === 'zh-CN'
      ? [
          `当前本地时间（${timeZone}）：${dateText}，${weekday}。当前时段：${period}。`,
          period === 'morning'
            ? '如果需要问候，可以用“早 / 早安 / 上午好”一类自然表达。'
            : period === 'afternoon'
              ? '不要使用“早安/早”，如需问候请用“下午好”或直接进入正题。'
              : period === 'evening'
                ? '不要使用“早安/早”，如需问候请用“晚上好”或直接进入正题。'
                : '现在已经很晚，禁止使用“早安/早/下午好”。优先直接进入正题，或用“这么晚打扰了”这类更自然的晚间表达。',
        ].join(' ')
      : language === 'ms'
        ? [
            `Waktu tempatan sekarang (${timeZone}): ${dateText}, ${weekday}. Bahagian hari: ${period}.`,
            period === 'morning'
              ? 'Jika mahu beri sapaan, boleh guna sapaan pagi secara natural.'
              : period === 'afternoon'
                ? 'Jangan guna sapaan pagi. Jika perlu, guna sapaan petang atau terus masuk isi.'
                : period === 'evening'
                  ? 'Jangan guna sapaan pagi. Jika perlu, guna sapaan malam atau terus ke point.'
                  : 'Sekarang sudah lewat malam. Elakkan sapaan pagi/petang; terus masuk isi atau guna pembuka yang sesuai untuk waktu malam.',
          ].join(' ')
        : [
            `Current local time (${timeZone}): ${dateText}, ${weekday}. Daypart: ${period}.`,
            period === 'morning'
              ? 'Morning greetings are acceptable if they feel natural.'
              : period === 'afternoon'
                ? 'Do not use morning greetings. If greeting, use an afternoon-appropriate line or skip greeting.'
                : period === 'evening'
                  ? 'Do not use morning greetings. If greeting, use an evening-appropriate line or go straight to the point.'
                  : 'It is late at night. Never use morning/afternoon greetings. Prefer going straight to the point or a light late-night acknowledgment.',
          ].join(' ');

  return { hour, period, guidance };
};

const getIndustryInstruction = (industry: string | null | undefined, language: Language) => {
  if (!industry?.trim()) {
    return '';
  }

  if (language === 'zh-CN') {
    return `行业上下文：当前商家行业是“${industry}”。输出要更贴近这个行业的常见客户沟通方式、常见交易节奏和常见顾虑。不要写成泛用销售话术。`;
  }

  if (language === 'ms') {
    return `Konteks industri: bisnes ini dalam industri “${industry}”. Sesuaikan mesej dengan cara pelanggan industri ini biasa berbual, membuat keputusan, dan membeli. Jangan bunyi terlalu generik.`;
  }

  return `Industry context: this business operates in "${industry}". Make the message feel native to how customers in this industry usually talk, decide, and buy. Avoid generic sales copy.`;
};

const getPersonalizationInstruction = (context: UserAiContext, language: Language): string => {
  const lines: string[] = [];
  if (context.nickname) {
    lines.push(language === 'zh-CN' ? `用户昵称：${context.nickname}` : language === 'ms' ? `Nama panggilan pengguna: ${context.nickname}` : `User nickname: ${context.nickname}`);
  }
  if (context.occupation) {
    lines.push(language === 'zh-CN' ? `用户职业：${context.occupation}` : language === 'ms' ? `Pekerjaan pengguna: ${context.occupation}` : `User occupation: ${context.occupation}`);
  }
  if (context.aboutYou) {
    lines.push(language === 'zh-CN' ? `用户补充背景：${context.aboutYou}` : language === 'ms' ? `Maklumat tambahan pengguna: ${context.aboutYou}` : `Additional user context: ${context.aboutYou}`);
  }
  if (context.customInstructions) {
    lines.push(language === 'zh-CN' ? `自定义指令（必须遵守）：${context.customInstructions}` : language === 'ms' ? `Arahan tersuai (wajib ikut): ${context.customInstructions}` : `Custom instructions (must follow): ${context.customInstructions}`);
  }
  return lines.join('\n');
};

const containsWrongTimeGreeting = (text: string, language: Language, hour: number) => {
  const lower = text.toLowerCase();
  if (language === 'zh-CN') {
    const hasMorning = /早安|早上好|早呀|早！|早,|早，|(^|[\s，,])早($|[\s！!，,])/u.test(text);
    return hasMorning && hour >= 12;
  }

  if (language === 'ms') {
    const hasMorning = /selamat pagi|pagi ya|pagi!/i.test(lower);
    return hasMorning && hour >= 12;
  }

  const hasMorning = /\bgood morning\b|\bmorning\b/.test(lower);
  return hasMorning && hour >= 12;
};

const hasConcreteReplyAsk = (text: string, language: Language) => {
  const lower = text.toLowerCase();
  if (language === 'zh-CN') {
    return /方便|可以|能否|回我|回复|几点|今天|明天|这周|下周|时间|安排/u.test(text);
  }
  if (language === 'ms') {
    return /boleh|balas|reply|hari ini|esok|minggu ini|minggu depan|jam berapa|tarikh/i.test(lower);
  }
  return /\bcan\b|\bcould\b|\blet me know\b|\breply\b|\btoday\b|\btomorrow\b|\bthis week\b|\bnext week\b|\bwhat time\b|\bdate\b/.test(lower);
};

const RESTART_SILENCE_MINUTES = Number(process.env.AI_CONVERSATION_RESTART_MINUTES || 12 * 60);

const greetingLineRegex = /^(?:\s*(?:hi|hello|hey|good (?:morning|afternoon|evening)|salam|salam sejahtera|selamat (?:pagi|petang|malam)|你好|您好|嗨|哈喽|早上好|早安|午安|晚上好)[^,\n，。!?！？]*[,\n，。!?！？]?)+\s*/i;

const hardBanOpeners = [
  /^\s*(?:hi|hello|hey|greetings|good (?:morning|afternoon|evening))\b/i,
  /^\s*(?:nice to meet you|pleasure to meet you)\b/i,
  /^\s*how (?:can|may) i (?:help|assist)(?: you)?(?: today)?\b/i,
  /^\s*thank you for (?:your message|reaching out|sharing)\b/i,
  /^\s*(?:salam|assalamualaikum|salam sejahtera|selamat (?:pagi|petang|malam))\b/i,
  /^\s*(?:你好|您好|很高兴认识你|哈喽|嗨)\b/u,
];

const softBanGenericStarters = [
  /^\s*(?:sure|okay|ok|alright|understood|noted)\b[,.! ]*$/i,
  /^\s*(?:got it|makes sense|i see|faham|saya faham|明白|我明白|了解了|收到)\b[,.!。！？ ]*$/iu,
  /^\s*(?:sure|okay|ok|understood|noted)[,.! ]+(?:i can help|let me help|i understand(?: your concern)?)/i,
  /^\s*(?:absolutely|certainly)[,.! ]+(?:let me help|i can help|i will assist)/i,
  /^\s*(?:terima kasih|thanks|thank you|谢谢|感謝)[,.! ]*$/i,
];

const starterStopWords = new Set([
  'the', 'this', 'that', 'for', 'with', 'from', 'have', 'been', 'your', 'you', 'and', 'but', 'yang', 'untuk', 'dengan',
  'saya', 'kami', 'kita', 'boleh', 'lah', 'ya', 'ni', 'itu', 'ini', 'ok', 'okay', 'sure', 'noted', 'understood',
]);

const splitIntoSentences = (text: string): string[] => {
  const chunks = text
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return chunks;
};

const extractFirstSentence = (text: string): { first: string; rest: string } => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { first: '', rest: '' };
  }

  const match = trimmed.match(/^([\s\S]*?[.!?。！？])(\s+[\s\S]*)$/u);
  if (match) {
    return {
      first: (match[1] || '').trim(),
      rest: (match[2] || '').trimStart(),
    };
  }

  const lines = trimmed.split('\n');
  if (lines.length > 1) {
    const [first, ...rest] = lines;
    return {
      first: (first || '').trim(),
      rest: rest.join('\n').trim(),
    };
  }

  return { first: trimmed, rest: '' };
};

const tokenizeAnchorTerms = (text: string): string[] => {
  const latin = (text.match(/[A-Za-z0-9]{3,}/g) || [])
    .map((token) => token.toLowerCase())
    .filter((token) => !starterStopWords.has(token));
  const cjk = (text.match(/[\u4e00-\u9fff]{2,}/gu) || []).map((token) => token.trim());
  return Array.from(new Set([...cjk, ...latin])).slice(0, 8);
};

const hasContextAnchorInFirstSentence = (firstSentence: string, context: GreetingPolicyContext, objective: string): boolean => {
  const first = firstSentence.toLowerCase();
  const candidateText = [
    context.activeTopicAnchor || '',
    context.lastInboundSnippet || '',
    context.lastOutboundSnippet || '',
    objective || '',
  ].join(' ');
  const anchors = tokenizeAnchorTerms(candidateText);
  if (anchors.length === 0) {
    return true;
  }

  return anchors.some((token) => first.includes(token.toLowerCase()));
};

const looksLikeGenericStarter = (firstSentence: string): boolean => {
  if (!firstSentence.trim()) {
    return true;
  }
  return softBanGenericStarters.some((regex) => regex.test(firstSentence.trim()));
};

const matchesHardBanOpener = (firstSentence: string): boolean => {
  return hardBanOpeners.some((regex) => regex.test(firstSentence.trim()));
};

const buildContextAnchoredFirstSentence = (
  language: Language,
  context: GreetingPolicyContext,
  objective: string
): string => {
  const anchor = (context.activeTopicAnchor || context.lastInboundSnippet || context.lastOutboundSnippet || objective || '').trim();
  const anchorShort = trimSnippet(anchor, 72).replace(/["“”]/g, '').trim();
  const safeAnchor = anchorShort || (
    language === 'zh-CN'
      ? '你刚才提到的内容'
      : language === 'ms'
        ? 'point tadi'
        : 'your last message'
  );

  if (language === 'zh-CN') {
    return `关于${safeAnchor}，这边先确认一下。`;
  }

  if (language === 'ms') {
    return `Untuk ${safeAnchor}, saya nak confirm satu perkara dulu.`;
  }

  return `On ${safeAnchor}, quick confirm before we proceed.`;
};

const enforceConciseResponse = (text: string, outputFormat: OutputFormat): string => {
  if (outputFormat === 'email') {
    return text.trim();
  }

  const sentences = splitIntoSentences(text);
  if (sentences.length <= 4) {
    return text.trim();
  }

  return sentences.slice(0, 4).join(' ').trim();
};

const applyConversationalGuardrails = (
  draft: string,
  language: Language,
  outputFormat: OutputFormat,
  context: GreetingPolicyContext,
  objective: string
): string => {
  let current = draft.trim();
  const { first, rest } = extractFirstSentence(current);
  if (!first) {
    return current;
  }

  const requireNoGreeting = !context.allowGreeting;
  const hasHardBan = requireNoGreeting && matchesHardBanOpener(first);
  const missingAnchor = requireNoGreeting && !hasContextAnchorInFirstSentence(first, context, objective);
  const genericStarter = requireNoGreeting && looksLikeGenericStarter(first) && missingAnchor;

  if (hasHardBan || missingAnchor || genericStarter) {
    const rewrittenFirst = buildContextAnchoredFirstSentence(language, context, objective);
    current = rest ? `${rewrittenFirst} ${rest}` : rewrittenFirst;
  }

  return enforceConciseResponse(current, outputFormat);
};

const startsWithGreeting = (text: string) => {
  if (!text) {
    return false;
  }
  const firstLine = text.trim().split('\n')[0] || '';
  return greetingLineRegex.test(firstLine);
};

const stripLeadingGreeting = (text: string) => {
  if (!text) {
    return text;
  }

  const trimmed = text.trimStart();
  const stripped = trimmed.replace(greetingLineRegex, '').trimStart();
  return stripped || trimmed;
};

const enforceGreetingPolicy = (draft: string, context: GreetingPolicyContext): string => {
  if (!startsWithGreeting(draft)) {
    return draft;
  }

  if (!context.allowGreeting || context.hasOutboundGreetingInLast24h || context.hasInboundReplyInLast24h) {
    return stripLeadingGreeting(draft);
  }

  return draft;
};

const getGreetingPolicyInstruction = (language: Language, context: GreetingPolicyContext): string => {
  const noNewGreeting = !context.allowGreeting || context.hasOutboundGreetingInLast24h || context.hasInboundReplyInLast24h;

  if (language === 'zh-CN') {
    return noNewGreeting
      ? '问候规则：过去 24 小时此客户已问候过或刚回复，本条不要再用“你好/早上好”等开场，直接延续正文。'
      : '问候规则：问候可选，不是必填；如不用问候，直接进入核心请求。';
  }

  if (language === 'ms') {
    return noNewGreeting
      ? 'Peraturan sapaan: dalam 24 jam terakhir sudah ada sapaan atau pelanggan baru balas, jadi jangan mulakan dengan sapaan lagi; teruskan isi mesej.'
      : 'Peraturan sapaan: sapaan adalah pilihan, bukan wajib; boleh terus kepada mesej utama.';
  }

  return noNewGreeting
    ? 'Greeting policy: this lead already had a greeting within 24h or just replied, so do not prepend another greeting; continue directly with the message body.'
    : 'Greeting policy: greeting is optional, not mandatory. You may start directly with the core ask.';
};

const buildBusinessValidationPrompt = (
  draft: string,
  language: Language,
  issues: string[],
  objective: string
) => {
  const issueList = issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n');
  if (language === 'zh-CN') {
    return `请重写下面消息，修复这些业务问题：\n${issueList}\n\n原始 objective：${objective}\n要求：\n- 保留同一个目标\n- 更像真人商家 WhatsApp\n- 直接输出可发送消息，不要解释\n\n草稿：\n${draft}`;
  }
  if (language === 'ms') {
    return `Tulis semula mesej ini dan betulkan masalah berikut:\n${issueList}\n\nObjektif asal: ${objective}\nSyarat:\n- Kekalkan objektif yang sama\n- Bunyikan seperti mesej WhatsApp bisnes sebenar\n- Output mesej siap hantar sahaja\n\nDraf:\n${draft}`;
  }
  return `Rewrite this message and fix these business-quality issues:\n${issueList}\n\nOriginal objective: ${objective}\nRequirements:\n- Keep the same objective\n- Make it sound like a real business WhatsApp message\n- Output only the sendable message\n\nDraft:\n${draft}`;
};

const normalizeTonePreference = (value?: string | null): FollowUpTone | PaymentTone | null => {
  if (!value) return null;
  const supported: Array<FollowUpTone | PaymentTone> = ['polite', 'friendly', 'professional', 'casual', 'assertive', 'empathetic', 'urgent'];
  return supported.includes(value as FollowUpTone) ? (value as FollowUpTone) : null;
};

const normalizeConversationModePreference = (value?: string | null): ConversationMode | null => {
  if (!value) return null;
  const supported: ConversationMode[] = ['standard', 'humor', 'banter', 'direct', 'consultative'];
  return supported.includes(value as ConversationMode) ? (value as ConversationMode) : null;
};

const normalizeEmojiPreferenceValue = (value?: string | null): EmojiPreference | null => {
  if (!value) return null;
  const supported: EmojiPreference[] = ['low', 'medium', 'high'];
  return supported.includes(value as EmojiPreference) ? (value as EmojiPreference) : null;
};

const normalizeOutputFormatValue = (value?: string | null): OutputFormat | null => {
  if (!value) return null;
  const supported: OutputFormat[] = ['chat', 'email', 'whatsapp'];
  return supported.includes(value as OutputFormat) ? (value as OutputFormat) : null;
};

const normalizeStyleValue = (value?: string | null): AiStyle | null =>
  normalizeConversationModePreference(value);

const mapStyleToTonePreference = (style: AiStyle): FollowUpTone | PaymentTone => {
  if (style === 'direct') return 'assertive';
  if (style === 'consultative') return 'professional';
  if (style === 'banter') return 'friendly';
  if (style === 'humor') return 'casual';
  return 'polite';
};

const mapStyleToFollowUpPreset = (style: AiStyle): FollowUpStylePreset => {
  if (style === 'direct') return 'deadline_push';
  if (style === 'consultative') return 'meeting_request';
  if (style === 'banter') return 'social_proof';
  if (style === 'humor') return 'value_reminder';
  return 'gentle_nudge';
};

const mapStyleToPaymentPreset = (style: AiStyle): PaymentStylePreset => {
  if (style === 'direct') return 'due_today';
  if (style === 'consultative') return 'installment_offer';
  if (style === 'banter' || style === 'humor') return 'friendly_reminder';
  return 'friendly_reminder';
};

type QuickActionIntentConfig = {
  internalInstruction: string;
  promptStrategyBlock: string;
  defaultToneBias: FollowUpTone | PaymentTone;
  defaultCtaBias: string;
  purposeHint: 'follow_up' | 'payment';
};

const QUICK_ACTION_INTENT_MAP: Record<QuickActionIntent, QuickActionIntentConfig> = {
  follow_up_softly: {
    internalInstruction: 'Send a low-pressure follow-up that feels warm and human.',
    promptStrategyBlock: 'Acknowledge context, keep urgency gentle, and ask one easy reply question.',
    defaultToneBias: 'friendly',
    defaultCtaBias: 'light yes/no or short timing reply',
    purposeHint: 'follow_up',
  },
  push_for_payment: {
    internalInstruction: 'Move the lead toward payment confirmation with respectful clarity.',
    promptStrategyBlock: 'Be process-oriented, request exact payment timing, and avoid threats or guilt framing.',
    defaultToneBias: 'professional',
    defaultCtaBias: 'confirm exact payment date/time',
    purposeHint: 'payment',
  },
  offer_discount: {
    internalInstruction: 'Use a value-focused discount nudge to reduce hesitation and close.',
    promptStrategyBlock: 'Frame discount as decision support, add careful urgency, and ask for explicit decision.',
    defaultToneBias: 'friendly',
    defaultCtaBias: 'accept offer today or choose option',
    purposeHint: 'follow_up',
  },
  close_deal: {
    internalInstruction: 'Assume strong buying intent and guide to final confirmation.',
    promptStrategyBlock: 'Keep momentum, remove ambiguity, and ask for booking/payment confirmation now.',
    defaultToneBias: 'assertive',
    defaultCtaBias: 'confirm now',
    purposeHint: 'payment',
  },
};

const getQuickActionIntentConfig = (intent?: QuickActionIntent | null) => {
  if (!intent) return null;
  return QUICK_ACTION_INTENT_MAP[intent] || null;
};

type PromptBuildInput = {
  purpose: 'follow_up' | 'payment';
  language: Language;
  leadName: string;
  goal: string;
  context: string;
  channel: OutputFormat;
  daysPassed: number;
  style: AiStyle;
  emojiIntensity: EmojiPreference;
  quickActionIntent?: QuickActionIntent;
  intentType?: string;
  conversationStage: ConversationStage;
  latestCustomerMessage: string;
  businessFacts: string[];
  unknownFacts: string[];
};

const STAGE_LABELS: Record<ConversationStage, string> = {
  new_inbound: 'new inbound inquiry',
  fresh_inbound_inquiry: 'fresh inbound inquiry',
  active_discussion: 'active discussion',
  follow_up: 'follow-up',
  quotation_payment: 'quotation/payment stage',
  quotation_payment_stage: 'quotation/payment stage',
};

const normalizeFactsInput = (value: unknown, maxItems: number): string[] => {
  const pushSafe = (bucket: string[], raw: unknown) => {
    if (typeof raw !== 'string') return;
    const cleaned = raw.trim();
    if (cleaned) bucket.push(cleaned);
  };

  const out: string[] = [];
  if (!value) return out;

  if (typeof value === 'string') {
    pushSafe(out, value);
    return out.slice(0, maxItems);
  }

  if (Array.isArray(value)) {
    value.forEach((item) => pushSafe(out, item));
    return out.slice(0, maxItems);
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
      if (typeof raw === 'boolean') {
        out.push(`${key}: ${raw ? 'unknown' : 'known'}`);
        return;
      }
      if (Array.isArray(raw)) {
        const joined = raw.map((x) => String(x).trim()).filter(Boolean).join(', ');
        if (joined) out.push(`${key}: ${joined}`);
        return;
      }
      if (raw !== null && raw !== undefined) {
        const cleaned = String(raw).trim();
        if (cleaned) out.push(`${key}: ${cleaned}`);
      }
    });
  }

  return out.slice(0, maxItems);
};

const normalizeConversationStage = (value?: ConversationStage | null): ConversationStage | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'new_inbound') return 'new_inbound';
  if (normalized === 'fresh_inbound_inquiry') return 'fresh_inbound_inquiry';
  if (normalized === 'active_discussion') return 'active_discussion';
  if (normalized === 'follow_up') return 'follow_up';
  if (normalized === 'quotation_payment') return 'quotation_payment';
  if (normalized === 'quotation_payment_stage') return 'quotation_payment_stage';
  return null;
};

const inferConversationStage = (args: {
  provided?: ConversationStage;
  purpose: 'follow_up' | 'payment';
  daysSinceLastContact: number;
  latestCustomerMessage: string;
  hasInboundReplyInLast24h: boolean;
  hasHistory: boolean;
}): ConversationStage => {
  const provided = normalizeConversationStage(args.provided);
  if (provided) return provided;
  if (args.purpose === 'payment') return 'quotation_payment';
  if (!args.latestCustomerMessage.trim() && args.daysSinceLastContact >= 3) return 'follow_up';
  if (/[?？]/.test(args.latestCustomerMessage) && args.hasInboundReplyInLast24h && !args.hasHistory) {
    return 'new_inbound';
  }
  if (/[?？]/.test(args.latestCustomerMessage) && args.hasInboundReplyInLast24h) {
    return 'active_discussion';
  }
  if (!args.latestCustomerMessage.trim() && args.daysSinceLastContact >= 2) return 'follow_up';
  return 'active_discussion';
};

const getPromptTaskInstruction = (
  language: Language,
  purpose: 'follow_up' | 'payment',
  leadName: string
) => {
  if (language === 'zh-CN') {
    return purpose === 'payment'
      ? `请写一条可直接发送给 ${leadName} 的付款提醒消息。`
      : `请写一条可直接发送给 ${leadName} 的跟进消息。`;
  }
  if (language === 'ms') {
    return purpose === 'payment'
      ? `Tulis mesej peringatan bayaran yang boleh terus dihantar kepada ${leadName}.`
      : `Tulis mesej follow-up yang boleh terus dihantar kepada ${leadName}.`;
  }
  return purpose === 'payment'
    ? `Write a payment reminder message that can be sent directly to ${leadName}.`
    : `Write a follow-up message that can be sent directly to ${leadName}.`;
};

const buildPrompt = (input: PromptBuildInput): string => {
  const intentConfig = getQuickActionIntentConfig(input.quickActionIntent);
  const latestMessage = input.latestCustomerMessage.trim() || 'n/a';
  const businessFacts = input.businessFacts.length > 0
    ? input.businessFacts.map((fact) => `- ${fact}`).join('\n')
    : '- none';
  const unknownFacts = input.unknownFacts.length > 0
    ? input.unknownFacts.map((fact) => `- ${fact}`).join('\n')
    : '- none';
  const languageLock = input.language === 'zh-CN'
    ? 'Chinese only'
    : input.language === 'ms'
      ? 'Bahasa Melayu only'
      : 'English only';
  const taskInstruction = getPromptTaskInstruction(input.language, input.purpose, input.leadName);
  const intentType = (input.intentType || (input.purpose === 'payment' ? 'payment_reply' : 'sales_reply')).trim();

  const quickIntentBlock = input.quickActionIntent && intentConfig
    ? [
        `- intentId: ${input.quickActionIntent}`,
        `- internalInstruction: ${intentConfig.internalInstruction}`,
        `- strategy: ${intentConfig.promptStrategyBlock}`,
        `- toneBias: ${intentConfig.defaultToneBias}`,
        `- ctaBias: ${intentConfig.defaultCtaBias}`,
      ].join('\n')
    : [
        '- intentId: none',
        '- internalInstruction: none',
        '- strategy: answer first, then move to one clear next step',
        '- toneBias: polite',
        '- ctaBias: single-question CTA',
      ].join('\n');

  return [
    'USER CONTEXT:',
    `- Lead name: ${input.leadName}`,
    '- Channel: WhatsApp',
    `- Target language: ${input.language}`,
    `- Language lock: ${languageLock}`,
    `- Emoji intensity: ${input.emojiIntensity}`,
    `- Conversation stage: ${STAGE_LABELS[input.conversationStage]}`,
    `- Seller intent type: ${intentType}`,
    `- Seller goal: ${input.goal || 'n/a'}`,
    `- Days since last contact: ${input.daysPassed}`,
    '',
    'KNOWN BUSINESS FACTS:',
    businessFacts,
    '',
    'UNKNOWN FACTS NOT TO INVENT:',
    unknownFacts,
    '',
    'CONVERSATION CONTEXT:',
    input.context || 'none',
    '',
    'LATEST CUSTOMER MESSAGE:',
    latestMessage,
    '',
    'QUICK ACTION INTENT:',
    quickIntentBlock,
    '',
    'TASK:',
    'Write exactly one send-ready WhatsApp reply for the seller.',
    '',
    'REPLY LOGIC:',
    '- Base the reply mainly on the latest customer message.',
    '- If the latest customer message contains a direct question, answer it first.',
    '- If the latest customer message is a fresh inquiry, do not use re-engagement or follow-up phrasing.',
    '- If information is missing, ask only the single most useful next question.',
    '- Use only known facts and supported context.',
    '- Do not invent business details.',
    '- Keep the reply concise, natural, and conversion-oriented.',
    `- Purpose hint: ${taskInstruction}`,
    '',
    'OUTPUT REQUIREMENT:',
    'Return only the final message text.',
  ].join('\n');
};

const buildRefinePrompt = (input: {
  language: Language;
  purpose: 'follow_up' | 'payment';
  originalText: string;
  instruction: string;
  style: AiStyle;
  channel: OutputFormat;
  emojiIntensity: EmojiPreference;
  quickActionIntent?: QuickActionIntent;
}): string => {
  const intentConfig = getQuickActionIntentConfig(input.quickActionIntent);
  return [
    'REFINE CONTEXT:',
    `- Channel: ${input.channel}`,
    `- Style: ${input.style}`,
    `- Purpose: ${input.purpose}`,
    `- Emoji intensity: ${input.emojiIntensity}`,
    '',
    'Message priority rules:',
    '- Keep customer-question-first behavior.',
    '- Remove re-engagement language ("just checking", "still interested", etc.) unless explicitly justified by inactive follow-up context.',
    '- Do not introduce unverified pricing/availability/package facts.',
    '',
    'Original message:',
    input.originalText.trim(),
    '',
    'Refinement instruction:',
    input.instruction.trim(),
    '',
    'Quick-action intent:',
    input.quickActionIntent && intentConfig
      ? [
          `- intentId: ${input.quickActionIntent}`,
          `- internalInstruction: ${intentConfig.internalInstruction}`,
          `- strategy: ${intentConfig.promptStrategyBlock}`,
          `- toneBias: ${intentConfig.defaultToneBias}`,
          `- ctaBias: ${intentConfig.defaultCtaBias}`,
        ].join('\n')
      : '- intentId: none',
    '',
    'Task:',
    'Rewrite the draft into one stronger WhatsApp message.',
    '',
    'Task requirements:',
    '- Preserve the original meaning unless the instruction says otherwise',
    '- Keep it human, concise, and conversion-oriented',
    '- Keep one clear CTA',
    '- Match the requested emoji intensity',
    '- Return only one rewritten message',
  ].join('\n');
};

const ANALYSIS_CONVERSATION_MAX_CHARS = 9000;
const ANALYSIS_NOTES_MAX_CHARS = 1400;

const truncateForAnalysis = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\r/g, '').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return normalized.slice(0, maxChars);
};

const buildConversationAnalysisPrompt = (input: {
  language: Language;
  leadName: string;
  conversation: string;
  notes?: string;
}) => {
  const schemaHint = '{"customer_intent":"","current_status":"","key_issues":"","tone_preference":"","urgency_level":"low|medium|high","next_best_action":"","summary":""}';
  return [
    'Extract compact CRM memory from the provided conversation.',
    'Return JSON only. No markdown, no explanations.',
    'Keep every field concise and practical for follow-up generation.',
    'If uncertain, make conservative inferences from explicit signals only.',
    `Target schema: ${schemaHint}`,
    '',
    `Lead name: ${input.leadName}`,
    `Language: ${input.language}`,
    '',
    'Conversation:',
    input.conversation || 'n/a',
    '',
    'Manual notes:',
    input.notes || 'none',
  ].join('\n');
};

const mapTonePreferenceToStoredTone = (value?: string | null): FollowUpTone | PaymentTone => {
  const normalized = (value || '').trim().toLowerCase();
  if (
    normalized === 'polite' ||
    normalized === 'friendly' ||
    normalized === 'professional' ||
    normalized === 'casual' ||
    normalized === 'assertive' ||
    normalized === 'empathetic' ||
    normalized === 'urgent'
  ) {
    return normalized;
  }
  if (normalized.includes('urgent') || normalized.includes('firm')) {
    return 'assertive';
  }
  if (normalized.includes('professional')) {
    return 'professional';
  }
  if (normalized.includes('casual')) {
    return 'casual';
  }
  if (normalized.includes('friend') || normalized.includes('warm')) {
    return 'friendly';
  }
  if (normalized.includes('empath')) {
    return 'empathetic';
  }
  return 'polite';
};

const normalizeStructuredMemory = (
  payload: Partial<Record<keyof LeadStructuredMemory, unknown>>
): LeadStructuredMemory => {
  const compact = (value: unknown, max: number) => trimSnippet(String(value || ''), max);
  const urgencyRaw = String(payload.urgency_level || '').trim().toLowerCase();
  const urgency_level: LeadStructuredMemory['urgency_level'] =
    urgencyRaw === 'high' || urgencyRaw === 'medium' || urgencyRaw === 'low'
      ? urgencyRaw
      : urgencyRaw.includes('high') || urgencyRaw.includes('urgent')
        ? 'high'
        : urgencyRaw.includes('low')
          ? 'low'
          : 'medium';

  const normalizedCandidate = {
    customer_intent: compact(payload.customer_intent, 240),
    current_status: compact(payload.current_status, 240),
    key_issues: compact(payload.key_issues, 320),
    tone_preference: compact(payload.tone_preference, 120),
    urgency_level,
    next_best_action: compact(payload.next_best_action, 240),
    summary: compact(payload.summary, 320),
  };

  return leadStructuredMemorySchema.parse({
    customer_intent: normalizedCandidate.customer_intent || 'Need was implied but not explicit',
    current_status: normalizedCandidate.current_status || 'Conversation ongoing',
    key_issues: normalizedCandidate.key_issues || 'No clear blockers stated',
    tone_preference: normalizedCandidate.tone_preference || 'polite',
    urgency_level: normalizedCandidate.urgency_level,
    next_best_action: normalizedCandidate.next_best_action || 'Send a concise follow-up asking for a clear next step',
    summary: normalizedCandidate.summary || 'Lead context captured from prior conversation',
  });
};

const parseStructuredMemoryFromModelOutput = (raw: string): LeadStructuredMemory => {
  const trimmed = raw.trim();
  try {
    return normalizeStructuredMemory(JSON.parse(trimmed));
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error('Invalid structured memory JSON');
    }
    const candidate = trimmed.slice(start, end + 1);
    return normalizeStructuredMemory(JSON.parse(candidate));
  }
};

const buildLeadMemoryUpdateData = (memory: LeadStructuredMemory, language: Language, now: Date = new Date()) => ({
  leadMemory: memory,
  memorySummary: memory.summary,
  memoryGoal: memory.next_best_action,
  aiTonePreference: mapTonePreferenceToStoredTone(memory.tone_preference),
  memoryLanguage: language,
  memoryUpdatedAt: now,
  lastActivityAt: now,
});

const toStructuredMemoryFromLegacy = (legacy: {
  summary?: string | null;
  goal?: string | null;
  tone?: string | null;
}): LeadStructuredMemory => ({
  customer_intent: trimSnippet(legacy.goal || legacy.summary || 'Clarify customer intent', 240),
  current_status: trimSnippet(legacy.summary || 'Conversation in progress', 240),
  key_issues: trimSnippet(legacy.summary || 'No clear blockers stated', 320),
  tone_preference: trimSnippet(legacy.tone || 'polite', 120),
  urgency_level: 'medium',
  next_best_action: trimSnippet(legacy.goal || 'Send a clear next-step follow-up', 240),
  summary: trimSnippet(legacy.summary || 'Lead memory updated', 320),
});

const getLeadMemorySnapshot = async (userId: string, leadId: string): Promise<LeadMemorySnapshot> => {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId },
    select: {
      leadMemory: true,
      memorySummary: true,
      memoryGoal: true,
      aiTonePreference: true,
      aiConversationMode: true,
      aiEmojiDensity: true,
      aiOutputFormat: true,
      memoryLanguage: true,
      memoryUpdatedAt: true,
    },
  });

  let structured: LeadStructuredMemory | null = null;
  if (lead?.leadMemory) {
    try {
      structured = normalizeStructuredMemory(lead.leadMemory as Record<string, unknown>);
    } catch {
      structured = null;
    }
  }

  return {
    summary: lead?.memorySummary || null,
    goal: lead?.memoryGoal || null,
    tone: normalizeTonePreference(lead?.aiTonePreference),
    conversationMode: normalizeConversationModePreference(lead?.aiConversationMode),
    emojiDensity: normalizeEmojiPreferenceValue(lead?.aiEmojiDensity),
    outputFormat: normalizeOutputFormatValue(lead?.aiOutputFormat),
    structured,
    language: (lead?.memoryLanguage as Language | null) || null,
    updatedAt: lead?.memoryUpdatedAt || null,
  };
};

const buildLeadMemoryFallback = (lead: {
  name: string;
  notes: string | null;
  status: string;
  stage?: string | null;
  tags?: unknown;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  latestInboundMessage?: string | null;
}, language: Language = 'en'): LeadMemorySnapshot => {
  const tags = Array.isArray(lead.tags) ? lead.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : [];
  const noteSummary = trimSnippet(lead.notes || '', 220);
  const inboundSnippet = trimSnippet(lead.latestInboundMessage || '', 220);
  const summary = language === 'zh-CN'
    ? [
        noteSummary ? `已知备注：${noteSummary}。` : null,
        `客户当前状态为 ${lead.status}。`,
        lead.stage ? `当前阶段：${lead.stage}。` : null,
        tags.length ? `自动标签：${tags.join('、')}。` : null,
        inboundSnippet ? `客户最新一句：${inboundSnippet}。` : null,
        lead.lastInboundAt ? `客户最近一次回复时间：${lead.lastInboundAt.toISOString()}。` : null,
        lead.lastOutboundAt ? `你最近一次发送时间：${lead.lastOutboundAt.toISOString()}。` : null,
      ].filter(Boolean).join(' ')
    : language === 'ms'
      ? [
          noteSummary ? `Nota sedia ada: ${noteSummary}.` : null,
          `Status lead sekarang ialah ${lead.status}.`,
          lead.stage ? `Tahap semasa: ${lead.stage}.` : null,
          tags.length ? `Tag automatik: ${tags.join(', ')}.` : null,
          inboundSnippet ? `Mesej pelanggan terkini: ${inboundSnippet}.` : null,
          lead.lastInboundAt ? `Balasan terakhir pelanggan pada ${lead.lastInboundAt.toISOString()}.` : null,
          lead.lastOutboundAt ? `Mesej terakhir anda dihantar pada ${lead.lastOutboundAt.toISOString()}.` : null,
        ].filter(Boolean).join(' ')
      : [
          noteSummary ? `Known notes: ${noteSummary}.` : null,
          `Lead is currently ${lead.status}.`,
          lead.stage ? `Current stage: ${lead.stage}.` : null,
          tags.length ? `Auto tags: ${tags.join(', ')}.` : null,
          inboundSnippet ? `Latest customer message: ${inboundSnippet}.` : null,
          lead.lastInboundAt ? `Customer last replied on ${lead.lastInboundAt.toISOString()}.` : null,
          lead.lastOutboundAt ? `You last sent a message on ${lead.lastOutboundAt.toISOString()}.` : null,
        ].filter(Boolean).join(' ');

  const inferredGoal =
    inboundSnippet
      ? language === 'zh-CN'
        ? /婚礼|婚紗|wedding/i.test(inboundSnippet)
          ? '确认婚礼摄影需求、日期和预算。'
          : /价格|多少钱|quote|price|harga/i.test(inboundSnippet)
            ? '确认客户想了解的价格、配套和下一步沟通时间。'
            : /booking|book|预定|订/i.test(inboundSnippet)
              ? '确认客户准备 booking 的时间、日期和所需资料。'
              : `根据客户最新消息确认需求并推进下一步。`
        : language === 'ms'
          ? /wedding|kahwin/i.test(inboundSnippet)
            ? 'Sahkan keperluan, tarikh, dan bajet untuk wedding shoot.'
            : /price|harga|quote/i.test(inboundSnippet)
              ? 'Sahkan pakej atau harga yang pelanggan mahu tahu serta masa untuk langkah seterusnya.'
              : /booking|book|reserve/i.test(inboundSnippet)
                ? 'Sahkan butiran booking, tarikh, dan maklumat yang diperlukan.'
                : 'Gunakan mesej terbaru pelanggan untuk sahkan keperluan dan langkah seterusnya.'
          : /wedding/i.test(inboundSnippet)
            ? 'Confirm wedding shoot requirements, date, and budget.'
            : /price|quote|how much|berapa/i.test(inboundSnippet)
              ? 'Confirm the pricing/package question and move toward a next-step reply.'
              : /booking|book|reserve/i.test(inboundSnippet)
                ? 'Confirm booking timing, date, and required details.'
                : 'Use the customer’s latest message to confirm their need and move to the next step.'
      : null;

  const goal = inferredGoal || (
    language === 'zh-CN'
      ? noteSummary || `推动 ${lead.name} 进入明确的下一步。`
      : language === 'ms'
        ? noteSummary || `Gerakkan ${lead.name} ke langkah seterusnya yang jelas.`
        : noteSummary || `Move ${lead.name} to the next clear step.`
  );

  return {
    summary: summary || (
      language === 'zh-CN'
        ? `自然延续与 ${lead.name} 的关系。`
        : language === 'ms'
          ? `Teruskan hubungan dengan ${lead.name} secara natural.`
          : `Continue the relationship naturally with ${lead.name}.`
    ),
    goal,
    tone: 'polite',
    conversationMode: 'standard',
    emojiDensity: 'medium',
    outputFormat: 'whatsapp',
    structured: toStructuredMemoryFromLegacy({
      summary: summary || null,
      goal,
      tone: 'polite',
    }),
    language,
    updatedAt: null,
  };
};

const memoryLooksPlaceholder = (summary?: string | null, goal?: string | null) => {
  const joined = `${summary || ''} ${goal || ''}`.toLowerCase();
  if (!joined.trim()) {
    return true;
  }

  const placeholderSignals = [
    'replace this with a real customer',
    'replace this',
    'generated text will appear here',
    'known notes:',
    'no whatsapp transcript stored',
    '请替换',
    '占位',
  ];

  return placeholderSignals.some((signal) => joined.includes(signal));
};

export const refreshLeadMemory = async (
  userId: string,
  leadId: string,
  language: Language = 'en'
): Promise<LeadMemorySnapshot> => {
  const userContext = await getUserAiContext(userId);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId },
    select: {
      id: true,
      name: true,
      notes: true,
      status: true,
      stage: true,
      tags: true,
      contact: true,
      lastInboundAt: true,
      lastOutboundAt: true,
    },
  });

  if (!lead) {
    throw new Error('Lead not found');
  }

  const normalizedContact = normalizePhoneForAi(lead.contact);
  const candidateLogs = await prisma.whatsAppMessageLog.findMany({
    where: {
      userId,
    },
    orderBy: { createdAt: 'desc' },
    take: 120,
  });

  const logs = candidateLogs
    .filter((log) => {
      if (log.leadId === leadId) {
        return true;
      }

      if (!normalizedContact) {
        return false;
      }

      return (
        phonesLikelyMatchForAi(log.toPhone, normalizedContact) ||
        phonesLikelyMatchForAi(log.fromPhone, normalizedContact)
      );
    })
    .slice(0, 16);

  const transcript = [...logs]
    .reverse()
    .map((log) => `${log.direction === 'inbound' ? 'customer' : 'you'}: ${trimSnippet(log.content, 160)}`)
    .join('\n');
  const latestInboundLog = logs.find((log) => log.direction === 'inbound');

  if (!process.env.OPENAI_API_KEY || logs.length === 0) {
    const fallback = buildLeadMemoryFallback({
      ...lead,
      latestInboundMessage: latestInboundLog?.content || null,
    }, language);
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        leadMemory: toStructuredMemoryFromLegacy({
          summary: fallback.summary,
          goal: fallback.goal,
          tone: fallback.tone,
        }),
        memorySummary: fallback.summary,
        memoryGoal: fallback.goal,
        aiTonePreference: fallback.tone,
        aiConversationMode: fallback.conversationMode,
        aiEmojiDensity: fallback.emojiDensity,
        aiOutputFormat: fallback.outputFormat,
        memoryLanguage: language,
        memoryUpdatedAt: new Date(),
      },
    });
    return { ...fallback, updatedAt: new Date() };
  }

  const systemPrompt = language === 'zh-CN'
    ? [
        '你在为小商家 WhatsApp 对话构建精简 CRM 记忆点。',
        '只返回标签内容，不要代码块。',
        '根据最近对话推断最可能的下一步目标、语气偏好和聊天习惯。',
        '不要编造对话里没有明确支持的细节。',
        'SUMMARY 和 GOAL 必须使用简体中文。',
      ].join('\n')
    : language === 'ms'
      ? [
          'Anda sedang membina memori CRM ringkas untuk perbualan WhatsApp bisnes kecil.',
          'Pulangkan kandungan bertag sahaja, tanpa code block.',
          'Berdasarkan perbualan terkini, infer objektif seterusnya, gaya nada, dan tabiat membalas.',
          'Jangan reka fakta yang tidak disokong oleh transkrip.',
          'SUMMARY dan GOAL mesti ditulis dalam Bahasa Melayu.',
        ].join('\n')
      : [
          'You are building a compact CRM memory for a small-business WhatsApp conversation.',
          'Return only tagged fields, no code fences.',
          'Infer the most likely next objective, reply style preference, and message habits from the recent conversation.',
          'Do not invent detailed facts that are not supported by the transcript.',
          'SUMMARY and GOAL must be written in English.',
        ].join('\n');

  const userPrompt = language === 'zh-CN'
    ? [
        `客户姓名：${lead.name}`,
        `客户状态：${lead.status}`,
        lead.stage ? `客户阶段：${lead.stage}` : '客户阶段：未设置',
        Array.isArray(lead.tags) && lead.tags.length ? `自动标签：${lead.tags.join('、')}` : '自动标签：无',
        userContext.industry ? `商家行业：${userContext.industry}` : '商家行业：未提供',
        lead.notes ? `内部备注：${lead.notes}` : '内部备注：无',
        '最近对话记录（最新在底部）：',
        transcript,
        '',
        '请严格按以下格式返回：',
        '<SUMMARY>用简体中文总结客户目前关注什么、对话进行到哪一步</SUMMARY>',
        '<GOAL>用简体中文写出下一条消息最适合的默认目标</GOAL>',
        '<TONE>polite|friendly|professional|casual|assertive|empathetic|urgent</TONE>',
        '<MODE>standard|humor|banter|direct|consultative</MODE>',
        '<EMOJI>low|medium|high</EMOJI>',
        '<FORMAT>chat|email|whatsapp</FORMAT>',
      ].join('\n')
    : language === 'ms'
      ? [
          `Nama pelanggan: ${lead.name}`,
          `Status lead: ${lead.status}`,
          lead.stage ? `Tahap lead: ${lead.stage}` : 'Tahap lead: belum ditetapkan',
          Array.isArray(lead.tags) && lead.tags.length ? `Tag automatik: ${lead.tags.join(', ')}` : 'Tag automatik: tiada',
          userContext.industry ? `Industri bisnes: ${userContext.industry}` : 'Industri bisnes: tiada',
          lead.notes ? `Nota dalaman: ${lead.notes}` : 'Nota dalaman: tiada',
          'Transkrip terkini (mesej terbaru di bawah):',
          transcript,
          '',
          'Pulangkan tepat dalam format ini:',
          '<SUMMARY>Ringkasan padat dalam Bahasa Melayu tentang apa yang pelanggan pedulikan dan tahap perbualan sekarang</SUMMARY>',
          '<GOAL>Objektif follow-up lalai terbaik dalam Bahasa Melayu untuk mesej seterusnya</GOAL>',
          '<TONE>polite|friendly|professional|casual|assertive|empathetic|urgent</TONE>',
          '<MODE>standard|humor|banter|direct|consultative</MODE>',
          '<EMOJI>low|medium|high</EMOJI>',
          '<FORMAT>chat|email|whatsapp</FORMAT>',
        ].join('\n')
      : [
          `Lead name: ${lead.name}`,
          `Lead status: ${lead.status}`,
          lead.stage ? `Lead stage: ${lead.stage}` : 'Lead stage: not set',
          Array.isArray(lead.tags) && lead.tags.length ? `Auto tags: ${lead.tags.join(', ')}` : 'Auto tags: none',
          userContext.industry ? `Business industry: ${userContext.industry}` : 'Business industry: not provided',
          lead.notes ? `Internal notes: ${lead.notes}` : 'Internal notes: none',
          'Recent transcript (latest at bottom):',
          transcript,
          '',
          'Return this exact format:',
          '<SUMMARY>One compact summary of what this customer cares about and where the conversation stands</SUMMARY>',
          '<GOAL>The best default follow-up objective for the next message</GOAL>',
          '<TONE>polite|friendly|professional|casual|assertive|empathetic|urgent</TONE>',
          '<MODE>standard|humor|banter|direct|consultative</MODE>',
          '<EMOJI>low|medium|high</EMOJI>',
          '<FORMAT>chat|email|whatsapp</FORMAT>',
        ].join('\n');

  try {
    const completion = await generateCompletion(systemPrompt, userPrompt);
    const raw = completion.choices[0]?.message?.content || '';
    const fallback = buildLeadMemoryFallback({
      ...lead,
      latestInboundMessage: latestInboundLog?.content || null,
    }, language);
    const summary = parseTaggedSection(raw, 'SUMMARY') || fallback.summary;
    const goal = parseTaggedSection(raw, 'GOAL') || fallback.goal;
    const tone = normalizeTonePreference(parseTaggedSection(raw, 'TONE')) || 'polite';
    const conversationMode = normalizeConversationModePreference(parseTaggedSection(raw, 'MODE')) || 'standard';
    const emojiDensity = normalizeEmojiPreferenceValue(parseTaggedSection(raw, 'EMOJI')) || 'medium';
    const outputFormat = normalizeOutputFormatValue(parseTaggedSection(raw, 'FORMAT')) || 'whatsapp';
    const updatedAt = new Date();
    const structured = normalizeStructuredMemory({
      customer_intent: summary || fallback.summary || '',
      current_status: summary || fallback.summary || '',
      key_issues: summary || fallback.summary || '',
      tone_preference: tone,
      urgency_level: 'medium',
      next_best_action: goal || fallback.goal || '',
      summary: summary || fallback.summary || '',
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        leadMemory: structured,
        memorySummary: structured.summary,
        memoryGoal: structured.next_best_action,
        aiTonePreference: tone,
        aiConversationMode: conversationMode,
        aiEmojiDensity: emojiDensity,
        aiOutputFormat: outputFormat,
        memoryLanguage: language,
        memoryUpdatedAt: updatedAt,
      },
    });

    return {
      summary: structured.summary,
      goal: structured.next_best_action,
      tone,
      conversationMode,
      emojiDensity,
      outputFormat,
      structured,
      language,
      updatedAt,
    };
  } catch (_error) {
    const fallback = buildLeadMemoryFallback({
      ...lead,
      latestInboundMessage: latestInboundLog?.content || null,
    }, language);
    const updatedAt = new Date();
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        leadMemory: toStructuredMemoryFromLegacy({
          summary: fallback.summary,
          goal: fallback.goal,
          tone: fallback.tone,
        }),
        memorySummary: fallback.summary,
        memoryGoal: fallback.goal,
        aiTonePreference: fallback.tone,
        aiConversationMode: fallback.conversationMode,
        aiEmojiDensity: fallback.emojiDensity,
        aiOutputFormat: fallback.outputFormat,
        memoryLanguage: language,
        memoryUpdatedAt: updatedAt,
      },
    });
    return { ...fallback, updatedAt };
  }
};

export const analyzeConversationToLeadMemory = async (
  userId: string,
  input: { leadId: string; conversation: string; notes?: string; language?: Language }
): Promise<LeadStructuredMemory> => {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, userId },
    select: {
      id: true,
      name: true,
      memoryLanguage: true,
    },
  });

  if (!lead) {
    throw new Error('Lead not found');
  }

  const language = input.language || (lead.memoryLanguage as Language | null) || 'en';
  const conversation = truncateForAnalysis(input.conversation, ANALYSIS_CONVERSATION_MAX_CHARS);
  const notes = input.notes ? truncateForAnalysis(input.notes, ANALYSIS_NOTES_MAX_CHARS) : '';
  const prompt = buildConversationAnalysisPrompt({
    language,
    leadName: lead.name,
    conversation,
    notes,
  });

  let memory: LeadStructuredMemory;

  if (!process.env.OPENAI_API_KEY) {
    memory = toStructuredMemoryFromLegacy({
      summary: trimSnippet(conversation, 320),
      goal: 'Send a concise follow-up asking for the next clear step',
      tone: 'polite',
    });
  } else {
    try {
      const completion = await generateCompletion(
        'You extract structured CRM memory. Output valid JSON only with exact required keys.',
        prompt,
        { maxTokens: 260 }
      );
      const raw = completion.choices[0]?.message?.content || '';
      memory = parseStructuredMemoryFromModelOutput(raw);
    } catch {
      memory = toStructuredMemoryFromLegacy({
        summary: trimSnippet(conversation, 320),
        goal: 'Send a concise follow-up asking for the next clear step',
        tone: 'polite',
      });
    }
  }

  const updatedAt = new Date();
  await prisma.lead.update({
    where: { id: input.leadId },
    data: buildLeadMemoryUpdateData(memory, language, updatedAt),
  });

  return memory;
};

const getConversationCutoffContext = async (userId: string, leadId: string, language: Language) => {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId },
    select: {
      id: true,
      name: true,
      contact: true,
      notes: true,
      status: true,
      leadMemory: true,
      memorySummary: true,
      memoryGoal: true,
      aiTonePreference: true,
      aiConversationMode: true,
      aiEmojiDensity: true,
      aiOutputFormat: true,
      memoryLanguage: true,
      memoryUpdatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
    },
  });

  if (!lead) {
    return { cutoffSummary: null, transcript: '', memory: null as LeadMemorySnapshot | null };
  }

  const memoryIsFresh =
    lead.memoryUpdatedAt && Date.now() - new Date(lead.memoryUpdatedAt).getTime() < 1000 * 60 * 60 * 24 * 3;
  const storedMemory: LeadMemorySnapshot = {
    summary: lead.memorySummary || null,
    goal: lead.memoryGoal || null,
    tone: normalizeTonePreference(lead.aiTonePreference),
    conversationMode: normalizeConversationModePreference(lead.aiConversationMode),
    emojiDensity: normalizeEmojiPreferenceValue(lead.aiEmojiDensity),
    outputFormat: normalizeOutputFormatValue(lead.aiOutputFormat),
    structured: lead.leadMemory
      ? (() => {
          try {
            return normalizeStructuredMemory(lead.leadMemory as Record<string, unknown>);
          } catch {
            return null;
          }
        })()
      : null,
    language: (lead.memoryLanguage as Language | null) || null,
    updatedAt: lead.memoryUpdatedAt || null,
  };

  const normalizedContact = normalizePhoneForAi(lead.contact);
  const candidateLogs = await prisma.whatsAppMessageLog.findMany({
    where: {
      userId,
    },
    orderBy: { createdAt: 'desc' },
    take: 120,
  });

  const logs = candidateLogs
    .filter((log) => {
      if (log.leadId === leadId) {
        return true;
      }

      if (!normalizedContact) {
        return false;
      }

      return (
        phonesLikelyMatchForAi(log.toPhone, normalizedContact) ||
        phonesLikelyMatchForAi(log.fromPhone, normalizedContact)
      );
    })
    .slice(0, 8);

  if (logs.length === 0) {
    const memory =
      storedMemory.summary && memoryIsFresh && storedMemory.language === language
        ? storedMemory
        : buildLeadMemoryFallback(lead, language);
    return {
      cutoffSummary: lead.lastOutboundAt || lead.lastInboundAt
        ? `No WhatsApp transcript stored, but lead is ${lead.status}. Last outbound: ${lead.lastOutboundAt || 'n/a'}. Last inbound: ${lead.lastInboundAt || 'n/a'}.`
        : `No prior WhatsApp transcript is stored for ${lead.name}.`,
      transcript: '',
      memory,
    };
  }

  const ordered = [...logs].reverse();
  const lastInbound = [...ordered].reverse().find((item) => item.direction === 'inbound');
  const lastOutbound = [...ordered].reverse().find((item) => item.direction === 'outbound');

  const transcript = ordered
    .map((log) => {
      const actor = log.direction === 'inbound' ? 'customer' : 'you';
      return `${log.createdAt.toISOString()} | ${actor} | ${log.status} | ${trimSnippet(log.content, 160)}`;
    })
    .join('\n');

  const cutoffSummary = [
    `Lead status: ${lead.status}.`,
    lastOutbound ? `Last outbound: ${trimSnippet(lastOutbound.content)} (${lastOutbound.createdAt.toISOString()}).` : null,
    lastInbound ? `Last inbound: ${trimSnippet(lastInbound.content)} (${lastInbound.createdAt.toISOString()}).` : null,
    lastInbound
      ? 'Use the last customer message as the cutoff point. Continue naturally from there instead of restarting the pitch.'
      : 'There is no customer reply yet. Treat the last outbound message as the cutoff point and continue naturally.',
  ]
    .filter(Boolean)
    .join(' ');

  const hasPlaceholderMemory = memoryLooksPlaceholder(storedMemory.summary, storedMemory.goal);
  const latestInboundIsNewerThanMemory =
    !!lastInbound &&
    (!storedMemory.updatedAt || new Date(lastInbound.createdAt).getTime() > new Date(storedMemory.updatedAt).getTime());

  const memory =
    storedMemory.summary &&
    memoryIsFresh &&
    storedMemory.language === language &&
    !hasPlaceholderMemory &&
    !latestInboundIsNewerThanMemory
      ? storedMemory
      : await refreshLeadMemory(userId, leadId, language);

  return { cutoffSummary, transcript, memory };
};

const detectLightCodeSwitchSignal = (text: string): boolean => {
  const hasHan = /[\u4e00-\u9fff]/u.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  const hasMalayMarkers = /\b(?:boleh|tak|lah|nanti|kejap|sekejap|ya|je|saja|confirm|balas)\b/i.test(text);
  return (hasHan && hasLatin) || (hasMalayMarkers && hasLatin);
};

const buildGreetingPolicyContextFromLogs = (
  logs: ChatLogLite[],
  nowMs: number = Date.now()
): GreetingPolicyContext => {
  const since = new Date(nowMs - 24 * 60 * 60 * 1000);
  const recentLogs = logs.filter((log) => log.createdAt >= since);
  const hasOutboundGreetingInLast24h = logs.some(
    (log) => log.createdAt >= since && log.direction === 'outbound' && startsWithGreeting(log.content || '')
  );
  const hasInboundReplyInLast24h = recentLogs.some((log) => log.direction === 'inbound');
  const hasHistory = logs.length > 0;
  const lastMessage = logs[0] || null;
  const minutesSinceLastMessage = lastMessage
    ? Math.max(0, Math.floor((nowMs - new Date(lastMessage.createdAt).getTime()) / (1000 * 60)))
    : null;
  const isLongSilence = minutesSinceLastMessage !== null && minutesSinceLastMessage >= RESTART_SILENCE_MINUTES;
  const lastInbound = logs.find((log) => log.direction === 'inbound') || null;
  const lastOutbound = logs.find((log) => log.direction === 'outbound') || null;

  let turnType: TurnType = 'ongoing_reply';
  if (!hasHistory) {
    turnType = 'first_turn';
  } else if (isLongSilence) {
    turnType = 'conversation_restart';
  } else if (lastMessage?.direction === 'inbound') {
    turnType = 'follow_up';
  } else {
    turnType = 'ongoing_reply';
  }

  const allowGreeting = turnType === 'first_turn' || turnType === 'conversation_restart';
  const lastInboundSnippet = lastInbound?.content ? trimSnippet(lastInbound.content, 120) : null;
  const lastOutboundSnippet = lastOutbound?.content ? trimSnippet(lastOutbound.content, 120) : null;
  const activeTopicAnchor = lastInboundSnippet || lastOutboundSnippet || null;
  const recentTranscript = logs
    .slice(0, 12)
    .map((log) => log.content || '')
    .filter(Boolean)
    .join('\n');
  const supportsLightCodeSwitch = detectLightCodeSwitchSignal(recentTranscript);

  return {
    hasOutboundGreetingInLast24h,
    hasInboundReplyInLast24h,
    hasHistory,
    allowGreeting,
    turnType,
    minutesSinceLastMessage,
    lastInboundSnippet,
    lastOutboundSnippet,
    activeTopicAnchor,
    supportsLightCodeSwitch,
  };
};

const getGreetingPolicyContext = async (userId: string, leadId: string): Promise<GreetingPolicyContext> => {
  const nowMs = Date.now();
  const logs = await prisma.whatsAppMessageLog.findMany({
    where: {
      userId,
      leadId,
      direction: { in: ['inbound', 'outbound'] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      direction: true,
      content: true,
      createdAt: true,
    },
    take: 80,
  });
  return buildGreetingPolicyContextFromLogs(
    logs.map((log) => ({
      direction: log.direction as 'inbound' | 'outbound',
      content: log.content,
      createdAt: log.createdAt,
    })),
    nowMs
  );
};

const buildVariantPrompt = (
  basePrompt: string,
  cutoffSummary: string | null,
  transcript: string,
  memory: LeadMemorySnapshot | null,
  language: Language,
  purpose: 'follow_up' | 'payment',
  variantCount: number
) => {
  const formatHint =
    language === 'zh-CN'
      ? `请返回以下标签格式，不要加代码块：\n<CUTOFF>一句话总结当前对话进度</CUTOFF>\n<VARIANT_1>...</VARIANT_1>\n<VARIANT_2>...</VARIANT_2>\n<VARIANT_3>...</VARIANT_3>`
      : language === 'ms'
        ? `Pulangkan dalam format tag ini sahaja tanpa code block:\n<CUTOFF>Ringkasan ringkas tahap perbualan sekarang</CUTOFF>\n<VARIANT_1>...</VARIANT_1>\n<VARIANT_2>...</VARIANT_2>\n<VARIANT_3>...</VARIANT_3>`
        : `Return only this tagged format without code fences:\n<CUTOFF>One short summary of where the conversation currently stands</CUTOFF>\n<VARIANT_1>...</VARIANT_1>\n<VARIANT_2>...</VARIANT_2>\n<VARIANT_3>...</VARIANT_3>`;

  const diversityHint =
    language === 'zh-CN'
      ? `请给 ${variantCount} 个不同版本：第 1 个最稳妥，第 2 个更温和，第 3 个更直接。都必须可直接发送。`
      : language === 'ms'
        ? `Berikan ${variantCount} versi berbeza: versi 1 paling selamat, versi 2 lebih mesra, versi 3 lebih terus. Semua mesti terus boleh dihantar.`
        : `Give ${variantCount} distinct variants: variant 1 safest, variant 2 warmer, variant 3 more direct. All must be sendable as-is.`;

  const memoryBlock = memory?.summary
    ? `\n\nLead memory point:\n- Summary: ${memory.structured?.summary || memory.summary}\n- Suggested default objective: ${memory.structured?.next_best_action || memory.goal || 'n/a'}\n- Customer intent: ${memory.structured?.customer_intent || 'n/a'}\n- Key issues: ${memory.structured?.key_issues || 'n/a'}\n- Urgency: ${memory.structured?.urgency_level || 'medium'}\n- Preferred tone: ${memory.structured?.tone_preference || memory.tone || 'n/a'}\n- Preferred mode: ${memory.conversationMode || 'n/a'}\n- Preferred emoji density: ${memory.emojiDensity || 'n/a'}\n- Preferred output format: ${memory.outputFormat || 'n/a'}`
    : '';

  const contextBlock = cutoffSummary
    ? `${memoryBlock}\n\nConversation cutoff memory:\n${cutoffSummary}${transcript ? `\n\nRecent WhatsApp transcript (latest at bottom):\n${transcript}` : ''}`
    : memoryBlock;

  const purposeHint =
    purpose === 'payment'
      ? language === 'zh-CN'
        ? '重点保持付款确认为第一优先。'
        : language === 'ms'
          ? 'Utamakan pengesahan masa pembayaran.'
          : 'Keep payment timing as the first priority.'
      : language === 'zh-CN'
        ? '重点自然承接上一次对话，而不是重新开一个新话题。'
        : language === 'ms'
          ? 'Sambung secara natural daripada perbualan terakhir, jangan mula semula dari kosong.'
          : 'Continue naturally from the last conversation instead of restarting from zero.';

  return `${basePrompt}${contextBlock}\n\n${diversityHint}\n${purposeHint}\n${formatHint}`;
};

const extractVariantBundle = (
  rawText: string,
  language: Language,
  outputFormat: OutputFormat
): { cutoffSummary: string | null; variants: string[] } => {
  const cutoffSummary = parseTaggedSection(rawText, 'CUTOFF') || null;
  const variants = [1, 2, 3]
    .map((index) => parseTaggedSection(rawText, `VARIANT_${index}`))
    .filter(Boolean)
    .map((text) => ensureEmojiRange(enforceOutputFormatConsistency(cleanGeneratedMessage(text), outputFormat), outputFormat, detectEmojiPreference(text)));

  if (variants.length > 0) {
    return { cutoffSummary, variants };
  }

  const cleaned = ensureEmojiRange(
    enforceOutputFormatConsistency(cleanGeneratedMessage(rawText), outputFormat),
    outputFormat,
    detectEmojiPreference(rawText)
  );

  return {
    cutoffSummary,
    variants: cleaned ? [cleaned] : [],
  };
};

export const generateFollowUpText = async (
  userId: string,
  leadId: string,
  data: FollowUpData
): Promise<AiGenerationBundle> => {
  const userContext = await getUserAiContext(userId);
  const goal = (data.goal || data.objective || '').trim();
  const additionalContext = (data.context || '').trim();
  const daysPassed = data.daysPassed || 0;
  const language = data.language || 'en';
  const memorySnapshot = userContext.memoryEnabled ? await getLeadMemorySnapshot(userId, leadId) : null;
  const style: AiStyle =
    normalizeStyleValue(data.style) ||
    normalizeConversationModePreference(data.conversationMode) ||
    memorySnapshot?.conversationMode ||
    userContext.defaultConversationMode ||
    'standard';
  const selectedPreset: FollowUpStylePreset = presetsEnabled
    ? data.stylePreset || mapStyleToFollowUpPreset(style)
    : mapStyleToFollowUpPreset(style);
  const quickActionIntentConfig = getQuickActionIntentConfig(data.quickActionIntent);
  const tone =
    normalizeTonePreference(data.tone) ||
    quickActionIntentConfig?.defaultToneBias ||
    mapStyleToTonePreference(style) ||
    memorySnapshot?.tone ||
    userContext.defaultTone ||
    'polite';
  const conversationMode: ConversationMode =
    style;
  const emojiPreference =
    normalizeEmojiPreferenceValue(data.emojiIntensity) ||
    normalizeEmojiPreferenceValue(data.emojiDensity) ||
    memorySnapshot?.emojiDensity ||
    userContext.defaultEmojiDensity ||
    detectEmojiPreference(goal);
  const outputFormat =
    normalizeOutputFormatValue(data.channel) ||
    normalizeOutputFormatValue(data.outputFormat) ||
    memorySnapshot?.outputFormat ||
    userContext.defaultOutputFormat ||
    'chat';
  const greetingPolicy = await getGreetingPolicyContext(userId, leadId);
  const latestCustomerMessage = (data.latestCustomerMessage || greetingPolicy.lastInboundSnippet || '').trim();
  const conversationStage = inferConversationStage({
    provided: data.conversationStage,
    purpose: 'follow_up',
    daysSinceLastContact: daysPassed,
    latestCustomerMessage,
    hasInboundReplyInLast24h: greetingPolicy.hasInboundReplyInLast24h,
    hasHistory: greetingPolicy.hasHistory,
  });
  const businessFacts = normalizeFactsInput(data.businessFacts, 12);
  const unknownFacts = normalizeFactsInput(data.unknownFacts, 12);
  const systemPrompt = buildWhatsappHumanSystemPrompt(emojiPreference, language);
  const memoryCompact = memorySnapshot?.structured
    ? [
        `Summary: ${trimSnippet(memorySnapshot.structured.summary, 120)}`,
        `Intent: ${trimSnippet(memorySnapshot.structured.customer_intent, 80)}`,
        `Issues: ${trimSnippet(memorySnapshot.structured.key_issues, 100)}`,
        `Urgency: ${memorySnapshot.structured.urgency_level}`,
        `Next action: ${trimSnippet(memorySnapshot.structured.next_best_action, 100)}`,
      ].join(' | ')
    : memorySnapshot?.summary
      ? trimSnippet(memorySnapshot.summary, 220)
      : '';
  const mergedContext = [additionalContext, memoryCompact ? `Lead memory: ${memoryCompact}` : '']
    .filter(Boolean)
    .join('\n');
  const userPrompt = buildPrompt({
    purpose: 'follow_up',
    language,
    leadName: data.leadName,
    goal,
    context: mergedContext,
    channel: outputFormat,
    daysPassed,
    style,
    emojiIntensity: emojiPreference,
    quickActionIntent: data.quickActionIntent,
    intentType: data.intentType,
    conversationStage,
    latestCustomerMessage,
    businessFacts,
    unknownFacts,
  });

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const promptDebugId = `follow_up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(
      '[AI_PROMPT_DEBUG]',
      JSON.stringify(
        buildPromptDebugPayload({
          id: promptDebugId,
          purpose: 'follow_up',
          mode: 'initial',
          normalizedConfig: {
            goal,
            context: additionalContext,
            channel: outputFormat,
            style,
            daysPassed,
            emojiIntensity: emojiPreference,
            language,
            tone,
            conversationMode,
            quickActionIntent: data.quickActionIntent || null,
            conversationStage,
            latestCustomerMessage,
            businessFacts,
            unknownFacts,
          },
          emojiRule: getEmojiRuleText(emojiPreference, language),
          responseTokenBudget: 120,
          system: systemPrompt,
          user: userPrompt,
        }),
        null,
        2
      )
    );

    const completion = await generateCompletion(systemPrompt, userPrompt, { maxTokens: 120 });
    let generatedText = cleanGeneratedMessage(completion.choices[0]?.message?.content || '');
    generatedText = await enforceLanguageLock(systemPrompt, generatedText, language);
    generatedText = sanitizePolicyBannedPhrases(generatedText, language);
    generatedText = enforceOutputFormatConsistency(generatedText, outputFormat);
    generatedText = ensureEmojiRange(generatedText, outputFormat, emojiPreference);
    generatedText = enforceGreetingPolicy(generatedText, greetingPolicy);
    generatedText = applyConversationalGuardrails(generatedText, language, outputFormat, greetingPolicy, goal);

    if (!generatedText.trim()) {
      throw new Error('OpenAI API returned empty response');
    }

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'follow_up',
        stylePreset: selectedPreset,
        content: generatedText,
      },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        aiTonePreference: tone,
        aiConversationMode: conversationMode,
        aiEmojiDensity: emojiPreference,
        aiOutputFormat: outputFormat,
        ...(userContext.memoryEnabled
          ? {
              ...(memorySnapshot?.structured
                ? {
                    leadMemory: {
                      ...memorySnapshot.structured,
                      next_best_action: trimSnippet(goal, 240),
                    },
                  }
                : {}),
              memoryGoal: goal,
              memorySummary: memorySnapshot?.summary || null,
              memoryLanguage: language,
              memoryUpdatedAt: new Date(),
            }
          : {}),
      },
    });

    return {
      text: generatedText,
      variants: [generatedText],
      cutoffSummary: null,
      memorySummary: userContext.memoryEnabled ? memorySnapshot?.summary || null : null,
      memoryGoal: userContext.memoryEnabled ? goal : null,
    };
  } catch (error: any) {
    const errorKind = classifyAiError(error);
    console.error(`[AI] Follow-up generation failed (${errorKind})`, error?.message || error);

    const objectiveItems = splitObjectives(goal);
    const objectiveSummary = objectiveItems.length > 1 ? objectiveItems.map((item, idx) => `${idx + 1}) ${item}`).join('\n') : goal;
    const isChinese = language === 'zh-CN';
    const isMalay = language === 'ms';
    const baseFallbackText = isMalay
      ? `Hai ${data.leadName},\n\nSaya nak follow-up ringkas tentang perkara berikut:\n${objectiveSummary}\n${daysPassed > 0 ? `\nSudah ${daysPassed} hari sejak mesej terakhir.` : ''}\n\nBoleh kongsi anggaran masa untuk setiap perkara di atas?`
      : isChinese
        ? `你好 ${data.leadName}，\n\n我这边简短跟进以下事项：\n${objectiveSummary}\n${daysPassed > 0 ? `\n距离上次沟通已 ${daysPassed} 天。` : ''}\n\n方便的话，请按以上事项回复大概时间。`
        : createFollowUpFallback({ ...data, objective: goal }, daysPassed, isChinese, selectedPreset).replace(goal, objectiveSummary);
    const fallbackBase = enforceGreetingPolicy(formatFallbackMessage(
      baseFallbackText,
      outputFormat,
      language,
      data.leadName,
      isChinese ? '跟进确认' : isMalay ? 'Susulan Ringkas' : 'Quick Follow-up'
    ), greetingPolicy);
    let fallbackText = sanitizePolicyBannedPhrases(fallbackBase, language);
    fallbackText = ensureEmojiRange(fallbackText, outputFormat, emojiPreference);
    fallbackText = applyConversationalGuardrails(fallbackText, language, outputFormat, greetingPolicy, goal);

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'follow_up',
        stylePreset: selectedPreset,
        content: fallbackText,
      },
    });

    return {
      text: fallbackText,
      variants: [fallbackText],
      cutoffSummary: null,
      memorySummary: userContext.memoryEnabled ? memorySnapshot?.summary || null : null,
      memoryGoal: userContext.memoryEnabled ? goal : null,
    };
  }
};

export const generatePaymentText = async (
  userId: string,
  leadId: string,
  data: PaymentData
): Promise<AiGenerationBundle> => {
  const userContext = await getUserAiContext(userId);
  const goal = (data.goal || data.objective || '').trim();
  const additionalContext = (data.context || '').trim();
  const amount = data.amount;
  const dueDate = data.dueDate;
  const language = data.language || 'en';
  const memorySnapshot = userContext.memoryEnabled ? await getLeadMemorySnapshot(userId, leadId) : null;
  const style: AiStyle =
    normalizeStyleValue(data.style) ||
    normalizeConversationModePreference(data.conversationMode) ||
    memorySnapshot?.conversationMode ||
    userContext.defaultConversationMode ||
    'standard';
  const selectedPreset: PaymentStylePreset = presetsEnabled
    ? data.stylePreset || mapStyleToPaymentPreset(style)
    : mapStyleToPaymentPreset(style);
  const quickActionIntentConfig = getQuickActionIntentConfig(data.quickActionIntent);
  const tone =
    normalizeTonePreference(data.tone) ||
    quickActionIntentConfig?.defaultToneBias ||
    mapStyleToTonePreference(style) ||
    memorySnapshot?.tone ||
    userContext.defaultTone ||
    'polite';
  const conversationMode: ConversationMode =
    style;
  const emojiPreference =
    normalizeEmojiPreferenceValue(data.emojiIntensity) ||
    normalizeEmojiPreferenceValue(data.emojiDensity) ||
    memorySnapshot?.emojiDensity ||
    userContext.defaultEmojiDensity ||
    detectEmojiPreference(goal);
  const outputFormat =
    normalizeOutputFormatValue(data.channel) ||
    normalizeOutputFormatValue(data.outputFormat) ||
    memorySnapshot?.outputFormat ||
    userContext.defaultOutputFormat ||
    'chat';
  const greetingPolicy = await getGreetingPolicyContext(userId, leadId);

  let daysOverdue = 0;
  if (dueDate) {
    const due = new Date(dueDate);
    const now = new Date();
    daysOverdue = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const latestCustomerMessage = (data.latestCustomerMessage || greetingPolicy.lastInboundSnippet || '').trim();
  const conversationStage = inferConversationStage({
    provided: data.conversationStage,
    purpose: 'payment',
    daysSinceLastContact: daysOverdue,
    latestCustomerMessage,
    hasInboundReplyInLast24h: greetingPolicy.hasInboundReplyInLast24h,
    hasHistory: greetingPolicy.hasHistory,
  });
  const businessFacts = normalizeFactsInput(data.businessFacts, 12);
  const unknownFacts = normalizeFactsInput(data.unknownFacts, 12);

  const systemPrompt = buildWhatsappHumanSystemPrompt(emojiPreference, language);
  const memoryCompact = memorySnapshot?.structured
    ? [
        `Summary: ${trimSnippet(memorySnapshot.structured.summary, 120)}`,
        `Intent: ${trimSnippet(memorySnapshot.structured.customer_intent, 80)}`,
        `Issues: ${trimSnippet(memorySnapshot.structured.key_issues, 100)}`,
        `Urgency: ${memorySnapshot.structured.urgency_level}`,
        `Next action: ${trimSnippet(memorySnapshot.structured.next_best_action, 100)}`,
      ].join(' | ')
    : memorySnapshot?.summary
      ? trimSnippet(memorySnapshot.summary, 220)
      : '';
  const mergedContext = [additionalContext, memoryCompact ? `Lead memory: ${memoryCompact}` : '']
    .filter(Boolean)
    .join('\n');
  const userPrompt = buildPrompt({
    purpose: 'payment',
    language,
    leadName: data.leadName,
    goal,
    context: mergedContext,
    channel: outputFormat,
    daysPassed: daysOverdue,
    style,
    emojiIntensity: emojiPreference,
    quickActionIntent: data.quickActionIntent,
    intentType: data.intentType,
    conversationStage,
    latestCustomerMessage,
    businessFacts,
    unknownFacts,
  });
  const paymentMeta = [
    amount ? `- Payment amount: ${amount.toFixed(2)}` : null,
    `- Days overdue: ${daysOverdue}`,
  ].filter(Boolean).join('\n');
  const finalUserPrompt = `${userPrompt}\n${paymentMeta ? `\n${paymentMeta}` : ''}`;

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const promptDebugId = `payment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(
      '[AI_PROMPT_DEBUG]',
      JSON.stringify(
        buildPromptDebugPayload({
          id: promptDebugId,
          purpose: 'payment',
          mode: 'initial',
          normalizedConfig: {
            goal,
            context: additionalContext,
            channel: outputFormat,
            style,
            daysPassed: daysOverdue,
            emojiIntensity: emojiPreference,
            language,
            tone,
            conversationMode,
            amount: amount || null,
            quickActionIntent: data.quickActionIntent || null,
            conversationStage,
            latestCustomerMessage,
            businessFacts,
            unknownFacts,
          },
          emojiRule: getEmojiRuleText(emojiPreference, language),
          responseTokenBudget: 120,
          system: systemPrompt,
          user: finalUserPrompt,
        }),
        null,
        2
      )
    );

    const completion = await generateCompletion(systemPrompt, finalUserPrompt, { maxTokens: 120 });
    let generatedText = cleanGeneratedMessage(completion.choices[0]?.message?.content || '');
    generatedText = await enforceLanguageLock(systemPrompt, generatedText, language);
    generatedText = sanitizePolicyBannedPhrases(generatedText, language);
    generatedText = enforceOutputFormatConsistency(generatedText, outputFormat);
    generatedText = ensureEmojiRange(generatedText, outputFormat, emojiPreference);
    generatedText = enforceGreetingPolicy(generatedText, greetingPolicy);
    generatedText = applyConversationalGuardrails(generatedText, language, outputFormat, greetingPolicy, goal);

    if (!generatedText.trim()) {
      throw new Error('OpenAI API returned empty response');
    }

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'payment',
        stylePreset: selectedPreset,
        content: generatedText,
      },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        aiTonePreference: tone,
        aiConversationMode: conversationMode,
        aiEmojiDensity: emojiPreference,
        aiOutputFormat: outputFormat,
        ...(userContext.memoryEnabled
          ? {
              ...(memorySnapshot?.structured
                ? {
                    leadMemory: {
                      ...memorySnapshot.structured,
                      next_best_action: trimSnippet(goal, 240),
                    },
                  }
                : {}),
              memoryGoal: goal,
              memorySummary: memorySnapshot?.summary || null,
              memoryLanguage: language,
              memoryUpdatedAt: new Date(),
            }
          : {}),
      },
    });

    return {
      text: generatedText,
      variants: [generatedText],
      cutoffSummary: null,
      memorySummary: userContext.memoryEnabled ? memorySnapshot?.summary || null : null,
      memoryGoal: userContext.memoryEnabled ? goal : null,
    };
  } catch (error: any) {
    const errorKind = classifyAiError(error);
    console.error(`[AI] Payment generation failed (${errorKind})`, error?.message || error);

    const objectiveItems = splitObjectives(goal);
    const objectiveSummary = objectiveItems.length > 1
      ? objectiveItems.map((item, idx) => `${idx + 1}) ${item}`).join('\n')
      : goal;
    const isChinese = language === 'zh-CN';
    const isMalay = language === 'ms';
    const baseFallbackText = isMalay
      ? `Hai ${data.leadName},\n\nPeringatan mesra untuk perkara berikut:\n${objectiveSummary}${amount ? `\nJumlah bayaran semasa: ${amount.toFixed(2)}.` : ''}\n\nBoleh kongsi anggaran tarikh untuk tindakan di atas, terutamanya bayaran?`
      : isChinese
        ? `你好 ${data.leadName}，\n\n这边提醒以下事项：\n${objectiveSummary}${amount ? `\n当前金额：${amount.toFixed(2)}。` : ''}\n\n方便的话，请优先确认付款时间，并告知其余事项安排。`
        : createPaymentFallback({ ...data, objective: goal }, isChinese, selectedPreset, daysOverdue).replace(goal, objectiveSummary);
    const fallbackBase = enforceGreetingPolicy(formatFallbackMessage(
      baseFallbackText,
      outputFormat,
      language,
      data.leadName,
      isChinese ? '付款提醒' : isMalay ? 'Peringatan Bayaran' : 'Payment Reminder'
    ), greetingPolicy);
    let fallbackText = sanitizePolicyBannedPhrases(fallbackBase, language);
    fallbackText = ensureEmojiRange(fallbackText, outputFormat, emojiPreference);
    fallbackText = applyConversationalGuardrails(fallbackText, language, outputFormat, greetingPolicy, goal);

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'payment',
        stylePreset: selectedPreset,
        content: fallbackText,
      },
    });

    return {
      text: fallbackText,
      variants: [fallbackText],
      cutoffSummary: null,
      memorySummary: userContext.memoryEnabled ? memorySnapshot?.summary || null : null,
      memoryGoal: userContext.memoryEnabled ? goal : null,
    };
  }
};

export const generateRefinedText = async (
  userId: string,
  leadId: string,
  data: RefineData
): Promise<AiGenerationBundle> => {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId },
    select: { id: true },
  });
  if (!lead) {
    throw new Error('Lead not found');
  }

  const language = data.language || 'en';
  const style: AiStyle = normalizeStyleValue(data.style) || 'standard';
  const channel: OutputFormat = normalizeOutputFormatValue(data.channel) || 'chat';
  const emojiIntensity = normalizeEmojiPreferenceValue(data.emojiIntensity) || 'medium';
  const purpose = data.purpose || 'follow_up';
  const systemPrompt = buildWhatsappHumanSystemPrompt(emojiIntensity, language);
  const userPrompt = buildRefinePrompt({
    language,
    purpose,
    originalText: data.originalText,
    instruction: data.instruction,
    style,
    channel,
    emojiIntensity,
    quickActionIntent: data.quickActionIntent,
  });

  const promptDebugId = `refine_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(
    '[AI_PROMPT_DEBUG]',
    JSON.stringify(
      buildPromptDebugPayload({
        id: promptDebugId,
        purpose,
        mode: 'refine',
        normalizedConfig: {
          leadId,
          style,
          channel,
          emojiIntensity,
          language,
          instruction: data.instruction,
          quickActionIntent: data.quickActionIntent || null,
        },
        emojiRule: getEmojiRuleText(emojiIntensity, language),
        responseTokenBudget: 120,
        system: systemPrompt,
        user: userPrompt,
      }),
      null,
      2
    )
  );

  const completion = await generateCompletion(systemPrompt, userPrompt, { maxTokens: 120 });
  let refinedText = cleanGeneratedMessage(completion.choices[0]?.message?.content || '');
  refinedText = await enforceLanguageLock(systemPrompt, refinedText, language);
  refinedText = sanitizePolicyBannedPhrases(refinedText, language);
  refinedText = enforceOutputFormatConsistency(refinedText, channel);
  refinedText = ensureEmojiRange(refinedText, channel, emojiIntensity);

  if (!refinedText.trim()) {
    refinedText = ensureEmojiRange(data.originalText.trim(), channel, emojiIntensity);
  }

  return {
    text: refinedText,
    variants: [refinedText],
    cutoffSummary: null,
    memorySummary: null,
    memoryGoal: null,
  };
};

export const getAiHistory = async (
  userId: string,
  options: { limit?: number; purpose?: 'follow_up' | 'payment' | 'all' }
) => {
  const limit = Math.min(Math.max(options.limit || 20, 1), 100);
  const purpose = options.purpose || 'all';

  return prisma.aiLog.findMany({
    where: {
      userId,
      ...(purpose !== 'all' ? { purpose } : {}),
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
};

export const __test__ = {
  RESTART_SILENCE_MINUTES,
  startsWithGreeting,
  enforceGreetingPolicy,
  applyConversationalGuardrails,
  detectLightCodeSwitchSignal,
  buildGreetingPolicyContextFromLogs,
  getTurnPolicyInstruction,
  buildPrompt,
  buildConversationAnalysisPrompt,
  parseStructuredMemoryFromModelOutput,
  buildLeadMemoryUpdateData,
};
