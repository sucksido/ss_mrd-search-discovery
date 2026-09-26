import type { ApiErrorBody } from '@mrd/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../lib/api-error.js';
import type { Logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`No route matches ${req.method} ${req.path}`));
};

/**
 * Every error leaves through here in one shape. Unknown errors are logged with
 * their stack and reported as a bare 500 — the client gets a request id to
 * quote, never an internal message.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const requestId = req.requestId ?? 'unknown';

    if (error instanceof ApiError) {
      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      };
      res.status(error.statusCode).json(body);
      return;
    }

    logger.error('unhandled error', {
      requestId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const body: ApiErrorBody = {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong handling this request', requestId },
    };
    res.status(500).json(body);
  };
}
