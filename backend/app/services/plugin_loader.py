"""插件加载服务：上传 zip → 解压 → 校验 manifest → 尝试 import。

安全约束：
- 插件名必须匹配 ^[a-zA-Z0-9_]{2,32}$
- zip 解压后的所有路径必须落在目标目录内（防 zip-slip）
- 不会执行 pip install；如果 import 时缺依赖，错误回写到 ProviderConfig.error
"""
from __future__ import annotations

import importlib
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

NAME_RE = re.compile(r"^[a-zA-Z0-9_]{2,32}$")


class PluginError(Exception):
    """插件相关错误的统一异常。"""


def plugins_root() -> Path:
    """data/plugins/ 目录。"""
    p = Path("data") / "plugins"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_extract(zf: zipfile.ZipFile, dest: Path) -> None:
    """防 zip-slip 的解压。"""
    dest = dest.resolve()
    for member in zf.infolist():
        target = (dest / member.filename).resolve()
        if not str(target).startswith(str(dest)):
            raise PluginError(f"非法路径: {member.filename}")
    zf.extractall(dest)


def _read_manifest(plugin_dir: Path) -> dict:
    f = plugin_dir / "manifest.json"
    if not f.exists():
        raise PluginError("缺少 manifest.json")
    try:
        manifest = json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise PluginError(f"manifest.json 解析失败: {e}") from e

    for key in ("name", "label", "entry"):
        if key not in manifest:
            raise PluginError(f"manifest.json 缺少字段: {key}")
    if not NAME_RE.match(manifest["name"]):
        raise PluginError(f"非法插件名: {manifest['name']}")
    if ":" not in manifest["entry"]:
        raise PluginError("entry 必须形如 'module:Class'")
    return manifest


def install_from_upload(content: bytes, filename: str) -> tuple[str, str | None]:
    """从上传的 zip 内容安装插件。

    返回 (name, error_or_none)。即使 import 失败，文件也会保留并返回 error。
    """
    if not filename.lower().endswith(".zip"):
        raise PluginError("仅支持 .zip 插件包")

    # 写入临时文件后解压到临时目录
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        zip_path = tmp_path / "plugin.zip"
        zip_path.write_bytes(content)

        extract_path = tmp_path / "extracted"
        extract_path.mkdir()
        try:
            with zipfile.ZipFile(zip_path) as zf:
                _safe_extract(zf, extract_path)
        except zipfile.BadZipFile as e:
            raise PluginError(f"无效 zip 文件: {e}") from e

        # 找到 manifest.json 所在目录（允许直接在根，或一层子目录）
        manifest_dir = extract_path
        if not (manifest_dir / "manifest.json").exists():
            subs = [d for d in extract_path.iterdir() if d.is_dir()]
            if len(subs) == 1 and (subs[0] / "manifest.json").exists():
                manifest_dir = subs[0]
            else:
                raise PluginError("zip 内未找到 manifest.json")

        manifest = _read_manifest(manifest_dir)
        name = manifest["name"]

        # 复制到 data/plugins/<name>/
        target = plugins_root() / name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(manifest_dir, target)

    # 尝试 import
    error: str | None = None
    try:
        target_str = str((plugins_root() / name).resolve())
        if target_str not in sys.path:
            sys.path.insert(0, target_str)
        mod_name, _, cls_name = manifest["entry"].partition(":")
        module = importlib.import_module(mod_name)
        getattr(module, cls_name)  # 确保类存在
    except Exception as e:  # noqa: BLE001
        error = f"{type(e).__name__}: {e}"

    return name, error


def uninstall(name: str) -> bool:
    """删除上传的插件目录。返回是否真的删除了。"""
    if not NAME_RE.match(name):
        raise PluginError(f"非法插件名: {name}")
    target = plugins_root() / name
    if target.exists() and target.is_dir():
        shutil.rmtree(target)
        return True
    return False


# 单包大小上限 32MB，避免大文件耗尽磁盘
MAX_PLUGIN_BYTES = 32 * 1024 * 1024


def install_from_url(url: str) -> tuple[str, str | None]:
    """从 URL 下载 zip 后调用 ``install_from_upload`` 走相同流水线。

    安全约束：
    - 仅允许 http/https
    - 单包不超过 ``MAX_PLUGIN_BYTES``
    """
    import urllib.error
    import urllib.parse
    import urllib.request

    if not url or not isinstance(url, str):
        raise PluginError("URL 不能为空")
    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise PluginError("仅支持 http/https URL")
    if not parsed.netloc:
        raise PluginError("非法 URL")

    # 推断 filename，用于 install_from_upload 校验 .zip 后缀
    filename = Path(parsed.path).name or "plugin.zip"
    if not filename.lower().endswith(".zip"):
        # 允许 ?query 链接，但要求路径名以 .zip 结尾
        raise PluginError("URL 必须指向 .zip 文件")

    req = urllib.request.Request(url, headers={"User-Agent": "volcano-plugin-fetcher/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 - 已限制 scheme
            content = resp.read(MAX_PLUGIN_BYTES + 1)
    except urllib.error.URLError as e:
        raise PluginError(f"下载失败: {e}") from e
    except TimeoutError as e:
        raise PluginError("下载超时") from e

    if len(content) > MAX_PLUGIN_BYTES:
        raise PluginError(f"插件包过大（>{MAX_PLUGIN_BYTES // 1024 // 1024}MB）")
    if not content:
        raise PluginError("下载内容为空")

    return install_from_upload(content, filename)
