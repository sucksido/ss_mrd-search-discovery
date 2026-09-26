import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from '../lib/logger.js';
import type { MetricsRegistry } from '../lib/metrics.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    startedAt: number;
  }
}

/**
 * One id per request, echoed in the `x-request-id` header and in every response
 * body's `meta`. It is what lets a reviewer match a card in the UI to a line in
 * the server log — cheap, and the first thing you miss when it isn't there.
 */
export function requestContext(metrics: MetricsRegistry, logger: Logger): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming !== undefined && incoming.length <= 64 ? incoming : randomUUID();
    req.startedAt = Date.now();
    res.setHeader('x-request-id', req.requestId);

    res.on('finish', () => {
      const durationMs = Date.now() - req.startedAt;
      // Label by route pattern, not by URL, so /items/:id is one bucket.
      const label = `${req.method} ${req.route?.path !== undefined ? req.baseUrl + req.route.path : req.path}`;
      // Only API traffic is instrumented: static asset hits would swamp the
      // metrics endpoint with noise nobody is going to act on. (originalUrl, not
      // path: Express rewrites req.url while dispatching a mounted router.)
      if (req.originalUrl.startsWith('/api')) metrics.recordRequest(label, durationMs, res.statusCode >= 400);
      logger.info('request', { requestId: req.requestId, route: label, status: res.statusCode, durationMs });
    });

    next();
  };
}

/** Express 4 does not forward rejected promises; this is the missing glue. */
export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}
