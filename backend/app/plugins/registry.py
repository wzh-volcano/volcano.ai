"""Unified registry for all plugin types (models, extensions, skills).

Provides registration, lookup, listing, and DB sync for the Plugin system v2.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PluginExtension
from .base import Plugin

_PLUGINS: dict[str, tuple[type, str, str, str]] = {}
"""name -> (plugin_class, label, source, category)"""


def register_plugin(
    name: str,
    plugin_cls: type,
    label: str,
    source: str = "builtin",
    category: str = "model",
) -> None:
    _PLUGINS[name] = (plugin_cls, label, source, category)


def get_plugin(name: str) -> type | None:
    entry = _PLUGINS.get(name)
    return entry[0] if entry else None


def list_plugins(category: str | None = None) -> list[type]:
    if category:
        return [cls for cls, _, _, cat in _PLUGINS.values() if cat == category]
    return [cls for cls, _, _, _ in _PLUGINS.values()]


def register_builtin_providers() -> None:
    """Bridge existing builtin providers into new registry."""
    from ..providers.registry import _BUILTIN

    for name, (cls, label, module_path, category) in _BUILTIN.items():
        register_plugin(name, cls, label, "builtin", category)


def sync_extensions_to_db(db: Session) -> None:
    """Ensure plugin_extensions rows match loaded extension plugins."""
    existing = {pe.name: pe for pe in db.scalars(select(PluginExtension))}
    for name, (cls, label, source, category) in _PLUGINS.items():
        if category == "model":
            continue  # handled by providers registry
        if name in existing:
            continue
        db.add(
            PluginExtension(
                name=name,
                label=label,
                category=category,
                source=source,
            )
        )
    db.commit()
