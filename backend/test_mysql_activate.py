import requests, time

BASE = 'http://127.0.0.1:8000'
r = requests.post(BASE + '/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
token = r.json()['access_token']
headers = {'Authorization': 'Bearer ' + token}

# Deactivate first to clear any error
r = requests.post(BASE + '/api/plugins/v2/mysql_mcp_server/deactivate', headers=headers)
print(f'Deactivate: {r.status_code}')

# Activate
r = requests.post(BASE + '/api/plugins/v2/mysql_mcp_server/activate', headers=headers)
print(f'Activate: {r.status_code}')
if r.status_code == 200:
    print(f'  is_active={r.json()["is_active"]}  error={r.json().get("error","")}')
else:
    print(f'  {r.text[:300]}')

# Wait for MCP to start (npx may need to download)
print('Waiting 20s for npx to start...')
time.sleep(20)

# Check status
r = requests.get(BASE + '/api/plugins/v2/mcp/status', headers=headers)
print(f'\nMCP Status ({r.status_code}):')
for name, info in r.json().items():
    print(f'  {name}: {info}')

# Check plugin again
r = requests.get(BASE + '/api/plugins/v2', headers=headers)
for item in r.json():
    if item['name'] == 'mysql_mcp_server':
        print(f'\nmysql_mcp_server: active={item["is_active"]} error={item.get("error","")}')
