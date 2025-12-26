require('dotenv').config();

const config = {
  // Slack credentials
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  },

  // Research APIs
  research: {
    enabled: process.env.RESEARCH_ENABLED !== 'false',
    rateLimit: parseInt(process.env.RESEARCH_RATE_LIMIT) || 20,
    linkedin: {
      email: process.env.LINKEDIN_EMAIL,
      password: process.env.LINKEDIN_PASSWORD,
    },
    perplexity: {
      apiKey: process.env.PERPLEXITY_API_KEY,
    },
    tavily: {
      apiKey: process.env.TAVILY_API_KEY,
    },
  },

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // Organization
  orgName: process.env.ORG_NAME || 'Foundry',
  adminSlackIds: (process.env.ADMIN_SLACK_IDS || '').split(',').filter(Boolean),

  // Channel IDs
  channels: {
    announcements: process.env.CHANNEL_ANNOUNCEMENTS,
    community: process.env.CHANNEL_COMMUNITY,
    introductions: process.env.CHANNEL_INTRODUCTIONS,
    events: process.env.CHANNEL_EVENTS,
    mentorship: process.env.CHANNEL_MENTORSHIP,
    founderShowcase: process.env.CHANNEL_FOUNDER_SHOWCASE,
    dealFlow: process.env.CHANNEL_DEAL_FLOW,
    sponsorship: process.env.CHANNEL_SPONSORSHIP,
    foundersRaised: process.env.CHANNEL_FOUNDERS_RAISED,
    partnershipOpp: process.env.CHANNEL_PARTNERSHIP_OPP,
    dropEvents: process.env.CHANNEL_DROP_EVENTS,
    sectorFintech: process.env.CHANNEL_SECTOR_FINTECH,
    sectorHealthtech: process.env.CHANNEL_SECTOR_HEALTHTECH,
    sectorClimate: process.env.CHANNEL_SECTOR_CLIMATE,
    sectorAiMl: process.env.CHANNEL_SECTOR_AI_ML,
    sectorHardwareRobotics: process.env.CHANNEL_SECTOR_HARDWARE_ROBOTICS,
    sectorConsumer: process.env.CHANNEL_SECTOR_CONSUMER,
    teamInternal: process.env.CHANNEL_TEAM_INTERNAL,
    botAdmin: process.env.CHANNEL_BOT_ADMIN,
    botLogs: process.env.CHANNEL_BOT_LOGS,
  },

  // User Group IDs
  userGroups: {
    vcPartners: process.env.GROUP_VC_PARTNERS,
    corporatePartners: process.env.GROUP_CORPORATE_PARTNERS,
    communityBuilders: process.env.GROUP_COMMUNITY_BUILDERS,
    angelInvestors: process.env.GROUP_ANGEL_INVESTORS,
    mentors: process.env.GROUP_MENTORS,
    tier1: process.env.GROUP_TIER_1,
    orgTeam: process.env.GROUP_ORG_TEAM,
  },

  // Digest schedule (cron format)
  digestSchedule: process.env.DIGEST_SCHEDULE || '0 9 * * 1', // Every Monday at 9am

  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
};

// Validate required config
const requiredEnvVars = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'OPENAI_API_KEY',
  'DATABASE_URL',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

module.exports = config;

