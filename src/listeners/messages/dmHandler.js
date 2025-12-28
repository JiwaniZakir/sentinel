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
        
        // Notify user that research is starting
        await say({
          blocks: buildTextBlocks(
            `✨ Perfect! I'm gathering some information about you in the background to make your introduction extra special. This won't slow down our conversation - we can keep chatting!`
          ),
          text: 'Gathering information in the background...',
        });
        
        // Start research in background (don't block the conversation)
        // Pass any name/firm we have from the conversation so far
        const existingPartner = await db.partners.findBySlackId(userId);
        triggerResearchAsync(
          userId, 
          linkedinUrl, 
          conversation.id,
          existingPartner?.name,
          existingPartner?.firm
        );
        
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

    // Trigger research if it hasn't been started yet
    if (config.research.enabled && !partner.researchStatus) {
      console.log('Research not started yet, triggering now...');
      const linkedinUrl = extractedData.linkedin_url || partner.linkedinUrl;
      
      if (linkedinUrl || (partner.name && partner.firm)) {
        // Start research in background (don't wait for it)
        triggerResearchAsync(userId, linkedinUrl, conversation.id, partner.name, partner.firm)
          .catch(err => console.error('Background research failed:', err.message));
        
        console.log('Research triggered with:', { linkedinUrl, name: partner.name, firm: partner.firm });
      } else {
        console.log('Insufficient data for research (need LinkedIn URL or name+firm)');
      }
    }

    // Generate introduction message with research context if available
    console.log('Generating intro message...');
    let introMessage = extractedData.suggested_intro_message;
    
    // Check if we have PersonProfile (from full pipeline)
    let personProfile = null;
    try {
      personProfile = await db.prisma.personProfile.findUnique({
        where: { partnerId: partner.id },
      });
      console.log('PersonProfile found:', !!personProfile);
    } catch (e) {
      console.log('No PersonProfile found');
    }
    
    // Generate rich intro if we have profile data (from full pipeline)
    if (personProfile && !introMessage) {
      console.log('Using PersonProfile for RICH intro generation (all 5 stages completed)');
      try {
        introMessage = await research.intro.generateRichIntro(partner.id, {
          style: 'warm',
          maxLength: 250,
        });
        console.log('✅ Rich intro generated with verified facts and onboarding data');
      } catch (introError) {
        console.error('Rich intro generation failed:', introError.message);
        // Fall through to fallback methods
      }
    }
    
    // Fallback 1: Use old research summary if pipeline hasn't completed yet
    if (!introMessage && partner.researchSummary) {
      console.log('Using research summary for intro generation (fallback)');
      const researchContext = research.generateAIContext(partner.researchSummary);
      introMessage = await openaiService.generateIntroMessage(partnerData, researchContext);
    }
    
    // Fallback 2: No research available, use onboarding data only
    if (!introMessage) {
      console.log('Generating intro from onboarding data only (no research)');
      introMessage = await openaiService.generateIntroMessage(partnerData);
    }
    
    console.log('Intro message generated, length:', introMessage?.length);

    // Store intro message in database for later retrieval
    await db.partners.update(userId, {
      onboardingData: {
        ...extractedData,
        pendingIntroMessage: introMessage,
      },
    });

    // Build research quality indicator
    let researchIndicator = '';
    if (personProfile) {
      const qualityPercent = (personProfile.dataQualityScore * 100).toFixed(0);
      const sourcesUsed = personProfile.sourcesUsed?.length || 0;
      researchIndicator = `\n\n_🔬 Research Quality: ${qualityPercent}% (${sourcesUsed} sources analyzed)_`;
    } else if (partner.researchStatus === 'IN_PROGRESS') {
      researchIndicator = `\n\n_⏳ Research still running in background..._`;
    } else if (partner.researchStatus === 'FAILED') {
      researchIndicator = `\n\n_ℹ️ Using your onboarding responses for your introduction_`;
    }

    // Ask partner if they want to introduce themselves
    console.log('Asking partner about introduction...');
    await say({
      blocks: buildIntroPromptBlocks(displayName, introMessage, partner.id, researchIndicator),
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
function buildIntroPromptBlocks(displayName, introMessage, partnerId, researchIndicator = '') {
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
        text: `*Here's a draft introduction based on our conversation:*${researchIndicator}`,
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
 * Extract Twitter username from conversation or onboarding data
 */
function extractTwitterUsername(partner, conversationData) {
  // Check onboarding data
  if (partner?.onboardingData) {
    const onboardingStr = JSON.stringify(partner.onboardingData).toLowerCase();
    const twitterMatch = onboardingStr.match(/@([a-zA-Z0-9_]+)|twitter\.com\/([a-zA-Z0-9_]+)|x\.com\/([a-zA-Z0-9_]+)/);
    if (twitterMatch) return twitterMatch[1] || twitterMatch[2] || twitterMatch[3];
  }
  
  // Check conversation messages
  if (conversationData?.messages) {
    const messagesStr = JSON.stringify(conversationData.messages).toLowerCase();
    const twitterMatch = messagesStr.match(/@([a-zA-Z0-9_]+)|twitter\.com\/([a-zA-Z0-9_]+)|x\.com\/([a-zA-Z0-9_]+)/);
    if (twitterMatch) return twitterMatch[1] || twitterMatch[2] || twitterMatch[3];
  }
  
  return null;
}

/**
 * Trigger FULL research pipeline in the background without blocking the conversation
 * 
 * Runs all 5 stages:
 * 1. Data Collection (LinkedIn, Perplexity, Tavily, Twitter, Wikipedia)
 * 2. Citation Crawling (follow Perplexity links)
 * 3. Quality Scoring & Fact Checking
 * 4. Profile Aggregation (PersonProfile, FirmProfile)
 * 5. Skip intro generation (will be done after onboarding completes)
 */
async function triggerResearchAsync(userId, linkedinUrl, conversationId, name = null, firm = null) {
  try {
    console.log('=== TRIGGERING FULL RESEARCH PIPELINE (ASYNC) ===');
    console.log('User:', userId);
    console.log('LinkedIn:', linkedinUrl || 'Not provided');
    console.log('Name:', name || 'Not provided');
    console.log('Firm:', firm || 'Not provided');
    
    // First, create or get the partner record
    let partner = await db.partners.findBySlackId(userId);
    
    if (!partner) {
      // Create a placeholder partner record for research
      partner = await db.partners.create({
        slackUserId: userId,
        name: name || 'Pending',
        firm: firm || 'Pending',
        partnerType: 'OTHER',
        linkedinUrl,
        researchStatus: 'PENDING',
      });
    } else {
      // Update with LinkedIn URL and research status
      const updateData = { researchStatus: 'PENDING' };
      if (linkedinUrl) updateData.linkedinUrl = linkedinUrl;
      if (name && !partner.name) updateData.name = name;
      if (firm && !partner.firm) updateData.firm = firm;
      
      await db.partners.update(userId, updateData);
    }
    
    // Try to extract Twitter username from conversation
    const conversation = await db.conversations.findById(conversationId);
    const twitterUsername = extractTwitterUsername(partner, conversation);
    if (twitterUsername) {
      console.log('Twitter username detected:', twitterUsername);
    }
    
    // Choose between full pipeline or quick research
    const useFullPipeline = config.research.useFullPipeline !== false;
    console.log('Research mode:', useFullPipeline ? 'FULL PIPELINE (5 stages)' : 'QUICK (Stage 1 only)');
    
    if (useFullPipeline) {
      // Start the FULL research pipeline (all 5 stages)
      console.log('Starting full 5-stage pipeline...');
      const pipelineResult = await research.runFullPipeline(partner.id, linkedinUrl, {
        name: name || partner.name, // Use provided name or partner name
        firm: firm || partner.firm, // Use provided firm or partner firm
        partnerType: partner.partnerType || 'OTHER',
        generateIntro: false, // Don't generate intro yet - will use onboarding data
        crawlCitations: true, // Enable citation crawling
        twitterUsername, // Pass Twitter username if found
      });
      
      console.log('Pipeline completed:', pipelineResult.success ? 'SUCCESS' : 'FAILED');
      console.log('Stages completed:', Object.keys(pipelineResult.stages || {}).length);
      
      if (pipelineResult.success) {
        console.log('✅ Full pipeline successful');
        console.log('Quality score:', (pipelineResult.qualityScore * 100).toFixed(0) + '%');
        console.log('Sources used:', pipelineResult.stages.dataCollection?.sourcesUsed?.join(', '));
        
        // PersonProfile and FirmProfile are already created in Stage 4
        // Partner record is already updated with real name/firm in Stage 4
        // Just confirm the research is complete
        await db.partners.update(userId, {
          researchStatus: 'SUCCESS',
          researchCompletedAt: new Date(),
        });
        
        console.log('Partner marked with research complete');
        
        // Log to admin channel
        await logToSlack('success', `Research pipeline completed for new partner`, {
          user: `<@${userId}>`,
          quality: (pipelineResult.qualityScore * 100).toFixed(0) + '%',
          sources: pipelineResult.stages.dataCollection?.sourcesUsed?.length || 0,
          duration: ((pipelineResult.totalTime || 0) / 1000).toFixed(1) + 's',
        });
      } else {
        console.log('❌ Pipeline failed:', pipelineResult.error);
        await db.partners.update(userId, {
          researchStatus: 'FAILED',
        });
      }
    } else {
      // Quick research (Stage 1 only) - legacy mode
      console.log('Starting quick research (Stage 1 only)...');
      const researchResult = await research.startResearch(partner.id, linkedinUrl, {
        name: name || partner.name, // Use provided name or partner name
        firm: firm || partner.firm, // Use provided firm or partner firm
        skipLinkedIn: !config.research.linkedin.email,
      });
      
      console.log('Research completed:', researchResult.success ? 'SUCCESS' : 'FAILED');
      
      if (researchResult.success && researchResult.summary) {
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
    }
    
  } catch (error) {
    console.error('Async research error:', error.message);
    logger.error({ error: error.message, userId, stack: error.stack }, 'Background research failed');
    
    // Mark as failed but don't break onboarding
    try {
      await db.partners.update(userId, {
        researchStatus: 'FAILED',
      });
    } catch (e) {}
  }
}

module.exports = {
  handleDM,
};

