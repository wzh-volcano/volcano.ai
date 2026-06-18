"""Test npx MCP with manual subprocess management."""
import asyncio, sys, json, os
sys.path.insert(0, '.')

async def test_manual():
    # First, pre-install the package silently
    proc = await asyncio.create_subprocess_exec(
        'npx', '-y', '@benborla29/mcp-server-mysql',
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ,
            "MYSQL_HOST": "127.0.0.1",
            "MYSQL_PORT": "3306",
            "MYSQL_USER": "root",
            "MYSQL_PASS": "root",
            "MYSQL_DB": "test",
        }
    )

    init_msg = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"}
        }
    }

    # Send initialize
    proc.stdin.write((json.dumps(init_msg) + '\n').encode())
    await proc.stdin.drain()

    # Read response with timeout
    try:
        line = await asyncio.wait_for(proc.stdout.readline(), timeout=10)
        resp = json.loads(line.decode())
        print('Initialize response:', json.dumps(resp, indent=2)[:500])
    except asyncio.TimeoutError:
        print('Timeout waiting for initialize response')
        # Check stderr
        try:
            stderr = await asyncio.wait_for(proc.stderr.read(), timeout=2)
            if stderr:
                print('Stderr:', stderr.decode()[:500])
        except asyncio.TimeoutError:
            pass
        proc.kill()
        return

    # Send tools/list
    tools_msg = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {}
    }
    proc.stdin.write((json.dumps(tools_msg) + '\n').encode())
    await proc.stdin.drain()

    try:
        line = await asyncio.wait_for(proc.stdout.readline(), timeout=10)
        resp = json.loads(line.decode())
        print('\nTools response:', json.dumps(resp, indent=2)[:1000])
    except asyncio.TimeoutError:
        print('Timeout waiting for tools response')
        try:
            stderr = await asyncio.wait_for(proc.stderr.read(), timeout=2)
            if stderr:
                print('Stderr:', stderr.decode()[:500])
        except asyncio.TimeoutError:
            pass

    proc.kill()

asyncio.run(test_manual())
