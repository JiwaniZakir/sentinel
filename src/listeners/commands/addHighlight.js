const db = require('../../services/database');
const { logger, logToSlack } = require('../../utils/logger');
const { isAdmin } = require('../../utils/validators');

/**
 * Register highlight/digest management commands
 */
function registerDigestCommands(app) {
  // /partnerbot add-highlight <text>
  app.command('/partnerbot', async ({ command, ack, respond, client }) => {
    const args = command.text.trim();
    const userId = command.user_id;

    // add-highlight command
    if (args.startsWith('add-highlight')) {
      await ack();

      if (!isAdmin(userId)) {
        await respond({
          text: '⚠️ This command is only available to admins.',
          response_type: 'ephemeral',
        });
        return;
      }

      const highlightText = args.replace('add-highlight', '').trim();
      
      if (!highlightText) {
        await respond({
          text: '⚠️ Please provide highlight text: `/partnerbot add-highlight Your highlight here`',
          response_type: 'ephemeral',
        });
        return;
      }

      try {
        // Get or create draft digest
        let digest = await db.digests.findDraft();
        
        if (!digest) {
          const now = new Date();
          const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          digest = await db.digests.create(twoWeeksAgo, now);
        }

        // Add highlight item
        await db.digests.addItem(digest.id, 'highlight', { text: highlightText }, userId);

        await respond({
          text: `✅ Highlight added to the next digest: "${highlightText}"`,
          response_type: 'ephemeral',
        });

        await logToSlack('info', `Highlight added to digest`, {
          addedBy: `<@${userId}>`,
          text: highlightText.substring(0, 50) + (highlightText.length > 50 ? '...' : ''),
        });

        logger.info({ userId, digestId: digest.id }, 'Highlight added to digest');
      } catch (error) {
        logger.error({ error: error.message }, 'Error adding highlight');
        await respond({
          text: `❌ Error adding highlight: ${error.message}`,
          response_type: 'ephemeral',
        });
      }
      return;
    }

    // feature-founder command
    if (args.startsWith('feature-founder')) {
      await ack();

      if (!isAdmin(userId)) {
        await respond({
          text: '⚠️ This command is only available to admins.',
          response_type: 'ephemeral',
        });
        return;
      }

      const userMention = args.replace('feature-founder', '').trim();
      const founderMatch = userMention.match(/<@(\w+)(?:\|[^>]+)?>/);

      if (!founderMatch) {
        await respond({
          text: '⚠️ Please mention a founder: `/partnerbot feature-founder @founder`',
          response_type: 'ephemeral',
        });
        return;
      }

      const founderId = founderMatch[1];

      try {
        // Get or create draft digest
        let digest = await db.digests.findDraft();
        
        if (!digest) {
          const now = new Date();
          const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          digest = await db.digests.create(twoWeeksAgo, now);
        }

        // Get founder info
        const founderInfo = await client.users.info({ user: founderId });
        const founderName = founderInfo.user?.profile?.real_name || founderInfo.user?.name || 'Founder';

        // Add featured founder item
        await db.digests.addItem(digest.id, 'featured_founder', {
          slackUserId: founderId,
          name: founderName,
          company: 'TBD', // Could be fetched from a founders database
          description: 'Featured founder in our community',
          seeking: 'Connections and opportunities',
        }, userId);

        await respond({
          text: `✅ <@${founderId}> added to featured founders in the next digest. You may want to DM them to get more details for the feature.`,
          response_type: 'ephemeral',
        });

        logger.info({ userId, founderId, digestId: digest.id }, 'Featured founder added to digest');
      } catch (error) {
        logger.error({ error: error.message }, 'Error featuring founder');
        await respond({
          text: `❌ Error featuring founder: ${error.message}`,
          response_type: 'ephemeral',
        });
      }
      return;
    }

    // preview-digest command
    if (args === 'preview-digest') {
      await ack();

      if (!isAdmin(userId)) {
        await respond({
          text: '⚠️ This command is only available to admins.',
          response_type: 'ephemeral',
        });
        return;
      }

      try {
        const digest = await db.digests.findDraft();
        
        if (!digest) {
          await respond({
            text: '📭 No draft digest found. Add some highlights or wait for the scheduled generation.',
            response_type: 'ephemeral',
          });
          return;
        }

        const itemCounts = {
          highlights: digest.items?.filter(i => i.itemType === 'highlight').length || 0,
          founders: digest.items?.filter(i => i.itemType === 'featured_founder').length || 0,
          eventRecaps: digest.items?.filter(i => i.itemType === 'event_recap').length || 0,
        };

        await respond({
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: '📰 Digest Preview', emoji: true },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Period:* ${digest.periodStart.toLocaleDateString()} — ${digest.periodEnd.toLocaleDateString()}`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Content:*\n• Highlights: ${itemCounts.highlights}\n• Featured Founders: ${itemCounts.founders}\n• Event Recaps: ${itemCounts.eventRecaps}`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: 'Use `/partnerbot send-digest` to generate and review the full digest.',
                },
              ],
            },
          ],
          text: 'Digest preview',
          response_type: 'ephemeral',
        });
      } catch (error) {
        logger.error({ error: error.message }, 'Error previewing digest');
        await respond({
          text: `❌ Error previewing digest: ${error.message}`,
          response_type: 'ephemeral',
        });
      }
      return;
    }

    // partner-stats command
    if (args === 'partner-stats') {
      await ack();

      if (!isAdmin(userId)) {
        await respond({
          text: '⚠️ This command is only available to admins.',
          response_type: 'ephemeral',
        });
        return;
      }

      try {
        const counts = await db.partners.countByType();
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const recentPartners = await db.partners.findRecentlyJoined(14);

        await respond({
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: '📊 Partner Statistics', emoji: true },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Total Partners:* ${total}\n\n*By Type:*\n• VCs: ${counts.VC || 0}\n• Corporates: ${counts.CORPORATE || 0}\n• Community Builders: ${counts.COMMUNITY_BUILDER || 0}\n• Angels: ${counts.ANGEL || 0}\n• Other: ${counts.OTHER || 0}`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Recent Joins (14 days):* ${recentPartners.length}`,
              },
            },
          ],
          text: 'Partner statistics',
          response_type: 'ephemeral',
        });
      } catch (error) {
        logger.error({ error: error.message }, 'Error getting partner stats');
        await respond({
          text: `❌ Error getting stats: ${error.message}`,
          response_type: 'ephemeral',
        });
      }
      return;
    }
  });
}

module.exports = {
  registerDigestCommands,
};

