"""Test npx MCP with subprocess.Popen keeping stdin open."""
import subprocess, json, os, sys, time

npx_path = r"D:\Program Files\nodejs\npx.cmd"
env = {**os.environ,
    "MYSQL_HOST": "127.0.0.1",
    "MYSQL_PORT": "3306",
    "MYSQL_USER": "root",
    "MYSQL_PASS": "root",
    "MYSQL_DB": "test",
}

# Method 1: npx.cmd with shell=False
print("=== Method 1: npx.cmd shell=False ===")
proc = subprocess.Popen(
    [npx_path, '-y', '@benborla29/mcp-server-mysql'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env,
)
init = {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
proc.stdin.write((json.dumps(init) + '\n').encode())
proc.stdin.flush()
time.sleep(2)
line = proc.stdout.readline()
print(f'  Init response: {line[:100] if line else "NONE"}...')
if line:
    tools = {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
    proc.stdin.write((json.dumps(tools) + '\n').encode())
    proc.stdin.flush()
    time.sleep(2)
    line2 = proc.stdout.readline()
    print(f'  Tools response: {line2[:100] if line2 else "NONE"}...')
    if not line2:
        stderr = proc.stderr.read()
        print(f'  Stderr: {stderr.decode(errors="replace")[:200]}')
proc.kill()

# Method 2: shell=True
print("\n=== Method 2: shell=True ===")
proc = subprocess.Popen(
    'npx -y @benborla29/mcp-server-mysql',
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env,
    shell=True,
)
proc.stdin.write((json.dumps(init) + '\n').encode())
proc.stdin.flush()
time.sleep(2)
line = proc.stdout.readline()
print(f'  Init response: {line[:100] if line else "NONE"}...')
if line:
    tools = {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
    proc.stdin.write((json.dumps(tools) + '\n').encode())
    proc.stdin.flush()
    time.sleep(2)
    line2 = proc.stdout.readline()
    print(f'  Tools response: {line2[:100] if line2 else "NONE"}...')
    if not line2:
        stderr = proc.stderr.read()
        print(f'  Stderr: {stderr.decode(errors="replace")[:200]}')
proc.kill()
