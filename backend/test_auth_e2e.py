"""End-to-end smoke test for auth + user management API."""
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


# 1. Login as admin
status, data = req("POST", "/api/auth/login", body={"username": "admin", "password": "admin123"})
step("admin login", status, data)
assert status == 200, "admin login failed"
admin_token = data["access_token"]

# 2. /api/me
status, data = req("GET", "/api/me", token=admin_token)
step("GET /api/me", status, data)
assert status == 200 and data["role"] == "admin"

# 3. List users
status, data = req("GET", "/api/users", token=admin_token)
step("list users (initial)", status, data)
assert status == 200

# 4. Create alice (delete first if exists)
for u in data:
    if u["username"] == "alice":
        req("DELETE", f"/api/users/{u['id']}", token=admin_token)

status, data = req("POST", "/api/users", token=admin_token,
                   body={"username": "alice", "password": "alice123", "role": "user"})
step("create alice", status, data)
assert status in (200, 201)
alice_id = data["id"]

# 5. Duplicate username -> 409
status, data = req("POST", "/api/users", token=admin_token,
                   body={"username": "alice", "password": "x123456", "role": "user"})
step("create duplicate alice (expect 409)", status, data)
assert status == 409

# 6. Login as alice
status, data = req("POST", "/api/auth/login", body={"username": "alice", "password": "alice123"})
step("alice login", status, data)
assert status == 200
alice_token = data["access_token"]

# 7. alice cannot list users -> 403
status, data = req("GET", "/api/users", token=alice_token)
step("alice list users (expect 403)", status, data)
assert status == 403

# 8. Reset alice password
status, data = req("POST", f"/api/users/{alice_id}/reset-password", token=admin_token)
step("reset alice password", status, data)
assert status == 200 and "new_password" in data
new_pwd = data["new_password"]

# 9. Alice login with old password -> 401
status, data = req("POST", "/api/auth/login", body={"username": "alice", "password": "alice123"})
step("alice login with old pwd (expect 401)", status, data)
assert status == 401

# 10. Alice login with new temp password
status, data = req("POST", "/api/auth/login", body={"username": "alice", "password": new_pwd})
step(f"alice login with temp pwd '{new_pwd}'", status, data)
assert status == 200
alice_token = data["access_token"]

# 11. Alice change password
status, data = req("POST", "/api/auth/change-password", token=alice_token,
                   body={"old_password": new_pwd, "new_password": "newPwd123"})
step("alice change password", status, data)
assert status in (200, 204)

# 12. Toggle alice status (disable)
status, data = req("POST", f"/api/users/{alice_id}/toggle-status", token=admin_token)
step("toggle alice status (disable)", status, data)
assert status == 200 and data["status"] == "disabled"

# 13. Disabled alice cannot login
status, data = req("POST", "/api/auth/login", body={"username": "alice", "password": "newPwd123"})
step("disabled alice login (expect 403/401)", status, data)
assert status in (401, 403)

# 14. Re-enable
status, data = req("POST", f"/api/users/{alice_id}/toggle-status", token=admin_token)
step("toggle alice status (enable)", status, data)
assert status == 200 and data["status"] == "active"

# 15. Update alice -> admin role
status, data = req("PATCH", f"/api/users/{alice_id}", token=admin_token,
                   body={"role": "admin"})
step("promote alice to admin", status, data)
assert status == 200 and data["role"] == "admin"

# 16. Demote alice back to user
status, data = req("PATCH", f"/api/users/{alice_id}", token=admin_token,
                   body={"role": "user"})
step("demote alice to user", status, data)
assert status == 200

# 17. Last-admin protection: try to demote admin self
status, data = req("GET", "/api/users", token=admin_token)
admin_user = next(u for u in data if u["username"] == "admin")
status, data = req("PATCH", f"/api/users/{admin_user['id']}", token=admin_token,
                   body={"role": "user"})
step("demote last admin (expect 4xx)", status, data)
assert 400 <= status < 500

# 18. Delete alice
status, data = req("DELETE", f"/api/users/{alice_id}", token=admin_token)
step("delete alice", status, data)
assert status in (200, 204)

# 19. Final list
status, data = req("GET", "/api/users", token=admin_token)
step("list users (final)", status, data)
assert status == 200
assert all(u["username"] != "alice" for u in data)

print("\n🎉 All E2E tests passed!")
