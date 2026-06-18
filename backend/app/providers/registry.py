"""Provider 注册表与工厂（数据库驱动）。

启动时:
1. 内置 provider 类静态注册到 _REGISTRY
2. 扫描 data/plugins/ 目录加载上传的插件
3. 与 ProviderConfig 表同步：缺失行的内置项写入种子记录

运行时:
- get_current() 读 DB 中 is_active=True 的 provider，按 module_path 实例化并注入配置
- 找不到时回退到 OpenAILikeProvider 兜底
"""
from __future__ import annotations

import importlib
import json
from pathlib import Path
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from .ollama import OllamaProvider
from .openai_like import OpenAILikeProvider
from .zhipu import ZhipuProvider


class _ProviderProto(Protocol):  # 与 base.Provider 等价的轻量协议
    def name(self) -> str: ...
    def label(self) -> str: ...
    def available(self) -> bool: ...
    def configured(self) -> bool: ...
    def get_llm(self): ...
    def get_embeddings(self): ...
    def config_fields(self) -> list[dict]: ...


# 内置 provider 注册表：name -> (provider class, default label, module_path, category)
_BUILTIN: dict[str, tuple[type, str, str, str]] = {
    "zhipu": (ZhipuProvider, "智谱 GLM", "app.providers.zhipu:ZhipuProvider", "model"),
    "openai_like": (
        OpenAILikeProvider,
        "OpenAI 兼容",
        "app.providers.openai_like:OpenAILikeProvider",
        "model",
    ),
    "ollama": (
        OllamaProvider,
        "Ollama (本地)",
        "app.providers.ollama:OllamaProvider",
        "model",
    ),
}

# 全部已注册（含上传）的 provider 类：name -> (cls, label, module_path, source, category)
_REGISTRY: dict[str, tuple[type, str, str, str, str]] = {
    name: (cls, label, mp, "builtin", category)
    for name, (cls, label, mp, category) in _BUILTIN.items()
}


# ---------- 上传插件加载 ----------
def _plugins_root() -> Path:
    p = Path("data") / "plugins"
    p.mkdir(parents=True, exist_ok=True)
    return p


def load_uploaded_plugins() -> list[tuple[str, str | None]]:
    """扫描 data/plugins/ 下的所有插件目录并尝试导入。

    返回 [(name, error_or_none)]，便于把加载错误同步到 DB。
    """
    results: list[tuple[str, str | None]] = []
    root = _plugins_root()
    for sub in root.iterdir():
        if not sub.is_dir():
            continue
        manifest_file = sub / "manifest.json"
        if not manifest_file.exists():
            continue
        try:
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
            name = manifest["name"]
            label = manifest.get("label", name)
            category = manifest.get("category", "model")
            entry = manifest.get("entry", "")

            if entry and category == "model":
                # 只对 model 插件尝试 import；非 model 插件的 entry 可能为文件路径
                mod_name, _, cls_name = entry.partition(":")

                # 把插件目录加入 sys.path 以便 import
                import sys

                sub_str = str(sub.resolve())
                if sub_str not in sys.path:
                    sys.path.insert(0, sub_str)

                module = importlib.import_module(mod_name)
                cls = getattr(module, cls_name)
                module_path = f"{mod_name}:{cls_name}"
            else:
                # 无 entry（如纯 skill 插件），或非 model 插件，不尝试 import
                cls = object
                module_path = ""

            _REGISTRY[name] = (cls, label, module_path, "uploaded", category)
            results.append((name, None))
        except Exception as e:  # noqa: BLE001
            name = sub.name
            results.append((name, f"{type(e).__name__}: {e}"))

    # Also register uploaded non-model plugins into unified registry
    from ..plugins.registry import register_plugin  # noqa: PLC0415

    for name, (cls, label, mp, source, category) in list(_REGISTRY.items()):
        if category != "model":
            register_plugin(name, cls, label, source, category)

    return results


def _instantiate(name: str, config: dict | None = None) -> _ProviderProto:
    entry = _REGISTRY.get(name)
    if entry is None:
        return OpenAILikeProvider(config=config)
    cls = entry[0]
    try:
        return cls(config=config)
    except TypeError:
        # 兼容不接受 config kwargs 的旧实现
        return cls()


# ---------- DB 同步 ----------
def sync_builtin_to_db(db: Session) -> None:
    """确保每个内置 provider 在 provider_configs 表中有一行。"""
    from ..models import ProviderConfig

    existing = {pc.name: pc for pc in db.scalars(select(ProviderConfig))}
    changed = False
    for name, (cls, label, module_path, category) in _BUILTIN.items():
        if name in existing:
            # 老库可能没 category，做一次幂等回填
            row = existing[name]
            if not row.category:
                row.category = category
                changed = True
            continue
        # 用默认实例提取一次默认值
        try:
            inst = cls()
        except Exception:  # noqa: BLE001
            inst = None
        db.add(
            ProviderConfig(
                name=name,
                label=label,
                category=category,
                source="builtin",
                module_path=module_path,
                installed=False,
                is_active=False,
                base_url=getattr(inst, "base_url", lambda: "")() if inst else "",
                api_key="",
                embedding_model=getattr(inst, "embedding_model", lambda: "")()
                if inst
                else "",
                extra_json="{}",
            )
        )
        changed = True
    if changed:
        db.commit()


def sync_uploaded_to_db(db: Session, results: list[tuple[str, str | None]]) -> None:
    """把扫描到的上传插件写入/更新 provider_configs。

    只处理 model 类插件；skill / extension 由 sync_extensions_to_db 管理。
    """
    from ..models import ProviderConfig

    for name, err in results:
        entry = _REGISTRY.get(name)
        if entry is None:
            label = name
            module_path = ""
            category = "model"
        else:
            _, label, module_path, _, category = entry
        if category and category != "model":
            continue  # 非 model 插件由 plugin_extensions 表管理
        row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
        if row is None:
            db.add(
                ProviderConfig(
                    name=name,
                    label=label,
                    category=category or "model",
                    source="uploaded",
                    module_path=module_path,
                    installed=False,
                    is_active=False,
                    extra_json="{}",
                    error=err,
                )
            )
        else:
            row.label = label or row.label
            row.module_path = module_path or row.module_path
            if category:
                row.category = category
            row.error = err
    db.commit()


# ---------- 公共 API ----------
def list_provider_names() -> list[str]:
    return list(_REGISTRY.keys())


def get_provider_class(name: str) -> type | None:
    entry = _REGISTRY.get(name)
    return entry[0] if entry else None


def list_providers() -> list[_ProviderProto]:
    """返回所有已注册 provider 的实例列表（无配置注入，仅展示元信息）。"""
    return [_instantiate(name) for name in _REGISTRY]


def available_providers() -> list[_ProviderProto]:
    return [p for p in list_providers() if p.available()]


def get_provider(db: Session, name: str | None = None) -> _ProviderProto:
    """按名称返回 provider 实例（带 DB 配置注入）。"""
    from ..models import ProviderConfig

    if name is None:
        # 取当前 active
        row = db.scalar(
            select(ProviderConfig).where(ProviderConfig.is_active.is_(True))
        )
    else:
        row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))

    if row is None:
        return OpenAILikeProvider()

    config = {
        "base_url": row.base_url,
        "api_key": row.api_key,
        "embedding_model": row.embedding_model,
    }
    try:
        config["extra"] = json.loads(row.extra_json or "{}")
    except json.JSONDecodeError:
        config["extra"] = {}
    return _instantiate(row.name, config=config)


def get_current(db: Session) -> _ProviderProto:
    """当前生效的 LLM provider（is_active=True）。"""
    return get_provider(db)


def _instantiate_from_row(row) -> _ProviderProto:
    """根据 ProviderConfig 行实例化 provider。"""
    config = {
        "base_url": row.base_url,
        "api_key": row.api_key,
        "embedding_model": row.embedding_model,
    }
    try:
        config["extra"] = json.loads(row.extra_json or "{}")
    except json.JSONDecodeError:
        config["extra"] = {}
    return _instantiate(row.name, config=config)


def get_current_embedding(db: Session) -> _ProviderProto:
    """当前生效的 Embedding provider。

    优先取 is_embedding_active=True 的行；若没有任何插件被设为 embedding 激活，
    回退到 LLM 当前激活的 provider（保持向后兼容）。
    """
    from ..models import ProviderConfig

    row = db.scalar(
        select(ProviderConfig).where(ProviderConfig.is_embedding_active.is_(True))
    )
    if row is None:
        return get_current(db)
    return _instantiate_from_row(row)


# 向后兼容：旧代码 get_current() 不传 db 时，临时开 session
def get_current_legacy() -> _ProviderProto:
    """不带 db 的旧接口，仅用于过渡。生产代码应改为 get_current(db)。"""
    from ..database import SessionLocal

    db = SessionLocal()
    try:
        return get_current(db)
    finally:
        db.close()


def list_active_models(db: Session) -> list[dict]:
    """返回所有已安装已激活的 provider 及其可用模型列表。

    优先使用 extra_json 中配置的模型列表（管理员手动选择），
    其次尝试通过 provider.list_models() 拉取，最后回退到 llm_model。
    """
    from ..models import ProviderConfig

    rows = db.scalars(
        select(ProviderConfig).where(
            ProviderConfig.installed.is_(True),
            ProviderConfig.is_active.is_(True),
            ProviderConfig.error.is_(None),
        )
    ).all()

    result: list[dict] = []
    for row in rows:
        model_list: list[dict] = []

        extra = {}
        try:
            extra = json.loads(row.extra_json or "{}")
        except json.JSONDecodeError:
            pass

        configured = extra.get("configured_models")
        if configured and isinstance(configured, list):
            for m in configured:
                if isinstance(m, dict) and "name" in m:
                    model_list.append({"name": m["name"], "context": m.get("context", 262144)})

        if not model_list:
            try:
                provider = _instantiate_from_row(row)
                if hasattr(provider, "list_models"):
                    raw = provider.list_models()
                    model_list = [{"name": name, "context": 262144} for name in raw]
            except Exception:
                pass

        result.append({
            "provider_name": row.name,
            "label": row.label,
            "models": model_list,
        })
    return result


# 兜底：保持旧的导入路径可用，但语义换成 legacy
__all__ = [
    "available_providers",
    "get_current",
    "get_current_embedding",
    "get_current_legacy",
    "get_provider",
    "list_providers",
    "list_provider_names",
    "load_uploaded_plugins",
    "sync_builtin_to_db",
    "sync_uploaded_to_db",
]


# 让旧的 settings.llm_provider 仍能用作兜底（保持向后兼容）
_ = settings  # 只引用一下以避免静态分析报错
