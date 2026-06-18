"""Test anyio open_process with cmd.exe /c npx."""
import anyio
import sys
import json

async def test():
    try:
        process = await anyio.open_process(
            ['cmd.exe', '/c', 'npx', '-y', '@benborla29/mcp-server-mysql'],
            env={**{k:v for k,v in (__import__('os').environ).items()},
                 "MYSQL_HOST": "127.0.0.1",
                 "MYSQL_PORT": "3306",
                 "MYSQL_USER": "root",
                 "MYSQL_PASS": "root",
                 "MYSQL_DB": "test"},
        )
        print(f'Process started: pid={process.pid}')
        
        # Send initialize
        init = {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
        if process.stdin:
            await process.stdin.send((json.dumps(init) + '\n').encode())
        print('Sent initialize')
        
        # Read response
        import asyncio
        try:
            line = await asyncio.wait_for(process.stdout.readline(), timeout=10) if process.stdout else None
            print(f'Got: {line[:200] if line else "none"}')
        except asyncio.TimeoutError:
            print('Timeout reading stdout')
        
        await process.kill()
        print('Done')
    except Exception as e:
        import traceback
        traceback.print_exc()

anyio.run(test)
