import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

export const updateLeadStatusSchema = z.object({
  status: z.string().min(1, 'Status is required'),
});

export const aiFollowUpSchema = z.object({
  leadName: z.string().min(1, 'Lead name is required'),
  status: z.string().optional(),
  daysPassed: z.number().int().positive().optional(),
  tone: z.string().optional(),
});

export const aiPaymentSchema = z.object({
  leadName: z.string().min(1, 'Lead name is required'),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional(),
  tone: z.string().optional(),
});

