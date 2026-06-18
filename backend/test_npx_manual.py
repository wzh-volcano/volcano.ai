"""Test npx MCP via subprocess.Popen with manual JSON-RPC."""
import subprocess, json, os, sys, shutil

# Build env
env = {**os.environ,
    "MYSQL_HOST": "127.0.0.1",
    "MYSQL_PORT": "3306",
    "MYSQL_USER": "root",
    "MYSQL_PASS": "root",
    "MYSQL_DB": "test",
}

# Find npx path
npx_path = shutil.which("npx")
if not npx_path:
    print("npx not found")
    sys.exit(1)

print(f"Using npx: {npx_path}")

proc = subprocess.Popen(
    [npx_path, '-y', '@benborla29/mcp-server-mysql'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env,
)

# Send initialize
init = {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
proc.stdin.write((json.dumps(init) + '\n').encode())
proc.stdin.flush()

import select

# Read response
import time
time.sleep(2)
line = proc.stdout.readline()
print('Got line:', line[:200] if line else 'empty')
if line:
    resp = json.loads(line.decode())
    print('Initialize:', json.dumps(resp, indent=2)[:500])

# tools/list
tools = {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
proc.stdin.write((json.dumps(tools) + '\n').encode())
proc.stdin.flush()

time.sleep(2)
line = proc.stdout.readline()
if line:
    resp = json.loads(line.decode())
    print('\nTools:', json.dumps(resp, indent=2)[:1000])
else:
    print('No tools response')
    stderr = proc.stderr.read()
    print('Stderr:', stderr.decode(errors='replace')[:500])

proc.kill()
