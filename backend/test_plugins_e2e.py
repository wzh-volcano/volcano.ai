"""插件管理 E2E 测试。

需要先启动后端：
    cd backend && uvicorn app.main:app --port 8000
"""
import io
import json
import urllib.request
import urllib.error
import zipfile

BASE = "http://127.0.0.1:8000"


def req(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(r) as resp:
            text = resp.read().decode()
            return resp.status, json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except Exception:
            return e.code, text


def upload(path, token, filename, content):
    """multipart/form-data 上传一个文件。"""
    boundary = "----PluginE2EBoundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/zip\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    r = urllib.request.Request(
        f"{BASE}{path}", data=body, method="POST", headers=headers
    )
    try:
        with urllib.request.urlopen(r) as resp:
            text = resp.read().decode()
            return resp.status, json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except Exception:
            return e.code, text


def step(title, status, body):
    ok = "✅" if 200 <= status < 300 else "❌"
    print(f"{ok} [{status}] {title}")
    print(f"   -> {body}")


def login(username, password):
    s, d = req(
        "POST", "/api/auth/login", body={"username": username, "password": password}
    )
    assert s == 200, f"login {username} failed: {d}"
    return d["access_token"]


def make_demo_plugin_zip(name: str = "demo_provider", category: str | None = None) -> bytes:
    """生成一个最小可用的 provider 插件 zip。"""
    manifest = {
        "name": name,
        "label": "Demo Provider (E2E)",
        "entry": f"{name}_main:DemoProvider",
        "version": "0.1.0",
        "requires": [],
    }
    if category is not None:
        manifest["category"] = category
    code = (
        '"""E2E 测试用最小 provider。"""\n'
        "class DemoProvider:\n"
        "    def __init__(self, config=None):\n"
        "        self._config = config or {}\n"
        f'    def name(self): return "{name}"\n'
        '    def label(self): return "Demo Provider (E2E)"\n'
        "    def available(self): return True\n"
        "    def configured(self): return True\n"
        '    def base_url(self): return self._config.get("base_url", "")\n'
        '    def api_key(self): return self._config.get("api_key", "")\n'
        '    def llm_model(self): return self._config.get("llm_model", "demo-llm")\n'
        '    def embedding_model(self): return self._config.get("embedding_model", "demo-emb")\n'
        '    def get_llm(self): raise RuntimeError("demo")\n'
        '    def get_embeddings(self): raise RuntimeError("demo")\n'
        "    def config_fields(self):\n"
        "        return [\n"
        '            {"key":"base_url","label":"Base URL","value":self.base_url(),"required":True,"type":"text"},\n'
        '            {"key":"api_key","label":"API Key","value":"","required":True,"type":"password"},\n'
        "        ]\n"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr(f"{name}_main.py", code)
    return buf.getvalue()


# 1. 登录
admin_token = login("admin", "admin123")
step("admin login", 200, "ok")

# 2. 列出插件 → 至少有 3 个内置
s, plugins = req("GET", "/api/plugins", token=admin_token)
step("list plugins", s, [(p["name"], p["category"], p["source"], p["installed"], p["is_active"]) for p in plugins])
assert s == 200
names = {p["name"] for p in plugins}
assert {"zhipu", "openai_like", "ollama"} <= names
# 已有内置插件应全部归为 model 类别
for p in plugins:
    if p["source"] == "builtin":
        assert p["category"] == "model", f"builtin {p['name']} category != 'model'"
step("builtin plugins all category=model", 200, "ok")

# 3. 普通用户无权访问
status_users, users_list = req("GET", "/api/users", token=admin_token)
existing = {u["username"]: u["id"] for u in users_list}
if "tester" in existing:
    req("DELETE", f"/api/users/{existing['tester']}", token=admin_token)
s, _ = req(
    "POST", "/api/users", token=admin_token,
    body={"username": "tester", "password": "tester123", "role": "user"},
)
assert s == 201
tester_token = login("tester", "tester123")

s, d = req("GET", "/api/plugins", token=tester_token)
step("tester list plugins (expect 403)", s, d)
assert s == 403

# 4. 配置 openai_like
s, d = req(
    "PATCH", "/api/plugins/openai_like", token=admin_token,
    body={
        "base_url": "https://example.com/v1",
        "api_key": "sk-test-1234567890",
        "llm_model": "gpt-test",
        "embedding_model": "emb-test",
    },
)
step("configure openai_like", s, d)
assert s == 200
assert d["base_url"] == "https://example.com/v1"
assert d["api_key_set"] is True
assert d["llm_model"] == "gpt-test"

# 5. 安装（标记 installed）
s, d = req("POST", "/api/plugins/openai_like/install", token=admin_token)
step("install openai_like", s, d)
assert s == 200
assert d["installed"] is True

# 6. 激活
s, d = req("POST", "/api/plugins/openai_like/activate", token=admin_token)
step("activate openai_like", s, d)
assert s == 200
assert d["is_active"] is True

# 7. openai_like 应已激活
s, plugins = req("GET", "/api/plugins", token=admin_token)
step("openai_like active", s, [p["name"] for p in plugins if p["is_active"]])
assert any(p["name"] == "openai_like" and p["is_active"] for p in plugins)

# 8. 切换到 zhipu（先配置 + install + activate）
s, _ = req(
    "PATCH", "/api/plugins/zhipu", token=admin_token,
    body={
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "api_key": "zhipu-fake-key",
        "llm_model": "glm-4-flash",
        "embedding_model": "embedding-3",
    },
)
assert s == 200
s, _ = req("POST", "/api/plugins/zhipu/install", token=admin_token)
assert s == 200
s, _ = req("POST", "/api/plugins/zhipu/activate", token=admin_token)
assert s == 200

s, d = req("GET", "/api/providers/current", token=admin_token)
step("switched to zhipu", s, d)
assert d["name"] == "zhipu"

# 激活 zhipu 后 openai_like 仍保持激活（允许多个同时激活）
s, plugins = req("GET", "/api/plugins", token=admin_token)
active = [p for p in plugins if p["is_active"]]
assert len(active) >= 2
assert any(p["name"] == "zhipu" for p in active)
assert any(p["name"] == "openai_like" for p in active)
step("multiple active", 200, [p["name"] for p in active])

# 9. 上传一个 demo 插件
zip_bytes = make_demo_plugin_zip("demo_provider")
s, d = upload("/api/plugins/upload", admin_token, "demo_provider.zip", zip_bytes)
step("upload demo plugin", s, d)
assert s == 200
assert d["name"] == "demo_provider"
assert d["installed"] is True  # error is None
assert d["error"] is None

# 10. demo plugin 出现在列表里
s, plugins = req("GET", "/api/plugins", token=admin_token)
demo = [p for p in plugins if p["name"] == "demo_provider"]
step("demo plugin listed", s, demo)
assert len(demo) == 1
assert demo[0]["source"] == "uploaded"

# 11. 配置 + install + activate demo
s, _ = req(
    "PATCH", "/api/plugins/demo_provider", token=admin_token,
    body={"base_url": "http://demo", "api_key": "demo-key", "llm_model": "demo-llm"},
)
assert s == 200
s, _ = req("POST", "/api/plugins/demo_provider/install", token=admin_token)
assert s == 200
s, d = req("POST", "/api/plugins/demo_provider/activate", token=admin_token)
step("activate demo", s, d)
assert s == 200

s, plugins = req("GET", "/api/plugins", token=admin_token)
active = [p for p in plugins if p["is_active"]]
step("demo active", s, [p["name"] for p in active])
assert any(p["name"] == "demo_provider" for p in active)

# 12. 卸载 demo（uploaded → 完全删除）
s, _ = req("DELETE", "/api/plugins/demo_provider", token=admin_token)
step("uninstall demo", s, "ok")
assert s == 204
s, plugins = req("GET", "/api/plugins", token=admin_token)
assert "demo_provider" not in {p["name"] for p in plugins}

# 卸载激活的插件后，重新激活一个稳定的 provider 以免后续业务中断
s, _ = req("POST", "/api/plugins/zhipu/activate", token=admin_token)
assert s == 200

# 13. 上传一个非法 zip
s, d = upload(
    "/api/plugins/upload", admin_token, "bad.zip", b"this is not a zip"
)
step("upload bad zip (expect 400)", s, d)
assert s == 400

# 14. 上传非 .zip
s, d = upload(
    "/api/plugins/upload", admin_token, "x.txt", b"hello"
)
step("upload non-zip (expect 400)", s, d)
assert s == 400

# 15. 内置插件 DELETE → reset 而非 404
s, _ = req("DELETE", "/api/plugins/ollama", token=admin_token)
step("reset builtin ollama", s, "ok")
assert s == 204
s, plugins = req("GET", "/api/plugins", token=admin_token)
ollama = next(p for p in plugins if p["name"] == "ollama")
assert ollama["installed"] is False
assert ollama["is_active"] is False

# 16. PATCH category 写入；上传带 category="other" 的插件并验证写库
zip_other = make_demo_plugin_zip("demo_other_provider", category="other")
s, d = upload("/api/plugins/upload", admin_token, "demo_other.zip", zip_other)
step("upload demo plugin with category=other", s, d)
assert s == 200
assert d["installed"] is True

s, plugins = req("GET", "/api/plugins", token=admin_token)
demo_other = next(p for p in plugins if p["name"] == "demo_other_provider")
step("uploaded plugin category", 200, demo_other["category"])
assert demo_other["category"] == "other"

# 把它的 category 改回 model
s, d = req(
    "PATCH", "/api/plugins/demo_other_provider", token=admin_token,
    body={"category": "model"},
)
step("patch category model", s, d)
assert s == 200 and d["category"] == "model"

# 非法 category 应被 422 拦截
s, d = req(
    "PATCH", "/api/plugins/demo_other_provider", token=admin_token,
    body={"category": "INVALID"},
)
step("patch invalid category (expect 422)", s, d)
assert s == 422

# 清理
s, _ = req("DELETE", "/api/plugins/demo_other_provider", token=admin_token)
assert s == 204


# 17. URL 导入：起一个本地 http server 提供 zip
import http.server
import socket
import socketserver
import threading

zip_url_bytes = make_demo_plugin_zip("demo_url_provider")


class _ZipHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/plugin.zip":
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(zip_url_bytes)))
            self.end_headers()
            self.wfile.write(zip_url_bytes)
        else:
            self.send_error(404)

    def log_message(self, *args, **kwargs):  # 静默
        pass


# 选一个空闲端口
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
port = sock.getsockname()[1]
sock.close()

httpd = socketserver.TCPServer(("127.0.0.1", port), _ZipHandler)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
try:
    url = f"http://127.0.0.1:{port}/plugin.zip"
    s, d = req("POST", "/api/plugins/import", token=admin_token, body={"url": url})
    step("import plugin from URL", s, d)
    assert s == 200 and d["name"] == "demo_url_provider" and d["installed"] is True

    s, plugins = req("GET", "/api/plugins", token=admin_token)
    assert any(p["name"] == "demo_url_provider" for p in plugins)

    # 非法协议
    s, d = req("POST", "/api/plugins/import", token=admin_token, body={"url": "ftp://x/y.zip"})
    step("import non-http (expect 400)", s, d)
    assert s == 400

    # 路径不是 .zip
    s, d = req(
        "POST", "/api/plugins/import", token=admin_token,
        body={"url": f"http://127.0.0.1:{port}/notzip"},
    )
    step("import non-zip path (expect 400)", s, d)
    assert s == 400

    # 普通用户无权
    s, d = req("POST", "/api/plugins/import", token=tester_token, body={"url": url})
    step("tester import (expect 403)", s, d)
    assert s == 403
finally:
    httpd.shutdown()
    httpd.server_close()

# 清理 import 进来的插件
s, _ = req("DELETE", "/api/plugins/demo_url_provider", token=admin_token)
assert s == 204


# 18. 清理 tester
s, users = req("GET", "/api/users", token=admin_token)
for u in users:
    if u["username"] == "tester":
        req("DELETE", f"/api/users/{u['id']}", token=admin_token)


print("\n🎉 插件管理 E2E 全部通过！")
