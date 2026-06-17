"""Tests for list_plugins endpoint.

Verifies the endpoint returns full PluginOut with all fields
(base_url, api_key_set, etc.) and only includes ProviderConfig rows.
"""
import json
from datetime import datetime
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models import ProviderConfig, PluginExtension, User


def _make_db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _seed_provider(
    db: Session,
    name: str = "test_provider",
    category: str = "model",
    source: str = "builtin",
    installed: bool = True,
    is_active: bool = True,
    base_url: str = "https://example.com/v1",
    api_key: str = "sk-test",
) -> ProviderConfig:
    row = ProviderConfig(
        name=name,
        label="Test Provider",
        category=category,
        source=source,
        installed=installed,
        is_active=is_active,
        base_url=base_url,
        api_key=api_key,
        created_at=datetime(2025, 1, 1),
        updated_at=datetime(2025, 1, 1),
    )
    db.add(row)
    db.commit()
    return row


def _seed_extension(
    db: Session,
    name: str = "ext_test",
    category: str = "skill",
    installed: bool = True,
    is_active: bool = True,
) -> PluginExtension:
    row = PluginExtension(
        name=name,
        label="Test Extension",
        category=category,
        source="uploaded",
        version="0.1.0",
        installed=installed,
        is_active=is_active,
        skills_json=json.dumps({"test_skill": {"description": "A test skill"}}),
        created_at=datetime(2025, 1, 1),
        updated_at=datetime(2025, 1, 1),
    )
    db.add(row)
    db.commit()
    return row


# --- Test: list_plugins returns PluginOut, NOT PluginListItem ---


def test_list_plugins_returns_full_plugin_out():
    """list_plugins must return full PluginOut with base_url, api_key_set, etc."""
    db = _make_db()
    _seed_provider(db)

    from app.routers.plugins import list_plugins

    result = list_plugins(db, MagicMock(spec=User, role="admin"))

    assert len(result) == 1
    item = result[0]
    # Fields that PluginListItem lacked but PluginOut has
    assert hasattr(item, "base_url")
    assert item.base_url == "https://example.com/v1"
    assert hasattr(item, "api_key_set")
    assert item.api_key_set is True
    assert hasattr(item, "module_path")
    assert hasattr(item, "is_embedding_active")
    assert hasattr(item, "embedding_model")
    assert hasattr(item, "extra_json")
    # Standard fields that should still work
    assert item.name == "test_provider"
    assert item.category == "model"
    assert item.source == "builtin"
    assert item.installed is True
    assert item.is_active is True
    assert item.error is None


def test_list_plugins_excludes_extension_plugins():
    """list_plugins should only return ProviderConfig rows, not PluginExtension."""
    db = _make_db()
    _seed_provider(db, name="model_provider")
    _seed_extension(db, name="skill_ext")

    from app.routers.plugins import list_plugins

    result = list_plugins(db, MagicMock(spec=User, role="admin"))

    names = [r.name for r in result]
    assert "model_provider" in names
    assert "skill_ext" not in names, "Extension plugins should NOT appear in list_plugins"
    assert len(result) == 1


def test_list_plugins_returns_empty_when_no_providers():
    """list_plugins should return empty list when no ProviderConfig rows exist."""
    db = _make_db()

    from app.routers.plugins import list_plugins

    result = list_plugins(db, MagicMock(spec=User, role="admin"))

    assert result == []
