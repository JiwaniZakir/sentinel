const pino = require('pino');
const config = require('../config');

// Create pino logger
const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  transport: config.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  } : undefined,
});

// Slack client reference (set by app.js)
let slackClient = null;

/**
 * Set the Slack client for logging to #bot-logs
 */
function setSlackClient(client) {
  slackClient = client;
}

/**
 * Log to #bot-logs channel
 */
async function logToSlack(level, message, metadata = {}) {
  if (!slackClient || !config.channels.botLogs) {
    return;
  }

  const emoji = {
    info: ':information_source:',
    warn: ':warning:',
    error: ':x:',
    success: ':white_check_mark:',
  }[level] || ':memo:';

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${level.toUpperCase()}*: ${message}`,
      },
    },
  ];

  if (Object.keys(metadata).length > 0) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `\`\`\`${JSON.stringify(metadata, null, 2)}\`\`\``,
        },
      ],
    });
  }

  try {
    await slackClient.chat.postMessage({
      channel: config.channels.botLogs,
      blocks,
      text: `${level}: ${message}`,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to log to Slack');
  }
}

/**
 * Log activity to database
 */
async function logActivity(db, actionType, actorSlackId, targetType, targetId, metadata) {
  try {
    await db.activityLog.create({
      data: {
        actionType,
        actorSlackId,
        targetType,
        targetId,
        metadata,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to log activity to database');
  }
}

module.exports = {
  logger,
  setSlackClient,
  logToSlack,
  logActivity,
};

