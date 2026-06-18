"""Unified registry for all plugin types (models, extensions, skills).

Provides registration, lookup, listing, and DB sync for the Plugin system v2.
"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PluginExtension
from .base import Plugin

_PLUGINS: dict[str, tuple[type, str, str, str]] = {}
"""name -> (plugin_class, label, source, category)"""

PLUGINS_DATA_DIR = Path("data") / "plugins"


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


def _read_manifest(name: str) -> dict | None:
    """Read manifest.json from plugin directory."""
    manifest_file = PLUGINS_DATA_DIR / name / "manifest.json"
    if not manifest_file.exists():
        return None
    try:
        return json.loads(manifest_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def sync_extensions_to_db(db: Session) -> None:
    """Ensure plugin_extensions rows match loaded extension plugins."""
    existing = {pe.name: pe for pe in db.scalars(select(PluginExtension))}
    for name, (cls, label, source, category) in _PLUGINS.items():
        if category == "model":
            continue  # handled by providers registry

        manifest = _read_manifest(name)
        version = (manifest or {}).get("version", "")
        skills_json = json.dumps((manifest or {}).get("skills", {}), ensure_ascii=False)
        hooks_json = json.dumps((manifest or {}).get("backend", {}).get("hooks", {}), ensure_ascii=False)
        frontend_json = json.dumps((manifest or {}).get("frontend", {}), ensure_ascii=False)

        if name in existing:
            row = existing[name]
            row.version = version or row.version
            if not row.skills_json or row.skills_json == "{}":
                row.skills_json = skills_json
            row.hooks_json = hooks_json
            row.frontend_json = frontend_json
            if row.label != label and label:
                row.label = label
            continue

        db.add(
            PluginExtension(
                name=name,
                label=label,
                category=category,
                source=source,
                version=version,
                skills_json=skills_json,
                hooks_json=hooks_json,
                frontend_json=frontend_json,
            )
        )
    db.commit()
