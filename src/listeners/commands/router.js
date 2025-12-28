const { isAdmin } = require('../../utils/validators');
const config = require('../../config');
const db = require('../../services/database');
const slackService = require('../../services/slack');
const openaiService = require('../../services/openai');
const { buildIntroApprovalBlocks } = require('../../templates/adminApproval');
const { logger } = require('../../utils/logger');
const researchOrchestrator = require('../../services/research/orchestrator');
const linkedinService = require('../../services/research/linkedin');
const tavilyService = require('../../services/research/tavily');
const perplexityService = require('../../services/research/perplexity');
const wikipediaService = require('../../services/research/wikipedia');
const accountPool = require('../../services/research/accountPool');
const sessionManager = require('../../services/research/sessionManager');

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
    } else if (argsLower.startsWith('test-research')) {
      const linkedinUrl = args.replace(/^test-research\s*/i, '').trim() || 'https://www.linkedin.com/in/harris-stolzenberg-44468b78/';
      await testResearch(respond, client, userId, userIsAdmin, linkedinUrl);
    } else if (argsLower.startsWith('test-linkedin')) {
      const linkedinUrl = args.replace(/^test-linkedin\s*/i, '').trim() || 'https://www.linkedin.com/in/harris-stolzenberg-44468b78/';
      await testLinkedIn(respond, client, userId, userIsAdmin, linkedinUrl);
    } else if (argsLower.startsWith('test-tavily')) {
      const linkedinUrl = args.replace(/^test-tavily\s*/i, '').trim() || 'https://www.linkedin.com/in/harris-stolzenberg-44468b78/';
      await testTavilyLinkedIn(respond, client, userId, userIsAdmin, linkedinUrl);
    } else if (argsLower.startsWith('test-perplexity')) {
      const nameAndFirm = args.replace(/^test-perplexity\s*/i, '').trim() || 'Harris Stolzenberg, Pear VC';
      await testPerplexity(respond, client, userId, userIsAdmin, nameAndFirm);
    } else if (argsLower.startsWith('test-wikipedia')) {
      const nameAndFirm = args.replace(/^test-wikipedia\s*/i, '').trim() || 'Marc Andreessen, Andreessen Horowitz';
      await testWikipedia(respond, client, userId, userIsAdmin, nameAndFirm);
    } else if (argsLower.startsWith('test-full-pipeline')) {
      const linkedinUrl = args.replace(/^test-full-pipeline\s*/i, '').trim() || 'https://www.linkedin.com/in/harris-stolzenberg-44468b78/';
      await testFullPipeline(respond, client, userId, userIsAdmin, linkedinUrl);
    } else if (argsLower === 'linkedin-accounts') {
      await listLinkedInAccounts(respond, userId, userIsAdmin);
    } else if (argsLower === 'linkedin-add-account') {
      await addLinkedInAccount(respond, userId, userIsAdmin);
    } else if (argsLower.startsWith('linkedin-disable-account')) {
      const email = args.replace(/^linkedin-disable-account\s*/i, '').trim();
      await disableLinkedInAccount(respond, email, userId, userIsAdmin);
    } else if (argsLower.startsWith('linkedin-reset-account')) {
      const email = args.replace(/^linkedin-reset-account\s*/i, '').trim();
      await resetLinkedInAccount(respond, email, userId, userIsAdmin);
    } else if (argsLower === 'linkedin-pool-stats') {
      await showLinkedInPoolStats(respond, userId, userIsAdmin);
    } else if (argsLower === 'linkedin-generate-key') {
      await generateEncryptionKey(respond, userId, userIsAdmin);
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
• \`/partnerbot test-research [linkedin_url]\` — Test research pipeline (LinkedIn, Perplexity, Tavily)
• \`/partnerbot test-linkedin [linkedin_url]\` — Test LinkedIn scraper only (detailed output)
• \`/partnerbot test-tavily [linkedin_url]\` — Test Tavily LinkedIn search (no login needed)
• \`/partnerbot test-perplexity [name, firm]\` — Test Perplexity research (person + firm)
• \`/partnerbot test-wikipedia [name, firm]\` — Test Wikipedia search (FREE & unlimited!)
• \`/partnerbot test-full-pipeline [linkedin_url]\` — Test FULL 5-stage pipeline (comprehensive!)

*LinkedIn Account Pool Commands:*
• \`/partnerbot linkedin-accounts\` — List all LinkedIn accounts and their status
• \`/partnerbot linkedin-pool-stats\` — Show pool statistics and health
• \`/partnerbot linkedin-add-account\` — Instructions to add a new account
• \`/partnerbot linkedin-disable-account <email>\` — Disable an account
• \`/partnerbot linkedin-reset-account <email>\` — Reset account failures/cooldown
• \`/partnerbot linkedin-generate-key\` — Generate encryption key for SESSION_ENCRYPTION_KEY
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
      console.log('OpenAI response:', testResponse.message);
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
 * Test research pipeline - runs LinkedIn scraper, Perplexity, and Tavily
 */
async function testResearch(respond, client, userId, userIsAdmin, linkedinUrl) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  console.log('=== TEST RESEARCH STARTED ===');
  console.log('User ID:', userId);
  console.log('LinkedIn URL:', linkedinUrl);

  // Check API configurations
  const apiStatus = {
    linkedin: !!config.linkedinScraper?.email && !!config.linkedinScraper?.password,
    perplexity: !!config.perplexity?.apiKey,
    tavily: !!config.tavily?.apiKey,
  };

  console.log('API Status:', apiStatus);

  await respond({
    text: `🔬 *Starting Research Pipeline Test*\n\n*LinkedIn URL:* ${linkedinUrl}\n\n*API Configuration:*\n• LinkedIn Scraper: ${apiStatus.linkedin ? '✅ Configured' : '❌ Missing credentials'}\n• Perplexity: ${apiStatus.perplexity ? '✅ Configured' : '❌ Missing API key'}\n• Tavily: ${apiStatus.tavily ? '✅ Configured' : '❌ Missing API key'}\n\n⏳ Running research... Check Railway logs for detailed progress.`,
    response_type: 'ephemeral',
  });

  try {
    // Step 1: Create a test partner for research
    console.log('Step 1: Creating test partner...');
    const testPartnerData = {
      slackUserId: `RESEARCH_TEST_${Date.now()}`,
      slackHandle: 'research-test',
      name: 'Research Test Partner',
      email: 'research-test@example.com',
      firm: 'Unknown Firm',
      role: 'Partner',
      partnerType: 'VC',
      linkedinUrl: linkedinUrl,
      sectors: [],
      onboardingData: { testResearch: true },
    };

    const testPartner = await db.partners.create(testPartnerData);
    console.log('Test partner created with ID:', testPartner.id);

    // Step 2: Run research orchestrator
    console.log('Step 2: Starting research orchestration...');
    const startTime = Date.now();
    
    const researchResults = await researchOrchestrator.startResearch(
      testPartner.id,
      linkedinUrl,
      {
        name: null, // Let LinkedIn scraper find this
        firm: null, // Let LinkedIn scraper find this
        partnerType: 'VC',
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('Research completed in', duration, 'seconds');
    console.log('Research results:', JSON.stringify(researchResults, null, 2));

    // Step 3: Fetch the saved research from database
    console.log('Step 3: Fetching saved research from database...');
    const savedResearch = await researchOrchestrator.getPartnerResearch(testPartner.id);
    console.log('Saved research records:', savedResearch?.records?.length || 0);

    // Step 4: Build result summary
    let resultMessage = `✅ *Research Pipeline Test Complete* (${duration}s)\n\n`;
    resultMessage += `*LinkedIn URL:* ${linkedinUrl}\n`;
    resultMessage += `*Test Partner ID:* \`${testPartner.id}\`\n\n`;

    // LinkedIn results
    if (researchResults.results?.linkedin?.success) {
      const li = researchResults.results.linkedin.data;
      resultMessage += `*📝 LinkedIn Data:*\n`;
      resultMessage += `• Name: ${li?.name || 'N/A'}\n`;
      resultMessage += `• Headline: ${li?.headline || 'N/A'}\n`;
      resultMessage += `• Location: ${li?.location || 'N/A'}\n`;
      if (li?.about) {
        resultMessage += `• About: ${li.about}\n`;
      }
      resultMessage += `• Experiences: ${li?.experiences?.length || 0} found\n\n`;
    } else if (researchResults.results?.linkedin?.error) {
      resultMessage += `*📝 LinkedIn:* ❌ ${researchResults.results.linkedin.error}\n\n`;
    } else if (!apiStatus.linkedin) {
      resultMessage += `*📝 LinkedIn:* ⏭️ Skipped (no credentials)\n\n`;
    }

    // Perplexity results
    if (researchResults.results?.personNews?.success) {
      const pn = researchResults.results.personNews.data;
      resultMessage += `*🔍 Perplexity (Person):* ✅\n`;
      if (pn?.summary) {
        resultMessage += `• Summary:\n${pn.summary}\n`;
      }
      resultMessage += `• Citations: ${pn?.citations?.length || 0} sources\n\n`;
    } else if (researchResults.results?.personNews?.error) {
      resultMessage += `*🔍 Perplexity (Person):* ❌ ${researchResults.results.personNews.error}\n\n`;
    }

    if (researchResults.results?.firmInfo?.success) {
      const fi = researchResults.results.firmInfo.data;
      resultMessage += `*🏢 Perplexity (Firm):* ✅\n`;
      if (fi?.overview) {
        resultMessage += `• Overview:\n${fi.overview}\n\n`;
      } else {
        resultMessage += `• Overview: Available\n\n`;
      }
    } else if (researchResults.results?.firmInfo?.error) {
      resultMessage += `*🏢 Perplexity (Firm):* ❌ ${researchResults.results.firmInfo.error}\n\n`;
    } else if (!apiStatus.perplexity) {
      resultMessage += `*🔍 Perplexity:* ⏭️ Skipped (no API key)\n\n`;
    }

    // Tavily results
    if (researchResults.results?.socialProfiles?.success) {
      const sp = researchResults.results.socialProfiles.data;
      const profiles = sp?.profiles || {};
      const profileLinks = Object.keys(profiles).filter(k => profiles[k]?.url).map(k => `${k}: ✅`);
      resultMessage += `*🌐 Tavily (Social):* ✅\n`;
      resultMessage += `• Profiles found: ${profileLinks.join(', ') || 'None'}\n\n`;
    } else if (researchResults.results?.socialProfiles?.error) {
      resultMessage += `*🌐 Tavily (Social):* ❌ ${researchResults.results.socialProfiles.error}\n\n`;
    } else if (!apiStatus.tavily) {
      resultMessage += `*🌐 Tavily:* ⏭️ Skipped (no API key)\n\n`;
    }

    // Errors summary
    if (researchResults.errorsCount > 0) {
      resultMessage += `*⚠️ Errors:* ${researchResults.errorsCount}\n`;
      researchResults.results?.errors?.forEach(err => {
        resultMessage += `• ${err.source}: ${err.error}\n`;
      });
      resultMessage += '\n';
    }

    // Database summary
    resultMessage += `*💾 Database Records:* ${savedResearch?.records?.length || 0} saved\n`;

    // Aggregated summary preview
    if (researchResults.summary) {
      resultMessage += `\n*📋 Aggregated Summary:*\n`;
      resultMessage += `• Sources: ${researchResults.summary.sources?.join(', ') || 'None'}\n`;
      if (researchResults.summary.profile?.name) {
        resultMessage += `• Profile Name: ${researchResults.summary.profile.name}\n`;
      }
      if (researchResults.summary.socialLinks && Object.keys(researchResults.summary.socialLinks).length > 0) {
        resultMessage += `• Social Links: ${Object.keys(researchResults.summary.socialLinks).join(', ')}\n`;
      }
    }

    // Step 5: Clean up (optional - keeping for debug)
    console.log('Step 5: Cleaning up...');
    // Delete research records first (due to foreign key)
    await db.prisma.partnerResearch.deleteMany({ where: { partnerId: testPartner.id } });
    await db.prisma.partner.delete({ where: { id: testPartner.id } });
    console.log('Test data cleaned up');

    resultMessage += `\n_Test data cleaned up. Check Railway logs for full details._`;

    console.log('=== TEST RESEARCH COMPLETED ===');

    await respond({
      text: resultMessage,
      response_type: 'ephemeral',
    });

  } catch (error) {
    console.error('=== TEST RESEARCH FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    await respond({
      text: `❌ Research test failed: ${error.message}\n\nCheck Railway logs for details.`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Test LinkedIn scraper only - detailed output for debugging
 */
async function testLinkedIn(respond, client, userId, userIsAdmin, linkedinUrl) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  console.log('=== TEST LINKEDIN STARTED ===');
  console.log('User ID:', userId);
  console.log('LinkedIn URL:', linkedinUrl);

  // Check configuration
  const hasCredentials = !!config.linkedinScraper?.email && !!config.linkedinScraper?.password;
  const email = config.linkedinScraper?.email;
  const maskedPassword = config.linkedinScraper?.password 
    ? config.linkedinScraper.password.substring(0, 3) + '***' 
    : 'NOT SET';

  await respond({
    text: `🔗 *LinkedIn Scraper Test*\n\n*URL:* ${linkedinUrl}\n*Email:* ${email || 'NOT SET'}\n*Password:* ${maskedPassword}\n*Credentials Configured:* ${hasCredentials ? '✅' : '❌'}\n\n⏳ Starting scrape... This may take 30-60 seconds.\n\n_Watch Railway logs for detailed output._`,
    response_type: 'ephemeral',
  });

  if (!hasCredentials) {
    await respond({
      text: '❌ *LinkedIn test aborted*\n\nMissing `LINKEDIN_EMAIL` or `LINKEDIN_PASSWORD` environment variables in Railway.',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    console.log('Starting LinkedIn scrape...');
    console.log('Email:', email);
    console.log('Password length:', config.linkedinScraper?.password?.length || 0);
    
    const startTime = Date.now();
    const result = await linkedinService.scrapeProfile(linkedinUrl);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('LinkedIn scrape completed in', duration, 'seconds');
    console.log('Result:', JSON.stringify(result, null, 2));

    let resultMessage = `🔗 *LinkedIn Scraper Test Complete* (${duration}s)\n\n`;
    resultMessage += `*URL:* ${linkedinUrl}\n`;
    resultMessage += `*Success:* ${result.success ? '✅' : '❌'}\n\n`;

    if (result.success) {
      const data = result.data;
      resultMessage += `*📝 Profile Data:*\n`;
      resultMessage += `• Name: ${data?.name || 'N/A'}\n`;
      resultMessage += `• Headline: ${data?.headline || data?.job_title || 'N/A'}\n`;
      resultMessage += `• Company: ${data?.company || 'N/A'}\n`;
      resultMessage += `• Location: ${data?.location || 'N/A'}\n`;
      resultMessage += `• Connections: ${data?.connections || 'N/A'}\n\n`;

      if (data?.about) {
        resultMessage += `*About:*\n>${data.about}\n\n`;
      }

      if (data?.experiences?.length > 0) {
        resultMessage += `*Experience (${data.experiences.length}):*\n`;
        data.experiences.slice(0, 3).forEach(exp => {
          resultMessage += `• ${exp.title || 'Role'} at ${exp.company || 'Company'}\n`;
        });
        if (data.experiences.length > 3) {
          resultMessage += `  _...and ${data.experiences.length - 3} more_\n`;
        }
        resultMessage += '\n';
      }

      if (data?.educations?.length > 0) {
        resultMessage += `*Education (${data.educations.length}):*\n`;
        data.educations.forEach(edu => {
          resultMessage += `• ${edu.school || 'School'}\n`;
        });
      }
    } else {
      resultMessage += `*❌ Error:* ${result.error}\n`;
      resultMessage += `*Error Type:* ${result.error_type || 'UNKNOWN'}\n\n`;

      // Provide helpful troubleshooting tips
      if (result.error_type === 'AUTH_FAILED') {
        resultMessage += `*💡 Troubleshooting:*\n`;
        resultMessage += `• Verify LINKEDIN_EMAIL and LINKEDIN_PASSWORD in Railway\n`;
        resultMessage += `• Make sure 2FA is disabled on the LinkedIn account\n`;
        resultMessage += `• Try logging into LinkedIn manually to check for security prompts\n`;
        resultMessage += `• LinkedIn may have flagged automated access - try a different account\n`;
      } else if (result.error_type === 'SCRAPE_ERROR') {
        resultMessage += `*💡 Troubleshooting:*\n`;
        resultMessage += `• Check Railway logs for Python stderr output\n`;
        resultMessage += `• Verify Chromium and chromedriver are installed correctly\n`;
      }

      if (result.raw_output) {
        resultMessage += `\n*Raw Output:*\n\`\`\`${result.raw_output}\`\`\`\n`;
      }
    }

    await respond({
      text: resultMessage,
      response_type: 'ephemeral',
    });

    console.log('=== TEST LINKEDIN COMPLETED ===');

  } catch (error) {
    console.error('=== TEST LINKEDIN FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    await respond({
      text: `❌ *LinkedIn test failed*\n\n*Error:* ${error.message}\n\nCheck Railway logs for details.`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Test Perplexity research (person + firm)
 */
async function testPerplexity(respond, client, userId, userIsAdmin, nameAndFirm) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  console.log('=== TEST PERPLEXITY STARTED ===');
  console.log('Input:', nameAndFirm);

  // Parse name and firm from input
  const parts = nameAndFirm.split(',').map(p => p.trim());
  const name = parts[0] || 'Harris Stolzenberg';
  const firm = parts[1] || 'Pear VC';

  const hasPerplexityKey = !!config.perplexity?.apiKey;

  await respond({
    text: `🧠 *Perplexity Research Test*\n\n*Name:* ${name}\n*Firm:* ${firm}\n*Perplexity API:* ${hasPerplexityKey ? '✅ Configured' : '❌ Missing'}\n\n⏳ Researching person and firm... This may take 20-40 seconds.`,
    response_type: 'ephemeral',
  });

  if (!hasPerplexityKey) {
    await respond({
      text: '❌ *Test aborted* - Missing `PERPLEXITY_API_KEY` in Railway environment variables.',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    const startTime = Date.now();
    
    // Run both person and firm research in parallel
    console.log('Starting parallel Perplexity research...');
    const [personResult, firmResult] = await Promise.all([
      perplexityService.researchPerson(name, firm, 'Partner'),
      perplexityService.researchFirm(firm, 'VC'),
    ]);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('Perplexity research completed in', duration, 'seconds');
    console.log('Person result success:', personResult.success);
    console.log('Firm result success:', firmResult.success);

    let resultMessage = `🧠 *Perplexity Research Complete* (${duration}s)\n\n`;
    resultMessage += `*Name:* ${name}\n*Firm:* ${firm}\n\n`;

    // Person research results
    resultMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    resultMessage += `*👤 Person Research:* ${personResult.success ? '✅' : '❌'}\n`;
    
    if (personResult.success && personResult.data) {
      const data = personResult.data;
      
      if (data.summary) {
        const summaryPreview = data.summary.length > 400 ? data.summary.substring(0, 400) + '...' : data.summary;
        resultMessage += `\n*Summary:*\n>${summaryPreview}\n`;
      }

      if (data.newsArticles) {
        resultMessage += `\n*📰 News:* Found\n`;
      }
      if (data.deals) {
        resultMessage += `*💰 Deals/Investments:* Found\n`;
      }
      if (data.speaking) {
        resultMessage += `*🎤 Speaking:* Found\n`;
      }
      if (data.podcasts) {
        resultMessage += `*🎙️ Podcasts:* Found\n`;
      }
      
      if (data.citations?.length > 0) {
        resultMessage += `\n*🔗 Sources:* ${data.citations.length} citations\n`;
        // Show first 3 citations
        data.citations.slice(0, 3).forEach((cite, i) => {
          resultMessage += `${i + 1}. ${cite}\n`;
        });
      }
    } else if (personResult.error) {
      resultMessage += `*Error:* ${personResult.error}\n`;
    }

    // Firm research results
    resultMessage += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    resultMessage += `*🏢 Firm Research:* ${firmResult.success ? '✅' : '❌'}\n`;
    
    if (firmResult.success && firmResult.data) {
      const data = firmResult.data;
      
      if (data.overview) {
        resultMessage += `\n*Overview:*\n>${data.overview}\n`;
      }

      if (data.leadership) {
        resultMessage += `\n*👥 Leadership:* Found\n`;
      }
      if (data.portfolio) {
        resultMessage += `*📊 Portfolio:* Found\n`;
      }
      if (data.news) {
        resultMessage += `*📰 Recent News:* Found\n`;
      }
      
      if (data.citations?.length > 0) {
        resultMessage += `\n*🔗 Sources:* ${data.citations.length} citations\n`;
      }
    } else if (firmResult.error) {
      resultMessage += `*Error:* ${firmResult.error}\n`;
    }

    // Show raw content preview if available
    if (personResult.data?.rawContent) {
      resultMessage += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      resultMessage += `*📄 Raw Person Research:*\n`;
      resultMessage += `>${personResult.data.rawContent.split('\n').join('\n>')}\n`;
    }

    await respond({
      text: resultMessage,
      response_type: 'ephemeral',
    });

    console.log('=== TEST PERPLEXITY COMPLETED ===');

  } catch (error) {
    console.error('=== TEST PERPLEXITY FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    await respond({
      text: `❌ *Perplexity test failed*\n\n*Error:* ${error.message}\n\nCheck Railway logs for details.`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Test Tavily LinkedIn search (no login required!)
 */
async function testTavilyLinkedIn(respond, client, userId, userIsAdmin, linkedinUrl) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  console.log('=== TEST TAVILY LINKEDIN STARTED ===');
  console.log('User ID:', userId);
  console.log('LinkedIn URL:', linkedinUrl);

  const hasTavilyKey = !!config.tavily?.apiKey;

  await respond({
    text: `🔍 *Tavily LinkedIn Search Test*\n\n*URL:* ${linkedinUrl}\n*Tavily API:* ${hasTavilyKey ? '✅ Configured' : '❌ Missing'}\n\n⏳ Searching LinkedIn via Tavily... This may take 10-20 seconds.`,
    response_type: 'ephemeral',
  });

  if (!hasTavilyKey) {
    await respond({
      text: '❌ *Test aborted* - Missing `TAVILY_API_KEY` in Railway environment variables.',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    const startTime = Date.now();
    
    // Extract name hint from URL if possible
    const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/i);
    const username = usernameMatch ? usernameMatch[1].replace(/-/g, ' ') : null;
    
    console.log('Extracted username hint:', username);
    
    const result = await tavilyService.searchLinkedInProfile(
      username || 'professional',  // name hint
      'company',                    // firm hint (will be overridden by search)
      linkedinUrl
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('Tavily search completed in', duration, 'seconds');
    console.log('Result:', JSON.stringify(result, null, 2));

    let resultMessage = `🔍 *Tavily LinkedIn Search Complete* (${duration}s)\n\n`;
    resultMessage += `*URL:* ${linkedinUrl}\n`;
    resultMessage += `*Success:* ${result.success ? '✅' : '❌'}\n\n`;

    if (result.success) {
      const data = result.data;
      
      resultMessage += `*📝 Profile Data:*\n`;
      resultMessage += `• Name: ${data?.name || 'N/A'}\n`;
      resultMessage += `• Headline: ${data?.headline || 'N/A'}\n`;
      resultMessage += `• Location: ${data?.location || 'N/A'}\n`;
      resultMessage += `• LinkedIn URL: ${data?.linkedinUrl || 'N/A'}\n\n`;

      if (data?.about) {
        resultMessage += `*About:*\n>${data.about}\n\n`;
      }

      if (data?.experiences?.length > 0) {
        resultMessage += `*Experience (${data.experiences.length}):*\n`;
        data.experiences.slice(0, 3).forEach(exp => {
          resultMessage += `• ${exp.title || 'Role'} at ${exp.company || 'Company'}\n`;
        });
        if (data.experiences.length > 3) {
          resultMessage += `  _...and ${data.experiences.length - 3} more_\n`;
        }
        resultMessage += '\n';
      }

      if (data?.education?.length > 0) {
        resultMessage += `*Education (${data.education.length}):*\n`;
        data.education.slice(0, 2).forEach(edu => {
          resultMessage += `• ${edu.school || 'School'}\n`;
        });
        resultMessage += '\n';
      }

      if (data?.skills?.length > 0) {
        resultMessage += `*Skills:* ${data.skills.slice(0, 5).join(', ')}\n\n`;
      }

      if (data?.answer) {
        resultMessage += `*🤖 AI Summary:*\n>${data.answer}\n\n`;
      }

      // Show raw results count
      resultMessage += `*Raw Results:* ${data?.rawResults?.length || 0} found\n`;

    } else {
      resultMessage += `*❌ Error:* ${result.error}\n`;
      resultMessage += `*Error Type:* ${result.error_type || 'UNKNOWN'}\n`;
    }

    await respond({
      text: resultMessage,
      response_type: 'ephemeral',
    });

    console.log('=== TEST TAVILY LINKEDIN COMPLETED ===');

  } catch (error) {
    console.error('=== TEST TAVILY LINKEDIN FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    await respond({
      text: `❌ *Tavily test failed*\n\n*Error:* ${error.message}\n\nCheck Railway logs for details.`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Test Wikipedia search (FREE and UNLIMITED!)
 */
async function testWikipedia(respond, client, userId, userIsAdmin, nameAndFirm) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  console.log('=== TEST WIKIPEDIA STARTED ===');
  console.log('Input:', nameAndFirm);

  // Parse name and firm from input
  const parts = nameAndFirm.split(',').map(p => p.trim());
  const name = parts[0] || 'Marc Andreessen';
  const firm = parts[1] || 'Andreessen Horowitz';

  await respond({
    text: `📚 *Wikipedia Search Test (FREE!)*\n\n*Person:* ${name}\n*Company:* ${firm}\n\n⏳ Searching Wikipedia... This should be fast!`,
    response_type: 'ephemeral',
  });

  try {
    const startTime = Date.now();
    
    // Run both searches in parallel
    console.log('Starting parallel Wikipedia searches...');
    const [personResult, companyResult] = await Promise.all([
      wikipediaService.searchPerson(name),
      wikipediaService.searchCompany(firm),
    ]);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('Wikipedia searches completed in', duration, 'seconds');
    console.log('Person result success:', personResult.success);
    console.log('Company result success:', companyResult.success);

    let resultMessage = `📚 *Wikipedia Search Complete* (${duration}s) — *FREE!*\n\n`;

    // Person results
    resultMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    resultMessage += `*👤 Person: ${name}*\n`;
    resultMessage += `*Status:* ${personResult.success ? '✅ Found' : '❌ Not found'}\n`;
    
    if (personResult.success && personResult.data) {
      const data = personResult.data;
      
      if (data.title) {
        resultMessage += `*Wikipedia Title:* ${data.title}\n`;
      }
      
      if (data.url) {
        resultMessage += `*URL:* ${data.url}\n`;
      }
      
      if (data.summary) {
        resultMessage += `\n*Summary:*\n>${data.summary}\n`;
      }
      
      if (data.career_info?.raw_career) {
        resultMessage += `\n*Career Info:*\n>${data.career_info.raw_career}\n`;
      }
      
      if (data.categories?.length > 0) {
        resultMessage += `\n*Categories:* ${data.categories.slice(0, 5).join(', ')}\n`;
      }
    } else if (personResult.error) {
      resultMessage += `*Note:* ${personResult.error}\n`;
    }

    // Company results
    resultMessage += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    resultMessage += `*🏢 Company: ${firm}*\n`;
    resultMessage += `*Status:* ${companyResult.success ? '✅ Found' : '❌ Not found'}\n`;
    
    if (companyResult.success && companyResult.data) {
      const data = companyResult.data;
      
      if (data.title) {
        resultMessage += `*Wikipedia Title:* ${data.title}\n`;
      }
      
      if (data.url) {
        resultMessage += `*URL:* ${data.url}\n`;
      }
      
      if (data.summary) {
        resultMessage += `\n*Summary:*\n>${data.summary}\n`;
      }
      
      if (data.company_info?.founding_info) {
        resultMessage += `\n*History/Founding:*\n>${data.company_info.founding_info}\n`;
      }
      
      if (data.categories?.length > 0) {
        resultMessage += `\n*Categories:* ${data.categories.slice(0, 5).join(', ')}\n`;
      }
    } else if (companyResult.error) {
      resultMessage += `*Note:* ${companyResult.error}\n`;
    }

    resultMessage += `\n_Wikipedia is FREE and UNLIMITED - no API key required!_`;

    await respond({
      text: resultMessage,
      response_type: 'ephemeral',
    });

    console.log('=== TEST WIKIPEDIA COMPLETED ===');

  } catch (error) {
    console.error('=== TEST WIKIPEDIA FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    await respond({
      text: `❌ *Wikipedia test failed*\n\n*Error:* ${error.message}\n\nCheck Railway logs for details.`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Test FULL 5-stage research pipeline
 */
async function testFullPipeline(respond, client, userId, userIsAdmin, linkedinUrl) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  console.log('=== TEST FULL PIPELINE STARTED ===');
  console.log('User ID:', userId);
  console.log('LinkedIn URL:', linkedinUrl);

  await respond({
    text: `🚀 *Testing FULL 5-Stage Research Pipeline*\n\n*LinkedIn URL:* ${linkedinUrl}\n\n*Pipeline Stages:*\n1️⃣ Data Collection (LinkedIn, Perplexity, Tavily, Wikipedia)\n2️⃣ Citation Crawling (follow Perplexity links)\n3️⃣ Quality Scoring & Fact Checking\n4️⃣ Profile Aggregation (PersonProfile, FirmProfile)\n5️⃣ Introduction Generation\n\n⏳ *This will take 30-60 seconds...*\n\nCheck Railway logs for detailed progress.`,
    response_type: 'ephemeral',
  });

  let testPartner;
  try {
    // Create a temporary test partner
    console.log('Step 1: Creating test partner...');
    testPartner = await db.partners.create({
      slackUserId: `TEST_FULL_PIPELINE_${Date.now()}`,
      name: 'Test Pipeline Partner',
      firm: 'Test Firm',
      partnerType: 'VC',
      linkedinUrl: linkedinUrl,
      onboardingData: { 
        test: true,
        thesis: 'Early-stage AI/ML startups',
        sectors: ['AI/ML', 'SaaS'],
        origin_story: 'Started as an engineer, now investing in the future',
        superpower: 'Technical due diligence',
      },
    });
    console.log('Test partner created with ID:', testPartner.id);

    // Run the FULL pipeline
    console.log('Step 2: Running full pipeline...');
    const startTime = Date.now();
    
    const pipelineResults = await researchOrchestrator.runFullPipeline(
      testPartner.id,
      linkedinUrl,
      {
        name: 'Harris Stolzenberg',
        firm: 'Pear VC',
        partnerType: 'VC',
        generateIntro: true,
        crawlCitations: true,
      }
    );
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('Pipeline completed in', totalTime, 'seconds');

    // Build result message
    let resultMessage = `🎉 *Full Pipeline Complete!* (${totalTime}s)\n\n`;
    resultMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Stage 1: Data Collection
    const stage1 = pipelineResults.stages.dataCollection;
    resultMessage += `*1️⃣ Data Collection* (${(pipelineResults.timing.dataCollection / 1000).toFixed(1)}s)\n`;
    resultMessage += `✅ Sources: ${stage1?.sourcesUsed?.join(', ') || 'none'}\n`;
    resultMessage += `❌ Errors: ${stage1?.errorsCount || 0}\n\n`;
    
    // Stage 2: Citation Crawling
    const stage2 = pipelineResults.stages.citationCrawling;
    resultMessage += `*2️⃣ Citation Crawling* (${(pipelineResults.timing.citationCrawling / 1000).toFixed(1)}s)\n`;
    resultMessage += `🔗 Citations found: ${stage2?.citationsFound || 0}\n`;
    resultMessage += `🌐 Crawled: ${stage2?.crawled || 0}\n`;
    resultMessage += `✅ Successful: ${stage2?.successful || 0}\n\n`;
    
    // Stage 3: Quality & Fact Checking
    const stage3 = pipelineResults.stages.qualityChecking;
    resultMessage += `*3️⃣ Quality & Fact Checking* (${(pipelineResults.timing.qualityChecking / 1000).toFixed(1)}s)\n`;
    resultMessage += `📊 Overall Quality: ${(stage3?.overallQuality * 100).toFixed(0)}%\n`;
    resultMessage += `📝 Facts collected: ${stage3?.factsCollected || 0}\n`;
    resultMessage += `✅ Verified facts: ${stage3?.verifiedFacts || 0}\n`;
    resultMessage += `⚠️ Disputed facts: ${stage3?.disputedFacts || 0}\n\n`;
    
    // Stage 4: Profile Aggregation
    const stage4 = pipelineResults.stages.profileAggregation;
    resultMessage += `*4️⃣ Profile Aggregation* (${(pipelineResults.timing.profileAggregation / 1000).toFixed(1)}s)\n`;
    resultMessage += `👤 PersonProfile: ${stage4?.personProfileCreated ? '✅ Created' : '❌ Failed'}\n`;
    resultMessage += `🏢 FirmProfile: ${stage4?.firmProfileCreated ? '✅ Created' : '❌ Failed'}\n`;
    resultMessage += `📈 Data Quality: ${(stage4?.dataQualityScore * 100).toFixed(0)}%\n\n`;
    
    // Stage 5: Introduction Generation
    const stage5 = pipelineResults.stages.introGeneration;
    const stage5Time = pipelineResults.timing.introGeneration ? (pipelineResults.timing.introGeneration / 1000).toFixed(1) : 'N/A';
    resultMessage += `*5️⃣ Introduction Generation* (${stage5Time}s)\n`;
    resultMessage += `📝 Generated: ${stage5?.generated ? '✅ Yes' : '❌ No'}\n`;
    resultMessage += `📏 Length: ${stage5?.length || 0} chars\n\n`;
    
    // Show the generated introduction
    if (pipelineResults.introduction) {
      resultMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      resultMessage += `*Generated Introduction:*\n\n`;
      resultMessage += pipelineResults.introduction + '\n\n';
    }
    
    resultMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    resultMessage += `✅ *Test complete!* Test data will be cleaned up.\n`;
    resultMessage += `Check Railway logs for full details.`;

    await respond({
      text: resultMessage,
      response_type: 'ephemeral',
    });

    console.log('=== TEST FULL PIPELINE COMPLETED ===');

  } catch (error) {
    console.error('=== TEST FULL PIPELINE FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    await respond({
      text: `❌ *Full pipeline test failed*\n\n*Error:* ${error.message}\n\nCheck Railway logs for details.`,
      response_type: 'ephemeral',
    });
  } finally {
    // Clean up test data
    if (testPartner) {
      console.log('Cleaning up test data...');
      try {
        // Delete PersonProfile first (if exists)
        await db.prisma.personProfile.deleteMany({ where: { partnerId: testPartner.id } });
        // Delete partner
        await db.prisma.partner.delete({ where: { id: testPartner.id } });
        console.log('Test data cleaned up');
      } catch (e) {
        console.log('Error cleaning up:', e.message);
      }
    }
    console.log('=== TEST FULL PIPELINE COMPLETE ===');
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

/**
 * List all LinkedIn accounts
 */
async function listLinkedInAccounts(respond, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    const accounts = await accountPool.getAllAccounts();
    
    if (accounts.length === 0) {
      await respond({
        text: '📭 No LinkedIn accounts in pool. Use `/partnerbot linkedin-add-account` to get started.',
        response_type: 'ephemeral',
      });
      return;
    }

    let message = `🔐 *LinkedIn Account Pool* (${accounts.length} accounts)\n\n`;

    for (const account of accounts) {
      const statusEmoji = {
        ACTIVE: '✅',
        COOLDOWN: '🕐',
        VERIFICATION_REQUIRED: '🔒',
        BANNED: '❌',
        DISABLED: '⏸️',
      }[account.status] || '❓';

      message += `${statusEmoji} *${account.linkedinEmail}*\n`;
      message += `   Status: ${account.status}\n`;
      message += `   Today: ${account.scrapesToday}/${accountPool.DAILY_LIMIT_PER_ACCOUNT} scrapes\n`;
      message += `   Total: ${account.totalScrapes} scrapes\n`;
      message += `   Failures: ${account.failureCount}\n`;
      
      if (account.lastUsedAt) {
        message += `   Last used: ${new Date(account.lastUsedAt).toLocaleString()}\n`;
      }
      
      if (account.cooldownUntil && new Date(account.cooldownUntil) > new Date()) {
        message += `   Cooldown until: ${new Date(account.cooldownUntil).toLocaleString()}\n`;
      }
      
      if (account.sessionExpiry) {
        const expiry = new Date(account.sessionExpiry);
        const hasValidSession = expiry > new Date();
        message += `   Session: ${hasValidSession ? '✓ Valid' : '✗ Expired'} (${expiry.toLocaleDateString()})\n`;
      }
      
      if (account.lastErrorMsg) {
        message += `   Last error: ${account.lastErrorMsg.substring(0, 100)}...\n`;
      }
      
      message += `\n`;
    }

    message += `\nUse \`/partnerbot linkedin-pool-stats\` for overview statistics.`;

    await respond({
      text: message,
      response_type: 'ephemeral',
    });

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list LinkedIn accounts');
    await respond({
      text: `❌ Failed to list accounts: ${error.message}`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Show LinkedIn pool statistics
 */
async function showLinkedInPoolStats(respond, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    const stats = await accountPool.getPoolStats();

    const message = `📊 *LinkedIn Account Pool Statistics*

*Pool Health:*
• Total accounts: ${stats.total}
• Active: ${stats.active} ✅
• In cooldown: ${stats.cooldown} 🕐
• Need verification: ${stats.verificationRequired} 🔒
• Banned: ${stats.banned} ❌
• Available now: ${stats.availableNow} 🟢

*Usage:*
• Scrapes today: ${stats.scrapesToday}
• Scrapes all time: ${stats.scrapesAllTime}

*Limits:*
• Per account/day: ${stats.dailyLimitPerAccount}
• Cooldown duration: ${stats.cooldownHours} hours
• Max capacity today: ${stats.total * stats.dailyLimitPerAccount}

${stats.availableNow === 0 ? '⚠️ *WARNING: No accounts available!*' : ''}
${stats.total === 0 ? '💡 Use `/partnerbot linkedin-add-account` to add accounts.' : ''}
`;

    await respond({
      text: message,
      response_type: 'ephemeral',
    });

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get pool stats');
    await respond({
      text: `❌ Failed to get stats: ${error.message}`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Instructions to add a LinkedIn account
 */
async function addLinkedInAccount(respond, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  const message = `📝 *How to Add a LinkedIn Account to the Pool*

*Prerequisites:*
1. A burner LinkedIn account (not your main account)
2. A Gmail account with 2FA enabled
3. Gmail App Password generated

*Step 1: Create Gmail App Password*
• Go to https://myaccount.google.com/apppasswords
• Sign in to the Gmail account
• Create a new app password (name it "LinkedIn Bot")
• Save the 16-character password

*Step 2: Add to Railway (Recommended)*
Go to your Railway project and add a JSON variable:

\`\`\`
LINKEDIN_ACCOUNTS='[
  {
    "linkedinEmail": "burner1@example.com",
    "linkedinPassword": "linkedin_password_here",
    "gmailEmail": "burner1gmail@gmail.com",
    "gmailAppPassword": "abcd efgh ijkl mnop"
  }
]'
\`\`\`

*Step 3: Add to Database Manually*
You can also use Prisma Studio or SQL:

\`\`\`bash
npm run db:studio
\`\`\`

Then create a \`LinkedInAccount\` record with:
• \`linkedinEmail\`: LinkedIn login email
• \`encryptedPassword\`: Use the encryption tool
• \`gmailEmail\`: Gmail address
• \`gmailAppPassword\`: 16-char app password

*Important Notes:*
⚠️ Never use your personal LinkedIn account
⚠️ Use burner/throwaway accounts only
⚠️ LinkedIn may ban accounts that scrape heavily
⚠️ Have backup accounts ready

*Need encryption key?*
Use \`/partnerbot linkedin-generate-key\` to generate \`SESSION_ENCRYPTION_KEY\`
`;

  await respond({
    text: message,
    response_type: 'ephemeral',
  });
}

/**
 * Disable a LinkedIn account
 */
async function disableLinkedInAccount(respond, email, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  if (!email) {
    await respond({
      text: 'Usage: `/partnerbot linkedin-disable-account <email>`',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    const accounts = await accountPool.getAllAccounts();
    const account = accounts.find(a => a.email === email || a.linkedinEmail === email);

    if (!account) {
      await respond({
        text: `❌ Account not found: ${email}`,
        response_type: 'ephemeral',
      });
      return;
    }

    await accountPool.updateAccountStatus(account.id, 'DISABLED');

    await respond({
      text: `✅ Disabled account: ${account.linkedinEmail}`,
      response_type: 'ephemeral',
    });

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to disable account');
    await respond({
      text: `❌ Failed to disable account: ${error.message}`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Reset a LinkedIn account
 */
async function resetLinkedInAccount(respond, email, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  if (!email) {
    await respond({
      text: 'Usage: `/partnerbot linkedin-reset-account <email>`',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    const accounts = await accountPool.getAllAccounts();
    const account = accounts.find(a => a.email === email || a.linkedinEmail === email);

    if (!account) {
      await respond({
        text: `❌ Account not found: ${email}`,
        response_type: 'ephemeral',
      });
      return;
    }

    await accountPool.resetAccount(account.id);

    await respond({
      text: `✅ Reset account: ${account.linkedinEmail}\n• Failure count: 0\n• Cooldown: cleared\n• Status: ACTIVE`,
      response_type: 'ephemeral',
    });

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to reset account');
    await respond({
      text: `❌ Failed to reset account: ${error.message}`,
      response_type: 'ephemeral',
    });
  }
}

/**
 * Generate encryption key
 */
async function generateEncryptionKey(respond, userId, userIsAdmin) {
  if (!userIsAdmin) {
    await respond({
      text: '⚠️ This command is only available to admins.',
      response_type: 'ephemeral',
    });
    return;
  }

  const key = sessionManager.generateEncryptionKey();

  const message = `🔑 *Generated Encryption Key*

Add this to your Railway environment variables:

\`\`\`
SESSION_ENCRYPTION_KEY=${key}
\`\`\`

⚠️ *IMPORTANT:*
• Save this key securely
• Once set, never change it (existing data will be unreadable)
• This key encrypts all LinkedIn passwords and session cookies
• Keep it secret - never commit to Git

After adding to Railway, redeploy the bot.
`;

  await respond({
    text: message,
    response_type: 'ephemeral',
  });
}

module.exports = {
  registerCommandRouter,
};

