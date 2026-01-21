import OpenAI from 'openai';
import prisma from '../config/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface FollowUpData {
  leadName: string;
  status?: string;
  daysPassed?: number;
  tone?: string;
  language?: 'en' | 'zh-CN';
}

export interface PaymentData {
  leadName: string;
  amount?: number;
  dueDate?: string;
  tone?: string;
  language?: 'en' | 'zh-CN';
}

export const generateFollowUpText = async (
  userId: string,
  leadId: string,
  data: FollowUpData
): Promise<string> => {
  const tone = data.tone || 'polite';
  const daysPassed = data.daysPassed || 0;
  const status = data.status || 'waiting_reply';
  const language = data.language || 'en';

  const isChinese = language === 'zh-CN';

  let systemPrompt: string;
  let userPrompt: string;

  if (isChinese) {
    systemPrompt = '你是一个专业的商务沟通助手。请用中文生成礼貌、专业且友好的客户跟进消息。';
    userPrompt = `请为以下客户生成一封跟进消息：
客户姓名：${data.leadName}
状态：${status === 'waiting_reply' ? '等待回复' : status === 'interested' ? '感兴趣' : '不感兴趣'}
${daysPassed > 0 ? `距离上次联系已过去 ${daysPassed} 天。` : ''}
语气：${tone === 'polite' ? '礼貌' : tone === 'friendly' ? '友好' : tone === 'professional' ? '专业' : '随意'}

请生成一封简洁、专业且友好的跟进消息，询问客户是否有任何问题或需要帮助的地方。`;
  } else {
    systemPrompt = 'You are a professional business communication assistant. Generate polite, professional, and friendly customer follow-up messages in English.';
    userPrompt = `Generate a follow-up message for the following customer:
Customer Name: ${data.leadName}
Status: ${status}
${daysPassed > 0 ? `It's been ${daysPassed} day${daysPassed > 1 ? 's' : ''} since we last connected.` : ''}
Tone: ${tone}

Please generate a concise, professional, and friendly follow-up message asking if they have any questions or need any assistance.`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const generatedText = completion.choices[0]?.message?.content || '';

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'follow_up',
        content: generatedText,
      },
    });

    return generatedText;
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Fallback to simple template if API fails
    const fallbackText = isChinese
      ? `尊敬的 ${data.leadName}，\n\n希望您一切顺利。${daysPassed > 0 ? `距离我们上次联系已经过去 ${daysPassed} 天了。` : ''}\n\n我想跟进一下我们之前的对话，看看您是否有任何问题或需要我帮助的地方。\n\n如有任何疑问，请随时联系我。\n\n此致\n敬礼`
      : `Dear ${data.leadName},\n\nI hope this message finds you well. ${daysPassed > 0 ? `It's been ${daysPassed} day${daysPassed > 1 ? 's' : ''} since we last connected.` : ''}\n\nI wanted to follow up on our previous conversation and see if you have any questions or if there's anything I can help you with.\n\nPlease feel free to reach out at your convenience. I'm here to help.\n\nBest regards`;

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'follow_up',
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

  const isChinese = language === 'zh-CN';

  let systemPrompt: string;
  let userPrompt: string;

  if (isChinese) {
    systemPrompt = '你是一个专业的商务沟通助手。请用中文生成礼貌、专业且友好的付款提醒消息。';
    userPrompt = `请为以下客户生成一封付款提醒消息：
客户姓名：${data.leadName}
${amount ? `付款金额：${amount.toFixed(2)}` : '有未付款项'}
${dueDate ? `到期日期：${dueDate}` : ''}
语气：${tone === 'polite' ? '礼貌' : tone === 'friendly' ? '友好' : tone === 'professional' ? '专业' : '随意'}

请生成一封简洁、专业且友好的付款提醒消息，提醒客户付款事项。如果客户已经付款，请忽略此消息。`;
  } else {
    systemPrompt = 'You are a professional business communication assistant. Generate polite, professional, and friendly payment reminder messages in English.';
    userPrompt = `Generate a payment reminder message for the following customer:
Customer Name: ${data.leadName}
${amount ? `Payment Amount: $${amount.toFixed(2)}` : 'There is a pending payment'}
${dueDate ? `Due Date: ${dueDate}` : ''}
Tone: ${tone}

Please generate a concise, professional, and friendly payment reminder message. If the customer has already made the payment, please disregard this message.`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const generatedText = completion.choices[0]?.message?.content || '';

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'payment',
        content: generatedText,
      },
    });

    return generatedText;
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Fallback to simple template if API fails
    const fallbackText = isChinese
      ? `尊敬的 ${data.leadName}，\n\n希望您一切顺利。${amount ? `这是一封关于 ${amount.toFixed(2)} 元付款的友好提醒。` : '这是一封关于未付款项的友好提醒。'}\n\n${dueDate ? `付款到期日为 ${dueDate}。` : '我想跟进一下目前未付的款项。'}\n\n如果您已经付款，请忽略此消息。如有任何问题或疑虑，请随时联系我。\n\n感谢您的关注。\n\n此致\n敬礼`
      : `Dear ${data.leadName},\n\nI hope you're doing well. ${amount ? `This is a friendly reminder regarding the payment of $${amount.toFixed(2)}.` : 'This is a friendly reminder regarding your pending payment.'}\n\n${dueDate ? `The payment was due on ${dueDate}.` : 'I wanted to follow up on the payment that is currently pending.'}\n\nIf you've already made the payment, please disregard this message. If you have any questions or concerns, please don't hesitate to reach out.\n\nThank you for your attention to this matter.\n\nBest regards`;

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'payment',
        content: fallbackText,
      },
    });

    return fallbackText;
  }
};

