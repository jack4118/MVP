import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler, notFoundHandler } from './middleware/error';
import authRoutes from './routes/auth';
import leadRoutes from './routes/leads';
import reminderRoutes from './routes/reminders';
import aiRoutes from './routes/ai';
import usageRoutes from './routes/usage';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // If FRONTEND_URL is set, check if origin matches
    if (process.env.FRONTEND_URL) {
      if (origin === process.env.FRONTEND_URL) {
        return callback(null, true);
      }
    }
    
    // Allow any localhost port during development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    // Reject other origins
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Server is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/usage', usageRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;

