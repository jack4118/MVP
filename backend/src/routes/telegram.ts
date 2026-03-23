import express, { NextFunction, Request, Response } from 'express';
import { handleTelegramWebhookUpdate } from '../orchestration/orchestrationService';

const router = express.Router();

router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await handleTelegramWebhookUpdate(req.body);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
});

export default router;
