const config = require('../../config');
const db = require('../../services/database');
const slackService = require('../../services/slack');
const openaiService = require('../../services/openai');
const { buildIntroApprovalBlocks } = require('../../templates/adminApproval');
const { logger } = require('../../utils/logger');
const { isAdmin } = require('../../utils/validators');

/**
 * Register test onboarding command
 * Usage: /partnerbot test-onboarding
 */
function registerTestOnboardingCommand(app) {
  app.command('/partnerbot', async ({ command, ack, respond, client }) => {
    const args = command.text.trim().toLowerCase();
    
    if (args !== 'test-onboarding') {
      return; // Let other handlers process
    }

    await ack();

    const userId = command.user_id;

    if (!isAdmin(userId)) {
      await respond({
        text: '⚠️ This command is only available to admins.',
        response_type: 'ephemeral',
      });
      return;
    }

    await respond({
      text: '🧪 Starting onboarding test... Check the logs for detailed output.',
      response_type: 'ephemeral',
    });

    try {
      console.log('=== TEST ONBOARDING STARTED ===');
      
      // Step 1: Test database connection
      console.log('Step 1: Testing database connection...');
      const dbHealthy = await db.healthCheck();
      console.log('Database healthy:', dbHealthy);
      
      if (!dbHealthy) {
        await respond({ text: '❌ Database connection failed', response_type: 'ephemeral' });
        return;
      }

      // Step 2: Test OpenAI connection
      console.log('Step 2: Testing OpenAI connection...');
      try {
        const testResponse = await openaiService.generateOnboardingResponse(
          [],
          'Hi, I am a test VC partner from Test Capital',
          'Test User'
        );
        console.log('OpenAI response type:', testResponse.type);
        console.log('OpenAI response preview:', testResponse.message?.substring(0, 100));
      } catch (openaiError) {
        console.error('OpenAI Error:', openaiError.message);
        await respond({ 
          text: `❌ OpenAI API Error: ${openaiError.message}`, 
          response_type: 'ephemeral' 
        });
        return;
      }

      // Step 3: Test creating a partner record
      console.log('Step 3: Testing partner creation...');
      const testPartnerData = {
        slackUserId: `TEST_${Date.now()}`,
        slackHandle: 'test-user',
        name: 'Test Partner',
        email: 'test@example.com',
        firm: 'Test Capital',
        role: 'Partner',
        partnerType: 'VC',
        sectors: ['fintech', 'ai-ml'],
        stageFocus: ['seed', 'series-a'],
        checkSize: '$500K - $2M',
        geographicFocus: ['US'],
        idealFounderProfile: 'Technical founders in fintech',
        engagementPreferences: ['pitch events', 'office hours'],
        contributionOffers: ['mentorship', 'funding'],
        goalsFromCommunity: 'Find great founders',
        onboardingData: { test: true },
      };

      const testPartner = await db.partners.create(testPartnerData);
      console.log('Test partner created with ID:', testPartner.id);

      // Step 4: Test posting to #bot-admin
      console.log('Step 4: Testing post to #bot-admin...');
      console.log('Bot Admin Channel ID:', config.channels.botAdmin);
      
      if (config.channels.botAdmin) {
        const testIntroMessage = `👋 Welcome *Test Partner* from *Test Capital*!\n\nThis is a test introduction message to verify the bot can post to #bot-admin.`;
        
        const approvalBlocks = buildIntroApprovalBlocks(testPartner, testIntroMessage, 'test-conversation-id');
        
        await slackService.postToChannel(
          client,
          config.channels.botAdmin,
          approvalBlocks,
          'Test partner introduction pending approval'
        );
        console.log('Successfully posted to #bot-admin!');
      } else {
        console.log('CHANNEL_BOT_ADMIN not configured');
        await respond({ 
          text: '⚠️ CHANNEL_BOT_ADMIN not configured in environment variables', 
          response_type: 'ephemeral' 
        });
      }

      // Step 5: Clean up test partner
      console.log('Step 5: Cleaning up test data...');
      await db.prisma.partner.delete({ where: { id: testPartner.id } });
      console.log('Test partner deleted');

      console.log('=== TEST ONBOARDING COMPLETED SUCCESSFULLY ===');
      
      await respond({
        text: '✅ Onboarding test completed successfully!\n\n• Database: ✅\n• OpenAI: ✅\n• Partner creation: ✅\n• Post to #bot-admin: ✅\n\nCheck #bot-admin for the test approval card.',
        response_type: 'ephemeral',
      });

    } catch (error) {
      console.error('=== TEST ONBOARDING FAILED ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      
      await respond({
        text: `❌ Test failed: ${error.message}\n\nCheck Railway logs for details.`,
        response_type: 'ephemeral',
      });
    }
  });
}

module.exports = {
  registerTestOnboardingCommand,
};

