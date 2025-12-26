const { isAdmin } = require('../../utils/validators');

/**
 * Register /partnerbot help command
 */
function registerHelpCommand(app) {
  app.command('/partnerbot', async ({ command, ack, respond }) => {
    await ack();

    const args = command.text.trim().toLowerCase();
    const userId = command.user_id;
    const userIsAdmin = isAdmin(userId);

    // Route to appropriate handler based on subcommand
    if (args === '' || args === 'help') {
      await showHelp(respond, userIsAdmin);
    } else if (args === 'intro') {
      // This will be handled by intro command handler
      return;
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
async function showHelp(respond, isAdmin) {
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
• \`/partnerbot feature-founder @user\` — Feature founder in digest
• \`/partnerbot view-queue\` — See pending approvals
• \`/partnerbot partner-stats\` — View engagement analytics
• \`/partnerbot export-partners\` — Export partner list as CSV
• \`/partnerbot test-onboarding\` — Test onboarding workflow (DB, OpenAI, Slack)
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

  if (isAdmin) {
    blocks.push({
      type: 'divider',
    });
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

module.exports = {
  registerHelpCommand,
};

