"""Lightweight npx-based MCP client using subprocess.Popen + manual JSON-RPC.

Bypasses MCP Python SDK's stdio_client which has issues with .cmd files on Windows.
"""
import asyncio
import json
import logging
import os
import subprocess
import shutil
import sys

from typing import Any

logger = logging.getLogger(__name__)


class NpxMcpClient:
    """Manages an npx MCP server subprocess with stdin/stdout JSON-RPC."""

    def __init__(self, name: str, entry: str, env: dict[str, str] | None = None):
        self.name = name
        self.entry = entry
        self.env = env or {}
        self._proc: subprocess.Popen | None = None
        self._tools: list[dict[str, Any]] = []
        self._req_id = 0

    async def start(self) -> list[dict[str, Any]]:
        """Start the npx subprocess, initialize, and list tools."""
        npx_path = shutil.which("npx")
        if not npx_path:
            raise RuntimeError("npx not found in PATH")

        # On Windows, .cmd/.bat files need shell=True
        use_shell = sys.platform == "win32"
        cmd = ["npx", "-y", self.entry] if use_shell else [npx_path, "-y", self.entry]

        logger.info("Starting npx MCP (shell=%s): %s", use_shell, " ".join(cmd))

        run_env = {**os.environ, **self.env}

        self._proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=run_env,
            shell=use_shell,
        )

        logger.info("Waiting for npx MCP %s to be ready...", self.entry)
        # Send initialize
        init_resp = await self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "transformer", "version": "1.0"},
        })
        logger.debug("Initialize response: %s", json.dumps(init_resp)[:200])

        # List tools
        tools_resp = await self._send_request("tools/list", {})
        tools = tools_resp.get("tools", [])
        self._tools = [
            {"name": t["name"], "description": t.get("description", ""), "inputSchema": t.get("inputSchema", {})}
            for t in tools
        ]
        logger.info("MCP npx %s: %d tools loaded", self.name, len(self._tools))
        return self._tools

    async def _send_request(self, method: str, params: dict) -> dict:
        """Send a JSON-RPC request and return the result."""
        self._req_id += 1
        req = {
            "jsonrpc": "2.0",
            "id": self._req_id,
            "method": method,
            "params": params,
        }

        if not self._proc or not self._proc.stdin:
            raise RuntimeError("MCP subprocess not running")

        req_bytes = (json.dumps(req) + "\n").encode()
        self._proc.stdin.write(req_bytes)
        self._proc.stdin.flush()

        # Read response line with timeout
        loop = asyncio.get_event_loop()
        try:
            line = await asyncio.wait_for(
                loop.run_in_executor(None, self._proc.stdout.readline),
                timeout=30,
            )
        except asyncio.TimeoutError:
            stderr = self._proc.stderr.read() if self._proc.stderr else b""
            err_text = stderr.decode(errors="replace")
            raise RuntimeError(f"MCP request {method} timed out. stderr: {err_text[:500]}")

        if not line:
            stderr = self._proc.stderr.read() if self._proc.stderr else b""
            err_text = stderr.decode(errors="replace")
            raise RuntimeError(f"MCP process closed stdout for {method}. stderr: {err_text[:500]}")

        resp = json.loads(line.decode())
        if "error" in resp:
            raise RuntimeError(f"MCP error: {resp['error']}")

        return resp.get("result", {})

    async def call_tool(self, tool_name: str, arguments: dict) -> str:
        """Call a tool and return the text content."""
        result = await self._send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })
        content = result.get("content", [])
        parts = []
        for c in content:
            if c.get("type") == "text":
                parts.append(c.get("text", ""))
        return "\n".join(parts)

    async def stop(self):
        """Kill the subprocess."""
        if self._proc:
            try:
                self._proc.kill()
                self._proc.wait(timeout=5)
            except Exception:
                pass
            self._proc = None
            logger.info("MCP npx %s stopped", self.name)

    @property
    def tools(self) -> list[dict[str, Any]]:
        return self._tools
