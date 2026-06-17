"""E2E tests for Plugin System v2."""
import atexit
import json
import os
import shutil
import tempfile
from pathlib import Path

# Set test database path BEFORE any app imports
_test_tmpdir = tempfile.mkdtemp()
os.environ["SQLITE_PATH"] = str(Path(_test_tmpdir) / "test.db")

atexit.register(lambda: shutil.rmtree(_test_tmpdir, ignore_errors=True))

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal, init_db
from app.models import PluginExtension, ProviderConfig
from app.security import hash_password
from app.deps import get_current_admin

# Initialize DB and seed data
init_db()

from app.main import seed_admin, seed_providers

seed_admin()
seed_providers()

client = TestClient(app)


def _get_admin_token() -> str:
    """Login as admin and return token."""
    resp = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def _auth_header() -> dict:
    return {"Authorization": f"Bearer {_get_admin_token()}"}


class TestPluginSystemV2:
    """E2E tests for the extended plugin system."""

    def test_list_endpoints(self):
        """Model plugins via /api/plugins, extensions via /api/plugins/v2."""
        headers = _auth_header()

        # Model plugins should return full PluginOut
        resp = client.get("/api/plugins", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        for item in data:
            assert "base_url" in item or "category" in item

        # Extension plugins endpoint
        resp = client.get("/api/plugins/v2", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_plugin_extension_crud(self):
        """Install -> activate -> deactivate -> delete cycle."""
        headers = _auth_header()

        # Create a test extension plugin entry via DB directly
        db = SessionLocal()
        try:
            ext = PluginExtension(
                name="test_e2e_ext",
                label="E2E Test Extension",
                category="extension",
                source="uploaded",
                version="1.0.0",
                skills_json=json.dumps({"test-skill": "skills/test.md"}),
                hooks_json="{}",
                frontend_json=json.dumps({
                    "components": {"Panel": "Panel"},
                    "extension_points": ["plugin-config-tab"],
                }),
            )
            db.add(ext)
            db.commit()
        finally:
            db.close()

        # Install
        resp = client.post("/api/plugins/v2/test_e2e_ext/install", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["installed"] is True

        # Activate
        resp = client.post("/api/plugins/v2/test_e2e_ext/activate", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

        # Deactivate
        resp = client.post("/api/plugins/v2/test_e2e_ext/deactivate", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

        # Delete
        resp = client.delete("/api/plugins/v2/test_e2e_ext", headers=headers)
        assert resp.status_code == 204

    def test_skill_update(self):
        """PATCH skill keywords and match_mode."""
        headers = _auth_header()

        db = SessionLocal()
        try:
            ext = PluginExtension(
                name="test_e2e_skill",
                label="E2E Skill",
                category="skill",
                source="uploaded",
                skills_json=json.dumps({
                    "code-review": {
                        "keywords": ["review", "check"],
                        "match_mode": "keyword",
                    }
                }),
            )
            db.add(ext)
            db.commit()
        finally:
            db.close()

        # Update skill config
        resp = client.patch(
            f"/api/plugins/v2/test_e2e_skill/skills",
            json={"name": "code-review", "keywords": ["review", "inspect"], "match_mode": "always"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        skills = json.loads(resp.json()["skills_json"])
        assert skills["code-review"]["keywords"] == ["review", "inspect"]
        assert skills["code-review"]["match_mode"] == "always"

        # Cleanup
        client.delete("/api/plugins/v2/test_e2e_skill", headers=headers)

    def test_model_plugins_still_work(self):
        """Verify existing model plugin operations are unaffected."""
        headers = _auth_header()

        # List should include builtin model plugins
        resp = client.get("/api/plugins", headers=headers)
        data = resp.json()
        names = [p["name"] for p in data]
        assert "zhipu" in names
        assert "openai_like" in names

        # A builtin model plugin should have model fields
        zhipu = next(p for p in data if p["name"] == "zhipu")
        assert zhipu["category"] == "model"
        assert "base_url" in zhipu
        assert "api_key_set" in zhipu

    def test_skill_injection(self):
        """Verify SkillInjector works."""
        from app.plugins.skill_loader import SkillInjector
        from app.plugins.base import SkillDef

        injector = SkillInjector()

        skills = [
            SkillDef(name="polite", plugin_name="test", content="请用礼貌用语。",
                     match_mode="keyword", keywords=["你好", "请问"]),
            SkillDef(name="always-on", plugin_name="test", content="始终遵循此规则。",
                     match_mode="always", keywords=[]),
        ]

        # Match with keyword
        matched = injector.match("你好，请问天气如何？", skills)
        assert len(matched) == 2  # always mode + keyword match
        assert "请用礼貌用语。" in matched
        assert "始终遵循此规则。" in matched

        # Match without keywords
        matched = injector.match("今天天气不错", skills)
        assert len(matched) == 1  # only always mode
        assert "始终遵循此规则。" in matched

    def test_hook_dispatcher(self):
        """Verify HookDispatcher resolution."""
        from app.plugins.hooks import _resolve_callable

        # Should resolve existing functions
        fn = _resolve_callable("json:dumps")
        assert fn is not None
        assert fn({"a": 1}) == '{"a": 1}'

        # Should return None for non-existent paths
        fn = _resolve_callable("nonexistent.module:func")
        assert fn is None
