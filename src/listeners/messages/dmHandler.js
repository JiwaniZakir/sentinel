const config = require('../../config');
const db = require('../../services/database');
const openaiService = require('../../services/openai');
const slackService = require('../../services/slack');
const research = require('../../services/research');
const { 
  buildTextBlocks, 
} = require('../../templates/welcomeDM');
const { logger, logToSlack, logActivity } = require('../../utils/logger');
const { parsePartnerType, parseSectors, parseStages } = require('../../utils/validators');

// Regex to detect LinkedIn URLs
const LINKEDIN_URL_REGEX = /https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_]+\/?/gi;

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
      
      // Check for LinkedIn URL in message and trigger research
      const linkedinMatch = userMessage.match(LINKEDIN_URL_REGEX);
      let researchContext = null;
      
      if (linkedinMatch && config.research.enabled) {
        const linkedinUrl = linkedinMatch[0];
        console.log('LinkedIn URL detected:', linkedinUrl);
        
        // Store LinkedIn URL in conversation data
        await db.conversations.update(conversation.id, {
          extractedData: {
            ...(conversation.extractedData || {}),
            linkedin_url: linkedinUrl,
          },
        });
        
        // Start research in background (don't block the conversation)
        triggerResearchAsync(userId, linkedinUrl, conversation.id);
        
        // Check if we already have research from a previous message
        const existingPartner = await db.partners.findBySlackId(userId);
        if (existingPartner?.researchSummary) {
          researchContext = research.generateAIContext(existingPartner.researchSummary);
        }
      } else {
        // Check for existing research context
        const existingPartner = await db.partners.findBySlackId(userId);
        if (existingPartner?.researchSummary) {
          researchContext = research.generateAIContext(existingPartner.researchSummary);
        }
      }
      
      // Get AI response with research context if available
      const displayName = await slackService.getUserDisplayName(client, userId);
      const aiResponse = await openaiService.generateOnboardingResponse(
        conversationHistory,
        userMessage,
        displayName,
        researchContext
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

    // Generate introduction message with research context if available
    console.log('Generating intro message...');
    let introMessage = extractedData.suggested_intro_message;
    
    // If we have research data, generate a more personalized intro
    if (partner.researchSummary && !introMessage) {
      console.log('Using research data for intro generation');
      const researchContext = research.generateAIContext(partner.researchSummary);
      introMessage = await openaiService.generateIntroMessage(partnerData, researchContext);
    } else if (!introMessage) {
      introMessage = await openaiService.generateIntroMessage(partnerData);
    }
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

/**
 * Trigger research in the background without blocking the conversation
 */
async function triggerResearchAsync(userId, linkedinUrl, conversationId) {
  try {
    console.log('=== TRIGGERING ASYNC RESEARCH ===');
    console.log('User:', userId, 'LinkedIn:', linkedinUrl);
    
    // First, create or get the partner record
    let partner = await db.partners.findBySlackId(userId);
    
    if (!partner) {
      // Create a placeholder partner record for research
      partner = await db.partners.create({
        slackUserId: userId,
        name: 'Pending',
        firm: 'Pending',
        partnerType: 'OTHER',
        linkedinUrl,
        researchStatus: 'PENDING',
      });
    } else {
      // Update with LinkedIn URL
      await db.partners.update(userId, {
        linkedinUrl,
        researchStatus: 'PENDING',
      });
    }
    
    // Start the research pipeline
    const researchResult = await research.startResearch(partner.id, linkedinUrl, {
      skipLinkedIn: !config.research.linkedin.email, // Skip if no LinkedIn credentials
    });
    
    console.log('Research completed:', researchResult.success ? 'SUCCESS' : 'FAILED');
    
    if (researchResult.success && researchResult.summary) {
      // Update partner with research summary
      const profile = researchResult.summary.profile || {};
      await db.partners.update(userId, {
        name: profile.name || partner.name,
        firm: profile.currentCompany || partner.firm,
        role: profile.currentTitle || partner.role,
        researchSummary: researchResult.summary,
        researchStatus: 'SUCCESS',
        researchCompletedAt: new Date(),
      });
      
      console.log('Partner updated with research data');
    }
    
  } catch (error) {
    console.error('Async research error:', error.message);
    logger.error({ error: error.message, userId }, 'Background research failed');
  }
}

module.exports = {
  handleDM,
};

