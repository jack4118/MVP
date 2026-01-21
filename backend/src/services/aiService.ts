import prisma from '../config/database';

export interface FollowUpData {
  leadName: string;
  status?: string;
  daysPassed?: number;
  tone?: string;
}

export interface PaymentData {
  leadName: string;
  amount?: number;
  dueDate?: string;
  tone?: string;
}

export const generateFollowUpText = async (
  userId: string,
  leadId: string,
  data: FollowUpData
): Promise<string> => {
  const tone = data.tone || 'polite';
  const daysPassed = data.daysPassed || 0;
  const status = data.status || 'waiting_reply';

  const generatedText = `Dear ${data.leadName},

I hope this message finds you well. ${daysPassed > 0 ? `It's been ${daysPassed} day${daysPassed > 1 ? 's' : ''} since we last connected.` : ''}

${status === 'waiting_reply' ? 'I wanted to follow up on our previous conversation and see if you have any questions or if there\'s anything I can help you with.' : ''}
${status === 'interested' ? 'I wanted to check in and see if you\'re still interested in moving forward with our discussion.' : ''}
${status === 'not_interested' ? 'I understand if your priorities have changed, but I wanted to reach out one more time in case there\'s an opportunity to assist you.' : ''}

Please feel free to reach out at your convenience. I'm here to help.

Best regards`;

  await prisma.aiLog.create({
    data: {
      userId,
      leadId,
      purpose: 'follow_up',
      content: generatedText,
    },
  });

  return generatedText;
};

export const generatePaymentText = async (
  userId: string,
  leadId: string,
  data: PaymentData
): Promise<string> => {
  const tone = data.tone || 'polite';
  const amount = data.amount;
  const dueDate = data.dueDate;

  const generatedText = `Dear ${data.leadName},

I hope you're doing well. ${amount ? `This is a friendly reminder regarding the payment of $${amount.toFixed(2)}.` : 'This is a friendly reminder regarding your pending payment.'}

${dueDate ? `The payment was due on ${dueDate}.` : 'I wanted to follow up on the payment that is currently pending.'}

If you've already made the payment, please disregard this message. If you have any questions or concerns, please don't hesitate to reach out.

Thank you for your attention to this matter.

Best regards`;

  await prisma.aiLog.create({
    data: {
      userId,
      leadId,
      purpose: 'payment',
      content: generatedText,
    },
  });

  return generatedText;
};

