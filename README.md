<p align="center">
  <h1 align="center">Aegis</h1>
  <p align="center">
    <strong>Personal Intelligence Platform</strong>
    <br />
    Self-hosted AI agents that connect your finances, calendar, academics, health, and social media — then deliver actionable insights over WhatsApp.
  </p>
  <p align="center">
    <a href="https://github.com/JiwaniZakir/sentinel/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/JiwaniZakir/sentinel/ci.yml?branch=main&style=flat-square&label=CI" alt="CI" /></a>
    <a href="https://python.org/"><img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" /></a>
    <a href="https://docker.com/"><img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" /></a>
    <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" /></a>
    <a href="https://github.com/openclaw/openclaw"><img src="https://img.shields.io/badge/Built_on-OpenClaw-FF6B35?style=flat-square" alt="OpenClaw" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" /></a>
  </p>
</p>

<br />

> **4 containers. ~2,700 lines of custom code. Zero public ports.**
> Built on [OpenClaw](https://github.com/openclaw/openclaw) (53+ bundled skills, 24 messaging channels).

<br />

## Table of Contents

- [What You Get](#what-you-get)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Integrations](#integrations)
- [Project Structure](#project-structure)
- [Security](#security)
- [Customization](#customization)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## What You Get

| Feature | Description |
|---------|-------------|
| **Morning Briefings** | Daily summary of calendar, deadlines, finances, and health goals — delivered to WhatsApp at 6 AM |
| **Financial Tracking** | Spending trends, recurring charges, subscription detection, affordability checks, and portfolio monitoring via Plaid and Schwab |
| **Academic Tracking** | Assignment deadlines, grade monitoring, and overdue alerts from Canvas LMS and Blackboard |
| **Health Optimization** | Steps, heart rate, sleep, calories, and protein tracking from Garmin Connect and Apple Health |
| **Content Engine** | AI-generated thought-leadership posts for LinkedIn and X, delivered for approval before publishing |
| **Weekly Digest** | End-of-week summary with spending trends, completion rates, health adherence, and recommendations |
| **Security Audit** | Weekly integrity check of the hash-chained audit log and LLM budget status |

All data is encrypted with AES-256-GCM. All credentials are stored in an encrypted credential store. Nothing leaves your server unencrypted.

---

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

**OpenClaw is the brain.** It runs the AI agents, handles scheduling, makes LLM calls, manages WhatsApp via Baileys, provides a Control UI, and stores agent memory. You configure it with JSON5 and teach it new capabilities through skill files.

**Data API is the vault.** A thin FastAPI service (~1,500 LOC) that stores encrypted credentials, proxies integration APIs, and maintains a tamper-evident audit log. The AI does the reasoning — the data-api just stores and retrieves.

---

## Quick Start

### Prerequisites

- **Docker** and **Docker Compose** v2.29+ ([install](https://docs.docker.com/engine/install/))
- An **Anthropic API key** ([get one](https://console.anthropic.com/))
- A machine with **4 GB RAM** and **2 CPU cores** minimum

### Option A: Docker (everything included)

```bash
git clone https://github.com/JiwaniZakir/sentinel.git aegis && cd aegis
./infrastructure/scripts/bootstrap.sh
```

Then add your Anthropic key:

```bash
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...
docker compose restart openclaw-gateway
open http://localhost:18789
```

Bootstrap auto-generates `DATA_API_TOKEN`, `ENCRYPTION_MASTER_KEY`, and `POSTGRES_PASSWORD`. You only need to add `ANTHROPIC_API_KEY`.

### Option B: npm (OpenClaw native + Docker for data layer)

```bash
npm install -g openclaw@latest
git clone https://github.com/JiwaniZakir/sentinel.git aegis && cd aegis
openclaw onboard
docker compose up -d data-api postgres cloudflared
openclaw
```

> For a complete walkthrough from zero, see **[docs/SETUP_FROM_SCRATCH.md](docs/SETUP_FROM_SCRATCH.md)**.

---

## Integrations

All integrations are optional. Enable only the ones you need.

<details>
<summary><strong>View all 10 integrations</strong></summary>

<br />

| Integration | Credentials Needed | Where to Get Them |
|------------|-------------------|-------------------|
| **Plaid** (banking) | `PLAID_CLIENT_ID`, `PLAID_SECRET` | [Plaid Dashboard](https://dashboard.plaid.com/) |
| **Schwab** (investments) | `SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET` | [Schwab Developer Portal](https://developer.schwab.com/) |
| **Canvas LMS** | Personal access token | Canvas Settings > Access Tokens |
| **Blackboard** | `BLACKBOARD_URL`, username, password | Your institution |
| **Google Calendar** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/) |
| **Outlook Calendar** | `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | [Azure Portal](https://portal.azure.com/) |
| **Garmin Connect** | `GARMIN_EMAIL`, `GARMIN_PASSWORD` | Your Garmin account |
| **Apple Health** | iOS Shortcut | Create a Shortcut that POSTs to `/health/ingest` |
| **LinkedIn** | `LINKEDIN_ACCESS_TOKEN` | [LinkedIn Developer Portal](https://developer.linkedin.com/) |
| **X / Twitter** | API v2 keys + tokens | [X Developer Portal](https://developer.x.com/) |

Add credentials to `.env` or the encrypted credential store. See `.env.example` for all variables.

</details>

---

## Project Structure

<details>
<summary><strong>View directory layout</strong></summary>

<br />

```
aegis/
├── config/                         # OpenClaw configuration
│   ├── openclaw.json               # Agents, channels, cron, hooks
│   ├── cron/jobs.json              # 8 scheduled jobs
│   ├── BOOT.md                     # Agent orientation (loaded on startup)
│   ├── USER.md                     # User profile and preferences
│   └── MEMORY.md                   # Persistent agent memory
├── skills/                         # 8 custom skill definitions
│   ├── aegis-finance/SKILL.md
│   ├── aegis-calendar/SKILL.md
│   ├── aegis-lms/SKILL.md
│   ├── aegis-health/SKILL.md
│   ├── aegis-social/SKILL.md
│   ├── aegis-content/SKILL.md
│   ├── aegis-briefing/SKILL.md
│   └── aegis-security/SKILL.md
├── hooks/                          # 3 custom hooks (TypeScript)
│   ├── audit-logger/               # Hash-chained audit logging
│   ├── pii-guard/                  # PII redaction on outbound messages
│   └── budget-guard/               # LLM spend tracking + alerts
├── data-api/                       # Encrypted persistence (FastAPI)
│   ├── app/
│   │   ├── main.py                 # App + auth middleware
│   │   ├── security/               # AES-256-GCM + audit log
│   │   ├── models/                 # 9 SQLAlchemy models
│   │   ├── api/                    # 10 routers (31 endpoints)
│   │   └── integrations/           # 10 API clients
│   ├── alembic/                    # Database migrations
│   └── tests/                      # 113 tests
├── infrastructure/
│   ├── Dockerfile.data-api
│   └── scripts/                    # bootstrap, deploy, backup, restore
├── docs/                           # Comprehensive documentation
├── docker-compose.yml              # 4 services
└── Makefile                        # dev, test, lint, deploy shortcuts
```

</details>

---

## Scheduled Tasks

| Task | Schedule | Agent | Delivery |
|------|----------|-------|----------|
| Financial sync | Every 6 hours | `sync` | Silent |
| Calendar sync | Every 15 min | `sync` | Silent |
| LMS sync | Every 30 min | `sync` | Silent |
| Health sync | Hourly | `sync` | Silent |
| Morning briefing | 6:00 AM ET | `briefing` | WhatsApp |
| Content drafts | 7:00 AM ET | `content` | WhatsApp |
| Weekly digest | Sun 8:00 PM ET | `briefing` | WhatsApp |
| Security audit | Mon 9:00 AM ET | `briefing` | WhatsApp |

Schedules are configured in `config/cron/jobs.json`.

---

## Security

| Layer | Implementation |
|-------|---------------|
| **Network** | Zero public ports. All access via Cloudflare Tunnel. |
| **Encryption** | AES-256-GCM with AAD for credentials and sensitive fields |
| **Auth** | Bearer token with constant-time comparison (`hmac.compare_digest`) |
| **Audit** | SHA-256 hash-chained tamper-evident log, verifiable via API |
| **PII** | Regex hook scans outbound messages for SSNs, card numbers, account numbers |
| **Budget** | Daily/monthly LLM spend tracking with alerts at 80/95/100% |
| **Containers** | `cap_drop: [ALL]`, `no-new-privileges: true`, internal-only networks |
| **Secrets** | SOPS + age for encrypted secret files in version control |

See **[SECURITY.md](SECURITY.md)** for the full threat model and vulnerability reporting policy.

---

## Customization

### Add a skill

Create `skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: "What this skill teaches the agent"
---

# My Skill

Instructions for the agent. Document the endpoints, request/response
shapes, and when the agent should use this skill.
```

OpenClaw auto-discovers skills at startup.

### Add a hook

Create `hooks/my-hook/HOOK.md` and `hooks/my-hook/handler.ts`. Hooks intercept events like `message:sent` to add behavior (redaction, logging, budget tracking). See existing hooks for examples.

### Add an integration

1. Create a client in `data-api/app/integrations/` (extends `BaseIntegration`)
2. Add a router in `data-api/app/api/`
3. Create an Alembic migration
4. Write a skill in `skills/` to teach agents the new endpoints
5. Add tests

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for step-by-step instructions.

### Modify agents

Edit `config/openclaw.json` to change models, tool permissions, cron schedules, or channel settings.

---

## Development

```bash
make help          # Show all available commands
make dev           # Start all services
make test          # Run 113 tests
make lint          # Ruff linter
make format        # Ruff formatter
make health        # Check all services
make logs          # Follow logs
make backup        # Encrypted database backup
make security      # Trivy vulnerability scan
```

---

## Documentation

| Document | Description |
|----------|-------------|
| **[Setup from Scratch](docs/SETUP_FROM_SCRATCH.md)** | Complete guide from zero to running (779 lines) |
| **[OpenClaw Guide](docs/OPENCLAW_GUIDE.md)** | How OpenClaw works + how to add Aegis features to any installation |
| **[Deployment](docs/DEPLOYMENT.md)** | Production deployment checklist |
| **[Development](docs/DEVELOPMENT.md)** | Developer guide: adding integrations, skills, hooks |
| **[Troubleshooting](docs/TROUBLESHOOTING.md)** | Common issues and fixes |
| **[Security](SECURITY.md)** | Threat model, encryption, vulnerability reporting |
| **[Features](FEATURES.md)** | Complete feature map (what moved where in the rebuild) |
| **[Contributing](.github/CONTRIBUTING.md)** | How to contribute |
| **[CLAUDE.md](CLAUDE.md)** | AI-assisted development reference |

---

## Contributing

We welcome contributions. See **[CONTRIBUTING.md](.github/CONTRIBUTING.md)** for guidelines.

```bash
# Before submitting a PR
make lint test
```

---

## License

[MIT](LICENSE)
