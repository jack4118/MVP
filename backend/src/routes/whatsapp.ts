import express, { Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { whatsappConnectionSchema, whatsappSendSchema } from '../utils/validation';
import {
  getWhatsappConnection,
  getWhatsAppMessageLogs,
  sendWhatsAppText,
  upsertWhatsappConnection,
  verifyWhatsappConnection,
} from '../services/whatsappService';

const router = express.Router();
router.use(authenticate);

router.get('/connection', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const connection = await getWhatsappConnection(req.userId);
    return res.json({ success: true, data: connection });
  } catch (error) {
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

export default router;
