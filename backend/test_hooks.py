"""Unit tests for HookDispatcher."""
import json
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models import PluginExtension
from app.plugins.hooks import HookDispatcher, _resolve_callable


def _make_db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _seed_hook(db: Session, name: str, hooks_json: str) -> None:
    db.add(PluginExtension(
        name=name,
        installed=True,
        is_active=True,
        hooks_json=hooks_json,
    ))
    db.commit()


# --- _resolve_callable ---

def test_resolve_callable_builtin():
    fn = _resolve_callable("json:dumps")
    assert fn is json.dumps


def test_resolve_callable_nonexistent():
    assert _resolve_callable("nonexistent.module:func") is None


def test_resolve_callable_bad_format():
    assert _resolve_callable("no-colon") is None


# --- get_enabled_hooks ---

def test_get_enabled_hooks_empty_db():
    db = _make_db()
    d = HookDispatcher()
    assert d.get_enabled_hooks(db) == []


def test_get_enabled_hooks_only_active_installed():
    db = _make_db()
    d = HookDispatcher()
    _seed_hook(db, "active_one", json.dumps({"pre_chat": "a:b"}))
    db.add(PluginExtension(
        name="inactive", installed=True, is_active=False,
        hooks_json=json.dumps({"pre_chat": "c:d"}),
    ))
    db.add(PluginExtension(
        name="not_installed", installed=False, is_active=True,
        hooks_json=json.dumps({"pre_chat": "e:f"}),
    ))
    db.commit()
    result = d.get_enabled_hooks(db)
    assert len(result) == 1
    assert result[0]["pre_chat"] == "a:b"


def test_get_enabled_hooks_invalid_json():
    db = _make_db()
    d = HookDispatcher()
    _seed_hook(db, "bad", "not-json")
    assert d.get_enabled_hooks(db) == []


# --- dispatch_pre_chat ---

def test_dispatch_pre_chat_no_hooks():
    db = _make_db()
    d = HookDispatcher()
    q, c = d.dispatch_pre_chat("hello", {"user": "alice"}, db)
    assert q == "hello"
    assert c == {"user": "alice"}


def test_dispatch_pre_chat_single_hook():
    db = _make_db()
    d = HookDispatcher()
    path = "json:dumps"  # dummy — won't be called with right sig
    _seed_hook(db, "p1", json.dumps({"pre_chat": path}))
    q, c = d.dispatch_pre_chat("hello", {}, db)
    assert q == "hello"


def test_dispatch_pre_chat_called():
    db = _make_db()
    d = HookDispatcher()
    stub = MagicMock(return_value=("modified", {"key": "val"}))
    with patch("app.plugins.hooks._resolve_callable", return_value=stub):
        _seed_hook(db, "p1", json.dumps({"pre_chat": "fake:fn"}))
        q, c = d.dispatch_pre_chat("hello", {}, db)
    assert q == "modified"
    assert c == {"key": "val"}
    stub.assert_called_once_with("hello", {})


def test_dispatch_pre_chat_multiple_hooks():
    db = _make_db()
    d = HookDispatcher()
    stub1 = MagicMock(return_value=("from1", {"n": 1}))
    stub2 = MagicMock(return_value=("from2", {"n": 2}))
    with patch("app.plugins.hooks._resolve_callable") as mock_resolve:
        mock_resolve.side_effect = [stub1, stub2]
        _seed_hook(db, "p1", json.dumps({"pre_chat": "a:b"}))
        _seed_hook(db, "p2", json.dumps({"pre_chat": "c:d"}))
        q, c = d.dispatch_pre_chat("start", {}, db)
    assert q == "from2"
    assert c == {"n": 2}
    stub1.assert_called_once_with("start", {})
    stub2.assert_called_once_with("from1", {"n": 1})


def test_dispatch_pre_chat_ignores_error():
    db = _make_db()
    d = HookDispatcher()
    def failing(q, c):
        raise ValueError("boom")
    with patch("app.plugins.hooks._resolve_callable", return_value=failing):
        _seed_hook(db, "p1", json.dumps({"pre_chat": "bad:fn"}))
        q, c = d.dispatch_pre_chat("hello", {}, db)
    assert q == "hello"
    assert c == {}


def test_dispatch_pre_chat_no_pre_chat_key():
    db = _make_db()
    d = HookDispatcher()
    _seed_hook(db, "p1", json.dumps({"post_chat": "a:b"}))
    q, c = d.dispatch_pre_chat("hello", {}, db)
    assert q == "hello"
    assert c == {}


# --- dispatch_post_chat ---

def test_dispatch_post_chat_no_hooks():
    db = _make_db()
    d = HookDispatcher()
    r = d.dispatch_post_chat("hi", "hello there", {}, db)
    assert r == "hello there"


def test_dispatch_post_chat_called():
    db = _make_db()
    d = HookDispatcher()
    stub = MagicMock(return_value="modified response")
    with patch("app.plugins.hooks._resolve_callable", return_value=stub):
        _seed_hook(db, "p1", json.dumps({"post_chat": "fake:fn"}))
        r = d.dispatch_post_chat("hi", "original", {}, db)
    assert r == "modified response"
    stub.assert_called_once_with("hi", "original", {})


def test_dispatch_post_chat_multiple():
    db = _make_db()
    d = HookDispatcher()
    stub1 = MagicMock(return_value="resp1")
    stub2 = MagicMock(return_value="resp2")
    with patch("app.plugins.hooks._resolve_callable") as mock_resolve:
        mock_resolve.side_effect = [stub1, stub2]
        _seed_hook(db, "p1", json.dumps({"post_chat": "a:b"}))
        _seed_hook(db, "p2", json.dumps({"post_chat": "c:d"}))
        r = d.dispatch_post_chat("hi", "original", {}, db)
    assert r == "resp2"
    stub1.assert_called_once_with("hi", "original", {})
    stub2.assert_called_once_with("hi", "resp1", {})


def test_dispatch_post_chat_ignores_error():
    db = _make_db()
    d = HookDispatcher()
    def failing(q, r, c):
        raise ValueError("boom")
    with patch("app.plugins.hooks._resolve_callable", return_value=failing):
        _seed_hook(db, "p1", json.dumps({"post_chat": "bad:fn"}))
        r = d.dispatch_post_chat("hi", "hello", {}, db)
    assert r == "hello"


def test_dispatch_post_chat_no_post_chat_key():
    db = _make_db()
    d = HookDispatcher()
    _seed_hook(db, "p1", json.dumps({"pre_chat": "a:b"}))
    r = d.dispatch_post_chat("hi", "hello", {}, db)
    assert r == "hello"
