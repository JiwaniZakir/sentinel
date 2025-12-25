const { formatPartnerType, formatSectors, formatDateTime, divider } = require('../utils/formatters');

/**
 * Build admin approval blocks for partner introduction
 */
function buildIntroApprovalBlocks(partner, introMessage, conversationId) {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📝 New Partner Introduction — Pending Approval',
        emoji: true,
      },
    },
    divider(),
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Partner:*\n<@${partner.slackUserId}>`,
        },
        {
          type: 'mrkdwn',
          text: `*Type:*\n${formatPartnerType(partner.partnerType)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Firm:*\n${partner.firm}`,
        },
        {
          type: 'mrkdwn',
          text: `*Role:*\n${partner.role || 'N/A'}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Sectors:* ${formatSectors(partner.sectors)}`,
      },
    },
    divider(),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Draft Introduction for #introductions:*`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `>${introMessage.split('\n').join('\n>')}`,
      },
    },
    divider(),
    {
      type: 'actions',
      block_id: `intro_approval_${partner.id}`,
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Approve & Post',
            emoji: true,
          },
          style: 'primary',
          action_id: 'approve_intro',
          value: JSON.stringify({ partnerId: partner.id, conversationId }),
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✏️ Edit',
            emoji: true,
          },
          action_id: 'edit_intro',
          value: JSON.stringify({ partnerId: partner.id, conversationId }),
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⏭️ Skip',
            emoji: true,
          },
          action_id: 'skip_intro',
          value: JSON.stringify({ partnerId: partner.id, conversationId }),
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🗑️ Delete',
            emoji: true,
          },
          style: 'danger',
          action_id: 'delete_intro',
          value: JSON.stringify({ partnerId: partner.id, conversationId }),
        },
      ],
    },
  ];
}

/**
 * Build admin approval blocks for event outreach
 */
function buildOutreachApprovalBlocks(outreach) {
  const { partner, event } = outreach;
  
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📤 *OUTREACH DRAFT* | ${event.name} — ${formatDateTime(event.dateTime)}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*To:*\n${partner.name || 'Partner'} (<@${partner.slackUserId}>)`,
        },
        {
          type: 'mrkdwn',
          text: `*Firm:*\n${partner.firm}`,
        },
        {
          type: 'mrkdwn',
          text: `*Type:*\n${formatPartnerType(partner.partnerType)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Focus:*\n${formatSectors(partner.sectors)}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Draft Message:*\n>${outreach.messageDraft.split('\n').join('\n>')}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        },
      ],
    },
    {
      type: 'actions',
      block_id: `outreach_approval_${outreach.id}`,
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Approve',
            emoji: true,
          },
          style: 'primary',
          action_id: 'approve_outreach',
          value: outreach.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✏️ Edit',
            emoji: true,
          },
          action_id: 'edit_outreach',
          value: outreach.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⏭️ Skip',
            emoji: true,
          },
          action_id: 'skip_outreach',
          value: outreach.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🗑️ Delete',
            emoji: true,
          },
          style: 'danger',
          action_id: 'delete_outreach',
          value: outreach.id,
        },
      ],
    },
  ];
}

/**
 * Build batch summary blocks for event outreach
 */
function buildBatchSummaryBlocks(event, counts, batchId) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 Outreach Batch Summary | ${event.name}`,
        emoji: true,
      },
    },
    divider(),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Event:* ${event.name}\n*Date:* ${formatDateTime(event.dateTime)}\n*Type:* ${event.eventType}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Total Partners:* ${total}\n├── VCs: ${counts.VC || 0}\n├── Corporates: ${counts.CORPORATE || 0}\n├── Community Builders: ${counts.COMMUNITY_BUILDER || 0}\n└── Angels: ${counts.ANGEL || 0}`,
      },
    },
    divider(),
    {
      type: 'actions',
      block_id: `batch_actions_${batchId}`,
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Approve All',
            emoji: true,
          },
          style: 'primary',
          action_id: 'approve_all_outreach',
          value: batchId,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📋 Review One-by-One',
            emoji: true,
          },
          action_id: 'review_outreach_batch',
          value: batchId,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❌ Cancel Batch',
            emoji: true,
          },
          style: 'danger',
          action_id: 'cancel_outreach_batch',
          value: batchId,
        },
      ],
    },
  ];
}

/**
 * Build approved/sent confirmation blocks
 */
function buildApprovedBlocks(originalBlocks, approverUserId, action) {
  const statusMap = {
    approved: '✅ Approved and sent',
    skipped: '⏭️ Skipped',
    deleted: '🗑️ Deleted',
  };
  
  return [
    ...originalBlocks.slice(0, -1), // Remove action buttons
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${statusMap[action]} by <@${approverUserId}> at <!date^${Math.floor(Date.now() / 1000)}^{date_short} {time}|${new Date().toISOString()}>`,
        },
      ],
    },
  ];
}

module.exports = {
  buildIntroApprovalBlocks,
  buildOutreachApprovalBlocks,
  buildBatchSummaryBlocks,
  buildApprovedBlocks,
};

