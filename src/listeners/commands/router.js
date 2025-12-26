const { isAdmin } = require('../../utils/validators');
const config = require('../../config');
const db = require('../../services/database');
const slackService = require('../../services/slack');
const openaiService = require('../../services/openai');
const { buildIntroApprovalBlocks } = require('../../templates/adminApproval');
const { logger } = require('../../utils/logger');

/**
 * Central command router for /partnerbot
 */
function registerCommandRouter(app) {
  app.command('/partnerbot', async ({ command, ack, respond, client }) => {
    await ack();

    const args = command.text.trim();
    const argsLower = args.toLowerCase();
    const userId = command.user_id;
    const userIsAdmin = isAdmin(userId);

    // Route based on subcommand
    if (argsLower === '' || argsLower === 'help') {
      await showHelp(respond, userIsAdmin);
    } else if (argsLower === 'test-onboarding') {
      await testOnboarding(respond, client, userId, userIsAdmin);
    } else if (argsLower === 'test-intro-flow') {
      await testIntroFlow(respond, client, userId, userIsAdmin);
    } else if (argsLower === 'announce-event') {
      await announceEvent(respond, client, command, userIsAdmin);
    } else if (argsLower.startsWith('add-highlight')) {
      await addHighlight(respond, args, userId, userIsAdmin);
    } else if (argsLower === 'send-digest' || argsLower === 'preview-digest') {
      await handleDigest(respond, client, argsLower, userId, userIsAdmin);
    } else {
      await respond({
        text: `Unknown command: \`${args}\`. Use \`/partnerbot help\` to see available commands.`,
        response_type: 'ephemeral',
      });
    }
  });
}

/**
 * Show help message
 */
async function showHelp(respond, userIsAdmin) {
  const partnerCommands = `
*Partner Commands:*
• \`/partnerbot help\` — Show this help message
• \`/partnerbot intro\` — Start or redo onboarding survey
• \`/partnerbot update-profile\` — Update your preferences
• \`/partnerbot events\` — See upcoming events
  `;

  const adminCommands = `
*Admin Commands:*
• \`/partnerbot announce-event\` — Create personalized event outreach
• \`/partnerbot send-digest\` — Generate bi-weekly digest
• \`/partnerbot preview-digest\` — Preview digest without sending
• \`/partnerbot add-highlight <text>\` — Add highlight to next digest
• \`/partnerbot test-onboarding\` — Test components (DB, OpenAI, Slack)
• \`/partnerbot test-intro-flow\` — Test intro approval buttons (sends DM to you)
  `;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🤖 PartnerBot Help',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: partnerCommands,
      },
    },
  ];

  if (userIsAdmin) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: adminCommands,
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: 'Need help? Contact an admin or reply to any bot message.',
      },
    ],
  });

  await respond({
    blocks,
    text: 'PartnerBot Help',
    response_type: 'ephemeral',
  });
}

/**
 * Test onboarding workflow
 */
async function testOnboarding(respond, client, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  await respond({
    text: '🧪 Starting onboarding test... Check Railway logs for detailed output.',
    response_type: 'ephemeral',
  });

  try {
    console.log('=== TEST ONBOARDING STARTED ===');
    console.log('Admin user:', userId);

    // Step 1: Test database connection
    console.log('Step 1: Testing database connection...');
    const dbHealthy = await db.healthCheck();
    console.log('Database healthy:', dbHealthy);

    if (!dbHealthy) {
      await respond({ text: '❌ Step 1 FAILED: Database connection failed', response_type: 'ephemeral' });
      return;
    }

    // Step 2: Test OpenAI connection
    console.log('Step 2: Testing OpenAI connection...');
    console.log('OpenAI API Key configured:', !!config.openai.apiKey);
    console.log('OpenAI Model:', config.openai.model);
    
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
      console.error('OpenAI Full Error:', openaiError);
      await respond({
        text: `❌ Step 2 FAILED: OpenAI API Error: ${openaiError.message}`,
        response_type: 'ephemeral',
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

    let testPartner;
    try {
      testPartner = await db.partners.create(testPartnerData);
      console.log('Test partner created with ID:', testPartner.id);
    } catch (dbError) {
      console.error('Database create error:', dbError.message);
      await respond({
        text: `❌ Step 3 FAILED: Database create error: ${dbError.message}`,
        response_type: 'ephemeral',
      });
      return;
    }

    // Step 4: Test posting to #bot-admin
    console.log('Step 4: Testing post to #bot-admin...');
    console.log('Bot Admin Channel ID:', config.channels.botAdmin);

    if (config.channels.botAdmin) {
      try {
        const testIntroMessage = `👋 Welcome *Test Partner* from *Test Capital*!\n\nThis is a TEST message to verify the bot can post to #bot-admin.\n\n_This will be auto-deleted._`;

        const approvalBlocks = buildIntroApprovalBlocks(testPartner, testIntroMessage, 'test-conversation-id');

        const result = await slackService.postToChannel(
          client,
          config.channels.botAdmin,
          approvalBlocks,
          'TEST: Partner introduction pending approval'
        );
        console.log('Successfully posted to #bot-admin! ts:', result.ts);
      } catch (slackError) {
        console.error('Slack post error:', slackError.message);
        console.error('Full error:', JSON.stringify(slackError.data || slackError, null, 2));
        await respond({
          text: `❌ Step 4 FAILED: Cannot post to #bot-admin: ${slackError.message}\n\nMake sure the bot is invited to #bot-admin.`,
          response_type: 'ephemeral',
        });
        // Still clean up the test partner
        await db.prisma.partner.delete({ where: { id: testPartner.id } });
        return;
      }
    } else {
      console.log('CHANNEL_BOT_ADMIN not configured - skipping channel test');
      await respond({
        text: '⚠️ Step 4 SKIPPED: CHANNEL_BOT_ADMIN not configured in environment variables',
        response_type: 'ephemeral',
      });
    }

    // Step 5: Clean up test partner
    console.log('Step 5: Cleaning up test data...');
    await db.prisma.partner.delete({ where: { id: testPartner.id } });
    console.log('Test partner deleted');

    console.log('=== TEST ONBOARDING COMPLETED SUCCESSFULLY ===');

    await respond({
      text: '✅ *Onboarding test completed successfully!*\n\n• Database: ✅\n• OpenAI: ✅\n• Partner creation: ✅\n• Post to #bot-admin: ✅\n\nCheck #bot-admin for the test approval card.',
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
}

/**
 * Test full intro approval flow - creates a partner record for YOU and sends the intro prompt
 */
async function testIntroFlow(respond, client, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  console.log('=== TEST INTRO FLOW STARTED ===');
  console.log('User ID:', userId);

  try {
    // Get user info
    const displayName = await slackService.getUserDisplayName(client, userId);
    const email = await slackService.getUserEmail(client, userId);
    console.log('Display name:', displayName);

    // Check if partner already exists
    let partner = await db.partners.findBySlackId(userId);
    
    const testIntroMessage = `👋 Hi everyone! I'm ${displayName} from *Test Ventures*.\n\nI'm a VC partner focused on *fintech* and *AI/ML* startups at the seed and Series A stage. I typically write checks between $500K - $2M.\n\nI'm excited to connect with founders building the future of financial infrastructure. Previously, I was a founder myself (acquired in 2020).\n\n*Looking for:* Technical founders with deep domain expertise\n*I can help with:* Fundraising strategy, GTM, and intro to enterprise customers`;

    const partnerData = {
      slackHandle: displayName,
      name: displayName,
      email: email,
      firm: 'Test Ventures',
      role: 'Partner',
      partnerType: 'VC',
      sectors: ['fintech', 'ai-ml'],
      stageFocus: ['seed', 'series-a'],
      checkSize: '$500K - $2M',
      geographicFocus: ['US'],
      idealFounderProfile: 'Technical founders with deep domain expertise',
      engagementPreferences: ['pitch events', 'office hours'],
      contributionOffers: ['mentorship', 'funding'],
      goalsFromCommunity: 'Find great founders',
      onboardingData: {
        test: true,
        pendingIntroMessage: testIntroMessage,
        suggested_intro_message: testIntroMessage,
      },
    };

    if (partner) {
      console.log('Updating existing partner record...');
      partner = await db.partners.update(userId, partnerData);
    } else {
      console.log('Creating new partner record...');
      partner = await db.partners.create({
        slackUserId: userId,
        ...partnerData,
      });
    }
    console.log('Partner saved with ID:', partner.id);

    // Send the intro prompt directly to the user via DM
    console.log('Opening DM with user...');
    const dmResult = await client.conversations.open({ users: userId });
    const dmChannel = dmResult.channel.id;
    console.log('DM channel:', dmChannel);

    // Build the intro prompt blocks (same as in dmHandler)
    const introPromptBlocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🧪 *TEST MODE*\n\n🎉 *Thanks for testing the intro flow, ${displayName}!*\n\nWould you like to introduce yourself to the community in our #introductions channel?`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Here's a draft introduction:*`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `>${testIntroMessage.split('\n').join('\n>')}`,
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
            value: partner.id,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✏️ Edit First',
              emoji: true,
            },
            action_id: 'partner_edit_intro',
            value: partner.id,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '⏭️ Skip',
              emoji: true,
            },
            action_id: 'partner_skip_intro',
            value: partner.id,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_This is a TEST. Click any button to test the flow._',
          },
        ],
      },
    ];

    await client.chat.postMessage({
      channel: dmChannel,
      blocks: introPromptBlocks,
      text: 'Test: Would you like to introduce yourself?',
    });

    console.log('=== TEST INTRO FLOW - DM SENT ===');

    await respond({
      text: '✅ *Test intro flow started!*\n\nCheck your DMs - you should see a message with the intro buttons.\n\nClick "Post Introduction" to test posting to #introductions.',
      response_type: 'ephemeral',
    });

  } catch (error) {
    console.error('=== TEST INTRO FLOW FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    await respond({
      text: `❌ Test failed: ${error.message}\n\nCheck Railway logs for details.`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Announce event (opens modal)
 */
async function announceEvent(respond, client, command, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'event_announcement_modal',
        title: {
          type: 'plain_text',
          text: '📅 New Event',
        },
        submit: {
          type: 'plain_text',
          text: 'Generate Outreach',
        },
        close: {
          type: 'plain_text',
          text: 'Cancel',
        },
        blocks: [
          {
            type: 'input',
            block_id: 'event_name',
            element: {
              type: 'plain_text_input',
              action_id: 'input',
              placeholder: { type: 'plain_text', text: 'e.g., Fintech Pitch Night' },
            },
            label: { type: 'plain_text', text: 'Event Name' },
          },
          {
            type: 'input',
            block_id: 'event_date',
            element: {
              type: 'plain_text_input',
              action_id: 'input',
              placeholder: { type: 'plain_text', text: 'e.g., Thursday, Jan 15 at 6:00 PM EST' },
            },
            label: { type: 'plain_text', text: 'Date & Time' },
          },
          {
            type: 'input',
            block_id: 'event_location',
            element: {
              type: 'plain_text_input',
              action_id: 'input',
              placeholder: { type: 'plain_text', text: 'e.g., Zoom link or venue address' },
            },
            label: { type: 'plain_text', text: 'Location/Link' },
          },
          {
            type: 'input',
            block_id: 'event_type',
            element: {
              type: 'static_select',
              action_id: 'select',
              options: [
                { text: { type: 'plain_text', text: 'Pitch Night' }, value: 'pitch_night' },
                { text: { type: 'plain_text', text: 'Demo Day' }, value: 'demo_day' },
                { text: { type: 'plain_text', text: 'Office Hours' }, value: 'office_hours' },
                { text: { type: 'plain_text', text: 'Networking Event' }, value: 'networking_event' },
                { text: { type: 'plain_text', text: 'Workshop' }, value: 'workshop' },
                { text: { type: 'plain_text', text: 'Other' }, value: 'other' },
              ],
            },
            label: { type: 'plain_text', text: 'Event Type' },
          },
          {
            type: 'input',
            block_id: 'event_description',
            element: {
              type: 'plain_text_input',
              action_id: 'input',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Describe the event...' },
            },
            label: { type: 'plain_text', text: 'Description' },
          },
          {
            type: 'input',
            block_id: 'rsvp_link',
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'input',
              placeholder: { type: 'plain_text', text: 'https://...' },
            },
            label: { type: 'plain_text', text: 'RSVP Link (optional)' },
          },
        ],
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to open event modal');
    await respond({
      text: `❌ Failed to open modal: ${error.message}`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Add highlight to digest
 */
async function addHighlight(respond, args, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  const highlightText = args.replace(/^add-highlight\s*/i, '').trim();

  if (!highlightText) {
    await respond({
      text: 'Usage: `/partnerbot add-highlight <your highlight text>`',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    await db.digestItems.create({
      itemType: 'highlight',
      content: { text: highlightText },
      createdBy: userId,
    });

    await respond({
      text: `✅ Highlight added to next digest:\n> ${highlightText}`,
      response_type: 'ephemeral',
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to add highlight');
    await respond({
      text: `❌ Failed to add highlight: ${error.message}`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Handle digest commands
 */
async function handleDigest(respond, client, command, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  await respond({
    text: `📊 Digest generation coming soon! Use \`/partnerbot add-highlight <text>\` to add content.`,
    response_type: 'ephemeral',
  });
}

module.exports = {
  registerCommandRouter,
};

