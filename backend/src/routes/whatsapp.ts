import express, { Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { whatsappConnectionSchema, whatsappMarkReadSchema, whatsappSendSchema } from '../utils/validation';
import {
  getWhatsappConnection,
  getWhatsAppContactSummariesPaged,
  getWhatsAppConversationMessages,
  getWhatsAppMessageLogs,
  markWhatsAppConversationRead,
  processWhatsAppWebhook,
  sendWhatsAppText,
  upsertWhatsappConnection,
  verifyWhatsappConnection,
} from '../services/whatsappService';

const router = express.Router();

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && expectedToken && token === expectedToken) {
    return res.status(200).send(String(challenge || ''));
  }
  return res.status(403).send('Forbidden');
});

router.post('/webhook', async (req, res) => {
  try {
    await processWhatsAppWebhook(req.body);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('WhatsApp webhook processing error:', error);
    return res.status(200).json({ success: true });
  }
});

router.use(authenticate);

router.get('/connection', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const connection = await getWhatsappConnection(req.userId);
    return res.json({ success: true, data: connection });
  } catch (error) {
    if (error instanceof Error && error.message === 'accessToken is required for first-time connection') {
      return res.status(400).json({ success: false, error: { message: error.message, code: 'WHATSAPP_ACCESS_TOKEN_REQUIRED' } });
    }
    next(error);
  }
});

router.post('/connection', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const validatedData = whatsappConnectionSchema.parse(req.body);
    await upsertWhatsappConnection(req.userId, validatedData);

    return res.status(201).json({
      success: true,
      data: { saved: true },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/connection/verify', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const result = await verifyWhatsappConnection(req.userId);
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'WhatsApp connection not found') {
      return res.status(404).json({ success: false, error: { message: 'Please save connection first', code: 'WHATSAPP_NOT_CONNECTED' } });
    }
    next(error);
  }
});

router.post('/send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const validatedData = whatsappSendSchema.parse(req.body);
    const result = await sendWhatsAppText(req.userId, validatedData);

    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'WhatsApp connection not found') {
      return res.status(404).json({ success: false, error: { message: 'Please connect WhatsApp first', code: 'WHATSAPP_NOT_CONNECTED' } });
    }
    if (error instanceof Error && error.message.includes('(#131030)')) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Recipient number is not in allowed list. Add this phone in Meta WhatsApp API > API Setup > To field, then try again.',
          code: 'WHATSAPP_RECIPIENT_NOT_ALLOWED',
        },
      });
    }
    if (
      error instanceof Error &&
      (
        error.message.toLowerCase().includes('re-engagement message') ||
        error.message.toLowerCase().includes('outside the allowed window') ||
        error.message.toLowerCase().includes('24 hours') ||
        error.message.toLowerCase().includes('24-hour')
      )
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'This contact is outside the 24-hour WhatsApp window. Use an approved template message first, or wait for the customer to reply before sending free-form text.',
          code: 'WHATSAPP_TEMPLATE_REQUIRED',
        },
      });
    }
    next(error);
  }
});

router.get('/logs', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const limit = Number(req.query.limit || 30);
    const logs = await getWhatsAppMessageLogs(req.userId, limit);

    return res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

router.get('/contacts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const q = String(req.query.q || '');
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || req.query.limit || 20);
    const paged = await getWhatsAppContactSummariesPaged(req.userId, { q, page, pageSize });

    return res.json({ success: true, data: paged });
  } catch (error) {
    next(error);
  }
});

router.get('/messages', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const phone = String(req.query.phone || '');
    if (!phone) {
      return res.status(400).json({ success: false, error: { message: 'phone is required' } });
    }

    const limit = Number(req.query.limit || 100);
    const messages = await getWhatsAppConversationMessages(req.userId, phone, limit);

    return res.json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
});

router.post('/conversations/read', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const validatedData = whatsappMarkReadSchema.parse(req.body);
    const result = await markWhatsAppConversationRead(req.userId, validatedData.phone);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
