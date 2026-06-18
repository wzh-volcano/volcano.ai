"""Test npx-based MCP server startup - try a simple one."""
import sys
sys.path.insert(0, '.')
from app.mcp.client_manager import StdioServerParameters, stdio_client, ClientSession
import asyncio

async def test(pkg: str, env: dict = None):
    print(f'\n=== Testing {pkg} ===')
    params = StdioServerParameters(command='npx', args=['-y', pkg], env=env or {})
    try:
        cm_stdio = stdio_client(params)
        read, write = await cm_stdio.__aenter__()
        print('stdio opened')
        cm_session = ClientSession(read, write)
        session = await cm_session.__aenter__()
        print('session opened')
        await session.initialize()
        print('initialized')
        result = await session.list_tools()
        print('tools:', result.tools)
        return True
    except Exception as e:
        print(f'Error: {e}')
        return False
    finally:
        try:
            await cm_session.__aexit__(None, None, None)
        except Exception:
            pass
        try:
            await cm_stdio.__aexit__(None, None, None)
        except Exception:
            pass

async def main():
    await test('mcp-memory')
    await test('@anthropic/mcp-server-filesystem')

asyncio.run(main())
