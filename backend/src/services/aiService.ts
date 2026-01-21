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

  // Map tone to new format: polite/friendly -> soft, professional -> professional, casual -> firm
  let mappedTone: 'soft' | 'professional' | 'firm';
  if (tone === 'professional') {
    mappedTone = 'professional';
  } else if (tone === 'casual') {
    mappedTone = 'firm';
  } else {
    mappedTone = 'soft'; // polite, friendly default to soft
  }

  const isChinese = language === 'zh-CN';

  let systemPrompt: string;
  let userPrompt: string;

  if (isChinese) {
    systemPrompt = '你是一个专业的销售助手，帮助小企业主跟进客户。你的目标是听起来礼貌、人性化且专业——不要显得咄咄逼人。消息应该减少压力并增加回复概率。';
    userPrompt = `用中文写一封跟进消息。

上下文：
- 距离上次回复的天数：${daysPassed}
- 关系：现有客户
- 语气：${mappedTone === 'soft' ? '温和' : mappedTone === 'professional' ? '专业' : '坚定'}

规则：
- 简短自然
- 不要施加压力
- 以简单的问题结尾`;
  } else {
    systemPrompt = 'You are a professional sales assistant helping a small business owner follow up with a client. Your goal is to sound polite, human, and professional — not pushy. The message should reduce pressure and increase reply probability.';
    userPrompt = `Write a follow-up message in English.

Context:
- Days since last reply: ${daysPassed}
- Relationship: existing client
- Tone: ${mappedTone}

Rules:
- Short and natural
- No pressure
- End with an easy question`;
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }

    console.log('Calling OpenAI API for follow-up message...');
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
    
    if (!generatedText) {
      throw new Error('OpenAI API returned empty response');
    }

    console.log('OpenAI API success, generated text length:', generatedText.length);

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'follow_up',
        content: generatedText,
      },
    });

    return generatedText;
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      if (error.message.includes('API key')) {
        console.error('Please check your OPENAI_API_KEY in .env file');
      }
    }
    if (error?.code === 'insufficient_quota' || error?.message?.includes('quota')) {
      console.error('⚠️ OpenAI API quota exceeded. Please check your billing at https://platform.openai.com/account/billing');
    }
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

  // Map tone to new format: professional or firm only
  let mappedTone: 'professional' | 'firm';
  if (tone === 'casual' || tone === 'friendly') {
    mappedTone = 'firm';
  } else {
    mappedTone = 'professional'; // polite, professional default to professional
  }

  // Calculate days overdue if dueDate is provided
  let daysOverdue = 0;
  if (dueDate) {
    const due = new Date(dueDate);
    const now = new Date();
    daysOverdue = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const isChinese = language === 'zh-CN';

  let systemPrompt: string;
  let userPrompt: string;

  if (isChinese) {
    systemPrompt = '你帮助企业主礼貌但清楚地请求付款。消息必须保护关系，同时提醒付款。';
    userPrompt = `用中文写一封付款提醒。

上下文：
- 项目已完成
- 付款待处理
- 逾期天数：${daysOverdue}
- 语气：${mappedTone === 'professional' ? '专业' : '坚定'}
${amount ? `- 金额：${amount.toFixed(2)}` : ''}

规则：
- 保持尊重
- 提及完成情况
- 清晰但友好`;
  } else {
    systemPrompt = 'You help a business owner request payment politely but clearly. The message must protect the relationship while reminding about payment.';
    userPrompt = `Write a payment reminder in English.

Context:
- Project is completed
- Payment is pending
- Days overdue: ${daysOverdue}
- Tone: ${mappedTone}
${amount ? `- Amount: $${amount.toFixed(2)}` : ''}

Rules:
- Be respectful
- Mention completion
- Clear but friendly`;
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }

    console.log('Calling OpenAI API for payment reminder...');
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
    
    if (!generatedText) {
      throw new Error('OpenAI API returned empty response');
    }

    console.log('OpenAI API success, generated text length:', generatedText.length);

    await prisma.aiLog.create({
      data: {
        userId,
        leadId,
        purpose: 'payment',
        content: generatedText,
      },
    });

    return generatedText;
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      if (error.message.includes('API key')) {
        console.error('Please check your OPENAI_API_KEY in .env file');
      }
    }
    if (error?.code === 'insufficient_quota' || error?.message?.includes('quota')) {
      console.error('⚠️ OpenAI API quota exceeded. Please check your billing at https://platform.openai.com/account/billing');
    }
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

