import requests

BASE = 'http://127.0.0.1:8000'
r = requests.post(BASE + '/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
token = r.json()['access_token']
headers = {'Authorization': 'Bearer ' + token}

# Deactivate first to clear error
r = requests.post(BASE + '/api/plugins/v2/mysql_mcp_server/deactivate', headers=headers)
print('Deactivate:', r.status_code, r.json().get('error','')[:100] if r.status_code == 200 else r.text[:200])

# Activate
r = requests.post(BASE + '/api/plugins/v2/mysql_mcp_server/activate', headers=headers)
print('Activate:', r.status_code)
if r.status_code == 200:
    data = r.json()
    print(f'  active={data["is_active"]} error={data.get("error","")}')
else:
    print('  Error:', r.text[:300])

# Check MCP status
import time
time.sleep(3)
r = requests.get(BASE + '/api/plugins/v2/mcp/status', headers=headers)
print('\nMCP Status:')
for name, info in r.json().items():
    print(f'  {name}: {info}')
