const config = require('../../config');
const db = require('../../services/database');
const openaiService = require('../../services/openai');
const slackService = require('../../services/slack');
const {
  buildMaybeLaterBlocks,
  buildSkipBlocks,
  buildOnboardingStartedBlocks,
  buildTextBlocks,
} = require('../../templates/welcomeDM');
const { logger, logToSlack, logActivity } = require('../../utils/logger');

/**
 * Register onboarding action handlers
 */
function registerOnboardingActions(app) {
  // Handle "Start Onboarding" button
  app.action('start_onboarding', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const channelId = body.channel.id;

    try {
      // Check for existing active conversation
      let conversation = await db.conversations.findActive(userId);
      
      if (!conversation) {
        // Create new conversation
        conversation = await db.conversations.create(userId);
      }

      // Update the original message to remove buttons
      await client.chat.update({
        channel: channelId,
        ts: body.message.ts,
        blocks: buildOnboardingStartedBlocks(),
        text: 'Onboarding started!',
      });

      // Get display name
      const displayName = await slackService.getUserDisplayName(client, userId);

      // Generate initial AI response
      const initialMessage = `Hi! I'm ${displayName} and I'm a new partner here.`;
      const aiResponse = await openaiService.generateOnboardingResponse(
        [],
        initialMessage,
        displayName
      );

      // Save messages to conversation
      await db.conversations.addMessage(conversation.id, 'user', initialMessage);
      await db.conversations.addMessage(conversation.id, 'assistant', aiResponse.message);

      // Update conversation status
      await db.conversations.update(conversation.id, { status: 'IN_PROGRESS' });

      // Send AI response
      await client.chat.postMessage({
        channel: channelId,
        blocks: buildTextBlocks(aiResponse.message),
        text: aiResponse.message,
      });

      // Log activity
      await logActivity(
        db.prisma,
        'onboarding_started',
        userId,
        'conversation',
        conversation.id,
        { displayName }
      );

      await logToSlack('info', `Partner started onboarding`, {
        user: `<@${userId}>`,
      });

      logger.info({ userId, conversationId: conversation.id }, 'Onboarding started');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error starting onboarding');
      
      await client.chat.postMessage({
        channel: channelId,
        blocks: buildTextBlocks(
          `Sorry, I had trouble starting the onboarding. Please try again or contact an admin.`
        ),
        text: 'Error starting onboarding',
      });
    }
  });

  // Handle "Maybe Later" button
  app.action('onboarding_later', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const channelId = body.channel.id;

    try {
      const displayName = await slackService.getUserDisplayName(client, userId);

      // Update message with "maybe later" response
      await client.chat.update({
        channel: channelId,
        ts: body.message.ts,
        blocks: buildMaybeLaterBlocks(displayName),
        text: 'No problem! Come back when you\'re ready.',
      });

      logger.info({ userId }, 'Partner chose "Maybe Later" for onboarding');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error handling "Maybe Later"');
    }
  });

  // Handle "Skip" button
  app.action('onboarding_skip', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const channelId = body.channel.id;

    try {
      const displayName = await slackService.getUserDisplayName(client, userId);

      // Update message with skip response
      await client.chat.update({
        channel: channelId,
        ts: body.message.ts,
        blocks: buildSkipBlocks(displayName),
        text: 'Onboarding skipped.',
      });

      // Log activity
      await logActivity(
        db.prisma,
        'onboarding_skipped',
        userId,
        'partner',
        userId,
        {}
      );

      await logToSlack('info', `Partner skipped onboarding`, {
        user: `<@${userId}>`,
      });

      logger.info({ userId }, 'Partner skipped onboarding');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error handling "Skip"');
    }
  });
}

module.exports = {
  registerOnboardingActions,
};

