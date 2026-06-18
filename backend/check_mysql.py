import requests

BASE = 'http://127.0.0.1:8000'
r = requests.post(BASE + '/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
token = r.json()['access_token']
headers = {'Authorization': 'Bearer ' + token}

# Check MCP status at correct path
r = requests.get(BASE + '/api/plugins/v2/mcp/status', headers=headers)
print('Status:', r.status_code)
if r.status_code == 200:
    for name, info in r.json().items():
        print(f'  {name}: {info}')
else:
    print(r.text[:500])
