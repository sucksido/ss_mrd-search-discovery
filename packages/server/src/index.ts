import { createApp } from './app.js';

const { app, config, logger, repo } = createApp();

const server = app.listen(config.port, () => {
  logger.info('server listening', {
    port: config.port,
    env: config.nodeEnv,
    catalogItems: repo.size,
    upstreamFailureRate: config.upstream.failureRate,
  });
  // Always visible, even at LOG_LEVEL=silent — this is the line a human wants.
  console.log(`\n  API ready → http://localhost:${config.port}/api/health\n`);
});

const shutdown = (signal: string): void => {
  logger.info('shutting down', { signal });
  server.close(() => process.exit(0));
  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
