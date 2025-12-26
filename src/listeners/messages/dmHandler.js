const config = require('../../config');
const db = require('../../services/database');
const openaiService = require('../../services/openai');
const slackService = require('../../services/slack');
const { 
  buildTextBlocks, 
} = require('../../templates/welcomeDM');
const { logger, logToSlack, logActivity } = require('../../utils/logger');
const { parsePartnerType, parseSectors, parseStages } = require('../../utils/validators');

/**
 * Handle DM messages for onboarding conversation
 */
async function handleDM(app) {
  app.message(async ({ message, client, say }) => {
    // Only handle DMs (channel type 'im')
    if (message.channel_type !== 'im') {
      return;
    }

    // Ignore bot messages
    if (message.bot_id || message.subtype) {
      return;
    }

    const userId = message.user;
    const userMessage = message.text;

    try {
      // Check for active onboarding conversation
      let conversation = await db.conversations.findActive(userId);

      if (!conversation) {
        // Check if user said "ready" to start onboarding
        if (userMessage.toLowerCase().includes('ready') || userMessage.toLowerCase().includes('start')) {
          // Start new onboarding
          conversation = await db.conversations.create(userId);
          
          const displayName = await slackService.getUserDisplayName(client, userId);
          
          // Get initial AI response
          const aiResponse = await openaiService.generateOnboardingResponse(
            [],
            `Hi, I'm ${displayName} and I'm ready to start the onboarding.`,
            displayName
          );

          // Save messages
          await db.conversations.addMessage(conversation.id, 'user', `Hi, I'm ${displayName} and I'm ready to start the onboarding.`);
          await db.conversations.addMessage(conversation.id, 'assistant', aiResponse.message);

          await say({
            blocks: buildTextBlocks(aiResponse.message),
            text: aiResponse.message,
          });

          logger.info({ userId }, 'Started onboarding conversation via DM');
          return;
        }

        // No active conversation and not starting one
        await say({
          blocks: buildTextBlocks(
            `Hi! 👋 I'm PartnerBot. If you'd like to complete your onboarding, just say "ready" or use the \`/partnerbot intro\` command.`
          ),
          text: 'Hi! I\'m PartnerBot.',
        });
        return;
      }

      // Continue existing conversation
      const conversationHistory = conversation.messages || [];
      
      // Add user message to history
      await db.conversations.addMessage(conversation.id, 'user', userMessage);
      
      // Get AI response
      const displayName = await slackService.getUserDisplayName(client, userId);
      const aiResponse = await openaiService.generateOnboardingResponse(
        conversationHistory,
        userMessage,
        displayName
      );

      // Save assistant message
      await db.conversations.addMessage(conversation.id, 'assistant', aiResponse.message);

      // Check if conversation is complete
      if (aiResponse.type === 'complete' && aiResponse.extractedData) {
        await handleOnboardingComplete(
          client,
          userId,
          conversation,
          aiResponse.extractedData,
          displayName,
          say
        );
      } else {
        // Continue conversation
        await say({
          blocks: buildTextBlocks(aiResponse.message),
          text: aiResponse.message,
        });
      }
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error handling DM');
      await say({
        blocks: buildTextBlocks(
          `Sorry, I encountered an issue. Please try again or contact an admin if this persists.`
        ),
        text: 'Sorry, I encountered an issue.',
      });
    }
  });
}

/**
 * Handle completion of onboarding conversation
 */
async function handleOnboardingComplete(client, userId, conversation, extractedData, displayName, say) {
  try {
    console.log('=== ONBOARDING COMPLETION STARTED ===');
    console.log('User ID:', userId);
    console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
    
    // Parse and normalize data
    const partnerType = parsePartnerType(extractedData.partner_type);
    const sectors = parseSectors(extractedData.sectors);
    const stageFocus = parseStages(extractedData.stage_focus);
    console.log('Parsed - Type:', partnerType, 'Sectors:', sectors);

    // Get user email
    const email = await slackService.getUserEmail(client, userId);

    // Create or update partner record
    let partner = await db.partners.findBySlackId(userId);
    
    const partnerData = {
      slackHandle: displayName,
      name: extractedData.name || displayName,
      email,
      firm: extractedData.firm || 'Unknown',
      role: extractedData.role,
      partnerType,
      sectors,
      stageFocus,
      checkSize: extractedData.check_size,
      geographicFocus: extractedData.geographic_focus || [],
      idealFounderProfile: extractedData.ideal_founder_profile,
      engagementPreferences: extractedData.engagement_preferences || [],
      contributionOffers: extractedData.contribution_offers || [],
      goalsFromCommunity: extractedData.goals_from_community,
      linkedinUrl: extractedData.linkedin_url,
      onboardingData: extractedData,
    };

    if (partner) {
      console.log('Updating existing partner...');
      partner = await db.partners.update(userId, partnerData);
    } else {
      console.log('Creating new partner...');
      partner = await db.partners.create({
        slackUserId: userId,
        ...partnerData,
      });
    }
    console.log('Partner saved with ID:', partner.id);

    // Mark conversation as complete
    console.log('Marking conversation complete...');
    await db.conversations.complete(conversation.id, partner.id, extractedData);
    console.log('Conversation marked complete');

    // Generate introduction message
    console.log('Generating intro message...');
    const introMessage = extractedData.suggested_intro_message || 
      await openaiService.generateIntroMessage(partnerData);
    console.log('Intro message generated');

    // Store intro message in database for later retrieval
    await db.partners.update(userId, {
      onboardingData: {
        ...extractedData,
        pendingIntroMessage: introMessage,
      },
    });

    // Ask partner if they want to introduce themselves
    console.log('Asking partner about introduction...');
    await say({
      blocks: buildIntroPromptBlocks(displayName, introMessage, partner.id),
      text: 'Would you like to introduce yourself to the community?',
    });
    console.log('Intro prompt sent');

    // Log activity
    await logActivity(
      db.prisma,
      'onboarding_completed',
      userId,
      'partner',
      partner.id,
      { partnerType, firm: partner.firm }
    );

    await logToSlack('success', `Onboarding completed for partner`, {
      user: `<@${userId}>`,
      firm: partner.firm,
      type: partnerType,
    });

    logger.info({ userId, partnerId: partner.id }, 'Onboarding completed successfully');
  } catch (error) {
    logger.error({ error: error.message, userId }, 'Error completing onboarding');
    await say({
      blocks: buildTextBlocks(
        `Thanks for the info! There was a small issue saving your data, but our team will follow up to complete your setup.`
      ),
      text: 'Thanks! Our team will follow up.',
    });
  }
}

/**
 * Build blocks to ask partner about their introduction
 */
function buildIntroPromptBlocks(displayName, introMessage, partnerId) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🎉 *Thanks for completing your onboarding, ${displayName}!*\n\nWould you like to introduce yourself to the community in our #introductions channel?`,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Here's a draft introduction based on our conversation:*`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `>${introMessage.split('\n').join('\n>')}`,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Post Introduction',
            emoji: true,
          },
          style: 'primary',
          action_id: 'partner_approve_intro',
          value: partnerId,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✏️ Edit First',
            emoji: true,
          },
          action_id: 'partner_edit_intro',
          value: partnerId,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⏭️ Skip',
            emoji: true,
          },
          action_id: 'partner_skip_intro',
          value: partnerId,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '_You can always introduce yourself later using `/partnerbot intro`_',
        },
      ],
    },
  ];
}

module.exports = {
  handleDM,
};

