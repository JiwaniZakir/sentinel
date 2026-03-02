# Aegis -- Personal Intelligence Platform

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Aegis is a self-hosted personal intelligence platform built on [OpenClaw](https://github.com/openclaw/openclaw). It connects your bank accounts, calendars, university LMS, health trackers, and social media into a single system -- then delivers actionable insights to you over WhatsApp through AI agents. It also runs an autonomous content engine that drafts daily LinkedIn and X posts for your review. Everything runs on a single VPS behind a Cloudflare Tunnel with zero public ports.

## What You Get

- **Morning briefings** -- A daily summary of your calendar, deadlines, finances, and health goals delivered to WhatsApp at 6 AM.
- **Financial tracking** -- Spending trends, recurring charges, subscription detection, affordability checks, and investment portfolio monitoring via Plaid and Schwab.
- **Academic tracking** -- Assignment deadlines, grade monitoring, and overdue alerts from Canvas LMS and Blackboard.
- **Health optimization** -- Steps, heart rate, sleep, calories, and protein tracking from Garmin Connect and Apple Health (via iOS Shortcuts).
- **Content engine** -- AI-generated thought-leadership posts for LinkedIn and X, delivered to WhatsApp for approval before publishing.
- **Weekly digest** -- End-of-week summary with spending trends, assignment completion rates, health goal adherence, and recommendations.
- **Security audit** -- Weekly integrity check of the audit log and LLM budget status.

All of this runs on 4 Docker containers, ~2,700 lines of custom code, with AES-256-GCM encryption for all sensitive data and a tamper-evident audit log.

### What OpenClaw Provides Out of the Box

[OpenClaw](https://github.com/openclaw/openclaw) ships with **53+ bundled skills** (web search, file management, code execution, memory, and more) and **24 messaging channels** (WhatsApp, Telegram, Discord, Slack, and others) built-in. It handles agent orchestration, cron scheduling, LLM calls, session memory (LanceDB), and a web-based Control UI.

Aegis extends OpenClaw with **8 custom skills** (finance, calendar, LMS, health, social, content, briefing, security), **3 custom hooks** (audit-logger, pii-guard, budget-guard), and a **data-api** for encrypted persistence of personal data. You get the full power of a general-purpose AI agent platform plus domain-specific intelligence for your life.

## Architecture

```
+------------------------------------------------------------------+
|                  Single VPS (Docker Compose)                      |
|                                                                   |
|  +------------------+  +--------------+  +------------------+    |
|  | OpenClaw Gateway |  |   Data API   |  |   PostgreSQL     |    |
|  |                  |  |  (FastAPI +  |  |   + pgvector     |    |
|  | - 4 AI agents    |  |  encryption) |  |                  |    |
|  | - 8 skills       |  |              |  | - credentials    |    |
|  | - 3 hooks        |  | - 10 routers |  | - transactions   |    |
|  | - 8 cron jobs    |  | - 10 clients |  | - audit log      |    |
|  | - WhatsApp       |  | - 9 models   |  | - health data    |    |
|  | - Web UI         |  |              |  |                  |    |
|  +------------------+  +--------------+  +------------------+    |
|                                                                   |
|  +-----------------------------------------------------------+   |
|  |          Cloudflare Tunnel (zero public ports)             |   |
|  +-----------------------------------------------------------+   |
+------------------------------------------------------------------+
```

**OpenClaw is the brain.** It runs the AI agents, handles cron scheduling, makes LLM calls (Claude), manages WhatsApp delivery via Baileys, provides a web UI, and stores agent memory in LanceDB. You configure it with JSON and teach it new capabilities through skill files (Markdown).

**Data API is the persistence layer.** A thin FastAPI service (~1,500 lines of code) that stores encrypted credentials, proxies integration APIs (Plaid, Canvas, Garmin, etc.), and maintains a hash-chained audit log. OpenClaw agents call it via `web_fetch`. It has no business logic -- the AI does the reasoning.

**4 Docker services total:** `openclaw-gateway`, `data-api`, `postgres`, `cloudflared`.

## Prerequisites

- **Docker** and **Docker Compose** v2.29+ ([install guide](https://docs.docker.com/engine/install/))
- An **Anthropic API key** for Claude ([get one here](https://console.anthropic.com/))
- A machine with at least **4 GB RAM** and **2 CPU cores** (VPS, local machine, or home server)
- (Optional) A **Cloudflare account** if you want tunnel access from outside your local network
- (Optional) A **Brave Search API key** if you want the agents to use web search

## Quick Start

OpenClaw can be installed via npm or run entirely through Docker. Choose the method that fits your workflow.

### Method A: Docker (recommended -- includes everything)

```bash
# 1. Clone the repository
git clone https://github.com/JiwaniZakir/aegis.git && cd aegis

# 2. Run bootstrap (generates secrets, starts services, runs migrations)
./infrastructure/scripts/bootstrap.sh

# 3. Add your Anthropic API key
#    Open .env in your editor and set ANTHROPIC_API_KEY=sk-ant-...
#    Then restart the gateway:
docker compose restart openclaw-gateway

# 4. Open the Control UI
open http://localhost:18789

# 5. Pair WhatsApp by scanning the QR code in the Control UI
```

Bootstrap automatically generates `DATA_API_TOKEN`, `ENCRYPTION_MASTER_KEY`, and `POSTGRES_PASSWORD`. You only need to add your `ANTHROPIC_API_KEY` manually.

### Method B: npm (OpenClaw standalone + Aegis config/skills/hooks)

If you already have OpenClaw installed or prefer to run it outside Docker:

```bash
# 1. Install OpenClaw globally
npm install -g openclaw@latest

# 2. Clone Aegis for its config, skills, hooks, and data-api
git clone https://github.com/JiwaniZakir/aegis.git && cd aegis

# 3. Run the onboarding wizard (creates config if needed)
openclaw onboard

# 4. Start the data-api and PostgreSQL via Docker
docker compose up -d data-api postgres cloudflared

# 5. Start OpenClaw gateway (reads config/ directory)
openclaw

# 6. Open the Control UI (default port 18789)
open http://localhost:18789
```

With this method, OpenClaw runs natively on your machine while the data-api, PostgreSQL, and Cloudflare Tunnel run in Docker.

For a detailed walkthrough from zero, see [docs/SETUP_FROM_SCRATCH.md](docs/SETUP_FROM_SCRATCH.md).

## Adding Your Integrations

All integrations are optional. Enable only the ones you use by adding the required credentials to `.env` or the credential store.

| Integration | What You Need | Setup |
|------------|---------------|-------|
| **Plaid** (banking) | Plaid API credentials ([dashboard](https://dashboard.plaid.com/)) | Add `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` to `.env` |
| **Schwab** (investments) | Schwab developer app ([dev portal](https://developer.schwab.com/)) | Add `SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET`, `SCHWAB_CALLBACK_URL` to `.env` |
| **Canvas LMS** | Personal access token from Canvas Settings | Store via `POST /credentials` with `service_name=canvas_access_token` |
| **Blackboard** | Username and password | Add `BLACKBOARD_URL`, `BLACKBOARD_USERNAME`, `BLACKBOARD_PASSWORD` to `.env` |
| **Google Calendar** | OAuth 2.0 credentials ([Cloud Console](https://console.cloud.google.com/)) | Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` to `.env` |
| **Outlook Calendar** | Azure AD app registration ([Azure Portal](https://portal.azure.com/)) | Add `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` to `.env` |
| **Garmin Connect** | Garmin account email and password | Add `GARMIN_EMAIL`, `GARMIN_PASSWORD` to `.env` |
| **Apple Health** | iOS Shortcuts automation | Create a Shortcut that POSTs health data to `/health/ingest` |
| **LinkedIn** | LinkedIn API access token ([developer portal](https://developer.linkedin.com/)) | Add `LINKEDIN_ACCESS_TOKEN` to `.env` |
| **X / Twitter** | X API v2 credentials ([developer portal](https://developer.x.com/)) | Add `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_BEARER_TOKEN` to `.env` |

See `.env.example` for all available configuration variables.

## Project Structure

```
aegis/
├── config/                         # OpenClaw configuration
│   ├── openclaw.json               # Agents, channels, cron, hooks, tools
│   ├── cron/jobs.json              # 8 scheduled jobs (sync, briefing, content)
│   ├── BOOT.md                     # Agent orientation (loaded on startup)
│   ├── USER.md                     # User profile and preferences
│   └── MEMORY.md                   # Persistent agent memory
├── skills/                         # OpenClaw skill definitions
│   ├── aegis-finance/SKILL.md      # Banking + investments queries
│   ├── aegis-calendar/SKILL.md     # Calendar events + free slots
│   ├── aegis-lms/SKILL.md          # Canvas assignments + grades
│   ├── aegis-health/SKILL.md       # Health metrics + goals
│   ├── aegis-social/SKILL.md       # LinkedIn + X posting
│   ├── aegis-content/SKILL.md      # Content generation
│   ├── aegis-briefing/SKILL.md     # Daily/weekly briefings
│   └── aegis-security/SKILL.md     # Audit + budget monitoring
├── hooks/                          # OpenClaw hooks (TypeScript)
│   ├── audit-logger/               # Hash-chained audit logging
│   ├── pii-guard/                  # PII redaction on outbound messages
│   └── budget-guard/               # LLM spend tracking + alerts
├── data-api/                       # Encrypted data persistence (FastAPI)
│   ├── app/main.py                 # FastAPI app + auth middleware
│   ├── app/config.py               # Settings (Pydantic)
│   ├── app/security/               # AES-256-GCM + audit log
│   ├── app/models/                 # 9 SQLAlchemy models
│   ├── app/api/                    # 10 API routers
│   ├── app/integrations/           # 10 API clients
│   ├── alembic/                    # Database migrations
│   └── tests/                      # pytest test suite
├── infrastructure/
│   ├── Dockerfile.data-api         # Multi-stage Python 3.12-slim
│   ├── cloudflared/config.yml      # Tunnel routing
│   ├── postgres/init.sql           # Extension setup (pgvector, pgcrypto)
│   └── scripts/
│       ├── bootstrap.sh            # One-command setup
│       ├── deploy.sh               # Production deployment
│       ├── backup.sh               # Encrypted PostgreSQL backup
│       └── rotate-secrets.sh       # Secret rotation (90-day cycle)
├── docker-compose.yml              # 4 services (prod: zero host ports)
├── docker-compose.prod.yml         # Production overrides (resource limits, logging)
├── docker-compose.override.yml     # Dev overrides (localhost port bindings)
├── .env.example                    # All environment variables documented
├── Makefile                        # dev, test, lint, format, deploy shortcuts
└── CLAUDE.md                       # AI-assisted development guidance
```

## Scheduled Tasks

These cron jobs run automatically once configured:

| Task | Frequency | Agent | Delivery |
|------|-----------|-------|----------|
| Financial sync | Every 6 hours | sync | Silent |
| Calendar sync | Every 15 minutes | sync | Silent |
| LMS sync | Every 30 minutes | sync | Silent |
| Health sync | Hourly | sync | Silent |
| Morning briefing | Daily 6:00 AM ET | briefing | WhatsApp |
| Content drafts | Daily 7:00 AM ET | content | WhatsApp |
| Weekly digest | Sunday 8:00 PM ET | briefing | WhatsApp |
| Security audit | Monday 9:00 AM ET | briefing | WhatsApp |

Schedules are defined in `config/cron/jobs.json` and can be customized.

## Security

- **Zero public ports** -- all external access routes through a Cloudflare Tunnel
- **AES-256-GCM encryption** with authenticated additional data (AAD) for all stored credentials and sensitive fields
- **SHA-256 hash-chained audit log** -- tamper-evident, verifiable via API endpoint
- **PII redaction hook** -- regex scans all outbound messages for SSNs, card numbers, and account numbers before delivery
- **LLM budget guardrails** -- daily and monthly spend tracking with alerts at 80%, 95%, and 100% thresholds
- **Bearer token auth** -- constant-time comparison (`hmac.compare_digest`) for machine-to-machine calls
- **Docker hardening** -- `cap_drop: [ALL]`, `no-new-privileges: true`, internal-only networks for backend and database
- **SOPS + age** for encrypted secret files in version control

See [SECURITY.md](SECURITY.md) for the full security model and vulnerability reporting.

## Customization

### Add a new skill

Create `skills/my-skill/SKILL.md` with YAML frontmatter:

```markdown
---
name: my_skill
description: "What this skill does"
---
# My Skill

Instructions for the agent on when and how to use this skill.
Document the data-api endpoints it should call.
```

OpenClaw auto-discovers skills at startup.

### Modify agent behavior

Edit `config/openclaw.json` to change:
- Agent models (swap Claude Sonnet for Haiku to reduce costs)
- Tool permissions (`web_fetch`, `web_search`, `memory_search`)
- Cron schedules (change briefing time, sync frequency)
- Channel configuration (WhatsApp settings, group policies)

### Add a new data integration

1. Create `data-api/app/integrations/my_client.py` inheriting `BaseIntegration`
2. Implement `sync()` and `health_check()`
3. Add a router in `data-api/app/api/`
4. Create a migration with `uv run alembic revision --autogenerate -m "add my table"`
5. Create a skill in `skills/` to teach agents how to use it
6. Add tests

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed instructions.

### Add a new hook

Create `hooks/my-hook/HOOK.md` (YAML frontmatter) and `hooks/my-hook/handler.ts`:

```markdown
---
name: my-hook
description: "What this hook does"
metadata: { "openclaw": { "events": ["message:sent"] } }
---
```

See the existing hooks in `hooks/` for examples.

## Development

```bash
# Run tests (113 tests)
make test

# Lint
make lint

# Format
make format

# Start all services locally
make dev

# Check health
make health

# View logs
make logs
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full development guide and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment.

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

## License

MIT License. See [LICENSE](LICENSE) for details.
