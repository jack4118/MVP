import express from 'express';
import { dispatchDueReminders } from '../services/reminderService';

const router = express.Router();

router.post('/reminders/dispatch', async (req, res) => {
  const secret = process.env.INTERNAL_DISPATCH_SECRET;
  const token = req.headers['x-internal-secret'];

  if (!secret || token !== secret) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
  }

  try {
    const result = await dispatchDueReminders();
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: { message: 'Dispatch failed' } });
  }
});

export default router;
