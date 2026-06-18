"""Built-in MCP Server — exposes knowledge_search and skill_get_guide tools."""
import asyncio
import json
import os
import sys
import logging

from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

logger = logging.getLogger(__name__)

server = Server("transformer-builtin")

_skill_injector = None


def _get_skill_injector():
    global _skill_injector
    if _skill_injector is None:
        from app.plugins.skill_loader import SkillInjector
        _skill_injector = SkillInjector()
    return _skill_injector


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="knowledge_search",
            description="Search the knowledge base for relevant chunks. Call this when the user asks about specific documents or knowledge.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "kb_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "Optional knowledge base IDs to restrict search to",
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="skill_get_guide",
            description="Get skill guide content matching the user query. Call this when a skill plugin might be relevant.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "User query to match against skill keywords"},
                    "app_id": {"type": "integer", "description": "Optional app ID to filter skills"},
                },
                "required": ["query"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "knowledge_search":
        return await _handle_knowledge_search(arguments)
    elif name == "skill_get_guide":
        return await _handle_skill_get_guide(arguments)
    else:
        return [TextContent(type="text", text=f"Unknown tool: {name}")]


async def _handle_knowledge_search(arguments: dict) -> list[TextContent]:
    from app.database import SessionLocal
    from app.models import KnowledgeBase
    from app.providers import get_current_embedding
    from app.rag import vectorstore

    query = arguments["query"]
    kb_ids = arguments.get("kb_ids")

    db = SessionLocal()
    try:
        try:
            embeddings = get_current_embedding(db).get_embeddings()
        except Exception:
            return [TextContent(type="text", text="Error: no embedding provider configured")]

        if not kb_ids:
            kbs = db.query(KnowledgeBase).all()
            kb_ids = [kb.id for kb in kbs]

        all_results = []
        for kb_id in kb_ids:
            try:
                retrieved = vectorstore.search(
                    db, kb_id=kb_id, query=query,
                    embeddings_model=embeddings, top_k=3,
                    chunk_method="general_auto",
                )
                for chunk, score in retrieved:
                    all_results.append({
                        "kb_id": kb_id,
                        "content": chunk.content,
                        "score": round(score, 4),
                        "filename": chunk.document.filename if chunk.document else "",
                    })
            except Exception:
                continue

        all_results.sort(key=lambda x: x["score"], reverse=True)
        all_results = all_results[:5]
        return [TextContent(type="text", text=json.dumps(all_results, ensure_ascii=False))]
    finally:
        db.close()


async def _handle_skill_get_guide(arguments: dict) -> list[TextContent]:
    from app.database import SessionLocal
    from app.models import App

    query = arguments["query"]
    app_id = arguments.get("app_id")

    db = SessionLocal()
    try:
        injector = _get_skill_injector()
        enabled = injector.get_enabled_skills(db)
        if app_id:
            app = db.get(App, app_id)
            if app:
                config = json.loads(app.config_json or "{}")
                skill_names = config.get("skill_names", [])
                enabled = [s for s in enabled if s.name in skill_names]
        matched = injector.match(query, enabled)
        if matched:
            return [TextContent(type="text", text=json.dumps(matched, ensure_ascii=False))]
        return [TextContent(type="text", text="[]")]
    finally:
        db.close()


async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
