"""Example MCP Server plugin: calculator tool."""
import asyncio
import json
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

server = Server("calc_helper")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="calculator",
            description="Perform basic math calculations: add, subtract, multiply, divide",
            inputSchema={
                "type": "object",
                "properties": {
                    "a": {"type": "number", "description": "First number"},
                    "b": {"type": "number", "description": "Second number"},
                    "op": {
                        "type": "string",
                        "enum": ["add", "subtract", "multiply", "divide"],
                        "description": "Operation to perform",
                    },
                },
                "required": ["a", "b", "op"],
            },
        ),
        Tool(
            name="current_time",
            description="Get the current server time in ISO format",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "calculator":
        a = arguments.get("a", 0)
        b = arguments.get("b", 0)
        op = arguments.get("op", "add")
        if op == "add":
            result = a + b
        elif op == "subtract":
            result = a - b
        elif op == "multiply":
            result = a * b
        elif op == "divide":
            result = a / b if b != 0 else float("inf")
        else:
            return [TextContent(type="text", text=f"Unknown operation: {op}")]
        return [TextContent(type="text", text=json.dumps({"result": result}, ensure_ascii=False))]
    elif name == "current_time":
        from datetime import datetime, timezone
        return [TextContent(type="text", text=json.dumps({"time": datetime.now(timezone.utc).isoformat()}, ensure_ascii=False))]
    else:
        return [TextContent(type="text", text=f"Unknown tool: {name}")]


async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
