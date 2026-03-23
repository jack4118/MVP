import { randomUUID } from 'crypto';
import { AppError } from '../middleware/error';

export interface CreateAppErrorOptions {
  statusCode: number;
  code: string;
  message: string;
  recoverable?: boolean;
  nextAction?: string;
  details?: Record<string, unknown>;
}

export const createAppError = (options: CreateAppErrorOptions): AppError => {
  const error = new Error(options.message) as AppError;
  error.statusCode = options.statusCode;
  error.code = options.code;
  error.recoverable = options.recoverable;
  error.nextAction = options.nextAction;
  error.details = options.details;
  error.correlationId = randomUUID();
  return error;
};
