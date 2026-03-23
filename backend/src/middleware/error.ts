import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  recoverable?: boolean;
  nextAction?: string;
  details?: Record<string, unknown>;
  correlationId?: string;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestCorrelationId = req.headers['x-correlation-id'];
  const correlationId = (
    typeof requestCorrelationId === 'string' && requestCorrelationId.trim()
      ? requestCorrelationId.trim()
      : err.correlationId || randomUUID()
  );
  const isValidationError = err instanceof ZodError;
  const statusCode = isValidationError ? 400 : err.statusCode || 500;
  const message = isValidationError
    ? err.errors[0]?.message || 'Validation failed'
    : err.message || 'Internal Server Error';

  console.error(`[${correlationId}] Error:`, err);

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      correlation_id: correlationId,
      ...(!isValidationError && err.code ? { code: err.code } : {}),
      ...(!isValidationError && err.recoverable !== undefined ? { recoverable: err.recoverable } : {}),
      ...(!isValidationError && err.nextAction ? { next_action: err.nextAction } : {}),
      ...(!isValidationError && err.details ? { details: err.details } : {}),
      ...(isValidationError && { code: 'VALIDATION_ERROR' }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error: AppError = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};
