const config = require('../config');
const { formatDate, formatDateTime, divider } = require('../utils/formatters');

/**
 * Build digest blocks for #announcements
 */
function buildDigestBlocks(digestData) {
  const {
    periodStart,
    periodEnd,
    pastEvents = [],
    newPartners = [],
    highlights = [],
    upcomingEvents = [],
    featuredFounders = [],
    summary = '',
  } = digestData;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🚀 ${config.orgName} Partner Digest`,
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${formatDate(periodStart)} — ${formatDate(periodEnd)}`,
        },
      ],
    },
  ];

  // Summary if provided
  if (summary) {
    blocks.push(divider());
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summary,
      },
    });
  }

  // What Happened Section
  if (pastEvents.length > 0 || newPartners.length > 0 || highlights.length > 0) {
    blocks.push(divider());
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📈 WHAT HAPPENED*',
      },
    });

    // Past Events
    if (pastEvents.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🎤 Events Recap*',
        },
      });
      
      const eventLines = pastEvents.map(e => 
        `• *${e.name}* (${formatDate(e.date)}): ${e.attendeeCount || '?'} attendees${e.highlights ? `\n  _${e.highlights}_` : ''}`
      ).join('\n');
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: eventLines,
        },
      });
    }

    // New Partners
    if (newPartners.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*👥 New Partners Joined*',
        },
      });
      
      const partnerLines = newPartners.map(p => 
        `• ${p.name || 'Partner'} — ${p.firm} (${p.partnerType})`
      ).join('\n');
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: partnerLines,
        },
      });
    }

    // Highlights
    if (highlights.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🏆 Highlights*',
        },
      });
      
      const highlightLines = highlights.map(h => `• ${h}`).join('\n');
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: highlightLines,
        },
      });
    }
  }

  // Coming Up Section
  if (upcomingEvents.length > 0) {
    blocks.push(divider());
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📅 COMING UP*',
      },
    });
    
    const eventLines = upcomingEvents.map(e => 
      `• *${formatDate(e.dateTime)}* — ${e.name}: ${e.description || 'Details coming soon'}${e.rsvpLink ? ` <${e.rsvpLink}|RSVP>` : ''}`
    ).join('\n');
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: eventLines,
      },
    });
  }

  // Featured Founders Section
  if (featuredFounders.length > 0) {
    blocks.push(divider());
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*💡 FEATURED FOUNDERS*\n_Looking for intros? Reply with the founder number or react with 🤝_',
      },
    });
    
    featuredFounders.forEach((founder, index) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${index + 1}. ${founder.name}* — ${founder.company}\n${founder.description}\n_Seeking: ${founder.seeking}_`,
        },
      });
    });
  }

  // Footer
  blocks.push(divider());
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Questions? Reply to this message or DM the team. | <#${config.channels.events}|View all events>`,
      },
    ],
  });

  return blocks;
}

/**
 * Build digest approval blocks for #bot-admin
 */
function buildDigestApprovalBlocks(digest, renderedBlocks) {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📰 Digest Ready for Review',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Period:* ${formatDate(digest.periodStart)} — ${formatDate(digest.periodEnd)}`,
      },
    },
    divider(),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Preview:*',
      },
    },
    ...renderedBlocks,
    divider(),
    {
      type: 'actions',
      block_id: `digest_approval_${digest.id}`,
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Send to #announcements',
            emoji: true,
          },
          style: 'primary',
          action_id: 'send_digest_channel',
          value: digest.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✏️ Edit First',
            emoji: true,
          },
          action_id: 'edit_digest',
          value: digest.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📧 Also DM All Partners',
            emoji: true,
          },
          action_id: 'send_digest_dms',
          value: digest.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❌ Cancel',
            emoji: true,
          },
          style: 'danger',
          action_id: 'cancel_digest',
          value: digest.id,
        },
      ],
    },
  ];
}

module.exports = {
  buildDigestBlocks,
  buildDigestApprovalBlocks,
};

