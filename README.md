# Foundry Partner Bot

An AI-powered Slack bot for automating partner onboarding and community management for non-profit founder support organizations.

## Features

### 🤖 AI-Powered Onboarding
- Multi-turn conversational onboarding using GPT-4
- Automatic partner type detection (VC, Corporate, Community Builder, Angel)
- Personalized introduction generation with comprehensive research
- Auto-assignment to user groups and channels

### 🔬 Advanced Research Integration
- **LinkedIn Profile Scraping** with session management and account pooling
- **Email Verification** automation via Gmail IMAP
- **5-Stage Research Pipeline**: Data Collection, Citation Crawling, Quality & Fact Checking, Profile Aggregation, Introduction Generation
- **Multiple Data Sources**: LinkedIn, Perplexity AI, Tavily, Twitter/X, Wikipedia, Web Crawler
- **Session Persistence**: 30-day session caching reduces login frequency by 3x
- **Intelligent Account Rotation**: Distribute load across 12+ LinkedIn accounts

### 📢 Personalized Event Outreach
- Generate personalized event invitations for each partner
- Admin approval workflow before any message is sent
- Batch operations for efficiency
- Message customization before sending

### 📰 Bi-Weekly Digest
- Automated community digest generation
- Highlights, event recaps, new partners, featured founders
- Scheduled delivery with admin approval

### 🔒 Admin Approval Workflow
**Critical**: The bot NEVER sends messages to partners without explicit admin approval. All outgoing communications are drafted and queued in `#bot-admin` for review.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Slack Bolt SDK
- **AI**: OpenAI GPT-4 / GPT-4o, Perplexity AI
- **Research APIs**: Tavily, Twitter API v2, Wikipedia API
- **Database**: PostgreSQL (Prisma ORM)
- **Scraping**: Python Selenium, Chromium
- **Email**: Gmail IMAP (for LinkedIn verification)
- **Security**: AES-256-GCM encryption for credentials
- **Deployment**: Railway (Nixpacks)

## Project Structure

```
src/
├── app.js                    # Bolt app initialization
├── index.js                  # Entry point
├── config/                   # Environment configuration
├── listeners/
│   ├── events/               # Slack event handlers
│   ├── messages/             # DM conversation handler
│   ├── actions/              # Button/modal action handlers
│   └── commands/             # Slash command handlers
├── services/
│   ├── openai.js             # OpenAI API integration
│   ├── database.js           # Prisma database operations
│   ├── slack.js              # Slack API helpers
│   ├── scheduler.js          # Cron job management
│   └── research/             # Research pipeline
│       ├── accountPool.js    # LinkedIn account rotation
│       ├── sessionManager.js # Session persistence & encryption
│       ├── emailVerification.js # Gmail IMAP verification
│       ├── linkedin.js       # LinkedIn scraper integration
│       ├── perplexity.js     # Perplexity AI research
│       ├── tavily.js         # Tavily search
│       ├── twitter.js        # Twitter/X API integration
│       ├── wikipedia.js      # Wikipedia search
│       ├── crawler.js        # Web crawler for citations
│       ├── orchestrator.js   # Research pipeline coordinator
│       └── introGenerator.js # AI introduction generator
├── prompts/                  # AI prompt templates
├── templates/                # Slack Block Kit templates
├── utils/                    # Helpers and utilities
└── scripts/                  # Python scraping scripts
    └── scrape_linkedin.py    # LinkedIn Selenium scraper
```

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Slack workspace (Pro or Business+ plan)
- OpenAI API key
- **For Research Features**:
  - Perplexity API key
  - Tavily API key
  - 1-12 burner LinkedIn accounts with Gmail verification
  - Python 3.9+ with Selenium
  - Chromium browser

### 1. Clone and Install

```bash
git clone https://github.com/JiwaniZakir/Foundry_Bot_Slack.git
cd Foundry_Bot_Slack
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Set Up Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Configure Slack App

1. Create app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add Bot Token Scopes (see below)
3. Enable Event Subscriptions
4. Enable Interactivity
5. Install to workspace

### 5. Run

```bash
# Development (Socket Mode)
npm run dev

# Production
npm start
```

## Slack App Configuration

### Required Bot Token Scopes

```
channels:join
channels:manage
channels:read
chat:write
chat:write.public
groups:read
groups:write
im:history
im:read
im:write
reactions:read
reactions:write
team:read
usergroups:read
usergroups:write
users:read
users:read.email
users.profile:read
commands
files:write
```

### Event Subscriptions

- `team_join`
- `member_joined_channel`
- `app_home_opened`
- `message.im`

## Slash Commands

### Partner Commands
- `/partnerbot help` — Show help
- `/partnerbot intro` — Start/redo onboarding
- `/partnerbot events` — See upcoming events

### Admin Commands
- `/partnerbot announce-event` — Create event outreach
- `/partnerbot send-digest` — Generate digest
- `/partnerbot add-highlight <text>` — Add to digest
- `/partnerbot partner-stats` — View statistics

## LinkedIn Session Manager Setup

The bot includes an advanced LinkedIn scraping system with:
- **Session persistence** (30-day caching)
- **Account pooling** (rotate across 12+ accounts)
- **Automated email verification** (Gmail IMAP)
- **Intelligent rate limiting** (75 scrapes/day per account)

### Quick Setup

See [LinkedIn Session Manager Quick Start](./docs/LINKEDIN_SESSION_MANAGER_QUICKSTART.md) for 15-minute setup.

### Key Commands

```bash
# Generate encryption key
/partnerbot linkedin-generate-key

# View all accounts
/partnerbot linkedin-accounts

# Pool statistics
/partnerbot linkedin-pool-stats

# Add account (shows instructions)
/partnerbot linkedin-add-account
```

### Required Environment Variables

```bash
# Encryption key for passwords and cookies (64-char hex)
SESSION_ENCRYPTION_KEY=<generated-key>

# Optional: Rate limiting
LINKEDIN_DAILY_LIMIT_PER_ACCOUNT=75
LINKEDIN_COOLDOWN_HOURS=6
```

### Documentation

- 📘 [Quick Start Guide](./docs/LINKEDIN_SESSION_MANAGER_QUICKSTART.md) - 15-minute setup
- 📖 [Full Setup Guide](./docs/LINKEDIN_SESSION_MANAGER_SETUP.md) - Complete documentation
- 🏗️ [Research Architecture](./docs/RESEARCH_ARCHITECTURE.md) - System design

## Railway Deployment

1. Connect GitHub repo to Railway
2. Add PostgreSQL database
3. Set environment variables (including `SESSION_ENCRYPTION_KEY`)
4. Deploy

Railway will automatically:
- Build using Nixpacks
- Install Python dependencies
- Run database migrations
- Start the bot

## Environment Variables

See `.env.example` for all required variables.

### Core Variables
- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`
- `DATABASE_URL`
- `OPENAI_API_KEY`

### Research Variables
- `SESSION_ENCRYPTION_KEY` (required for LinkedIn)
- `PERPLEXITY_API_KEY`
- `TAVILY_API_KEY`
- `TWITTER_BEARER_TOKEN` (optional)

### Rate Limiting
- `LINKEDIN_DAILY_LIMIT_PER_ACCOUNT=75`
- `LINKEDIN_COOLDOWN_HOURS=6`

Key variables:
- `SLACK_BOT_TOKEN` — Bot OAuth token
- `SLACK_SIGNING_SECRET` — App signing secret
- `OPENAI_API_KEY` — OpenAI API key
- `DATABASE_URL` — PostgreSQL connection string
- `ADMIN_SLACK_IDS` — Comma-separated admin user IDs

## License

MIT
