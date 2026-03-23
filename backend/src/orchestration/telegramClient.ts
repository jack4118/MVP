import { TelegramSendResult } from './types';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard: TelegramInlineButton[][];
}

const getBotToken = (): string => process.env.TELEGRAM_BOT_TOKEN || '';
const getApproverChatId = (): string => process.env.TELEGRAM_APPROVER_CHAT_ID || '';

export const telegramIsConfigured = (): boolean => Boolean(getBotToken() && getApproverChatId());

const buildTelegramUrl = (method: string): string => `${TELEGRAM_API_BASE}/bot${getBotToken()}/${method}`;

export const sendTelegramMessage = async (
  message: string,
  options?: { replyMarkup?: TelegramReplyMarkup }
): Promise<TelegramSendResult> => {
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
    const response = await fetch(buildTelegramUrl('sendMessage'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
        ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
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

export const answerTelegramCallbackQuery = async (
  callbackQueryId: string,
  text?: string
): Promise<{ ok: boolean; error?: string }> => {
  const token = getBotToken();
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' };
  }

  try {
    const response = await fetch(buildTelegramUrl('answerCallbackQuery'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || undefined,
        show_alert: false,
      }),
    });
    const payload = (await response.json()) as { ok?: boolean; description?: string };
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        error: payload.description || `answerCallbackQuery failed with status ${response.status}`,
      };
    }
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'answerCallbackQuery failed' };
  }
};

export const extractTelegramUpdate = (body: any): {
  chatId: string | null;
  text: string | null;
  callbackQueryId: string | null;
  callbackData: string | null;
  messageId: number | null;
} => {
  const sourceMessage = body?.message || body?.edited_message || null;
  const callbackQuery = body?.callback_query || null;
  const callbackMessage = callbackQuery?.message || null;
  const activeMessage = sourceMessage || callbackMessage;
  const chatId = sourceMessage?.chat?.id ? String(sourceMessage.chat.id) : null;
  const callbackChatId = callbackMessage?.chat?.id ? String(callbackMessage.chat.id) : null;
  const text = typeof sourceMessage?.text === 'string' ? sourceMessage.text.trim() : null;
  const callbackData = typeof callbackQuery?.data === 'string' ? callbackQuery.data.trim() : null;
  const callbackQueryId = typeof callbackQuery?.id === 'string' ? callbackQuery.id : null;
  const messageId = Number(activeMessage?.message_id || 0) || null;

  return {
    chatId: chatId || callbackChatId,
    text,
    callbackQueryId,
    callbackData,
    messageId,
  };
};
