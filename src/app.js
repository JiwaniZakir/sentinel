const { App, ExpressReceiver } = require('@slack/bolt');
const config = require('./config');
const { logger, setSlackClient } = require('./utils/logger');

// Event handlers
const { handleMemberJoined, handleTeamJoin } = require('./listeners/events/memberJoined');
const { handleDM } = require('./listeners/messages/dmHandler');

// Action handlers
const { registerOnboardingActions } = require('./listeners/actions/onboarding');
const { registerApprovalActions } = require('./listeners/actions/approval');

// Command handlers
const { registerHelpCommand } = require('./listeners/commands/help');
const { registerAnnounceEventCommand } = require('./listeners/commands/announceEvent');
const { registerDigestCommands } = require('./listeners/commands/addHighlight');

// Services
const scheduler = require('./services/scheduler');
const db = require('./services/database');

/**
 * Create and configure the Bolt app
 */
function createApp() {
  // Use Socket Mode for local development only
  // In production (Railway), always use HTTP mode with ExpressReceiver
  if (config.slack.appToken && config.nodeEnv === 'development') {
    logger.info('Running in Socket Mode (development)');
    return new App({
      token: config.slack.botToken,
      signingSecret: config.slack.signingSecret,
      socketMode: true,
      appToken: config.slack.appToken,
    });
  }

  // Production: Use default HTTP receiver
  logger.info({ port: config.port }, 'Running in HTTP Mode (production)');
  
  const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    port: config.port,
  });

  return app;
}

/**
 * Register all listeners
 */
async function registerListeners(app) {
  // Set Slack client for logger
  setSlackClient(app.client);

  // Event listeners
  handleMemberJoined(app);
  handleTeamJoin(app);
  handleDM(app);

  // Action handlers
  registerOnboardingActions(app);
  registerApprovalActions(app);

  // Command handlers
  registerHelpCommand(app);
  registerAnnounceEventCommand(app);
  registerDigestCommands(app);

  // Digest action handlers
  registerDigestActions(app);

  // Initialize scheduler
  scheduler.initialize(app.client);

  logger.info('All listeners registered');
}

/**
 * Register digest-related action handlers
 */
function registerDigestActions(app) {
  // Send digest to channel
  app.action('send_digest_channel', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const digestId = body.actions[0].value;

    try {
      const digest = await db.digests.findById(digestId);
      if (!digest) {
        throw new Error('Digest not found');
      }

      const digestBlocks = JSON.parse(digest.renderedMessage);

      // Post to #announcements
      await client.chat.postMessage({
        channel: config.channels.announcements,
        blocks: digestBlocks,
        text: `${config.orgName} Partner Digest`,
      });

      // Mark as sent
      await db.digests.markSent(digestId, true, false);

      // Update approval message
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ Digest sent to <#${config.channels.announcements}> by <@${userId}>`,
            },
          },
        ],
        text: 'Digest sent',
      });

      logger.info({ digestId, sentBy: userId }, 'Digest sent to channel');
    } catch (error) {
      logger.error({ error: error.message }, 'Error sending digest to channel');
    }
  });

  // Send digest to DMs
  app.action('send_digest_dms', async ({ ack, body, client, respond }) => {
    await ack();

    const userId = body.user.id;
    const digestId = body.actions[0].value;

    try {
      const digest = await db.digests.findById(digestId);
      if (!digest) {
        throw new Error('Digest not found');
      }

      const digestBlocks = JSON.parse(digest.renderedMessage);
      const partners = await db.partners.findAll();
      const onboardedPartners = partners.filter(p => p.onboardingComplete);

      await respond({
        text: `Sending digest to ${onboardedPartners.length} partners... This may take a few minutes.`,
        replace_original: false,
      });

      let sent = 0;
      for (const partner of onboardedPartners) {
        try {
          await client.chat.postMessage({
            channel: partner.slackUserId,
            blocks: digestBlocks,
            text: `${config.orgName} Partner Digest`,
          });
          sent++;
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error({ error: error.message, partnerId: partner.id }, 'Failed to send digest DM');
        }
      }

      // Mark as sent to DMs
      await db.digests.markSent(digestId, digest.sentToChannel, true);

      await respond({
        text: `✅ Digest sent to ${sent}/${onboardedPartners.length} partners.`,
        replace_original: false,
      });

      logger.info({ digestId, sent, total: onboardedPartners.length }, 'Digest sent to DMs');
    } catch (error) {
      logger.error({ error: error.message }, 'Error sending digest DMs');
    }
  });

  // Cancel digest
  app.action('cancel_digest', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;

    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❌ Digest cancelled by <@${userId}>`,
          },
        },
      ],
      text: 'Digest cancelled',
    });
  });
}

/**
 * Global error handler
 */
function setupErrorHandler(app) {
  app.error(async (error) => {
    logger.error({ error: error.message, stack: error.stack }, 'Unhandled app error');
  });
}

/**
 * Health check endpoint (for HTTP mode)
 * Note: Health check is now set up in createApp() with ExpressReceiver
 */
function setupHealthCheck(app) {
  // Health check already configured in createApp for production
  // This function is kept for compatibility but does nothing
}

module.exports = {
  createApp,
  registerListeners,
  setupErrorHandler,
  setupHealthCheck,
};

