import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodError } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function fromZod(err: ZodError): HttpError {
  const details = err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  return new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.', details);
}

function readStringProperty(source: unknown, key: string): string | undefined {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) {
    return err;
  }
  const parserErrorType = readStringProperty(err, 'type');
  if (parserErrorType === 'entity.parse.failed') {
    return new HttpError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
  if (parserErrorType === 'entity.too.large') {
    return new HttpError(400, 'VALIDATION_ERROR', 'Request body is too large.');
  }
  if (readStringProperty(err, 'code')?.startsWith('SQLITE_BUSY')) {
    return new HttpError(503, 'SERVICE_UNAVAILABLE', 'Please retry the request.');
  }
  return new HttpError(500, 'INTERNAL', 'Internal server error.');
}

function logUnexpected(err: unknown): void {
  console.error('Unhandled request error:', err instanceof Error ? (err.stack ?? err.message) : err);
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found.'));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const httpError = toHttpError(err);
  if (httpError.status === 500) {
    logUnexpected(err);
  }
  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      details: httpError.details,
    },
  });
};
