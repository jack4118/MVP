import OpenAI from 'openai';
import prisma from '../config/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Language = 'en' | 'zh-CN' | 'ms';
type OutputFormat = 'chat' | 'email' | 'whatsapp';

type FollowUpTone = 'polite' | 'friendly' | 'professional' | 'casual';
type PaymentTone = 'polite' | 'friendly' | 'professional' | 'casual';

type FollowUpStylePreset = 'gentle_nudge' | 'value_reminder' | 'meeting_request';
type PaymentStylePreset = 'friendly_reminder' | 'due_today' | 'overdue_escalation';

export interface FollowUpData {
  leadName: string;
  objective: string;
  status?: string;
  daysPassed?: number;
  tone?: FollowUpTone;
  stylePreset?: FollowUpStylePreset;
  outputFormat?: OutputFormat;
  language?: Language;
}

export interface PaymentData {
  leadName: string;
  objective: string;
  amount?: number;
  dueDate?: string;
  tone?: PaymentTone;
  stylePreset?: PaymentStylePreset;
  outputFormat?: OutputFormat;
  language?: Language;
}

type AiErrorKind = 'quota' | 'auth' | 'timeout' | 'unknown';
type EmojiPreference = 'low' | 'medium' | 'high';

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

const getObjectiveCoverageRatio = (message: string, objectiveItems: string[]): number => {
  if (objectiveItems.length === 0) {
    return 1;
  }

  const normalizedMessage = normalize(message);
  let matched = 0;

  for (const item of objectiveItems) {
    const normalizedItem = normalize(item);
    const itemTokens = normalizedItem
      .split(/[^a-z0-9\u4e00-\u9fff]+/i)
      .filter((token) => token.length >= 3);

    const directMatch = normalizedMessage.includes(normalizedItem);
    const tokenMatch = itemTokens.some((token) => normalizedMessage.includes(token));
    if (directMatch || tokenMatch) {
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
  if (tone === 'professional') {
    return 'professional';
  }
  if (tone === 'casual') {
    return 'firm';
  }
  return 'soft';
};

const mapPaymentTone = (tone: PaymentTone): 'professional' | 'firm' => {
  if (tone === 'casual' || tone === 'friendly') {
    return 'firm';
  }
  return 'professional';
};

const createFollowUpFallback = (data: FollowUpData, daysPassed: number, isChinese: boolean, preset: FollowUpStylePreset): string => {
  if (isChinese) {
    if (preset === 'value_reminder') {
      return `你好 ${data.leadName}，\n\n想简短跟进一下。上次我们讨论的方案主要是为了帮你更稳定地推进当前目标（${data.objective}）。\n\n如果你愿意，我可以按你的节奏继续配合。你这周看什么时候方便回复我一句？`;
    }

    if (preset === 'meeting_request') {
      return `你好 ${data.leadName}，\n\n希望你近况顺利。${daysPassed > 0 ? `距离上次沟通已经 ${daysPassed} 天，` : ''}我想确认一下你这边关于“${data.objective}”的进展。\n\n如果方便，我们可以约一个 10 分钟的简短沟通，你看这两天哪个时间合适？`;
    }

    return `你好 ${data.leadName}，\n\n希望你一切顺利。${daysPassed > 0 ? `距离上次沟通已经 ${daysPassed} 天，` : ''}我来轻轻跟进一下，看你这边关于“${data.objective}”是否需要我补充任何信息。\n\n你方便时回复我一句就好。`;
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
  data: PaymentData,
  isChinese: boolean,
  preset: PaymentStylePreset,
  daysOverdue: number
): string => {
  const amountText = data.amount ? (isChinese ? `${data.amount.toFixed(2)} 元` : `$${data.amount.toFixed(2)}`) : null;

  if (isChinese) {
    if (preset === 'due_today') {
      return `你好 ${data.leadName}，\n\n温馨提醒，${amountText ? `${amountText} 的` : ''}款项今天到期。\n\n若你已安排付款请忽略；如方便，也请回复我确认一下时间。谢谢。`;
    }

    if (preset === 'overdue_escalation') {
      return `你好 ${data.leadName}，\n\n关于${amountText ? amountText : '该笔'}款项（${data.objective}），当前已逾期 ${daysOverdue} 天。\n\n麻烦你确认一下预计付款日期，以便我这边安排后续记录。感谢配合。`;
    }

    return `你好 ${data.leadName}，\n\n友好提醒一下，${amountText ? `${amountText} 的` : ''}款项目前仍待处理（${data.objective}）。\n\n如你已完成付款请忽略这条信息；若尚未处理，方便的话请告知预计时间。`;
  }

  if (preset === 'due_today') {
    return `Hi ${data.leadName},\n\nFriendly reminder that ${amountText ? `${amountText} ` : ''}payment is due today.\n\nIf you have already sent it, please ignore this message. If not, could you share a quick confirmation when processed?`;
  }

  if (preset === 'overdue_escalation') {
    return `Hi ${data.leadName},\n\nA quick note that ${amountText ? `${amountText} ` : ''}payment is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.\n\nCould you confirm the exact payment date so I can update our records?`;
  }

  return `Hi ${data.leadName},\n\nFriendly reminder regarding ${amountText ? `${amountText} ` : 'the pending '}payment for the completed work on ${data.objective}.\n\nIf already paid, please disregard this note. If still pending, could you share an estimated payment date?`;
};

const generateCompletion = async (systemPrompt: string, userPrompt: string) => {
  return openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 350,
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
  outputFormat: OutputFormat,
  language: Language,
  emojiPreference: EmojiPreference
): string => {
  if (outputFormat !== 'whatsapp') {
    return language === 'zh-CN'
      ? 'emoji 使用：最多 1 个，非必要可不使用。'
      : language === 'ms'
        ? 'Penggunaan emoji: maksimum 1, pilihan sahaja.'
      : 'Emoji usage: max 1, optional.';
  }

  if (emojiPreference === 'high') {
    return language === 'zh-CN'
      ? 'emoji 使用：自然地使用 3-6 个（分散在各段），不要连续堆叠同一个 emoji。'
      : language === 'ms'
        ? 'Penggunaan emoji: guna 3-6 secara semula jadi, jangan bertindih berlebihan.'
      : 'Emoji usage: naturally use 3-6 emojis across lines, no repetitive stacking.';
  }

  return language === 'zh-CN'
    ? 'emoji 使用：自然地使用 1-3 个，增强亲和感但不过度。'
    : language === 'ms'
      ? 'Penggunaan emoji: 1-3 secara semula jadi, mesra tetapi tidak berlebihan.'
    : 'Emoji usage: naturally use 1-3 emojis for warmth, not excessive.';
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
      common.push('4) 第一行建议简短称呼，第二行直接说明请求，末尾给出易回复问题');
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
      common.push('4) Baris pertama sapaan ringkas, baris kedua permintaan jelas, akhir dengan soalan mudah jawab');
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
    common.push('4) Line 1 short greeting, line 2 concrete ask, end with an easy reply question');
  }
  return common.join('\n');
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

export const generateFollowUpText = async (
  userId: string,
  leadId: string,
  data: FollowUpData
): Promise<string> => {
  const tone = data.tone || 'polite';
  const daysPassed = data.daysPassed || 0;
  const language = data.language || 'en';
  const outputFormat = data.outputFormat || 'chat';
  const mappedTone = mapFollowUpTone(tone);
  const isChinese = language === 'zh-CN';
  const isMalay = language === 'ms';
  const selectedPreset: FollowUpStylePreset = presetsEnabled ? data.stylePreset || 'gentle_nudge' : 'gentle_nudge';
  const objectiveItems = splitObjectives(data.objective);

  const systemPrompt = getAdvisorPersona(language);

  const userPrompt = isChinese
    ? `用中文写一封跟进消息。\n\n上下文：\n- 客户姓名：${data.leadName}\n- 目标：${data.objective}\n- 距离上次回复天数：${daysPassed}\n- 语气：${mappedTone === 'soft' ? '温和' : mappedTone === 'professional' ? '专业' : '坚定'}\n- 模板风格：${selectedPreset}\n\n风格要求：\n${getFollowUpPresetFragment(selectedPreset, true)}\n\n规则：\n- 简短自然\n- 不要施压\n- 结尾用简单问题\n- 必须使用客户姓名` 
    : isMalay
      ? `Tulis mesej follow-up dalam Bahasa Melayu.\n\nKonteks:\n- Nama pelanggan: ${data.leadName}\n- Objektif: ${data.objective}\n- Hari sejak respons terakhir: ${daysPassed}\n- Nada: ${mappedTone}\n- Gaya template: ${selectedPreset}\n\nPeraturan:\n- Ringkas dan natural\n- Tiada tekanan\n- Akhiri dengan soalan mudah dibalas\n- Wajib sebut nama pelanggan`
      : `Write a follow-up message in English.\n\nContext:\n- Customer Name: ${data.leadName}\n- Objective: ${data.objective}\n- Days since last reply: ${daysPassed}\n- Tone: ${mappedTone}\n- Style preset: ${selectedPreset}\n\nStyle requirement:\n${getFollowUpPresetFragment(selectedPreset, false)}\n\nRules:\n- Keep it short and natural\n- No pressure\n- End with an easy question\n- Must use the customer name`;
  const formatInstruction = getFormatInstruction(outputFormat, language);
  const emojiPreference = detectEmojiPreference(data.objective);
  const emojiInstruction = getEmojiInstruction(outputFormat, language, emojiPreference);
  const objectiveDirective = getObjectiveDirective(data.objective, language, objectiveItems, 'follow_up');
  const hardConstraints = getHardConstraints(language, outputFormat);
  const humanStyleBlock =
    isChinese && outputFormat === 'whatsapp'
      ? `\n\n${getChineseWhatsappHumanStyle('follow_up')}`
      : isMalay && outputFormat === 'whatsapp'
        ? `\n\n${getMalayWhatsappHumanStyle('follow_up')}`
        : '';
  const priorityInstruction = isChinese
    ? '如果 objective 与模板风格冲突，优先满足 objective。'
    : isMalay
      ? 'Jika objektif bercanggah dengan gaya template, utamakan objektif.'
      : 'If objective conflicts with style preset, prioritize objective.';
  const promptWithFormat = `${userPrompt}\n\n${objectiveDirective}\n\n- Output format: ${outputFormat}\n- Formatting rule: ${formatInstruction}\n- ${emojiInstruction}\n\n${hardConstraints}${humanStyleBlock}\n\n${priorityInstruction}`;

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const completion = await generateCompletion(systemPrompt, promptWithFormat);
    let generatedText = cleanGeneratedMessage(completion.choices[0]?.message?.content || '');

    if (objectiveItems.length > 1 && getObjectiveCoverageRatio(generatedText, objectiveItems) < 0.75) {
      const strictPrompt = `${promptWithFormat}\n\nRewrite now: ensure all objective items are explicitly covered. Keep it concise and natural.`;
      const retryCompletion = await generateCompletion(systemPrompt, strictPrompt);
      const retriedText = cleanGeneratedMessage(retryCompletion.choices[0]?.message?.content || '');
      if (retriedText.trim()) {
        generatedText = retriedText;
      }
    }

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

    return generatedText;
  } catch (error: any) {
    const errorKind = classifyAiError(error);
    console.error(`[AI] Follow-up generation failed (${errorKind})`, error?.message || error);

    const objectiveSummary = objectiveItems.length > 1
      ? objectiveItems.map((item, idx) => `${idx + 1}) ${item}`).join('\n')
      : data.objective;
    const baseFallbackText = isMalay
      ? `Hai ${data.leadName},\n\nSaya nak follow-up ringkas tentang perkara berikut:\n${objectiveSummary}\n${daysPassed > 0 ? `\nSudah ${daysPassed} hari sejak mesej terakhir.` : ''}\n\nBoleh kongsi anggaran masa untuk setiap perkara di atas?`
      : isChinese
        ? `你好 ${data.leadName}，\n\n我这边简短跟进以下事项：\n${objectiveSummary}\n${daysPassed > 0 ? `\n距离上次沟通已 ${daysPassed} 天。` : ''}\n\n方便的话，请按以上事项回复大概时间。`
        : createFollowUpFallback(data, daysPassed, isChinese, selectedPreset).replace(data.objective, objectiveSummary);
    const fallbackText = formatFallbackMessage(
      baseFallbackText,
      outputFormat,
      language,
      data.leadName,
      isChinese ? '跟进确认' : isMalay ? 'Susulan Ringkas' : 'Quick Follow-up'
    );

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'follow_up',
        stylePreset: selectedPreset,
        content: fallbackText,
      },
    });

    return fallbackText;
  }
};

export const generatePaymentText = async (
  userId: string,
  leadId: string,
  data: PaymentData
): Promise<string> => {
  const tone = data.tone || 'polite';
  const amount = data.amount;
  const dueDate = data.dueDate;
  const language = data.language || 'en';
  const outputFormat = data.outputFormat || 'chat';
  const mappedTone = mapPaymentTone(tone);
  const isChinese = language === 'zh-CN';
  const isMalay = language === 'ms';
  const selectedPreset: PaymentStylePreset = presetsEnabled ? data.stylePreset || 'friendly_reminder' : 'friendly_reminder';
  const objectiveItems = splitObjectives(data.objective);

  let daysOverdue = 0;
  if (dueDate) {
    const due = new Date(dueDate);
    const now = new Date();
    daysOverdue = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const systemPrompt = getAdvisorPersona(language);

  const userPrompt = isChinese
    ? `用中文写一封付款提醒。\n\n上下文：\n- 客户姓名：${data.leadName}\n- 目标：${data.objective}\n- 项目已完成\n- 付款待处理\n- 逾期天数：${daysOverdue}\n- 语气：${mappedTone === 'professional' ? '专业' : '坚定'}\n${amount ? `- 金额：${amount.toFixed(2)}` : ''}\n- 模板风格：${selectedPreset}\n\n风格要求：\n${getPaymentPresetFragment(selectedPreset, true)}\n\n规则：\n- 保持尊重\n- 清晰友好\n- 使用客户姓名`
    : isMalay
      ? `Tulis mesej peringatan bayaran dalam Bahasa Melayu.\n\nKonteks:\n- Nama pelanggan: ${data.leadName}\n- Objektif: ${data.objective}\n- Projek telah siap\n- Bayaran masih belum diterima\n- Hari tertunggak: ${daysOverdue}\n- Nada: ${mappedTone}\n${amount ? `- Jumlah: ${amount.toFixed(2)}` : ''}\n- Gaya template: ${selectedPreset}\n\nPeraturan:\n- Hormat dan profesional\n- Jelas serta ringkas\n- Wajib sebut nama pelanggan`
      : `Write a payment reminder in English.\n\nContext:\n- Customer Name: ${data.leadName}\n- Objective: ${data.objective}\n- Project is completed\n- Payment is pending\n- Days overdue: ${daysOverdue}\n- Tone: ${mappedTone}\n${amount ? `- Amount: $${amount.toFixed(2)}` : ''}\n- Style preset: ${selectedPreset}\n\nStyle requirement:\n${getPaymentPresetFragment(selectedPreset, false)}\n\nRules:\n- Be respectful\n- Keep it clear and friendly\n- Must use the customer name`;
  const formatInstruction = getFormatInstruction(outputFormat, language);
  const emojiPreference = detectEmojiPreference(data.objective);
  const emojiInstruction = getEmojiInstruction(outputFormat, language, emojiPreference);
  const objectiveDirective = getObjectiveDirective(data.objective, language, objectiveItems, 'payment');
  const hardConstraints = getHardConstraints(language, outputFormat);
  const humanStyleBlock =
    isChinese && outputFormat === 'whatsapp'
      ? `\n\n${getChineseWhatsappHumanStyle('payment')}`
      : isMalay && outputFormat === 'whatsapp'
        ? `\n\n${getMalayWhatsappHumanStyle('payment')}`
        : '';
  const priorityInstruction = isChinese
    ? '如果 objective 与模板风格冲突，优先满足 objective。'
    : isMalay
      ? 'Jika objektif bercanggah dengan gaya template, utamakan objektif.'
      : 'If objective conflicts with style preset, prioritize objective.';
  const promptWithFormat = `${userPrompt}\n\n${objectiveDirective}\n\n- Output format: ${outputFormat}\n- Formatting rule: ${formatInstruction}\n- ${emojiInstruction}\n\n${hardConstraints}${humanStyleBlock}\n\n${priorityInstruction}`;

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const completion = await generateCompletion(systemPrompt, promptWithFormat);
    let generatedText = cleanGeneratedMessage(completion.choices[0]?.message?.content || '');

    if (objectiveItems.length > 1 && getObjectiveCoverageRatio(generatedText, objectiveItems) < 0.75) {
      const strictPrompt = `${promptWithFormat}\n\nRewrite now: include every objective item. Keep payment timing first, then cover the remaining objectives naturally.`;
      const retryCompletion = await generateCompletion(systemPrompt, strictPrompt);
      const retriedText = cleanGeneratedMessage(retryCompletion.choices[0]?.message?.content || '');
      if (retriedText.trim()) {
        generatedText = retriedText;
      }
    }

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

    return generatedText;
  } catch (error: any) {
    const errorKind = classifyAiError(error);
    console.error(`[AI] Payment generation failed (${errorKind})`, error?.message || error);

    const objectiveSummary = objectiveItems.length > 1
      ? objectiveItems.map((item, idx) => `${idx + 1}) ${item}`).join('\n')
      : data.objective;
    const baseFallbackText = isMalay
      ? `Hai ${data.leadName},\n\nPeringatan mesra untuk perkara berikut:\n${objectiveSummary}${amount ? `\nJumlah bayaran semasa: ${amount.toFixed(2)}.` : ''}\n\nBoleh kongsi anggaran tarikh untuk tindakan di atas, terutamanya bayaran?`
      : isChinese
        ? `你好 ${data.leadName}，\n\n这边提醒以下事项：\n${objectiveSummary}${amount ? `\n当前金额：${amount.toFixed(2)}。` : ''}\n\n方便的话，请优先确认付款时间，并告知其余事项安排。`
        : createPaymentFallback(data, isChinese, selectedPreset, daysOverdue).replace(data.objective, objectiveSummary);
    const fallbackText = formatFallbackMessage(
      baseFallbackText,
      outputFormat,
      language,
      data.leadName,
      isChinese ? '付款提醒' : isMalay ? 'Peringatan Bayaran' : 'Payment Reminder'
    );

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'payment',
        stylePreset: selectedPreset,
        content: fallbackText,
      },
    });

    return fallbackText;
  }
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
