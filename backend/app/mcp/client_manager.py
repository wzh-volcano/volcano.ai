import asyncio
import json
import logging
import sys
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_core.tools import BaseTool, tool

from .npx_client import NpxMcpClient

logger = logging.getLogger(__name__)


@dataclass
class McpServerInfo:
    name: str = ""
    session: ClientSession | None = None
    tools: list[dict[str, Any]] = field(default_factory=list)
    entry: str = ""
    env: dict[str, str] = field(default_factory=dict)
    handler: Any | None = field(default=None, repr=False)
    npx_client: NpxMcpClient | None = field(default=None, repr=False)
    _cm_stdio: object | None = field(default=None, repr=False)
    _cm_session: object | None = field(default=None, repr=False)


class MCPClientManager:
    def __init__(self):
        self._servers: dict[str, McpServerInfo] = {}

    async def start_plugin(self, name: str, entry: str, env: dict[str, str] | None = None,
                           runtime: str = "python") -> list[dict]:
        info = McpServerInfo(name=name, entry=entry, env={} if env is None else env)
        if runtime == "npx":
            npx = NpxMcpClient(name, entry, env=env or {})
            tools = await npx.start()
            info.tools = tools
            info.npx_client = npx
            self._servers[name] = info
            logger.info("MCP npx plugin %s started with %d tools", name, len(tools))
            return tools

        # Python-based MCP server
        params = StdioServerParameters(command=sys.executable, args=[entry],
                                        env={**env} if env is not None else None)
        cm_stdio = stdio_client(params)
        cm_session = None
        try:
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
        except Exception:
            exc = sys.exc_info()
            if cm_session:
                await cm_session.__aexit__(*exc)
            await cm_stdio.__aexit__(*exc)
            raise

    async def stop_plugin(self, name: str):
        info = self._servers.pop(name, None)
        if info is None:
            return
        if info.npx_client:
            await info.npx_client.stop()
        if info._cm_session:
            await info._cm_session.__aexit__(None, None, None)
        if info._cm_stdio:
            await info._cm_stdio.__aexit__(None, None, None)
        logger.info("MCP plugin %s stopped", name)

    async def _make_tool_call(self, server_name: str, tool_name: str, **kwargs: Any) -> str:
        info = self._servers.get(server_name)
        if info is None:
            return "Error: server not found"
        if info.npx_client:
            try:
                return await info.npx_client.call_tool(tool_name, kwargs)
            except Exception as e:
                return f"Error calling tool {tool_name}: {e}"
        if info.session:
            try:
                resp = await info.session.call_tool(tool_name, kwargs)
                parts = []
                for c in resp.content:
                    if hasattr(c, "text"):
                        parts.append(c.text)
                    elif hasattr(c, "model_dump"):
                        parts.append(json.dumps(c.model_dump(), ensure_ascii=False))
                return json.dumps(parts, ensure_ascii=False)
            except Exception as e:
                return f"Error calling tool {tool_name}: {e}"
        if info.handler:
            return await info.handler(tool_name, kwargs)
        return "Error: no session or handler"

    def register_inproc_tools(
        self, name: str, tools: list[dict],
        handler: Any
    ) -> None:
        """Register tools that are handled in-process (no subprocess)."""
        info = McpServerInfo(name=name, tools=tools, entry="", handler=handler)
        self._servers[name] = info
        logger.info("In-process MCP %s registered with %d tools", name, len(tools))

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

    def get_status_dict(self) -> dict:
        return {name: {"tools": [t["name"] for t in info.tools]} for name, info in self._servers.items()}

    async def stop_all(self):
        for name in list(self._servers):
            await self.stop_plugin(name)


_manager: MCPClientManager | None = None


def get_mcp_manager() -> MCPClientManager:
    global _manager
    if _manager is None:
        _manager = MCPClientManager()
    return _manager
