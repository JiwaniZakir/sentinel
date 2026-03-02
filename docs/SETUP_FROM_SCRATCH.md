# Setup From Scratch

This is the complete guide for going from nothing to a running Aegis instance. Read it end-to-end if you are setting up Aegis for the first time.

---

## Table of Contents

1. [What is OpenClaw](#1-what-is-openclaw)
2. [What is Aegis](#2-what-is-aegis)
3. [System requirements](#3-system-requirements)
4. [Installing Docker](#4-installing-docker)
5. [Getting an Anthropic API key](#5-getting-an-anthropic-api-key)
6. [Cloning Aegis](#6-cloning-aegis)
7. [Running bootstrap](#7-running-bootstrap)
8. [Configuring your Anthropic key](#8-configuring-your-anthropic-key)
9. [Pairing WhatsApp](#9-pairing-whatsapp)
10. [Configuring integrations](#10-configuring-integrations)
11. [Understanding the agent system](#11-understanding-the-agent-system)
12. [Understanding skills](#12-understanding-skills)
13. [Understanding hooks](#13-understanding-hooks)
14. [Understanding cron jobs](#14-understanding-cron-jobs)
15. [Daily operation](#15-daily-operation)
16. [Customizing for yourself](#16-customizing-for-yourself)
17. [Backing up and restoring](#17-backing-up-and-restoring)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. What is OpenClaw

[OpenClaw](https://github.com/openclaw/openclaw) is an open-source AI agent platform. It provides:

- **AI agents** powered by Claude (Anthropic) or other LLMs
- **Channels** for interacting with agents (WhatsApp, Telegram, web UI)
- **Cron scheduling** for running agent tasks on a schedule
- **Tools** like `web_fetch` (HTTP calls) and `web_search` (search engine)
- **Skills** (Markdown files that teach agents new capabilities) -- 53+ bundled skills ship with OpenClaw, plus you can add your own
- **Hooks** (TypeScript functions that intercept events)
- **Memory** (persistent agent context stored in LanceDB)
- **A Control UI** served directly from the gateway at `http://localhost:18789` for managing sessions and pairing channels
- **Workspace bootstrap files** that inject context into agents on startup (BOOT.md, USER.md, MEMORY.md, SOUL.md, IDENTITY.md, and more)

OpenClaw runs as a single Node.js process (requires Node.js >= 22.12.0). You can install it via npm, run it in a Docker container, or build from source. Configuration lives in a JSON5 file (`openclaw.json`) with hot-reload support, and you extend it with skills and hooks.

## 2. What is Aegis

Aegis is a pre-configured OpenClaw setup designed as a personal intelligence platform. It adds:

- **A data-api** (FastAPI + PostgreSQL) that stores encrypted financial data, calendar events, LMS assignments, health metrics, content drafts, and social posts
- **10 integration clients** that connect to external services (Plaid, Canvas, Garmin, Google Calendar, LinkedIn, X, etc.)
- **8 skills** that teach OpenClaw agents how to query and reason about the data
- **3 hooks** for security (PII redaction, audit logging, budget tracking)
- **8 cron jobs** for automated data sync, morning briefings, content generation, and weekly digests
- **4 pre-configured agents** with different roles and model assignments

In short: OpenClaw is the brain, Aegis is the configuration and data layer that turns it into a personal assistant.

## 3. System Requirements

| Requirement | Minimum | Recommended |
|------------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 10 GB | 20 GB |
| OS | Any OS that runs Docker | Ubuntu 22.04+ or macOS |
| Node.js | 22.12.0+ (only if installing OpenClaw via npm) | 22.x LTS |
| Network | Outbound internet access | Same |

You also need:
- An Anthropic API key (costs money per API call -- roughly $1-5/day with default configuration)
- (Optional) API credentials for any integrations you want to enable

**Note:** If you use the Docker-based setup (recommended for Aegis), you do NOT need Node.js installed on the host -- it runs inside the container. Node.js is only required if you install OpenClaw globally via npm for local development.

## 4. Installing Docker

### macOS

1. Download and install [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
2. Open Docker Desktop and wait for it to start
3. Verify: `docker compose version` should show v2.29+

### Ubuntu / Debian

```bash
# Install Docker using the official convenience script
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (avoids needing sudo)
sudo usermod -aG docker $USER

# Log out and back in, then verify
docker compose version
```

### Other Linux distributions

Follow the [official Docker install guide](https://docs.docker.com/engine/install/) for your distribution.

### Verify Docker Compose version

```bash
docker compose version
# Must be v2.29.0 or later
```

If your system has `docker-compose` (with a hyphen) instead of `docker compose` (with a space), you have the legacy v1 version. Upgrade Docker to get Compose v2.

## 5. Getting an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create an account or sign in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy the key -- it starts with `sk-ant-api03-`

Keep this key safe. It will be stored in your `.env` file (which is never committed to Git).

Estimated costs with the default Aegis configuration:
- 4 sync jobs + 1 briefing + 1 content job per day
- Roughly $1-5/day depending on interaction volume
- Default budget guardrails: $5/day, $50/month (configurable)

## 6. Cloning Aegis

```bash
git clone https://github.com/JiwaniZakir/aegis.git
cd aegis
```

The repository structure:

```
aegis/
├── config/          # OpenClaw agent configuration
├── skills/          # Agent skill definitions (Markdown)
├── hooks/           # Event hooks (TypeScript)
├── data-api/        # Encrypted data persistence (Python/FastAPI)
├── infrastructure/  # Docker, scripts, tunnel config
├── .env.example     # Environment variable template
├── docker-compose.yml
└── Makefile
```

## 7. Running Bootstrap

```bash
./infrastructure/scripts/bootstrap.sh
```

This command does everything needed for initial setup:

0. **Clones OpenClaw** if not already present -- the script runs `git clone https://github.com/openclaw/openclaw.git` into an `openclaw/` directory at the project root. This is the Docker-based deployment path. (Alternatively, you can install OpenClaw globally with `npm install -g openclaw@latest` and run `openclaw onboard --install-daemon` for the interactive setup wizard, but the bootstrap script handles the Docker approach automatically.)

1. **Generates `.env`** from `.env.example` with auto-generated secrets:
   - `DATA_API_TOKEN` -- 64-character hex token for API authentication
   - `ENCRYPTION_MASTER_KEY` -- 64-character hex key for AES-256-GCM encryption
   - `POSTGRES_PASSWORD` -- 48-character hex database password

2. **Starts Docker services** by running `docker compose up -d --build`:
   - PostgreSQL 16 with pgvector extension
   - Data API (FastAPI on port 8000 internally)
   - OpenClaw gateway (default port 18789, using `ghcr.io/openclaw/openclaw` image). The gateway bind mode must be `"lan"` (not the default `"loopback"`) when running inside Docker so other containers can reach it. The bridge port is 18790.
   - Cloudflare tunnel (starts but does nothing without a tunnel token)

3. **Waits for services to become healthy** (up to 60 seconds)

4. **Runs database migrations** to create all required tables

After bootstrap completes, you will see next steps printed in your terminal.

### Alternative: Installing OpenClaw via npm (non-Docker)

If you prefer to run OpenClaw directly on the host instead of in Docker:

```bash
# Requires Node.js >= 22.12.0
npm install -g openclaw@latest

# Run the interactive setup wizard
openclaw onboard --install-daemon

# Start the gateway
openclaw gateway
```

This installs OpenClaw globally and creates its configuration at `~/.openclaw/`. The default paths are:
- Config: `~/.openclaw/openclaw.json` (JSON5 format with hot-reload)
- Workspace: `~/.openclaw/workspace`
- Credentials: `~/.openclaw/credentials/`
- Sessions: `~/.openclaw/agents/<agentId>/sessions/`

You can also build from source:

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm build
```

For Aegis, the Docker approach (bootstrap.sh) is recommended because it manages all 4 services together. If you install OpenClaw via npm, you still need to run PostgreSQL, the data-api, and cloudflared separately.

If bootstrap fails, see the [Troubleshooting](#18-troubleshooting) section.

## 8. Configuring Your Anthropic Key

Bootstrap generates all Aegis-specific secrets, but OpenClaw itself needs additional environment variables. The most important one is your Anthropic API key.

```bash
# Open .env in your preferred editor
nano .env    # or: vim .env, code .env
```

Find this line and add your key:

```
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

Other optional environment variables for OpenClaw:

```
OPENCLAW_GATEWAY_TOKEN=...        # Optional: token for authenticating API calls to the gateway
BRAVE_API_KEY=...                  # Optional: enables web search via Brave Search API
```

Then restart the gateway so it picks up the new key:

```bash
docker compose restart openclaw-gateway
```

Verify the gateway is healthy:

```bash
docker compose ps
# openclaw-gateway should show "Up (healthy)"

# You can also hit the gateway health endpoint directly
curl -sf http://localhost:18789/healthz
```

## 9. Pairing WhatsApp

OpenClaw uses the Baileys library (WhatsApp Web protocol) for WhatsApp integration. There are two ways to pair:

### Method 1: Control UI (QR code)

1. Open the Control UI in your browser: [http://localhost:18789](http://localhost:18789)
2. The UI will display a QR code for WhatsApp pairing
3. On your phone:
   - Open WhatsApp
   - Go to **Settings > Linked Devices > Link a Device**
   - Scan the QR code on screen
4. Once paired, the QR code disappears and you will see a connected session

### Method 2: CLI pairing

If you installed OpenClaw via npm (or have access to the CLI inside the container):

```bash
# Initiate WhatsApp login (displays QR in terminal)
openclaw channels login --channel whatsapp

# After scanning, check for pending pairing requests
openclaw pairing list whatsapp

# Approve a pairing request
openclaw pairing approve whatsapp <CODE>
```

### Configuring your phone number

To set your phone number for outbound messages, edit `.env`:

```
WHATSAPP_ADMIN_PHONE=+15551234567
```

And update the `allowFrom` and `defaultTo` fields in `config/openclaw.json` to match your number. Use E.164 format with the `+` prefix (e.g., `"+15551234567"`).

The WhatsApp channel is configured in `config/openclaw.json` under `channels.whatsapp`. Key settings:
- `dmPolicy` -- controls who can message the agent. Options: `"pairing"` (default, requires approval), `"allowlist"`, `"open"`, `"disabled"`
- `allowFrom` -- array of E.164 phone numbers allowed to interact (when using `"allowlist"` policy)
- `defaultTo` -- phone number for outbound messages (briefings, content drafts)

After making these changes:

```bash
docker compose restart openclaw-gateway
```

You can now message the agent on WhatsApp and it will respond.

## 10. Configuring Integrations

All integrations are optional. You can start with zero integrations and add them one at a time.

### Plaid (Banking)

Plaid connects to your bank accounts for transaction and balance data.

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com/)
2. Get your credentials (start with Sandbox for testing, then upgrade to Development)
3. Add to `.env`:
   ```
   PLAID_CLIENT_ID=your-client-id
   PLAID_SECRET=your-secret
   PLAID_ENV=sandbox
   ```
4. Restart: `docker compose restart data-api`
5. The finance sync cron job will start pulling data automatically

### Canvas LMS

Canvas provides assignment deadlines, grades, and announcements from your university.

1. Log in to your Canvas instance
2. Go to **Account > Settings > Approved Integrations > New Access Token**
3. Generate a token and copy it
4. Store the token via the API:
   ```bash
   curl -X POST http://localhost:8000/credentials \
     -H "Authorization: Bearer $(grep DATA_API_TOKEN .env | cut -d= -f2)" \
     -H "Content-Type: application/json" \
     -d '{"user_id":"default","service_name":"canvas_access_token","value":"YOUR_CANVAS_TOKEN"}'
   ```
5. Set your Canvas URL in `.env`:
   ```
   CANVAS_API_URL=https://canvas.youruniversity.edu/api/v1
   ```
6. Restart: `docker compose restart data-api`

### Google Calendar

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a project and enable the **Google Calendar API**
3. Create OAuth 2.0 credentials (Desktop app type)
4. Add to `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
5. Complete the OAuth flow to get a refresh token, then store it:
   ```bash
   curl -X POST http://localhost:8000/credentials \
     -H "Authorization: Bearer $(grep DATA_API_TOKEN .env | cut -d= -f2)" \
     -H "Content-Type: application/json" \
     -d '{"user_id":"default","service_name":"google_refresh_token","value":"YOUR_REFRESH_TOKEN"}'
   ```
6. Restart: `docker compose restart data-api`

### Outlook Calendar (Microsoft Graph)

1. Go to [portal.azure.com](https://portal.azure.com/)
2. Register an application in Azure Active Directory
3. Add the `Calendars.Read` permission
4. Add to `.env`:
   ```
   AZURE_CLIENT_ID=your-client-id
   AZURE_CLIENT_SECRET=your-client-secret
   AZURE_TENANT_ID=your-tenant-id
   ```
5. Store the refresh token via `/credentials` (same pattern as Google Calendar)

### Garmin Connect

1. Add to `.env`:
   ```
   GARMIN_EMAIL=your-garmin-email@example.com
   GARMIN_PASSWORD=your-garmin-password
   ```
2. Restart: `docker compose restart data-api`

Note: The Garmin integration uses an unofficial library (`garminconnect`). It may break if Garmin changes their API.

### Apple Health

Apple Health data is ingested via iOS Shortcuts. There is no direct API.

1. On your iPhone, open the **Shortcuts** app
2. Create a shortcut that:
   - Reads health data (steps, calories, heart rate, etc.)
   - Formats it as JSON
   - Sends a POST request to `http://your-server:8000/health/ingest`
   - Includes the `Authorization: Bearer <DATA_API_TOKEN>` header
3. Set the shortcut to run on a schedule (e.g., hourly via Automations)

### LinkedIn

1. Create an app at [developer.linkedin.com](https://developer.linkedin.com/)
2. Get an access token with `w_member_social` permission
3. Add to `.env`:
   ```
   LINKEDIN_ACCESS_TOKEN=your-access-token
   ```

Note: LinkedIn's API is very limited. Posting requires an approved app.

### X / Twitter

1. Sign up for the [X Developer Portal](https://developer.x.com/)
2. Create a project and app
3. Generate keys and tokens
4. Add to `.env`:
   ```
   X_API_KEY=your-api-key
   X_API_SECRET=your-api-secret
   X_ACCESS_TOKEN=your-access-token
   X_ACCESS_TOKEN_SECRET=your-access-token-secret
   X_BEARER_TOKEN=your-bearer-token
   ```

Note: X API v2 requires a paid plan ($100/month for Basic tier) for read + write access.

### Schwab (Investments)

1. Register at [developer.schwab.com](https://developer.schwab.com/)
2. Create an app and get credentials
3. Add to `.env`:
   ```
   SCHWAB_APP_KEY=your-app-key
   SCHWAB_APP_SECRET=your-app-secret
   SCHWAB_CALLBACK_URL=your-callback-url
   ```

### After adding integrations

Always restart the affected service:

```bash
docker compose restart data-api
# If you changed openclaw.json:
docker compose restart openclaw-gateway
```

## 11. Understanding the Agent System

Aegis runs 4 AI agents, each with a specific role:

### Main Agent (`main`)

- **Model:** Claude Sonnet (smarter, more expensive)
- **Purpose:** Interactive assistant -- responds to your WhatsApp messages
- **Tools:** `web_fetch`, `web_search`, `memory_search`
- **Channel:** WhatsApp
- **When it runs:** When you send a message

This is the agent you talk to. It has access to all skills and can query any data-api endpoint.

### Sync Agent (`sync`)

- **Model:** Claude Haiku (faster, cheaper)
- **Purpose:** Background data synchronization
- **Tools:** `web_fetch` only
- **Channel:** None (silent)
- **When it runs:** On cron schedule (every 6h for finance, every 15m for calendar, etc.)

This agent pulls data from external services via the data-api. It runs silently and only reports errors.

### Briefing Agent (`briefing`)

- **Model:** Claude Haiku
- **Purpose:** Morning briefings, weekly digests, security audits
- **Tools:** `web_fetch` only
- **Channel:** WhatsApp (announces results)
- **When it runs:** Daily at 6 AM, Sunday at 8 PM, Monday at 9 AM

This agent aggregates data from multiple sources and composes summaries delivered to WhatsApp.

### Content Agent (`content`)

- **Model:** Claude Sonnet
- **Purpose:** Generate LinkedIn and X thought-leadership posts
- **Tools:** `web_fetch`, `web_search`
- **Channel:** WhatsApp (announces drafts for approval)
- **When it runs:** Daily at 7 AM

This agent uses web search to find trending topics, generates posts, and sends drafts to WhatsApp for your review before publishing.

### Workspace bootstrap files

When OpenClaw starts (or when an agent session begins), it injects context from workspace files. These files live in `config/` for Aegis:

| File | Purpose |
|------|---------|
| `BOOT.md` | Startup orientation -- runs on every gateway restart. Tells the agent who it is and what to do. |
| `USER.md` | User profile and preferences (your name, timezone, goals) |
| `MEMORY.md` | Long-term curated memory that persists across sessions |
| `SOUL.md` | Persona definition, ethical boundaries, communication tone |
| `IDENTITY.md` | Agent name and aesthetic (how the agent introduces itself) |
| `TOOLS.md` | Tool usage guidance (when and how to use web_fetch, web_search, etc.) |
| `AGENTS.md` | Operating instructions and inter-agent coordination |
| `HEARTBEAT.md` | Lightweight periodic checklist (runs on heartbeat interval) |
| `BOOTSTRAP.md` | One-time first-run setup instructions (auto-deleted after first run) |

You will primarily edit `BOOT.md`, `USER.md`, and `MEMORY.md` to customize the agent for yourself.

### Agent configuration

All agents are defined in `config/openclaw.json` under the `agents` key. You can:
- Change models (swap Sonnet for Haiku to reduce costs)
- Add or remove tools
- Adjust heartbeat intervals
- Modify the active hours window

## 12. Understanding Skills

Skills are Markdown files that teach agents how to perform tasks. They are NOT code -- they are instructions that the LLM reads and follows.

Each skill has:
- A `SKILL.md` file with YAML frontmatter (`name`, `description`, `eligibility`)
- API endpoint documentation with example `web_fetch` calls
- Guidelines for formatting and presenting data

### Skill loading (3-tier system)

OpenClaw loads skills from three tiers, in priority order:

1. **Workspace skills** -- Custom skills in your workspace (`skills/` in Aegis). These take highest priority.
2. **Managed skills** -- Installed via OpenClaw package management.
3. **Bundled skills** -- 53+ skills that ship with OpenClaw out of the box (web search, file management, memory, etc.).

Aegis adds 8 workspace-level skills on top of the bundled ones:

| Skill | Directory | What it teaches |
|-------|-----------|----------------|
| Finance | `skills/aegis-finance/` | Banking queries, spending analysis, portfolio tracking |
| Calendar | `skills/aegis-calendar/` | Event queries, conflict detection, free slot finding |
| LMS | `skills/aegis-lms/` | Assignment tracking, grade monitoring, deadline alerts |
| Health | `skills/aegis-health/` | Health metrics, goal tracking, wellness recommendations |
| Social | `skills/aegis-social/` | LinkedIn and X posting, engagement tracking |
| Content | `skills/aegis-content/` | Content generation strategy and publishing |
| Briefing | `skills/aegis-briefing/` | Morning briefing and weekly digest composition |
| Security | `skills/aegis-security/` | Audit log verification, budget monitoring |

OpenClaw auto-discovers skills at startup. To add a new skill, create a new directory in `skills/` with a `SKILL.md` file. No restart required -- OpenClaw watches for file changes.

## 13. Understanding Hooks

Hooks are TypeScript functions that intercept OpenClaw events. They run synchronously before the event is processed.

The 3 custom hooks:

### audit-logger

- **Events:** `command`, `message:sent`, `message:received`
- **What it does:** POSTs all agent events to the data-api audit endpoint for hash-chain logging
- **Why:** Creates a tamper-evident record of everything the agent does

### pii-guard

- **Events:** `message:sent`
- **What it does:** Scans outbound messages for SSNs, credit card numbers, and bank account numbers, then redacts them before delivery
- **Why:** Prevents accidental PII exposure in WhatsApp messages

### budget-guard

- **Events:** `message:sent`
- **What it does:** Tracks LLM token usage and cost. Sends warnings at 80%, 95%, and 100% of daily/monthly budgets
- **Why:** Prevents runaway LLM costs

Additionally, 2 bundled OpenClaw hooks are enabled:

- **session-memory:** Saves session context when you start a new conversation (`/new`)
- **boot-md:** Loads `config/BOOT.md` on gateway startup to orient the agent

Hooks are configured in `config/openclaw.json` under `hooks.internal.entries`.

## 14. Understanding Cron Jobs

Cron jobs run agent tasks on a schedule. They are defined in `config/cron/jobs.json`.

| Job | Schedule | Agent | What it does |
|-----|----------|-------|-------------|
| `sync-finance` | Every 6 hours | sync | Pulls bank transactions and balances via Plaid/Schwab |
| `sync-calendar` | Every 15 minutes | sync | Syncs Google Calendar and Outlook events |
| `sync-lms` | Every 30 minutes | sync | Syncs Canvas and Blackboard assignments |
| `sync-health` | Hourly | sync | Processes Garmin and Apple Health data |
| `morning-briefing` | Daily 6:00 AM ET | briefing | Generates and delivers daily briefing to WhatsApp |
| `generate-content` | Daily 7:00 AM ET | content | Creates LinkedIn/X post drafts, announces to WhatsApp |
| `weekly-digest` | Sunday 8:00 PM ET | briefing | Generates weekly summary with trends and recommendations |
| `security-audit` | Monday 9:00 AM ET | briefing | Verifies audit log integrity and checks LLM budget |

Each job specifies:
- `schedule.expr` -- standard cron expression
- `schedule.tz` -- timezone
- `agentId` -- which agent runs the task
- `delivery.mode` -- `"none"` (silent) or `"announce"` (sends to WhatsApp)
- `payload.message` -- the instructions given to the agent

To disable a job, set `"enabled": false` in `config/cron/jobs.json`.

To change schedules, edit the `expr` field. Use [crontab.guru](https://crontab.guru/) to build cron expressions.

## 15. Daily Operation

Once configured, Aegis runs autonomously. Here is what happens each day:

### Automatic (no input needed)

- Data syncs run silently in the background (finance, calendar, LMS, health)
- Morning briefing arrives on WhatsApp at 6 AM with your day's summary
- Content drafts are generated and sent to WhatsApp at 7 AM for review
- Weekly digest arrives Sunday evening
- Security audit runs Monday morning

### Interactive

- Message the agent on WhatsApp anytime with questions:
  - "What did I spend on food this month?"
  - "What assignments are due this week?"
  - "How are my health goals looking?"
  - "Check my portfolio"
- The agent uses skills to query the data-api and responds with formatted answers

### Occasional maintenance

- Check `make health` periodically to verify services are running
- Review LLM spend: `curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/budget/usage`
- Run backups: `make backup` (or set up automated backups)
- Rotate secrets every 90 days: `./infrastructure/scripts/rotate-secrets.sh`

## 16. Customizing for Yourself

### Change your identity

Edit `config/BOOT.md` to change the agent's orientation:
- Replace "Zakir" with your name
- Update your university, timezone, and preferences
- Adjust the tone and style guidelines

Edit `config/USER.md` with your personal preferences and context.

### Change health goals

Edit `.env`:

```
DAILY_PROTEIN_TARGET_G=150    # Default: 175
DAILY_CALORIE_LIMIT=2000      # Default: 1900
```

### Change briefing schedule

Edit `config/cron/jobs.json` and change the `schedule.expr` and `schedule.tz` fields. For example, to get your briefing at 7 AM Pacific instead of 6 AM Eastern:

```json
{
  "schedule": {
    "kind": "cron",
    "expr": "0 7 * * *",
    "tz": "America/Los_Angeles"
  }
}
```

### Change agent models

Edit `config/openclaw.json` directly, or use the CLI if OpenClaw is installed via npm:

```bash
openclaw config get agents.list
openclaw config set agents.list[0].model "anthropic/claude-haiku-4-5"
```

To use cheaper models everywhere in the JSON config:

```json
{
  "id": "main",
  "model": "anthropic/claude-haiku-4-5"
}
```

### Disable features you do not use

In `config/cron/jobs.json`, set `"enabled": false` on jobs you do not need. For example, if you do not use Canvas LMS:

```json
{
  "jobId": "sync-lms",
  "enabled": false
}
```

### Change WhatsApp phone number

Update these locations:
1. `.env`: `WHATSAPP_ADMIN_PHONE=+15551234567` (E.164 format)
2. `config/openclaw.json`: `channels.whatsapp.allowFrom` and `channels.whatsapp.defaultTo` (also E.164 format, e.g., `"+15551234567"`)

## 17. Backing Up and Restoring

### Creating a backup

```bash
make backup
```

This creates an encrypted backup in `backups/`. Old backups are automatically pruned (keeps last 7).

### Automating backups

Add to your crontab:

```bash
crontab -e
# Add:
0 3 * * * cd /path/to/aegis && ./infrastructure/scripts/backup.sh
```

### Restoring from backup

```bash
# Decrypt and restore
age -d -i /path/to/key backups/aegis_TIMESTAMP.sql.gz.age | \
  gunzip | docker compose exec -T postgres psql -U aegis aegis
```

### What is backed up

The backup script dumps the entire PostgreSQL database, which contains:
- Encrypted credentials
- Financial transactions and accounts
- Calendar events
- LMS assignments
- Health metrics
- Audit log
- Content drafts and social posts
- LLM usage records

### What is NOT backed up

- OpenClaw agent memory (stored in the `openclaw_data` Docker volume -- back up separately if needed)
- Docker images (rebuilt from source)
- `.env` file (back up manually)

## 18. Troubleshooting

### Quick diagnostics

```bash
# Check all services
docker compose ps

# Check health
make health

# OpenClaw built-in diagnostics (if installed via npm)
openclaw doctor
openclaw status
openclaw health

# Gateway health endpoints (available at http://localhost:18789)
# /healthz  — liveness probe
# /readyz   — readiness probe
# /health   — detailed health info
# /ready    — alias for readyz

# View recent logs
docker compose logs --tail=50
```

### Common issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "Cannot connect to Docker daemon" | Docker not running | Start Docker Desktop or `sudo systemctl start docker` |
| data-api shows "unhealthy" | Database not ready or migrations not run | `docker compose logs data-api` then `make migrate` |
| Gateway crashes on start | Missing `ANTHROPIC_API_KEY` | Add key to `.env`, restart gateway |
| WhatsApp QR code does not appear | Gateway not healthy | Check `docker compose logs openclaw-gateway` or run `openclaw doctor` |
| Cron jobs not firing | Jobs disabled or config error | Check `config/cron/jobs.json` for `"enabled": true` |
| "Budget exceeded" warnings | Daily/monthly LLM limit reached | Increase limits in `.env` or reduce agent usage |
| Integration returns 401 | Expired token | Re-authenticate and store fresh credentials |

For detailed troubleshooting, see [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md).
