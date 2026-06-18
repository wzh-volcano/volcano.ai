import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_core.tools import BaseTool, tool

logger = logging.getLogger(__name__)


@dataclass
class McpServerInfo:
    name: str
    session: ClientSession | None = None
    tools: list[dict] = field(default_factory=list)
    entry: str = ""
    env: dict = field(default_factory=dict)


class MCPClientManager:
    def __init__(self):
        self._servers: dict[str, McpServerInfo] = {}

    async def start_plugin(self, name: str, entry: str, env: dict | None = None) -> list[dict]:
        info = McpServerInfo(name=name, entry=entry, env={} if env is None else env)
        params = StdioServerParameters(command="python", args=[entry], env={**env} if env is not None else None)
        cm_stdio = stdio_client(params)
        read, write = await cm_stdio.__aenter__()
        cm_session = ClientSession(read, write)
        session = await cm_session.__aenter__()
        await session.initialize()
        info.session = session
        info._cm_stdio = cm_stdio
        info._cm_session = cm_session
        result = await session.list_tools()
        info.tools = [{"name": t.name, "description": t.description, "inputSchema": t.inputSchema} for t in result.tools]
        self._servers[name] = info
        logger.info("MCP plugin %s started with %d tools", name, len(info.tools))
        return info.tools

    async def stop_plugin(self, name: str):
        info = self._servers.pop(name, None)
        if info is None:
            return
        if hasattr(info, '_cm_session') and info._cm_session:
            await info._cm_session.__aexit__(None, None, None)
        if hasattr(info, '_cm_stdio') and info._cm_stdio:
            await info._cm_stdio.__aexit__(None, None, None)
        logger.info("MCP plugin %s stopped", name)

    async def _make_tool_call(self, server_name: str, tool_name: str, **kwargs: Any) -> str:
        session = self._servers[server_name].session
        if session is None:
            return "Error: server not connected"
        try:
            resp = await session.call_tool(tool_name, kwargs)
            parts = []
            for c in resp.content:
                if hasattr(c, "text"):
                    parts.append(c.text)
                elif hasattr(c, "model_dump"):
                    parts.append(json.dumps(c.model_dump(), ensure_ascii=False))
            return json.dumps(parts, ensure_ascii=False)
        except Exception as e:
            return f"Error calling tool {tool_name}: {e}"

    def get_all_tools(self) -> list[BaseTool]:
        result: list[BaseTool] = []
        for name, info in self._servers.items():
            for t_def in info.tools:
                tool_name = t_def["name"]
                tool_desc = t_def.get("description", "")
                server_name = name

                @tool(tool_name, description=tool_desc)
                async def run_tool(server_name=server_name, tool_name=tool_name, **kwargs: Any) -> str:
                    return await self._make_tool_call(server_name, tool_name, **kwargs)

                result.append(run_tool)
        return result

    async def stop_all(self):
        for name in list(self._servers):
            await self.stop_plugin(name)


_manager: MCPClientManager | None = None


def get_mcp_manager() -> MCPClientManager:
    global _manager
    if _manager is None:
        _manager = MCPClientManager()
    return _manager
