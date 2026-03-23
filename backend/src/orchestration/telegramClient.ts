import { TelegramSendResult } from './types';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

const getBotToken = (): string => process.env.TELEGRAM_BOT_TOKEN || '';
const getApproverChatId = (): string => process.env.TELEGRAM_APPROVER_CHAT_ID || '';

export const telegramIsConfigured = (): boolean => Boolean(getBotToken() && getApproverChatId());

export const sendTelegramMessage = async (message: string): Promise<TelegramSendResult> => {
  const token = getBotToken();
  const chatId = getApproverChatId();

  if (!token || !chatId) {
    return {
      ok: false,
      messageId: null,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_APPROVER_CHAT_ID is not configured',
    };
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };

    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        messageId: null,
        error: payload.description || `Telegram send failed with status ${response.status}`,
      };
    }

    return {
      ok: true,
      messageId: payload.result?.message_id || null,
    };
  } catch (error: any) {
    return {
      ok: false,
      messageId: null,
      error: error?.message || 'Telegram send failed',
    };
  }
};

export const extractTelegramCommand = (body: any): { chatId: string | null; text: string | null } => {
  const sourceMessage = body?.message || body?.edited_message || null;
  const chatId = sourceMessage?.chat?.id ? String(sourceMessage.chat.id) : null;
  const text = typeof sourceMessage?.text === 'string' ? sourceMessage.text.trim() : null;

  return { chatId, text };
};
