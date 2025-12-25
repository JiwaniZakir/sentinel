# Foundry Partner Bot

An AI-powered Slack bot for automating partner onboarding and community management for non-profit founder support organizations.

## Features

### 🤖 AI-Powered Onboarding
- Multi-turn conversational onboarding using GPT-4
- Automatic partner type detection (VC, Corporate, Community Builder, Angel)
- Personalized introduction generation
- Auto-assignment to user groups and channels

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
- **AI**: OpenAI GPT-4 / GPT-4o
- **Database**: PostgreSQL (Prisma ORM)
- **Deployment**: Railway

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
│   └── scheduler.js          # Cron job management
├── prompts/                  # AI prompt templates
├── templates/                # Slack Block Kit templates
└── utils/                    # Helpers and utilities
```

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Slack workspace (Pro or Business+ plan)
- OpenAI API key

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

## Railway Deployment

1. Connect GitHub repo to Railway
2. Add PostgreSQL database
3. Set environment variables
4. Deploy

Railway will automatically:
- Build using Dockerfile
- Run database migrations
- Start the bot

## Environment Variables

See `.env.example` for all required variables.

Key variables:
- `SLACK_BOT_TOKEN` — Bot OAuth token
- `SLACK_SIGNING_SECRET` — App signing secret
- `OPENAI_API_KEY` — OpenAI API key
- `DATABASE_URL` — PostgreSQL connection string
- `ADMIN_SLACK_IDS` — Comma-separated admin user IDs

## License

MIT
