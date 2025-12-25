const cron = require('node-cron');
const config = require('../config');
const db = require('./database');
const openaiService = require('./openai');
const slackService = require('./slack');
const { buildDigestBlocks, buildDigestApprovalBlocks } = require('../templates/digest');
const { logger, logToSlack } = require('../utils/logger');

let slackClient = null;

/**
 * Initialize scheduler with Slack client
 */
function initialize(client) {
  slackClient = client;
  
  // Schedule bi-weekly digest
  if (config.digestSchedule) {
    cron.schedule(config.digestSchedule, async () => {
      logger.info('Running scheduled digest generation');
      await generateAndPostDigest();
    });
    
    logger.info({ schedule: config.digestSchedule }, 'Digest scheduler initialized');
  }
}

/**
 * Generate and post digest to #bot-admin for approval
 */
async function generateAndPostDigest() {
  if (!slackClient) {
    logger.error('Slack client not initialized for scheduler');
    return;
  }

  try {
    // Calculate period
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Get or create digest
    let digest = await db.digests.findDraft();
    
    if (!digest) {
      digest = await db.digests.create(periodStart, periodEnd);
    }

    // Aggregate content
    const digestData = {
      periodStart,
      periodEnd,
      pastEvents: [],
      newPartners: [],
      highlights: [],
      upcomingEvents: [],
      featuredFounders: [],
    };

    // Get recent events
    const recentEvents = await db.events.findRecent(14);
    digestData.pastEvents = recentEvents.map(e => ({
      name: e.name,
      date: e.dateTime,
      attendeeCount: null, // Would need to track this
      highlights: e.description,
    }));

    // Get upcoming events
    const upcomingEvents = await db.events.findUpcoming(14);
    digestData.upcomingEvents = upcomingEvents;

    // Get new partners
    const newPartners = await db.partners.findRecentlyJoined(14);
    digestData.newPartners = newPartners.map(p => ({
      name: p.name,
      firm: p.firm,
      partnerType: p.partnerType,
    }));

    // Get digest items (highlights, featured founders)
    const freshDigest = await db.digests.findById(digest.id);
    if (freshDigest?.items) {
      for (const item of freshDigest.items) {
        if (item.itemType === 'highlight') {
          digestData.highlights.push(item.content.text);
        } else if (item.itemType === 'featured_founder') {
          digestData.featuredFounders.push(item.content);
        } else if (item.itemType === 'event_recap') {
          digestData.pastEvents.push(item.content);
        }
      }
    }

    // Generate summary using OpenAI
    if (digestData.pastEvents.length > 0 || digestData.newPartners.length > 0 || digestData.highlights.length > 0) {
      digestData.summary = await openaiService.generateDigestSummary(digestData);
    }

    // Build digest blocks
    const digestBlocks = buildDigestBlocks(digestData);

    // Update digest with content
    await db.digests.update(digest.id, {
      content: digestData,
      renderedMessage: JSON.stringify(digestBlocks),
    });

    // Post to #bot-admin for approval
    if (config.channels.botAdmin) {
      const approvalBlocks = buildDigestApprovalBlocks(
        { ...digest, periodStart, periodEnd },
        digestBlocks
      );

      await slackService.postToChannel(
        slackClient,
        config.channels.botAdmin,
        approvalBlocks,
        'Bi-weekly digest ready for review'
      );

      await logToSlack('info', 'Bi-weekly digest generated and pending approval', {
        events: digestData.pastEvents.length,
        newPartners: digestData.newPartners.length,
        highlights: digestData.highlights.length,
      });
    }

    logger.info({ digestId: digest.id }, 'Digest generated successfully');
    return digest;
  } catch (error) {
    logger.error({ error: error.message }, 'Error generating digest');
    await logToSlack('error', 'Failed to generate digest', { error: error.message });
    throw error;
  }
}

/**
 * Manually trigger digest generation
 */
async function triggerDigest() {
  return generateAndPostDigest();
}

module.exports = {
  initialize,
  triggerDigest,
};

