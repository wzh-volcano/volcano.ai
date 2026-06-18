"""Test @kevinwatt/mysql-mcp as persistent MCP server."""
import subprocess, json, os, time

env = {**os.environ,
    "MYSQL_HOST": "127.0.0.1",
    "MYSQL_PORT": "3306",
    "MYSQL_USER": "root",
    "MYSQL_PASS": "root",
    "MYSQL_DB": "test",
}

proc = subprocess.Popen(
    'npx -y @kevinwatt/mysql-mcp',
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env,
    shell=True,
)

init = {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
proc.stdin.write((json.dumps(init) + '\n').encode())
proc.stdin.flush()
time.sleep(3)
line = proc.stdout.readline()
print(f'Init: {line[:150] if line else "NONE"}')

if line:
    tools = {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
    proc.stdin.write((json.dumps(tools) + '\n').encode())
    proc.stdin.flush()
    time.sleep(3)
    line2 = proc.stdout.readline()
    print(f'Tools: {line2[:300] if line2 else "NONE"}')
    if not line2:
        stderr = proc.stderr.read()
        print(f'Stderr: {stderr.decode(errors="replace")[:300]}')

proc.kill()
