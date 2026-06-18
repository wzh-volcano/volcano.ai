import requests

BASE = 'http://127.0.0.1:8000'
r = requests.post(BASE + '/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
token = r.json()['access_token']
headers = {'Authorization': 'Bearer ' + token}

# MCP status
r = requests.get(BASE + '/api/plugins/v2/mcp/status', headers=headers)
print('MCP Status:')
for name, info in r.json().items():
    tools = info.get('tools', [])
    print(f'  {name}: {len(tools)} tools -> {tools}')

# Plugin list
r = requests.get(BASE + '/api/plugins/v2', headers=headers)
for item in r.json():
    if item['category'] == 'mcp_server':
        print(f'\n{item["name"]}: active={item["is_active"]} error={item.get("error","")}')
