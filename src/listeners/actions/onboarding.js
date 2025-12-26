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

// Partner type emoji mapping
const PARTNER_TYPE_EMOJI = {
  VC: '💰',
  CORPORATE: '🏢',
  COMMUNITY_BUILDER: '🌐',
  ANGEL: '👼',
  OTHER: '🤝',
};

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

  // ========================================
  // Partner Introduction Actions
  // ========================================

  // Handle "Post Introduction" button - partner approves their intro
  app.action('partner_approve_intro', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const channelId = body.channel.id;
    const partnerId = body.actions[0].value;

    try {
      // Get partner data
      const partner = await db.partners.findBySlackId(userId);
      if (!partner) {
        throw new Error('Partner not found');
      }

      const introMessage = partner.onboardingData?.pendingIntroMessage;
      if (!introMessage) {
        throw new Error('No pending introduction found');
      }

      // Post to #introductions
      const emoji = PARTNER_TYPE_EMOJI[partner.partnerType] || '👋';
      const introBlocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Welcome <@${userId}>!*`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: introMessage,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${partner.firm} • ${partner.partnerType.replace('_', ' ')}`,
            },
          ],
        },
      ];

      if (config.channels.introductions) {
        await slackService.postToChannel(
          client,
          config.channels.introductions,
          introBlocks,
          `Welcome ${partner.name} from ${partner.firm}!`
        );
      }

      // Mark onboarding as complete
      await db.partners.markOnboardingComplete(userId);

      // Update the DM message
      await client.chat.update({
        channel: channelId,
        ts: body.message.ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Your introduction has been posted to #introductions!*\n\nWelcome to the community! Feel free to explore the channels and connect with other partners.`,
            },
          },
        ],
        text: 'Introduction posted!',
      });

      // Log to #bot-admin
      if (config.channels.botAdmin) {
        await slackService.postToChannel(
          client,
          config.channels.botAdmin,
          [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *New Partner Introduced*\n\n<@${userId}> (${partner.firm}) posted their introduction to #introductions.`,
              },
            },
          ],
          `New partner: ${partner.name}`
        );
      }

      await logToSlack('success', `Partner posted introduction`, {
        user: `<@${userId}>`,
        firm: partner.firm,
      });

      logger.info({ userId, partnerId }, 'Partner approved and posted introduction');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error posting partner introduction');
      
      await client.chat.update({
        channel: channelId,
        ts: body.message.ts,
        blocks: buildTextBlocks(
          `Sorry, there was an issue posting your introduction. Please try again or contact an admin.`
        ),
        text: 'Error posting introduction',
      });
    }
  });

  // Handle "Edit First" button - open modal to edit intro
  app.action('partner_edit_intro', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const partnerId = body.actions[0].value;

    try {
      // Get partner data
      const partner = await db.partners.findBySlackId(userId);
      if (!partner) {
        throw new Error('Partner not found');
      }

      const introMessage = partner.onboardingData?.pendingIntroMessage || '';

      // Open modal for editing
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'edit_intro_modal',
          private_metadata: JSON.stringify({ partnerId, channelId: body.channel.id, messageTs: body.message.ts }),
          title: {
            type: 'plain_text',
            text: 'Edit Introduction',
          },
          submit: {
            type: 'plain_text',
            text: 'Post Introduction',
          },
          close: {
            type: 'plain_text',
            text: 'Cancel',
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Edit your introduction below. This will be posted to #introductions.',
              },
            },
            {
              type: 'input',
              block_id: 'intro_text',
              element: {
                type: 'plain_text_input',
                action_id: 'input',
                multiline: true,
                initial_value: introMessage,
                placeholder: {
                  type: 'plain_text',
                  text: 'Write your introduction...',
                },
              },
              label: {
                type: 'plain_text',
                text: 'Your Introduction',
              },
            },
          ],
        },
      });

      logger.info({ userId }, 'Partner opened intro edit modal');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error opening intro edit modal');
    }
  });

  // Handle "Skip" intro button
  app.action('partner_skip_intro', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const channelId = body.channel.id;

    try {
      // Mark onboarding as complete even without intro
      await db.partners.markOnboardingComplete(userId);

      // Update the DM message
      await client.chat.update({
        channel: channelId,
        ts: body.message.ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👍 *No problem!* You can always introduce yourself later using \`/partnerbot intro\`.\n\nWelcome to the community! Feel free to explore the channels.`,
            },
          },
        ],
        text: 'Introduction skipped',
      });

      await logToSlack('info', `Partner skipped introduction`, {
        user: `<@${userId}>`,
      });

      logger.info({ userId }, 'Partner skipped introduction');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error skipping intro');
    }
  });

  // Handle edit intro modal submission
  app.view('edit_intro_modal', async ({ ack, body, view, client }) => {
    await ack();

    const userId = body.user.id;
    const metadata = JSON.parse(view.private_metadata);
    const editedIntro = view.state.values.intro_text.input.value;

    try {
      // Get partner data
      const partner = await db.partners.findBySlackId(userId);
      if (!partner) {
        throw new Error('Partner not found');
      }

      // Post to #introductions with edited message
      const emoji = PARTNER_TYPE_EMOJI[partner.partnerType] || '👋';
      const introBlocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Welcome <@${userId}>!*`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: editedIntro,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${partner.firm} • ${partner.partnerType.replace('_', ' ')}`,
            },
          ],
        },
      ];

      if (config.channels.introductions) {
        await slackService.postToChannel(
          client,
          config.channels.introductions,
          introBlocks,
          `Welcome ${partner.name} from ${partner.firm}!`
        );
      }

      // Mark onboarding as complete
      await db.partners.markOnboardingComplete(userId);

      // Update the original DM message
      await client.chat.update({
        channel: metadata.channelId,
        ts: metadata.messageTs,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Your introduction has been posted to #introductions!*\n\nWelcome to the community! Feel free to explore the channels and connect with other partners.`,
            },
          },
        ],
        text: 'Introduction posted!',
      });

      // Log to #bot-admin
      if (config.channels.botAdmin) {
        await slackService.postToChannel(
          client,
          config.channels.botAdmin,
          [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *New Partner Introduced*\n\n<@${userId}> (${partner.firm}) posted their introduction to #introductions.`,
              },
            },
          ],
          `New partner: ${partner.name}`
        );
      }

      await logToSlack('success', `Partner posted edited introduction`, {
        user: `<@${userId}>`,
        firm: partner.firm,
      });

      logger.info({ userId }, 'Partner posted edited introduction');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error posting edited introduction');
    }
  });
}

module.exports = {
  registerOnboardingActions,
};

