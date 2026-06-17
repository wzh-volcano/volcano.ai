from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PluginExtension
from .base import SkillDef

SKILLS_DIR = Path("data") / "plugins"


class SkillInjector:
    def load_from_plugin(
        self, plugin_name: str, skills_map: dict[str, str]
    ) -> list[SkillDef]:
        """Read skills markdown from plugin's skills/ directory.

        skills_map: {"code-review": "skills/code-review.md"}
        """
        result: list[SkillDef] = []
        plugin_dir = SKILLS_DIR / plugin_name
        for skill_name, rel_path in skills_map.items():
            md_file = plugin_dir / rel_path
            if not md_file.exists():
                continue
            content = md_file.read_text(encoding="utf-8")
            result.append(SkillDef(
                name=skill_name,
                plugin_name=plugin_name,
                content=content,
                match_mode="keyword",
                keywords=[],
            ))
        return result

    def get_enabled_skills(self, db: Session) -> list[SkillDef]:
        """Return all skills from active extension plugins."""
        rows = db.scalars(
            select(PluginExtension).where(
                PluginExtension.is_active.is_(True),
                PluginExtension.installed.is_(True),
            )
        ).all()

        skills: list[SkillDef] = []
        for row in rows:
            try:
                skills_map = json.loads(row.skills_json or "{}")
            except json.JSONDecodeError:
                continue
            if not skills_map:
                continue
            skills.extend(self.load_from_plugin(row.name, skills_map))
        return skills

    def match(
        self, query: str, skills: list[SkillDef]
    ) -> list[str]:
        """Return skill content matching the query. Substring matching."""
        matched: list[str] = []
        for skill in skills:
            if skill.match_mode == "always":
                matched.append(skill.content)
            elif skill.match_mode == "keyword":
                q = query.lower()
                if any(kw.lower() in q for kw in skill.keywords):
                    matched.append(skill.content)
        return matched
