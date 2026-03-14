import express, { Request, Response, NextFunction } from 'express';
import { register, login, getCurrentUser, updateCurrentUser } from '../services/authService';
import { registerSchema, loginSchema, updateProfileSchema } from '../utils/validation';
import { errorHandler } from '../middleware/error';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const user = await register(validatedData);
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Email already exists') {
      return res.status(400).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await login(validatedData);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid')) {
      return res.status(401).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const user = await getCurrentUser(req.userId);
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

router.put('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const validatedData = updateProfileSchema.parse(req.body);
    const user = await updateCurrentUser(req.userId, validatedData);
    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
