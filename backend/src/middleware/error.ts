import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isValidationError = err instanceof ZodError;
  const statusCode = isValidationError ? 400 : err.statusCode || 500;
  const message = isValidationError
    ? err.errors[0]?.message || 'Validation failed'
    : err.message || 'Internal Server Error';

  console.error('Error:', err);

  res.status(statusCode).json({
    success: false,
    error: {
      message,
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
