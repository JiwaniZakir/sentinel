# Contributing to Aegis

Thank you for your interest in contributing to Aegis. This guide covers everything you need to know to submit a quality pull request.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/sentinel.git aegis
   cd aegis
   ```
3. Run bootstrap to set up the development environment:
   ```bash
   ./infrastructure/scripts/bootstrap.sh
   ```
4. Install Python dev dependencies:
   ```bash
   cd data-api && uv sync --dev
   ```
5. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature
   ```

## Development Setup

See [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) for the full development guide, including:
- Running services locally
- Running the data-api outside Docker
- Running tests
- Database migrations

## Code Conventions

All code conventions are documented in [CLAUDE.md](../CLAUDE.md) at the project root. Key rules:

### Python (data-api)

- **Formatter:** `ruff format` (line length 99)
- **Linter:** `ruff check` with security rules enabled
- **Type hints** on all function signatures
- `from __future__ import annotations` at the top of every file
- Use `httpx.AsyncClient` for HTTP calls (never `requests`)
- Use `structlog` for logging (never `print`)
- Never catch bare `Exception` -- use specific exception types
- Never log secrets, tokens, or PII
- All database changes go through Alembic migrations
- All integration clients inherit from `BaseIntegration`

### TypeScript (hooks)

- Hooks live in `hooks/<name>/handler.ts` with a `HOOK.md` config file
- Handler functions receive `InternalHookEvent`
- Use `event.messages.push()` to send messages, `event.context.content` to mutate content

### Conventional Commits

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Garmin sleep tracking to health sync
fix: handle expired Canvas tokens gracefully
chore: update ruff to 0.9.0
docs: add deployment guide for Hetzner
security: rotate default encryption test vectors
refactor: extract BaseIntegration credential methods
test: add integration tests for Schwab client
ci: add Trivy scan to Docker build job
```

Allowed prefixes: `feat`, `fix`, `chore`, `docs`, `security`, `refactor`, `test`, `ci`.

Keep the subject line under 72 characters. Use the body for details if needed.

## Before Pushing

Always run lint and tests before pushing:

```bash
make lint test
```

Both must pass. CI will reject pull requests that fail either check.

If you are adding a new API endpoint, also verify the Docker image builds:

```bash
docker build -f infrastructure/Dockerfile.data-api -t aegis-data-api:test .
```

## Pull Request Guidelines

- Keep PRs focused -- one feature or fix per PR
- Add tests for new functionality
- Update documentation for user-facing changes
- Reference the related issue (if any) in the PR description
- Ensure all CI checks pass before requesting review

## Adding New Integrations

See [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md#adding-a-new-integration) for a step-by-step guide. In summary:

1. Create an integration client in `data-api/app/integrations/` (inherits `BaseIntegration`)
2. Create a model in `data-api/app/models/` if you need new database tables
3. Create an Alembic migration
4. Create an API router in `data-api/app/api/`
5. Register the router in `data-api/app/main.py`
6. Create a skill in `skills/` to teach agents how to use it
7. Write tests

## Adding New Skills

Skills are Markdown files in `skills/<name>/SKILL.md` with YAML frontmatter. They contain instructions for agents, not code. See [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md#adding-a-new-skill) for the format.

## Adding New Hooks

Hooks are TypeScript files in `hooks/<name>/handler.ts` with a `HOOK.md` config file. See [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md#adding-a-new-hook) for the format and registration.

## Security

If you discover a security vulnerability, **do not open a public issue.** Email the maintainer directly. See [SECURITY.md](../SECURITY.md) for the full security policy and reporting instructions.

When contributing code that touches security-sensitive areas (encryption, authentication, audit logging, PII handling), please:
- Add tests that verify the security properties
- Document any threat model considerations in the PR description
- Do not introduce new dependencies without justification

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
