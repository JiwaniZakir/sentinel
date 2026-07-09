"""Shared test fixtures for Aegis data-api."""

from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault(
    "DATA_API_TOKEN",
    "test_data_api_token_0123456789abcdef",
)
os.environ.setdefault(
    "ENCRYPTION_MASTER_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
)
os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402

AUTH_HEADER = {"Authorization": "Bearer test_data_api_token_0123456789abcdef"}


@pytest.fixture(scope="session", autouse=True)
async def _dispose_engine():
    """Close pooled DB connections on the session loop before it shuts down."""
    yield
    await engine.dispose()


@pytest.fixture
def master_key() -> bytes:
    return bytes.fromhex("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
