"""KB 鉴权端到端测试：admin 看所有 / 普通用户只看自己。"""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"


def req(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers=headers)
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
    s, d = req("POST", "/api/auth/login", body={"username": username, "password": password})
    assert s == 200, f"login {username} failed: {d}"
    return d["access_token"]


# 1. admin 登录
admin_token = login("admin", "admin123")
step("admin login", 200, "ok")

# 2. 用 admin 创建/确保两个普通用户：bob, carol
status, users = req("GET", "/api/users", token=admin_token)
existing = {u["username"]: u["id"] for u in users}
for name in ("bob", "carol"):
    if name in existing:
        # 重置一下密码确保已知
        req("POST", f"/api/users/{existing[name]}/reset-password", token=admin_token)
        # 直接删了再建更干净
        req("DELETE", f"/api/users/{existing[name]}", token=admin_token)
for name in ("bob", "carol"):
    s, d = req("POST", "/api/users", token=admin_token,
               body={"username": name, "password": f"{name}1234", "role": "user"})
    step(f"create {name}", s, d)
    assert s == 201

bob_token = login("bob", "bob1234")
carol_token = login("carol", "carol1234")
step("bob/carol login", 200, "ok")

# 3. bob 创建一个 KB
s, kb_b = req("POST", "/api/kb", token=bob_token,
              body={"name": "bob-kb", "description": "bob 的知识库"})
step("bob create kb", s, kb_b)
assert s == 201
assert kb_b["owner_username"] == "bob"
bob_kb_id = kb_b["id"]

# 4. carol 创建一个 KB
s, kb_c = req("POST", "/api/kb", token=carol_token,
              body={"name": "carol-kb", "description": "carol 的知识库"})
step("carol create kb", s, kb_c)
assert s == 201
carol_kb_id = kb_c["id"]

# 5. bob 列表只能看到自己
s, list_b = req("GET", "/api/kb", token=bob_token)
step("bob list kb", s, list_b)
assert s == 200
ids = {kb["id"] for kb in list_b}
assert bob_kb_id in ids and carol_kb_id not in ids, "bob 看到了 carol 的 KB"

# 6. carol 列表只能看到自己
s, list_c = req("GET", "/api/kb", token=carol_token)
step("carol list kb", s, list_c)
ids = {kb["id"] for kb in list_c}
assert carol_kb_id in ids and bob_kb_id not in ids, "carol 看到了 bob 的 KB"

# 7. admin 列表能看到所有
s, list_a = req("GET", "/api/kb", token=admin_token)
step("admin list kb (count)", s, f"{len(list_a)} items")
ids = {kb["id"] for kb in list_a}
assert bob_kb_id in ids and carol_kb_id in ids, "admin 没看到全部 KB"
# admin 列表里应该带 owner_username
for kb in list_a:
    assert "owner_username" in kb

# 8. bob 访问 carol 的 KB → 404
s, d = req("GET", f"/api/kb/{carol_kb_id}", token=bob_token)
step("bob get carol's kb (expect 404)", s, d)
assert s == 404

# 9. bob 删除 carol 的 KB → 404
s, d = req("DELETE", f"/api/kb/{carol_kb_id}", token=bob_token)
step("bob delete carol's kb (expect 404)", s, d)
assert s == 404

# 10. bob 上传文档到 carol 的 KB → 404
# 这里只能测 GET documents 列表，避免 multipart
s, d = req("GET", f"/api/kb/{carol_kb_id}/documents", token=bob_token)
step("bob list carol's kb docs (expect 404)", s, d)
assert s == 404

# 11. bob 自己 GET 自己 KB → 200
s, d = req("GET", f"/api/kb/{bob_kb_id}", token=bob_token)
step("bob get own kb", s, d)
assert s == 200

# 12. admin 可以访问任意 KB
s, d = req("GET", f"/api/kb/{bob_kb_id}", token=admin_token)
step("admin get bob's kb", s, d)
assert s == 200
assert d["owner_username"] == "bob"

s, d = req("GET", f"/api/kb/{carol_kb_id}", token=admin_token)
step("admin get carol's kb", s, d)
assert s == 200

# 13. admin 可以删除任意 KB
s, d = req("DELETE", f"/api/kb/{bob_kb_id}", token=admin_token)
step("admin delete bob's kb", s, d)
assert s == 204

# 14. carol 自己删自己 KB
s, d = req("DELETE", f"/api/kb/{carol_kb_id}", token=carol_token)
step("carol delete own kb", s, d)
assert s == 204

# 15. 未登录访问 → 401
s, d = req("GET", "/api/kb")
step("anonymous list kb (expect 401)", s, d)
assert s == 401

# 16. 清理 bob/carol
for name in ("bob", "carol"):
    s, users = req("GET", "/api/users", token=admin_token)
    for u in users:
        if u["username"] == name:
            req("DELETE", f"/api/users/{u['id']}", token=admin_token)

print("\n🎉 KB 鉴权 E2E 全部通过！")
