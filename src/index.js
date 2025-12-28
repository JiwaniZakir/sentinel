require('dotenv').config();

const { createApp, registerListeners, setupErrorHandler, setupHealthCheck } = require('./app');
const { logger } = require('./utils/logger');
const db = require('./services/database');
const config = require('./config');
const { loadAccountsFromEnv } = require('./services/research/accountPool');

/**
 * Main entry point
 */
async function main() {
  try {
    logger.info('Starting PartnerBot...');

    // Verify database connection
    const dbHealthy = await db.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connected');

    // Load LinkedIn accounts from environment variables
    try {
      const result = await loadAccountsFromEnv();
      if (result.loaded > 0) {
        logger.info(`Loaded ${result.loaded} LinkedIn account(s) from environment variables`);
      }
    } catch (error) {
      logger.warn(`Failed to load LinkedIn accounts from env: ${error.message}`);
    }

    // Create and configure app
    const app = createApp();

    // Register all listeners
    await registerListeners(app);

    // Setup error handling
    setupErrorHandler(app);

    // Setup health check endpoint
    setupHealthCheck(app);

    // Start the app
    await app.start();

    logger.info({
      mode: config.slack.appToken ? 'Socket Mode' : 'HTTP',
      port: config.slack.appToken ? 'N/A' : config.port,
      org: config.orgName,
    }, '⚡ PartnerBot is running!');

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Received shutdown signal');
      await db.disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('=== STARTUP ERROR ===');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('Full error:', error);
    logger.error({ error: error.message, stack: error.stack }, 'Failed to start PartnerBot');
    process.exit(1);
  }
}

main();

