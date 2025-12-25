const config = require('../../config');
const db = require('../../services/database');
const slackService = require('../../services/slack');
const { buildApprovedBlocks } = require('../../templates/adminApproval');
const { logger, logToSlack, logActivity } = require('../../utils/logger');
const { isAdmin } = require('../../utils/validators');

/**
 * Register approval action handlers
 */
function registerApprovalActions(app) {
  // ============================================
  // INTRODUCTION APPROVAL ACTIONS
  // ============================================

  // Approve introduction
  app.action('approve_intro', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    if (!isAdmin(userId)) {
      return;
    }

    try {
      const { partnerId, conversationId } = JSON.parse(body.actions[0].value);
      const partner = await db.partners.findById(partnerId);

      if (!partner) {
        throw new Error('Partner not found');
      }

      // Get the introduction message from the approval card
      const introBlock = body.message.blocks.find(b => 
        b.type === 'section' && b.text?.text?.startsWith('>')
      );
      const introMessage = introBlock?.text?.text?.replace(/^>/gm, '').trim() || 
        `Welcome ${partner.name} from ${partner.firm}!`;

      // Post introduction to #introductions
      await slackService.postToChannel(
        client,
        config.channels.introductions,
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: introMessage,
            },
          },
        ],
        introMessage
      );

      // Set up partner channels and groups
      await slackService.setupPartnerChannels(
        client,
        partner.slackUserId,
        partner.partnerType,
        partner.sectors
      );

      // Mark partner as onboarding complete
      await db.partners.updateById(partnerId, { onboardingComplete: true });

      // Update approval message
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: buildApprovedBlocks(body.message.blocks, userId, 'approved'),
        text: 'Introduction approved and posted',
      });

      // Notify partner
      await slackService.sendDM(
        client,
        partner.slackUserId,
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎉 Great news! Your introduction has been posted to <#${config.channels.introductions}>.\n\nYou've also been added to the relevant channels based on your interests. Welcome to the community!`,
            },
          },
        ],
        'Your introduction has been posted!'
      );

      // Log activity
      await logActivity(db.prisma, 'intro_approved', userId, 'partner', partnerId, {});
      await logToSlack('success', `Introduction approved and posted`, {
        partner: `<@${partner.slackUserId}>`,
        approvedBy: `<@${userId}>`,
      });

      logger.info({ partnerId, approvedBy: userId }, 'Introduction approved');
    } catch (error) {
      logger.error({ error: error.message }, 'Error approving introduction');
    }
  });

  // Skip introduction
  app.action('skip_intro', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    if (!isAdmin(userId)) return;

    try {
      const { partnerId } = JSON.parse(body.actions[0].value);

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: buildApprovedBlocks(body.message.blocks, userId, 'skipped'),
        text: 'Introduction skipped',
      });

      await logActivity(db.prisma, 'intro_skipped', userId, 'partner', partnerId, {});
      logger.info({ partnerId, skippedBy: userId }, 'Introduction skipped');
    } catch (error) {
      logger.error({ error: error.message }, 'Error skipping introduction');
    }
  });

  // Delete introduction
  app.action('delete_intro', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    if (!isAdmin(userId)) return;

    try {
      const { partnerId } = JSON.parse(body.actions[0].value);

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: buildApprovedBlocks(body.message.blocks, userId, 'deleted'),
        text: 'Introduction deleted',
      });

      await logActivity(db.prisma, 'intro_deleted', userId, 'partner', partnerId, {});
      logger.info({ partnerId, deletedBy: userId }, 'Introduction deleted');
    } catch (error) {
      logger.error({ error: error.message }, 'Error deleting introduction');
    }
  });

  // ============================================
  // OUTREACH APPROVAL ACTIONS
  // ============================================

  // Approve outreach
  app.action('approve_outreach', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    if (!isAdmin(userId)) return;

    try {
      const outreachId = body.actions[0].value;
      const outreach = await db.outreach.findById(outreachId);

      if (!outreach || outreach.status !== 'PENDING') {
        throw new Error('Outreach not found or already processed');
      }

      // Send DM to partner
      await slackService.sendDM(
        client,
        outreach.partner.slackUserId,
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: outreach.messageDraft,
            },
          },
        ],
        outreach.messageDraft
      );

      // Update outreach status
      await db.outreach.updateStatus(outreachId, 'SENT', userId);

      // Update approval message
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: buildApprovedBlocks(body.message.blocks, userId, 'approved'),
        text: 'Outreach approved and sent',
      });

      await logActivity(db.prisma, 'outreach_sent', userId, 'outreach', outreachId, {
        partnerId: outreach.partnerId,
      });
      
      logger.info({ outreachId, approvedBy: userId }, 'Outreach approved and sent');
    } catch (error) {
      logger.error({ error: error.message }, 'Error approving outreach');
    }
  });

  // Skip outreach
  app.action('skip_outreach', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    if (!isAdmin(userId)) return;

    try {
      const outreachId = body.actions[0].value;
      await db.outreach.updateStatus(outreachId, 'SKIPPED', userId);

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: buildApprovedBlocks(body.message.blocks, userId, 'skipped'),
        text: 'Outreach skipped',
      });

      logger.info({ outreachId, skippedBy: userId }, 'Outreach skipped');
    } catch (error) {
      logger.error({ error: error.message }, 'Error skipping outreach');
    }
  });

  // Delete outreach
  app.action('delete_outreach', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    if (!isAdmin(userId)) return;

    try {
      const outreachId = body.actions[0].value;
      await db.outreach.updateStatus(outreachId, 'DELETED', userId);

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: buildApprovedBlocks(body.message.blocks, userId, 'deleted'),
        text: 'Outreach deleted',
      });

      logger.info({ outreachId, deletedBy: userId }, 'Outreach deleted');
    } catch (error) {
      logger.error({ error: error.message }, 'Error deleting outreach');
    }
  });

  // Approve all outreach in batch
  app.action('approve_all_outreach', async ({ ack, body, client, respond }) => {
    await ack();

    const userId = body.user.id;
    if (!isAdmin(userId)) return;

    try {
      const eventId = body.actions[0].value;
      const outreachMessages = await db.outreach.findByEvent(eventId);
      const pending = outreachMessages.filter(m => m.status === 'PENDING');

      await respond({
        text: `Sending ${pending.length} messages... This may take a moment.`,
        replace_original: false,
      });

      let sent = 0;
      for (const outreach of pending) {
        try {
          await slackService.sendDM(
            client,
            outreach.partner.slackUserId,
            [{ type: 'section', text: { type: 'mrkdwn', text: outreach.messageDraft } }],
            outreach.messageDraft
          );
          await db.outreach.updateStatus(outreach.id, 'SENT', userId);
          sent++;
          // Rate limiting: 1 message per second
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error({ error: error.message, outreachId: outreach.id }, 'Failed to send outreach');
        }
      }

      await respond({
        text: `✅ Batch complete! Sent ${sent}/${pending.length} messages.`,
        replace_original: false,
      });

      await logToSlack('success', `Batch outreach completed`, {
        sent,
        total: pending.length,
        approvedBy: `<@${userId}>`,
      });

      logger.info({ eventId, sent, total: pending.length }, 'Batch outreach completed');
    } catch (error) {
      logger.error({ error: error.message }, 'Error in batch approve');
    }
  });

  // Cancel outreach batch
  app.action('cancel_outreach_batch', async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    if (!isAdmin(userId)) return;

    try {
      const eventId = body.actions[0].value;
      const outreachMessages = await db.outreach.findByEvent(eventId);

      for (const outreach of outreachMessages) {
        if (outreach.status === 'PENDING') {
          await db.outreach.updateStatus(outreach.id, 'DELETED', userId);
        }
      }

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: buildApprovedBlocks(body.message.blocks, userId, 'deleted'),
        text: 'Batch cancelled',
      });

      logger.info({ eventId, cancelledBy: userId }, 'Outreach batch cancelled');
    } catch (error) {
      logger.error({ error: error.message }, 'Error cancelling batch');
    }
  });
}

module.exports = {
  registerApprovalActions,
};

