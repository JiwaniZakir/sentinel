# OpenClaw Integration Guide for Aegis

A comprehensive guide to OpenClaw and how Aegis extends it. Written for humans who want to understand the platform, and for AI agents (like Claude Code) that need to add Aegis functionality to an OpenClaw installation.

---

## Table of Contents

1. [What is OpenClaw](#part-1-what-is-openclaw)
2. [How OpenClaw Works](#part-2-how-openclaw-works)
3. [Installing OpenClaw from Scratch](#part-3-installing-openclaw-from-scratch)
4. [Understanding the Configuration](#part-4-understanding-the-configuration)
5. [What Aegis Adds](#part-5-what-aegis-adds)
6. [Adding Aegis to Your OpenClaw Installation](#part-6-adding-aegis-to-your-openclaw-installation)
7. [Adding Individual Aegis Features](#part-7-adding-individual-aegis-features)
8. [Creating Your Own Skills](#part-8-creating-your-own-skills)
9. [Creating Your Own Hooks](#part-9-creating-your-own-hooks)
10. [Quick Reference](#part-10-quick-reference)

---

## Part 1: What is OpenClaw

OpenClaw is an open-source personal AI assistant platform. It gives you a self-hosted, always-running AI assistant that connects to messaging apps (WhatsApp, Telegram, Slack, Discord, and 20+ others) and does things on your behalf -- answering questions, running scheduled tasks, fetching data from the web, and executing commands.

Think of it as your own private AI butler that lives on your server. You message it on WhatsApp, it thinks using Claude (or another LLM), and it can pull information, run scripts, and send you proactive updates on a schedule. Everything stays on your machine -- no third-party SaaS holds your data.

OpenClaw was created by Peter Steinberger and is MIT-licensed with roughly 247K GitHub stars. It is written in TypeScript and requires Node.js 22.12.0 or higher.

---

## Part 2: How OpenClaw Works

### The Gateway

The **gateway** is a daemon that runs on port 18789. It stays running, listens for incoming messages from channels, routes them to the right agent, and manages the whole lifecycle. Think of it as a switchboard operator that never sleeps.

### Agents

**Agents** are AI assistants. Each agent has a model (like Claude Sonnet or Haiku), a workspace (a folder of files it can read), and a personality. You can have multiple agents for different purposes -- interactive chat, background sync, briefings, content generation.

### Skills, Hooks, Channels, Cron, Tools

- **Skills** are markdown files (`SKILL.md`) that teach agents how to do specific things. They are the knowledge layer -- they do not run code, they tell the agent what to do.
- **Hooks** are TypeScript functions that intercept events (like outbound messages) to add automatic behavior -- PII redaction, audit logging, budget tracking.
- **Channels** are messaging platforms (24 total). You connect one or more, and agents communicate through them.
- **Cron jobs** are scheduled tasks that trigger agents on a timer.
- **Tools** are capabilities: `web_fetch` (HTTP requests), `web_search`, `exec` (shell commands), file operations, and browser automation.

### How They Fit Together

```
User sends a WhatsApp message
  -> Gateway receives it via the WhatsApp channel
  -> Gateway routes it to the correct agent
  -> Agent reads its workspace files (BOOT.md, skills, etc.)
  -> Agent reasons using its LLM model
  -> Agent calls tools (web_fetch to hit an API, etc.)
  -> Hooks intercept the outbound message (PII guard, audit logger, etc.)
  -> Gateway delivers the response to WhatsApp
```

For cron jobs, the flow starts at the schedule trigger instead of a user message.

---

## Part 3: Installing OpenClaw from Scratch

### Step 1: Install Node.js 22+

```bash
# macOS (Homebrew)
brew install node@22

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm
nvm install 22 && nvm use 22
```

### Step 2: Install OpenClaw

```bash
npm install -g openclaw@latest
```

### Step 3: Run the Onboard Wizard

```bash
openclaw onboard --install-daemon
```

This creates `~/.openclaw/`, generates `openclaw.json`, sets up the workspace, installs the gateway daemon, and prompts for your Anthropic API key.

### Step 4: Start the Gateway

```bash
openclaw start       # Start the gateway (if not already running as daemon)
openclaw status      # Check status
```

### Step 5: Access the Control UI

Open `http://localhost:18789` in your browser. This lets you chat with your agent, view logs, and manage configuration.

### Step 6: Link WhatsApp (Optional)

```bash
openclaw channels login --channel whatsapp
```

Scan the QR code with WhatsApp (Settings > Linked Devices > Link a Device).

---

## Part 4: Understanding the Configuration

All configuration lives in `~/.openclaw/openclaw.json` (JSON5 format). The gateway hot-reloads on changes.

### Agents

```json5
{
  agents: {
    defaults: {
      model: "anthropic/claude-sonnet-4-6",
      workspace: "~/.openclaw/workspace",
      thinkingDefault: "low",  // off | minimal | low | medium | high | xhigh
    },
    list: [
      { id: "main", default: true, name: "My Assistant", model: "anthropic/claude-sonnet-4-6" },
      { id: "worker", name: "Background Worker", model: "anthropic/claude-haiku-4-5" },
    ],
  },
}
```

- `model` can be a string or `{primary, fallbacks}` object
- `thinkingDefault` is only valid in `defaults`, not per-agent
- `tools.profile` -- `"full"` or `"minimal"`; `tools.allow` -- explicit tool list

### Channels

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "pairing",         // "pairing" | "allowlist" | "open" | "disabled"
      allowFrom: ["15551234567"],
      textChunkLimit: 4000,
    },
  },
}
```

### Skills

```json5
{
  skills: {
    load: {
      extraDirs: ["../skills"],
      watch: true,
    },
    limits: {
      maxSkillsInPrompt: 12,
      maxSkillFileBytes: 65536,
    },
  },
}
```

Three loading tiers (highest priority wins): workspace skills, managed skills (`~/.openclaw/skills/`), bundled skills (53+).

### Hooks

```json5
{
  hooks: {
    internal: {
      enabled: true,
      load: { extraDirs: ["../hooks"] },
      entries: {
        "my-hook": { enabled: true, env: { API_TOKEN: "${MY_TOKEN}" } },
      },
    },
  },
}
```

OpenClaw discovers hooks via `HOOK.md` files (not `hook.json`). Each hook directory has `HOOK.md` + `handler.ts`.

### Cron

```json5
{
  cron: {
    enabled: true,
    store: "./cron/jobs.json",
    maxConcurrentRuns: 3,
    sessionRetention: "3d",
  },
}
```

Jobs specify: `schedule.expr` (cron expression), `schedule.tz`, `agentId`, `sessionTarget: "isolated"`, `delivery.mode` (`"announce"` or `"none"`).

### Tools

```json5
{
  tools: {
    web: {
      fetch: { enabled: true, maxChars: 32000, timeoutSeconds: 30 },
      search: { enabled: true, maxResults: 5 },
    },
    exec: { security: "deny" },    // "deny" | "sandbox" | "host"
    fs: { workspaceOnly: true },
  },
}
```

### Workspace Bootstrap Files

| File | Purpose |
|------|---------|
| `BOOT.md` | Startup orientation -- architecture, rules, API reference |
| `AGENTS.md` | Operating instructions, rules, priorities |
| `SOUL.md` | Persona, tone, boundaries |
| `USER.md` | User identity and preferences |
| `IDENTITY.md` | Agent name and aesthetic |
| `TOOLS.md` | Tool usage guidance |
| `HEARTBEAT.md` | Periodic health checks |
| `MEMORY.md` | Long-term curated memory |
| `BOOTSTRAP.md` | One-time first-run setup (auto-deleted) |

---

## Part 5: What Aegis Adds

Aegis is a layer on top of OpenClaw that turns it into a personal intelligence platform.

### The data-api (Encrypted Persistence)

OpenClaw has no built-in way to store structured data securely. Aegis adds a **data-api** (FastAPI, ~1,500 LOC) that handles:

- **Encrypted storage** -- AES-256-GCM for financial data, health metrics, and credentials
- **Integration proxy** -- talks to Plaid, Schwab, Canvas, Garmin, Google Calendar, etc.
- **Audit logging** -- SHA-256 hash-chained tamper-evident log
- **Budget tracking** -- LLM token spend against daily/monthly budgets

The data-api stores and retrieves data. It does not analyze, call LLMs, or send messages -- that is OpenClaw's job.

### Why Each Skill Exists

- **aegis-finance** -- "What is my balance? How much did I spend on food?" Queries Plaid/Schwab.
- **aegis-calendar** -- "What is on my schedule today? Am I free at 3 PM?" Queries Google Calendar/Outlook.
- **aegis-lms** -- "What assignments are due? What are my grades?" Queries Canvas/Blackboard.
- **aegis-health** -- "How much protein today? How was my sleep?" Queries Garmin/Apple Health.
- **aegis-social** -- "Post this to LinkedIn. Check engagement." Publishes to LinkedIn/X.
- **aegis-content** -- "Generate a thought-leadership post." Creates and manages drafts.
- **aegis-briefing** -- "Morning briefing. Weekly digest." Aggregates all data sources.
- **aegis-security** -- "Is the audit log intact? Budget status?" Always-active PII rules.

### Why Each Hook Exists

- **audit-logger** -- Logs all commands and messages to the hash-chained audit trail. Fire-and-forget.
- **pii-guard** -- Scans outbound messages for SSNs, card numbers, and account numbers. Redacts before delivery.
- **budget-guard** -- Tracks token cost against daily ($5) and monthly ($50) budgets. Warns at 80/95%, blocks at 100%.

### Why PostgreSQL and Cloudflare Tunnel

PostgreSQL stores structured relational data (transactions, health metrics, assignments, audit chains) -- distinct from OpenClaw's LanceDB agent memory. Cloudflare Tunnel provides external access with zero public ports.

---

## Part 6: Adding Aegis to Your OpenClaw Installation

These steps assume a working OpenClaw installation (see Part 3).

### Step 1: Clone the Aegis Repository

```bash
git clone https://github.com/your-org/aegis.git ~/aegis
```

### Step 2: Copy Skills

```bash
cp -r ~/aegis/skills/* ~/.openclaw/workspace/skills/
```

### Step 3: Copy Hooks

```bash
cp -r ~/aegis/hooks/* ~/.openclaw/hooks/
```

### Step 4: Copy Workspace Files

```bash
cp ~/aegis/config/BOOT.md ~/.openclaw/workspace/BOOT.md
cp ~/aegis/config/USER.md ~/.openclaw/workspace/USER.md
```

Edit `USER.md` to match your details (timezone, health goals, accounts, preferences).

### Step 5: Set Up the data-api

```bash
cd ~/aegis
cp .env.example .env
# Fill in at minimum:
#   DATA_API_TOKEN       (openssl rand -hex 32)
#   ENCRYPTION_MASTER_KEY (openssl rand -hex 32)
#   POSTGRES_PASSWORD     (openssl rand -hex 16)
#   ANTHROPIC_API_KEY     (your Anthropic key)

docker compose up -d data-api postgres
docker compose exec data-api uv run alembic upgrade head
curl -sf http://localhost:8000/health
```

### Step 6: Configure openclaw.json

Register hooks:

```json5
{
  hooks: {
    internal: {
      enabled: true,
      load: { extraDirs: ["~/.openclaw/hooks"] },
      entries: {
        "audit-logger": { enabled: true, env: { DATA_API_URL: "http://data-api:8000", DATA_API_TOKEN: "${DATA_API_TOKEN}" } },
        "pii-guard": { enabled: true },
        "budget-guard": { enabled: true, env: { DATA_API_URL: "http://data-api:8000", DATA_API_TOKEN: "${DATA_API_TOKEN}", LLM_DAILY_BUDGET_USD: "${LLM_DAILY_BUDGET_USD}", LLM_MONTHLY_BUDGET_USD: "${LLM_MONTHLY_BUDGET_USD}" } },
      },
    },
  },
}
```

Add cron jobs:

```bash
cp ~/aegis/config/cron/jobs.json ~/.openclaw/cron/jobs.json
```

### Step 7: Set the DATA_API_TOKEN Environment Variable

```bash
export DATA_API_TOKEN="your-generated-token-here"
```

### Step 8: Verify

```bash
curl -sf http://localhost:8000/health   # data-api responds
openclaw status                          # gateway is running
openclaw skills list                     # aegis-* skills loaded
```

---

## Part 7: Adding Individual Aegis Features

Each feature is independent. Enable only what you need. For every feature: copy the SKILL.md, set any required credentials in `.env`, and restart OpenClaw.

### Finance (aegis-finance)

Balances, transactions, recurring charges, subscriptions, portfolio, affordability analysis via Plaid (banking) and Schwab (investments). Endpoints: `/finance/balances`, `/finance/transactions`, `/finance/sync`, and 8 more.

**Credentials:** `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` ([dashboard.plaid.com](https://dashboard.plaid.com/)). Schwab: `SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET` ([developer.schwab.com](https://developer.schwab.com/)).

### Calendar (aegis-calendar)

Today's events, multi-day lookups, free slot detection from Google Calendar and Outlook. Endpoints: `/calendar/today`, `/calendar/events`, `/calendar/free`, `/calendar/sync`.

**Credentials:** Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Outlook: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.

### LMS (aegis-lms)

Courses, assignments, grades, announcements from Canvas LMS and Blackboard. Urgency-based prioritization (overdue through low). Endpoints: `/lms/courses`, `/lms/due`, `/lms/grades`, `/lms/announcements`, `/lms/sync`.

**Credentials:** Canvas: `CANVAS_API_URL` (token stored encrypted via `POST /credentials`). Blackboard: `BLACKBOARD_URL`, `BLACKBOARD_USERNAME`, `BLACKBOARD_PASSWORD`.

### Health (aegis-health)

Daily metrics (steps, heart rate, sleep, macros), goal tracking, trends, data ingestion from Garmin and Apple Health. Endpoints: `/health/today`, `/health/summary`, `/health/trends`, `/health/goals`, `/health/macros`, `/health/weekly`, `/health/ingest`, `/health/sync`.

**Credentials:** Garmin: `GARMIN_EMAIL`, `GARMIN_PASSWORD` (unofficial library). Apple Health: no credentials -- push via iOS Shortcuts to `POST /health/ingest`.

### Social (aegis-social)

Post to LinkedIn and X, engagement metrics, post history, tweet search. Endpoints: `/social/post`, `/social/history`, `/social/engagement`, `/social/x/me`, `/social/x/search`.

**Credentials:** LinkedIn: `LINKEDIN_ACCESS_TOKEN` (requires approved API app). X: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_BEARER_TOKEN` (Basic tier $100/mo).

### Content (aegis-content)

Generate thought-leadership posts, manage content queue, ingest research material. Depends on `aegis-social` for publishing. Endpoints: `/content/generate`, `/content/drafts`, `/content/queue`, `/content/publish`, `/content/ingest`.

**Credentials:** None beyond what `aegis-social` requires.

### Briefing (aegis-briefing)

Cross-domain morning briefings (6 AM) and weekly digests (Sunday 8 PM). Aggregates finance, calendar, LMS, and health data. Depends on those skills. Endpoints: `/briefing/today`, `/briefing/weekly`, `/briefing/insights`.

**Credentials:** None beyond the data sources you want included.

### Security (aegis-security)

Audit log integrity, LLM budget monitoring, mandatory PII handling rules. Always active -- applies to every agent interaction. Endpoints: `/audit/log`, `/audit/verify`, `/budget/usage`.

**Credentials:** None (uses `DATA_API_TOKEN`).

---

## Part 8: Creating Your Own Skills

### Step 1: Create the Directory and SKILL.md

```bash
mkdir -p ~/.openclaw/workspace/skills/my-skill
```

Create `SKILL.md` inside it:

```markdown
---
name: my_skill
description: "One-line description of what this skill does"
---
# My Skill

What this skill does in 1-2 sentences.

## When to Use

Activate when the user asks about: [trigger phrases and topics].

## API Reference

Base URL: `http://my-api:8000` -- All endpoints require `Authorization: Bearer $MY_TOKEN`.

### GET /my-endpoint

\```
web_fetch("http://my-api:8000/my-endpoint?param=value", {
  "headers": {"Authorization": "Bearer $MY_TOKEN"}
})
\```

Returns: `{"key": "value", "count": 42}`

## Guidelines

- How to format responses
- Safety rules (what never to include)

## Error Handling

- `401` -- token missing or invalid
- `500` -- retry after a moment
```

### Step 2: Key Principles

- **Show exact `web_fetch` calls.** Agents need full URL, headers, and body.
- **Include response shapes.** Agents need to know what fields come back.
- **Write guidelines, not code.** Tell the agent how to interpret and present data.
- **Set boundaries.** What data is sensitive? What should never appear in messages?
- **Keep it under 64KB.** Aegis sets `maxSkillFileBytes: 65536`.

### Step 3: Test

With `watch: true`, the skill loads automatically. Otherwise run `openclaw restart`. Ask your agent a question that should trigger it.

---

## Part 9: Creating Your Own Hooks

### Step 1: Create the Directory

```bash
mkdir -p ~/.openclaw/hooks/my-hook
```

### Step 2: Write HOOK.md

```markdown
---
name: my-hook
description: "What this hook does in one line"
metadata:
  openclaw:
    events: ["message:sent"]
---
# My Hook

What this hook does and why.
```

Available events: `command`, `message:sent`, `message:received`.

### Step 3: Write handler.ts

```typescript
interface InternalHookEvent {
  type: "command" | "message" | "agent" | "gateway" | "session";
  action: string;
  sessionKey: string;
  context: Record<string, unknown>;
  timestamp: Date;
  messages: string[];
}

export default function handler(event: InternalHookEvent): void {
  if (event.type !== "message" || event.action !== "sent") return;

  const content = event.context.content as string | undefined;
  if (!content) return;

  // Modify outbound content:
  event.context.content = content.replace(/secret/gi, "[REDACTED]");

  // Send an extra message to the user:
  event.messages.push("Hook processed this message.");
}
```

Key patterns:
- **Sync hooks** (like pii-guard): mutate `event.context.content`, return `void`
- **Async hooks** (like budget-guard): return `Promise<void>`, can make HTTP calls
- **Fire-and-forget** (like audit-logger): do not await the HTTP call
- **Block a message**: set `event.context.content = ""`

### Step 4: Register in openclaw.json

```json5
{
  hooks: { internal: { entries: { "my-hook": { enabled: true } } } }
}
```

### Step 5: Test

Run `openclaw restart`, send a test message, check stderr logs for hook output.

---

## Part 10: Quick Reference

### Aegis Components

| Component | Type | Purpose |
|-----------|------|---------|
| `data-api` | Docker service | Encrypted data persistence (FastAPI, ~1,500 LOC) |
| `postgres` | Docker service | PostgreSQL 16+ with pgvector |
| `cloudflared` | Docker service | Zero-trust tunnel (no public ports) |
| `aegis-finance` | Skill | Banking + investments via Plaid and Schwab |
| `aegis-calendar` | Skill | Google Calendar + Outlook events and free slots |
| `aegis-lms` | Skill | Canvas + Blackboard assignments and grades |
| `aegis-health` | Skill | Garmin + Apple Health metrics and goals |
| `aegis-social` | Skill | LinkedIn + X posting and engagement |
| `aegis-content` | Skill | Content generation and draft management |
| `aegis-briefing` | Skill | Morning briefing + weekly digest |
| `aegis-security` | Skill | Audit, budget, PII rules (always active) |
| `audit-logger` | Hook | Hash-chained audit logging to data-api |
| `pii-guard` | Hook | SSN/card/account redaction on outbound messages |
| `budget-guard` | Hook | LLM spend tracking (80/95/100% thresholds) |

### Agents

| Agent | Model | Purpose | Delivery |
|-------|-------|---------|----------|
| `main` | Claude Sonnet 4.6 | Interactive assistant | WhatsApp |
| `sync` | Claude Haiku 4.5 | Silent background sync | None |
| `briefing` | Claude Haiku 4.5 | Morning briefing + weekly digest | WhatsApp |
| `content` | Claude Sonnet 4.6 | Content generation | WhatsApp |

### Cron Schedule

| Job | Agent | Schedule | Delivery |
|-----|-------|----------|----------|
| Sync Finances | sync | Every 6 hours | Silent |
| Sync Calendar | sync | Every 15 minutes | Silent |
| Sync LMS | sync | Every 30 minutes | Silent |
| Sync Health | sync | Every hour | Silent |
| Morning Briefing | briefing | 6:00 AM ET daily | WhatsApp |
| Generate Content | content | 7:00 AM ET daily | WhatsApp |
| Weekly Digest | briefing | 8:00 PM ET Sunday | WhatsApp |
| Security Audit | briefing | 9:00 AM ET Monday | WhatsApp |

### Integration Credentials

| Integration | Required Env Vars | Where to Sign Up |
|-------------|-------------------|------------------|
| Plaid | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | dashboard.plaid.com |
| Schwab | `SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET` | developer.schwab.com |
| Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com |
| Outlook | `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` | portal.azure.com |
| Canvas LMS | `CANVAS_API_URL` + encrypted token via API | Your institution |
| Blackboard | `BLACKBOARD_URL`, `BLACKBOARD_USERNAME`, `BLACKBOARD_PASSWORD` | Your institution |
| Garmin | `GARMIN_EMAIL`, `GARMIN_PASSWORD` | Unofficial (may break) |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN` | Requires approved API app |
| X / Twitter | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_BEARER_TOKEN` | Basic tier $100/mo |
