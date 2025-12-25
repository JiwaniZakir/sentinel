const config = require('../../config');
const db = require('../../services/database');
const slackService = require('../../services/slack');
const { buildWelcomeBlocks } = require('../../templates/welcomeDM');
const { logger, logToSlack, logActivity } = require('../../utils/logger');

/**
 * Handle member_joined_channel event
 * Triggers welcome DM for new partners
 */
async function handleMemberJoined(app) {
  app.event('member_joined_channel', async ({ event, client }) => {
    const { user: userId, channel: channelId } = event;

    // Only trigger for specific channels (introductions or community)
    const triggerChannels = [
      config.channels.introductions,
      config.channels.community,
    ].filter(Boolean);

    if (!triggerChannels.includes(channelId)) {
      return;
    }

    try {
      // Check if this user already has a partner record
      const existingPartner = await db.partners.findBySlackId(userId);
      if (existingPartner && existingPartner.onboardingComplete) {
        logger.info({ userId }, 'Partner already onboarded, skipping welcome');
        return;
      }

      // Check if there's an active onboarding conversation
      const activeConversation = await db.conversations.findActive(userId);
      if (activeConversation) {
        logger.info({ userId }, 'Active onboarding conversation exists, skipping welcome');
        return;
      }

      // Get user's display name
      const displayName = await slackService.getUserDisplayName(client, userId);

      // Send welcome DM
      const welcomeBlocks = buildWelcomeBlocks(displayName);
      await slackService.sendDM(client, userId, welcomeBlocks, `Welcome to ${config.orgName}!`);

      // Log activity
      await logActivity(
        db.prisma,
        'welcome_dm_sent',
        null,
        'partner',
        userId,
        { channel: channelId, displayName }
      );

      await logToSlack('info', `Welcome DM sent to new member`, {
        user: `<@${userId}>`,
        triggeredBy: `<#${channelId}>`,
      });

      logger.info({ userId, channelId }, 'Welcome DM sent to new member');
    } catch (error) {
      logger.error({ error: error.message, userId, channelId }, 'Failed to send welcome DM');
      await logToSlack('error', `Failed to send welcome DM`, {
        user: `<@${userId}>`,
        error: error.message,
      });
    }
  });
}

/**
 * Handle team_join event (alternative trigger)
 * Fires when a new user joins the workspace
 */
async function handleTeamJoin(app) {
  app.event('team_join', async ({ event, client }) => {
    const { user } = event;
    const userId = user.id;

    try {
      // Skip bots
      if (user.is_bot) {
        return;
      }

      // Get user's display name
      const displayName = user.profile?.display_name || user.profile?.real_name || user.name || 'Partner';

      // Wait a moment for the user to be fully set up
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Send welcome DM
      const welcomeBlocks = buildWelcomeBlocks(displayName);
      await slackService.sendDM(client, userId, welcomeBlocks, `Welcome to ${config.orgName}!`);

      // Log activity
      await logActivity(
        db.prisma,
        'welcome_dm_sent',
        null,
        'partner',
        userId,
        { trigger: 'team_join', displayName }
      );

      await logToSlack('info', `Welcome DM sent to new workspace member`, {
        user: `<@${userId}>`,
        trigger: 'team_join',
      });

      logger.info({ userId }, 'Welcome DM sent to new workspace member');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Failed to send welcome DM on team_join');
      await logToSlack('error', `Failed to send welcome DM on team_join`, {
        user: `<@${userId}>`,
        error: error.message,
      });
    }
  });
}

module.exports = {
  handleMemberJoined,
  handleTeamJoin,
};

