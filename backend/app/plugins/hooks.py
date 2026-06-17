from __future__ import annotations

import importlib
import json
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PluginExtension


def _resolve_callable(dotted_path: str) -> Callable | None:
    """Resolve 'module.path:function' to callable."""
    try:
        mod_name, _, fn_name = dotted_path.partition(":")
        module = importlib.import_module(mod_name)
        return getattr(module, fn_name)
    except Exception:
        return None


class HookDispatcher:
    def get_enabled_hooks(self, db: Session) -> list[dict]:
        """Return hook definitions from active extension plugins."""
        rows = db.scalars(
            select(PluginExtension).where(
                PluginExtension.is_active.is_(True),
                PluginExtension.installed.is_(True),
            )
        ).all()

        hooks: list[dict] = []
        for row in rows:
            try:
                hooks_def = json.loads(row.hooks_json or "{}")
            except json.JSONDecodeError:
                continue
            hooks.append(hooks_def)
        return hooks

    def dispatch_pre_chat(
        self, query: str, context: dict, db: Session
    ) -> tuple[str, dict]:
        """Call all pre_chat hooks in registered order."""
        hooks = self.get_enabled_hooks(db)
        for hook_def in hooks:
            path = hook_def.get("pre_chat")
            if not path:
                continue
            fn = _resolve_callable(path)
            if fn:
                try:
                    query, context = fn(query, context)
                except Exception:
                    pass
        return query, context

    def dispatch_post_chat(
        self, query: str, response: str, context: dict, db: Session
    ) -> str:
        """Call all post_chat hooks in registered order."""
        hooks = self.get_enabled_hooks(db)
        for hook_def in hooks:
            path = hook_def.get("post_chat")
            if not path:
                continue
            fn = _resolve_callable(path)
            if fn:
                try:
                    response = fn(query, response, context)
                except Exception:
                    pass
        return response
