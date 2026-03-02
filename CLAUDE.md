# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Aegis Personal Intelligence Platform

## Mission

Aegis is a self-hosted personal intelligence platform built on OpenClaw. It aggregates data from financial accounts, calendars, LMS platforms, health devices, and social media — then surfaces actionable insights through WhatsApp via AI agents. It also runs an autonomous content engine that publishes daily thought-leadership posts to LinkedIn and X.

Everything runs on a single Hetzner VPS behind Cloudflare Tunnel with zero public attack surface. Security is the #1 architectural constraint.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Single VPS (Docker Compose)                   │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  OpenClaw Gateway │  │   Data API   │  │    PostgreSQL    │   │
│  │ (agents, cron, UI │  │  (FastAPI +  │  │   + pgvector     │   │
│  │  WhatsApp)        │  │  encryption) │  │                  │   │
│  └──────────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │             Cloudflare Tunnel (zero public ports)           │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**OpenClaw IS the application.** It handles agents, scheduling (cron), LLM calls, WhatsApp delivery (via Baileys), web UI, and agent memory (LanceDB). The **data-api** is a thin encrypted persistence layer (~1,500 LOC) that OpenClaw agents call via `web_fetch`.

4 Docker services: `openclaw-gateway`, `data-api`, `postgres`, `cloudflared`.

---

## Technology Stack

### Infrastructure
| Component | Technology | Purpose |
|-----------|-----------|---------|
| VPS | Hetzner Cloud CPX41+ | Compute (8 vCPU, 16GB RAM) |
| Container Runtime | Docker + Docker Compose 2.29+ | Orchestration |
| Tunnel | Cloudflare Tunnel (`cloudflared`) | Zero-trust access |
| Secrets | SOPS + age | Encrypted secrets management |

### Core Services
| Service | Technology | Purpose |
|---------|-----------|---------|
| OpenClaw Gateway | OpenClaw (Node.js) | Agents, channels, cron, UI, hooks |
| Data API | FastAPI + Python 3.12+ | Encrypted data persistence |
| Database | PostgreSQL 16+ (pgvector) | Financial data, audit log, credentials |
| Tunnel | cloudflared | External zero-trust access |

### Data Integrations (10 clients in data-api)
| Integration | Method | Library |
|------------|--------|---------|
| Banking (Plaid) | Plaid API | `plaid-python` |
| Investments (Schwab) | Schwab API | `schwab-py` |
| Canvas LMS | Canvas REST API | `httpx` |
| Blackboard Learn | Web API | `httpx` |
| Garmin Connect | Unofficial API | `garminconnect` |
| Google Calendar | Google Calendar API v3 | `httpx` |
| Outlook Calendar | Microsoft Graph API | `httpx` |
| LinkedIn | LinkedIn API | `httpx` |
| X / Twitter | X API v2 | `httpx` |

---

## Directory Structure

```
aegis/
├── CLAUDE.md
├── FEATURES.md                     # Feature spec (what moved where)
├── docker-compose.yml              # 4 services
├── docker-compose.prod.yml         # Production overrides
├── docker-compose.override.yml     # Dev port bindings (auto-loaded)
├── .env.example                    # Environment template
├── Makefile                        # dev, test, lint, deploy shortcuts
├── config/                         # OpenClaw configuration
│   ├── openclaw.json               # Agents, channels, cron, hooks
│   ├── cron/jobs.json              # Pre-seeded cron schedules
│   ├── BOOT.md                     # Agent orientation doc
│   ├── USER.md                     # User profile and preferences
│   └── MEMORY.md                   # Persistent user preferences
├── skills/                         # OpenClaw skill definitions (SKILL.md)
│   ├── aegis-finance/              # Banking + investments queries
│   ├── aegis-calendar/             # Calendar events + free slots
│   ├── aegis-lms/                  # Canvas assignments + grades
│   ├── aegis-health/               # Health metrics + goals
│   ├── aegis-social/               # LinkedIn + X posting
│   ├── aegis-content/              # Content generation strategy
│   ├── aegis-briefing/             # Daily/weekly briefings
│   └── aegis-security/             # PII awareness + audit
├── hooks/                          # OpenClaw hooks (TypeScript)
│   ├── audit-logger/               # Hash-chained audit logging
│   ├── pii-guard/                  # PII redaction on outbound
│   └── budget-guard/               # LLM spend tracking
├── data-api/                       # Encrypted data persistence (FastAPI)
│   ├── pyproject.toml              # uv-managed deps (~15 packages)
│   ├── alembic.ini
│   ├── alembic/                    # Database migrations
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, Bearer token auth, audit middleware
│   │   ├── config.py               # Pydantic Settings (no JWT, no Redis, no CORS)
│   │   ├── database.py             # Async SQLAlchemy engine + session factory
│   │   ├── logging.py              # structlog with secret redaction
│   │   ├── security/
│   │   │   ├── encryption.py       # AES-256-GCM field encryption
│   │   │   └── audit.py            # SHA-256 hash-chained audit log
│   │   ├── models/                 # 9 SQLAlchemy models
│   │   │   ├── base.py             # DeclarativeBase, UUIDMixin, TimestampMixin
│   │   │   ├── credential.py       # Encrypted credential storage
│   │   │   ├── audit.py            # Audit log entries
│   │   │   ├── account.py          # Financial accounts (Plaid)
│   │   │   ├── transaction.py      # Financial transactions
│   │   │   ├── assignment.py       # LMS assignments
│   │   │   ├── health_metric.py    # Health data points
│   │   │   ├── content_draft.py    # Content draft lifecycle
│   │   │   └── social_post.py      # Published social posts
│   │   ├── api/                    # 10 routers
│   │   │   ├── credentials.py      # CRUD encrypted credentials
│   │   │   ├── finance.py          # Plaid + Schwab + tx queries
│   │   │   ├── calendar.py         # Google Cal + Outlook
│   │   │   ├── lms.py              # Canvas + Blackboard LMS
│   │   │   ├── health.py           # Health ingest + query
│   │   │   ├── social.py           # LinkedIn + X posting
│   │   │   ├── audit.py            # Audit chain verify + query
│   │   │   ├── budget.py           # LLM usage tracking
│   │   │   ├── briefing.py         # Daily/weekly briefings
│   │   │   └── content.py          # Content draft management
│   │   └── integrations/           # 10 API clients
│   │       ├── base.py             # BaseIntegration ABC
│   │       ├── plaid_client.py
│   │       ├── schwab_client.py
│   │       ├── canvas_client.py
│   │       ├── blackboard_client.py
│   │       ├── garmin_client.py
│   │       ├── google_calendar_client.py
│   │       ├── outlook_calendar_client.py
│   │       ├── linkedin_client.py
│   │       └── x_client.py
│   └── tests/
│       ├── conftest.py
│       ├── test_health_endpoint.py
│       ├── test_auth.py
│       ├── test_encryption.py
│       └── test_audit.py
├── infrastructure/
│   ├── Dockerfile.data-api         # Multi-stage Python 3.12-slim
│   ├── cloudflared/config.yml      # Tunnel config
│   ├── postgres/init.sql           # Extension setup (vector, pgcrypto, uuid)
│   └── scripts/
│       ├── deploy.sh               # Build + start + health check
│       ├── bootstrap.sh            # Migrations + verify
│       ├── backup.sh               # Encrypted backups
│       └── rotate-secrets.sh       # 90-day secret rotation
└── secrets/                        # SOPS-encrypted credentials
    ├── .sops.yaml
    └── *.enc.yaml
```

---

## Security Model

### Auth Model
Simple Bearer token (`DATA_API_TOKEN`) — no JWT, no sessions, no TOTP. Single machine-to-machine caller (OpenClaw). Constant-time comparison via `hmac.compare_digest`.

### Encryption
- **At rest**: AES-256-GCM with AAD context for all credentials and sensitive fields
- **In transit**: Cloudflare Tunnel (TLS) for external; internal Docker networks for service-to-service
- **Secrets**: SOPS + age for secret files; environment variables for runtime injection
- **Audit**: SHA-256 hash-chained tamper-evident log in PostgreSQL

### Network Security
- Zero public ports — all access through Cloudflare Tunnel
- Docker network isolation: `frontend`, `backend` (internal), `data` (internal)
- `cap_drop: [ALL]` and `no-new-privileges:true` on all containers

### OpenClaw Hooks (Security)
- **pii-guard**: Regex-scans outbound messages, redacts SSN/cards/accounts/phones/emails
- **budget-guard**: Tracks LLM token spend, warns at 80/95/100% of daily/monthly budget
- **audit-logger**: POSTs all agent events to data-api audit endpoint for hash-chain logging

---

## Coding Conventions

### Python (data-api)
- **Formatter**: `ruff format` (line length 99)
- **Linter**: `ruff check` with `select = ["E", "F", "I", "N", "W", "UP", "S", "B", "A", "C4", "SIM", "TCH"]`
- **Type hints**: Required on all function signatures. Use `from __future__ import annotations`.
- **Async**: All I/O-bound operations must be async. Use `httpx.AsyncClient` (never `requests`).
- **Models**: SQLAlchemy 2.0 with `Mapped[]` type annotations. Alembic for all migrations.
- **Pydantic**: v2 for all request/response schemas.
- **Error handling**: Never catch bare `Exception`. All integration errors must be caught and logged without leaking credentials.
- **Logging**: `structlog` with JSON output. Never log secrets, tokens, or PII.
- **Tests**: `pytest` + `pytest-asyncio`.

### TypeScript (hooks)
- Hooks are TypeScript files in `hooks/<name>/handler.ts` with `HOOK.md` config (YAML frontmatter).
- OpenClaw discovers hooks via `HOOK.md` files — NOT `hook.json`.
- Handler functions receive `InternalHookEvent` with: `type`, `action`, `sessionKey`, `context`, `timestamp`, `messages[]`.
- To send messages to the user from a hook: `event.messages.push(line)`.
- To mutate content: `event.context.content = newValue`.

### Git Conventions
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `security:`, `refactor:`
- Never commit secrets, `.env` files, or unencrypted credentials.

---

## OpenClaw Configuration

### Agents (4)
| Agent | Model | Purpose | Channels |
|-------|-------|---------|----------|
| `main` | claude-sonnet-4-6 | Interactive assistant | WhatsApp |
| `sync` | claude-haiku-4-5 | Silent background sync | none |
| `briefing` | claude-haiku-4-5 | Morning brief + weekly digest | WhatsApp |
| `content` | claude-sonnet-4-6 | LinkedIn + X drafts | WhatsApp |

### Skills (8)
Skills are `SKILL.md` files that teach agents how to call data-api endpoints via `web_fetch`. They replace all former Python service files — the LLM does the reasoning, skills just teach it how to query data.

### Hooks (3 custom + 2 bundled)
- `audit-logger` — events: `command`, `message:sent`, `message:received` (HOOK.md + handler.ts)
- `pii-guard` — events: `message:sent` (HOOK.md + handler.ts)
- `budget-guard` — events: `message:sent` (HOOK.md + handler.ts)
- `session-memory` — bundled OpenClaw hook (saves session context on `/new`)
- `boot-md` — bundled OpenClaw hook (runs BOOT.md on gateway startup)

### Channels
- **WhatsApp** — Baileys (native), dmPolicy: pairing, phone: env var

### Cron (8 jobs)
Defined in `config/cron/jobs.json`. Agents call data-api endpoints via `web_fetch` on schedule.

### OpenClaw Config Schema Notes
- **Config format**: `openclaw.json` supports JSON5 (trailing commas, comments allowed), not strict JSON
- **Setup command**: `openclaw onboard` is the interactive setup wizard (not `openclaw setup`)
- **Gateway default port**: 18789 (configurable via `gateway.bind`)
- **Health endpoints**: `/healthz`, `/readyz`, `/health`, `/ready` (all available on the gateway)
- **Skill loading priority**: 3 tiers — workspace skills (your `skills/` dir) > managed skills > 53+ bundled skills. Workspace skills override bundled skills of the same name.
- **WhatsApp**: Uses Baileys library natively (no external bridge service needed)
- `agents.defaults.thinkingDefault` — valid at defaults level only, NOT per-agent
- `agents.list[].model` — can be string or `{primary, fallbacks}` object
- `agents.defaults.compaction.memoryFlush` — must be `{enabled: true}`, not boolean
- `session.maintenance` — uses `pruneAfter` (duration string like "30d"), not `maxAgeDays`
- `gateway.controlUi` — requires `allowedOrigins` when `gateway.bind` is not `loopback`
- `skills.limits.maxSkillFileBytes` — default 256000, set to 65536 to cap custom skills
- `hooks` — OpenClaw discovers hooks via `HOOK.md` (YAML frontmatter), NOT `hook.json`. Handlers use `InternalHookEvent` type.

---

## Integration Pattern

All data-api integration clients follow the `BaseIntegration` ABC:

```python
class BaseIntegration(ABC):
    def __init__(self, user_id: str, db: AsyncSession):
        self.user_id = user_id
        self.db = db

    async def get_credential(self, key: str) -> str:
        """Fetch and decrypt a stored credential. Audit-logged."""

    @abstractmethod
    async def sync(self) -> dict[str, Any]: ...

    @abstractmethod
    async def health_check(self) -> bool: ...
```

---

## API Feasibility Notes

| Integration | Feasibility | Notes |
|------------|-------------|-------|
| Plaid (Banking) | Fully supported | Plaid Link for token exchange. Sandbox available. |
| Schwab (Investments) | Partial | `schwab-py` library. Read access solid; trading requires OAuth approval. |
| Canvas LMS | Fully supported | Personal access token. Full assignment/grade access. |
| Google Calendar | Fully supported | OAuth 2.0 via Google Cloud project. |
| Microsoft Graph (Outlook) | Fully supported | Azure AD app registration. |
| Garmin Connect | Unofficial | `garminconnect` library. Can break with updates. |
| LinkedIn API | Very limited | Official API only allows posting with approved app. |
| X API v2 | Supported (paid) | Basic tier ($100/mo) for read + write. |
| Apple Health | Indirect | iOS Shortcuts export to POST endpoint. |

---

## Key Commands

```bash
# Start all services
docker compose up -d

# Run data-api tests
cd data-api && uv run pytest -v

# Lint data-api
cd data-api && uv run ruff check .

# Format data-api
cd data-api && uv run ruff format .

# Database migrations
cd data-api && uv run alembic upgrade head

# Deploy to production
./infrastructure/scripts/deploy.sh --prod
```

---

## Critical Rules for Claude Code

1. **NEVER hallucinate an API that doesn't exist.** Check the feasibility table above.
2. **NEVER hardcode credentials.** All secrets via environment variables.
3. **NEVER expose ports to 0.0.0.0.** All services bind to internal Docker networks only.
4. **NEVER store plaintext PII.** Financial data, messages, and credentials must be encrypted with AES-256-GCM.
5. **NEVER skip error handling on integrations.** Every external API call needs try/except with specific exceptions and structured logging.
6. **NEVER use `requests` library.** Use `httpx` with async client.
7. **NEVER commit `.env`, unencrypted secrets, or API tokens.**
8. **ALWAYS create database migrations via Alembic** — never raw SQL DDL.
9. **ALWAYS follow the `BaseIntegration` pattern** for new integration clients.
10. **ALWAYS write tests** for new endpoints and security-critical code.
11. **OpenClaw is the brain** — business logic goes in skills (SKILL.md), not Python services.
12. **Data-api is persistence only** — it stores, encrypts, and retrieves data. No analysis, no LLM calls, no delivery.

## File Writing Rules

- Use the Write tool or `python3 -c "..."` instead of `cat << 'EOF'` heredocs.
- For multi-line file creation, prefer the Write tool.
