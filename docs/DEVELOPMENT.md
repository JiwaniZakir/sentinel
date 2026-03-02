# Development Guide

This guide covers local development, testing, code style, and how to extend Aegis with new integrations, skills, hooks, and API endpoints.

## Local Development Setup

### Prerequisites

- **Python 3.12+** ([python.org](https://www.python.org/downloads/) or via `brew install python@3.12`)
- **uv** package manager ([docs.astral.sh/uv](https://docs.astral.sh/uv/)) -- install with `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Docker and Docker Compose** v2.29+ ([docs.docker.com](https://docs.docker.com/engine/install/))
- **Node.js 20+** (only if modifying hooks locally outside Docker)

### Initial setup

```bash
# Clone the repository
git clone https://github.com/JiwaniZakir/aegis.git
cd aegis

# Bootstrap (generates .env, starts services, runs migrations)
./infrastructure/scripts/bootstrap.sh

# Install Python dev dependencies for the data-api
cd data-api
uv sync --dev
```

### Running services

```bash
# Start all services (dev mode with localhost port bindings)
make dev

# The override file (docker-compose.override.yml) automatically exposes:
#   127.0.0.1:18789  -- OpenClaw Control UI
#   127.0.0.1:8000   -- Data API (Swagger at /docs)
#   127.0.0.1:5432   -- PostgreSQL

# Check service health
make health

# View logs
make logs
```

### Running data-api outside Docker

For faster iteration, you can run the data-api directly:

```bash
cd data-api

# Ensure PostgreSQL is running (via Docker)
docker compose up -d postgres

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://aegis:$(grep POSTGRES_PASSWORD ../.env | cut -d= -f2)@localhost:5432/aegis"
export DATA_API_TOKEN="$(grep DATA_API_TOKEN ../.env | cut -d= -f2)"
export ENCRYPTION_MASTER_KEY="$(grep ENCRYPTION_MASTER_KEY ../.env | cut -d= -f2)"

# Run the API
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Running Tests

```bash
# All tests (from project root)
make test

# All tests (from data-api directory)
cd data-api && uv run pytest -v

# Specific test file
cd data-api && uv run pytest tests/test_auth.py -v

# With coverage
cd data-api && uv run pytest --cov=app --cov-report=term-missing

# Quick summary
cd data-api && uv run pytest -q
```

The test suite has 113 tests. Tests that require a running PostgreSQL instance will automatically skip when the database is unavailable. This is by design -- CI runs without a database, and the tests still provide value.

Key test files:
- `tests/conftest.py` -- shared fixtures, sets environment variables before app import
- `tests/test_auth.py` -- Bearer token authentication
- `tests/test_encryption.py` -- AES-256-GCM encryption/decryption
- `tests/test_audit.py` -- Hash-chained audit log
- `tests/test_health_endpoint.py` -- Health check endpoint
- `tests/test_api_endpoints.py` -- All API router registration

## Code Style

### Python (data-api)

- **Formatter:** `ruff format` (line length 99)
- **Linter:** `ruff check` with security rules enabled

```bash
# Lint
make lint
# or: cd data-api && uv run ruff check app/ tests/

# Format
make format
# or: cd data-api && uv run ruff format app/ tests/

# Auto-fix linting issues
cd data-api && uv run ruff check --fix app/ tests/
```

Rules enforced:
- `E`, `F` -- pyflakes + pycodestyle errors
- `I` -- import sorting (isort)
- `N` -- naming conventions
- `W` -- warnings
- `UP` -- pyupgrade (modern Python syntax)
- `S` -- security (bandit rules)
- `B` -- bugbear
- `A` -- shadowing builtins
- `C4` -- comprehension simplification
- `SIM` -- simplification

Test files are exempt from `S101` (assert), `S105` (hardcoded passwords), `S106` (hardcoded password arguments).

### TypeScript (hooks)

Hooks are TypeScript files in `hooks/<name>/handler.ts`. They follow standard TypeScript conventions. No separate linter is configured for hooks -- they are compiled by OpenClaw at runtime.

### Conventional Commits

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add Garmin sleep tracking to health sync
fix: handle expired Canvas tokens gracefully
chore: update ruff to 0.9.0
docs: add deployment guide for Hetzner
security: rotate default encryption test vectors
refactor: extract BaseIntegration credential methods
```

Prefix types: `feat`, `fix`, `chore`, `docs`, `security`, `refactor`, `test`, `ci`.

### Pre-push checklist

Before pushing, always run:

```bash
make lint test
```

CI will fail if either command fails.

## Adding a New Integration

Integration clients live in `data-api/app/integrations/` and inherit from `BaseIntegration`.

### Step 1: Create the client

Create `data-api/app/integrations/my_service_client.py`:

```python
"""MyService integration client."""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.integrations.base import BaseIntegration

logger = structlog.get_logger()

# Guard optional dependencies
try:
    import my_optional_lib  # noqa: F401
    MY_SERVICE_AVAILABLE = True
except ImportError:
    MY_SERVICE_AVAILABLE = False


class MyServiceClient(BaseIntegration):
    """Sync data from MyService API."""

    BASE_URL = "https://api.myservice.com/v1"

    async def sync(self) -> dict[str, Any]:
        """Pull latest data from MyService."""
        if not MY_SERVICE_AVAILABLE:
            self._log.warning("my_service_unavailable", reason="library not installed")
            return {"synced": 0}

        token = await self.get_credential("my_service_api_token")

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(
                    f"{self.BASE_URL}/data",
                    headers={"Authorization": f"Bearer {token}"},
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                self._log.error(
                    "my_service_sync_failed",
                    status=exc.response.status_code,
                )
                return {"synced": 0, "error": str(exc)}

        await self._audit(
            action="my_service_synced",
            resource_type="my_service_data",
            detail=f"Synced {len(data)} items",
        )

        return {"synced": len(data)}

    async def health_check(self) -> bool:
        """Verify MyService credentials are valid."""
        try:
            token = await self.get_credential("my_service_api_token")
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/health",
                    headers={"Authorization": f"Bearer {token}"},
                )
                return resp.status_code == 200
        except Exception:
            return False
```

Key patterns:
- Import `from __future__ import annotations` at the top
- Guard optional libraries with `try/except ImportError`
- Use `httpx.AsyncClient` (never `requests`)
- Catch specific exceptions (never bare `except Exception` in production paths)
- Audit log all data access
- Never log credentials or tokens

### Step 2: Create a model (if needed)

Create `data-api/app/models/my_data.py`:

```python
"""MyService data model."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class MyData(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "my_data"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
```

### Step 3: Create a database migration

```bash
cd data-api
uv run alembic revision --autogenerate -m "add my_data table"

# Review the generated migration file in alembic/versions/
# Then apply:
uv run alembic upgrade head
```

Never write raw SQL DDL. Always use Alembic migrations.

### Step 4: Create an API router

Create `data-api/app/api/my_service.py`:

```python
"""MyService API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.integrations.my_service_client import MyServiceClient

router = APIRouter(prefix="/my-service", tags=["my-service"])


@router.post("/sync")
async def sync_my_service(
    user_id: str = Query(default="default"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Trigger a MyService data sync."""
    client = MyServiceClient(user_id=user_id, db=db)
    return await client.sync()
```

Register the router in `data-api/app/main.py`:

```python
from app.api.my_service import router as my_service_router

app.include_router(my_service_router, dependencies=[Depends(verify_token)])
```

### Step 5: Create a skill

Create `skills/aegis-my-service/SKILL.md`:

```markdown
---
name: aegis_my_service
description: "Query MyService data via the data-api"
---
# Aegis MyService

Instructions for the agent on when and how to query MyService data.

## API Reference

Base URL: `http://data-api:8000`

### POST /my-service/sync

Trigger a data sync.

\```
web_fetch("http://data-api:8000/my-service/sync?user_id=default", {
  "method": "POST",
  "headers": {"Authorization": "Bearer $DATA_API_TOKEN"}
})
\```
```

### Step 6: Write tests

Add tests in `data-api/tests/`. Test both the endpoint registration and the client logic. Use mocks for external API calls.

## Adding a New Skill

Skills are Markdown files that teach OpenClaw agents how to interact with data-api endpoints. They do not contain code -- they contain instructions.

### Structure

```
skills/
  aegis-my-skill/
    SKILL.md
```

### SKILL.md format

```markdown
---
name: my_skill_name
description: "One-line description of what the skill does"
---
# Skill Title

When to use this skill. What questions or tasks it covers.

## API Reference

Base URL: `http://data-api:8000`

### GET /endpoint

Description of what this endpoint returns.

\```
web_fetch("http://data-api:8000/endpoint?param=value", {
  "headers": {"Authorization": "Bearer $DATA_API_TOKEN"}
})
\```

Returns: `{"field": "value"}`

## Guidelines

- How to format responses
- What NOT to do (e.g., never expose raw account numbers)
```

The YAML frontmatter (`name` and `description`) is required. OpenClaw auto-discovers skills from the `skills/` directory at startup.

### Skill loading priority (3 tiers)

OpenClaw loads skills in a 3-tier priority order:

1. **Workspace skills** -- your custom skills in the `skills/` directory (highest priority)
2. **Managed skills** -- installed via OpenClaw's skill management commands
3. **Bundled skills** -- 53+ skills that ship with OpenClaw (web search, file management, code execution, memory, etc.)

If a workspace skill has the same name as a bundled skill, the workspace version takes precedence. Aegis's 8 custom skills (`aegis-finance`, `aegis-calendar`, etc.) are all workspace skills.

Skills are limited to 65,536 bytes (configured in `openclaw.json` via `skills.limits.maxSkillFileBytes`).

## Adding a New Hook

Hooks intercept OpenClaw events and can modify messages, log actions, or trigger side effects.

### Structure

```
hooks/
  my-hook/
    HOOK.md
    handler.ts
```

### HOOK.md format

```markdown
---
name: my-hook
description: "What this hook does"
metadata: { "openclaw": { "emoji": "icon", "events": ["message:sent"] } }
---
# My Hook

Brief description.
```

Supported events: `command`, `message:sent`, `message:received`, `agent`, `gateway`, `session`.

### handler.ts format

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
  // To send a message to the user:
  event.messages.push("Hello from my hook");

  // To mutate outbound content:
  event.context.content = "modified content";

  // To log (visible in container stderr):
  console.error("[my-hook] something happened");
}
```

Register hooks in `config/openclaw.json` under `hooks.internal.entries`:

```json
{
  "my-hook": {
    "enabled": true,
    "env": {
      "MY_VAR": "${MY_VAR}"
    }
  }
}
```

OpenClaw discovers hooks via `HOOK.md` files, NOT `hook.json`.

## Adding a New API Endpoint

### Step 1: Create the router file

Create `data-api/app/api/my_router.py` with a `router = APIRouter(...)`.

### Step 2: Register in main.py

In `data-api/app/main.py`, import the router and include it:

```python
from app.api.my_router import router as my_router

app.include_router(my_router, dependencies=[Depends(verify_token)])
```

The `Depends(verify_token)` ensures all routes on this router require Bearer token authentication. Exclude it only for truly public endpoints (like `/health`).

### Step 3: Add tests

Add the new router's routes to `tests/test_api_endpoints.py` in the `_PROTECTED_ROUTES` list to verify they require authentication.

Write specific tests for the endpoint logic.

## Database Migrations

All schema changes go through Alembic. Never run raw `CREATE TABLE` or `ALTER TABLE` SQL.

```bash
cd data-api

# Create a new migration (auto-detects model changes)
uv run alembic revision --autogenerate -m "describe what changed"

# Apply migrations
uv run alembic upgrade head

# Downgrade one step
uv run alembic downgrade -1

# Show current migration state
uv run alembic current

# Show migration history
uv run alembic history
```

Review auto-generated migrations before applying. Alembic sometimes misdetects changes, especially with indexes and constraints.

## CI/CD Pipeline

The GitHub Actions CI pipeline (`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests:

| Job | What it does |
|-----|-------------|
| `lint` | Installs deps, runs `ruff check` and `ruff format --check` |
| `test` | Installs deps, runs `pytest` with JUnit XML output |
| `docker-build` | Validates Docker Compose config, builds the data-api Docker image |
| `security-scan` | Runs Trivy vulnerability scanner on the Docker image (fails on HIGH/CRITICAL) |

All jobs must pass before merging.

## Project Conventions Reference

For the full set of coding conventions, see `CLAUDE.md` at the project root. Key rules:

- Type hints on all function signatures
- `from __future__ import annotations` at the top of every Python file
- `httpx.AsyncClient` for all HTTP calls (never `requests`)
- `structlog` for logging (never `print` or `logging.basicConfig`)
- Never catch bare `Exception` -- use specific exception types
- Never log secrets, tokens, or PII
- All models use `user_id: String(36)` (not UUID FK -- single-user system)
- Business logic belongs in skills, not Python services
- Data-api is persistence only -- no analysis, no LLM calls, no message delivery
