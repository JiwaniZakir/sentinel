const config = require('../config');

/**
 * Build welcome DM blocks for new partners
 */
function buildWelcomeBlocks(partnerName) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Hey ${partnerName}! 👋\n\nWelcome to *${config.orgName}*! We're thrilled to have you join our community of partners supporting early-stage founders.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `I'd love to learn a bit about you so we can connect you with the right founders and opportunities. It's a quick 3-minute chat.`,
      },
    },
    {
      type: 'actions',
      block_id: 'onboarding_welcome',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🚀 Start Onboarding',
            emoji: true,
          },
          style: 'primary',
          action_id: 'start_onboarding',
          value: 'start',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⏰ Maybe Later',
            emoji: true,
          },
          action_id: 'onboarding_later',
          value: 'later',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⏭️ Skip',
            emoji: true,
          },
          action_id: 'onboarding_skip',
          value: 'skip',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_This helps us personalize your experience and connect you with relevant founders._`,
        },
      ],
    },
  ];
}

/**
 * Build "maybe later" response blocks
 */
function buildMaybeLaterBlocks(partnerName) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `No problem, ${partnerName}! Take your time. 🙌\n\nWhen you're ready, just click the button below or message me "ready" and we can pick up from here.`,
      },
    },
    {
      type: 'actions',
      block_id: 'onboarding_reminder',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🚀 Start Onboarding',
            emoji: true,
          },
          style: 'primary',
          action_id: 'start_onboarding',
          value: 'start',
        },
      ],
    },
  ];
}

/**
 * Build "skip" response blocks
 */
function buildSkipBlocks(partnerName) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Got it, ${partnerName}! You can always complete onboarding later by typing \`/partnerbot intro\`.\n\nIn the meantime, feel free to explore the channels and introduce yourself in <#${config.channels.introductions}> when you're ready.\n\nWelcome to ${config.orgName}! 🎉`,
      },
    },
  ];
}

/**
 * Build onboarding started confirmation blocks
 */
function buildOnboardingStartedBlocks() {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Great! Let's get started. 🎯\n\nFirst things first — what type of partner are you?\n\n• *VC* — Venture capital fund or investor\n• *Corporate* — Corporate innovation, BD, or executive\n• *Community Builder* — Accelerator, incubator, or founder community\n• *Angel* — Individual angel investor`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Just type your answer naturally, like "I'm a VC" or "Corporate partner"_`,
        },
      ],
    },
  ];
}

/**
 * Build simple text message block
 */
function buildTextBlocks(text) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text,
      },
    },
  ];
}

/**
 * Build onboarding completion blocks (for partner)
 */
function buildOnboardingCompleteBlocks(partnerName) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Thanks so much, ${partnerName}! 🙏\n\nI've got everything I need. An admin will review your info and get you set up with the right channels and introductions shortly.\n\nIn the meantime, feel free to explore and say hi in <#${config.channels.community}>!`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_You'll receive a notification once your introduction is posted._`,
        },
      ],
    },
  ];
}

module.exports = {
  buildWelcomeBlocks,
  buildMaybeLaterBlocks,
  buildSkipBlocks,
  buildOnboardingStartedBlocks,
  buildTextBlocks,
  buildOnboardingCompleteBlocks,
};

