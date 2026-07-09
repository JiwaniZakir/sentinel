"""Tests for configuration and settings."""

from __future__ import annotations

import pytest


def test_settings_loads_from_env():
    """Settings should load DATA_API_TOKEN from environment."""
    from app.config import Settings

    s = Settings(
        data_api_token="a" * 32,
        encryption_master_key="0" * 64,
        postgres_password="test",
    )
    assert s.data_api_token == "a" * 32


def test_settings_requires_min_token_length():
    """DATA_API_TOKEN must be at least 32 chars."""
    from app.config import Settings

    with pytest.raises(ValueError):
        Settings(
            data_api_token="short",
            encryption_master_key="0" * 64,
            postgres_password="test",
        )


def test_async_database_url():
    """async_database_url should build from components."""
    from app.config import Settings

    s = Settings(
        data_api_token="a" * 32,
        encryption_master_key="0" * 64,
        postgres_user="myuser",
        postgres_password="mypass",
        postgres_db="mydb",
        database_url="",  # a DATABASE_URL env var (e.g. in CI) must not shadow the components
    )
    assert "myuser:mypass" in s.async_database_url
    assert "mydb" in s.async_database_url
    assert "asyncpg" in s.async_database_url


def test_sync_database_url():
    """sync_database_url should use psycopg2."""
    from app.config import Settings

    s = Settings(
        data_api_token="a" * 32,
        encryption_master_key="0" * 64,
        postgres_password="test",
    )
    assert "psycopg2" in s.sync_database_url


def test_master_key_bytes_valid():
    """master_key_bytes should decode valid hex."""
    from app.config import Settings

    s = Settings(
        data_api_token="a" * 32,
        encryption_master_key="ab" * 32,
        postgres_password="test",
    )
    key = s.master_key_bytes
    assert len(key) == 32
    assert isinstance(key, bytes)


def test_master_key_bytes_too_short():
    """master_key_bytes should reject keys shorter than 64 hex chars."""
    from app.config import Settings

    s = Settings(
        data_api_token="a" * 32,
        encryption_master_key="ab" * 16,
        postgres_password="test",
    )
    with pytest.raises(ValueError, match="64 hex"):
        _ = s.master_key_bytes


def test_llm_budget_defaults():
    """LLM budget settings should have sensible defaults."""
    from app.config import Settings

    s = Settings(
        data_api_token="a" * 32,
        encryption_master_key="0" * 64,
        postgres_password="test",
    )
    assert s.llm_daily_budget_usd == 5.00
    assert s.llm_monthly_budget_usd == 50.00
