import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express } from 'express';
import { CatalogRepository } from './catalog/catalog.repository.js';
import { loadConfig, type AppConfig } from './config.js';
import { createLogger, type Logger } from './lib/logger.js';
import { MetricsRegistry } from './lib/metrics.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestContext } from './middleware/request-context.js';
import { createApiRouter } from './routes/api.routes.js';
import { SearchService } from './search/search.service.js';
import { EnrichmentClient } from './upstream/enrichment.client.js';
import { SimulatedUpstreamProvider } from './upstream/provider.js';

export interface AppContext {
  app: Express;
  config: AppConfig;
  logger: Logger;
  repo: CatalogRepository;
  metrics: MetricsRegistry;
  enrichment: EnrichmentClient;
  search: SearchService;
}

/**
 * Composition root. Everything is constructed here and injected downwards, so
 * a test can build an app with a 100%-failure upstream (or a 2-second one)
 * without touching a global or spinning up a network listener.
 */
export function createApp(overrides: Partial<AppConfig> = {}): AppContext {
  const config: AppConfig = { ...loadConfig(), ...overrides };
  const logger = createLogger(config.logLevel);
  const metrics = new MetricsRegistry();

  const repo = CatalogRepository.fromFile(config.catalogPath);
  const provider = new SimulatedUpstreamProvider(config.upstream, new Set(repo.all().map((item) => item.id)));
  const enrichment = new EnrichmentClient(provider, config.resilience, metrics, logger);
  const search = new SearchService(repo, enrichment, config.resilience);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '32kb' }));
  app.use(requestContext(metrics, logger));
  app.use('/api', createApiRouter({ repo, search, enrichment, metrics }));

  // In production the API also serves the built client, so the whole app is
  // one origin and one process: `npm run build && npm start`.
  if (config.staticDir !== undefined && existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir, { maxAge: '1h', index: 'index.html' }));
    app.get('*', (_req, res) => {
      res.sendFile(join(config.staticDir as string, 'index.html'));
    });
    logger.info('serving static client', { dir: config.staticDir });
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return { app, config, logger, repo, metrics, enrichment, search };
}
