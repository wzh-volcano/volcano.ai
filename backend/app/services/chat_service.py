"""Shared chat logic used by both internal and public API routers."""
import json
import traceback

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from sqlalchemy.orm import Session

from ..models import App, KnowledgeBase
from ..plugins.hooks import HookDispatcher
from ..plugins.skill_loader import SkillInjector
from ..providers import get_current, get_current_embedding, get_provider
from ..rag import vectorstore
from ..mcp.client_manager import get_mcp_manager

_skill_injector = SkillInjector()
_hook_dispatcher = HookDispatcher()


def chat_with_app_config(
    app: App,
    question: str,
    stream: bool,
    db: Session,
    messages: list | None = None,
) -> StreamingResponse | dict:
    """Execute a chat against the given app's configuration.

    Returns either a StreamingResponse (stream=True) or a dict {"answer": str}.
    """
    config = json.loads(app.config_json or "{}")

    # ---- pre_chat hooks ----
    question, _ = _hook_dispatcher.dispatch_pre_chat(question, {}, db)

    system_prompt = config.get("prompt", "") or "你是一个有用的 AI 助手。"
    # ---- skill injection (filtered by app config) ----
    skill_names = config.get("skill_names", [])
    if skill_names:
        enabled_skills = _skill_injector.get_enabled_skills(db)
        enabled_skills = [s for s in enabled_skills if s.name in skill_names]
        if enabled_skills:
            matched = _skill_injector.match(question, enabled_skills)
            if matched:
                skill_section = "\n\n---\n## 技能指南\n\n" + "\n\n".join(matched)
                system_prompt += skill_section

    kb_ids = config.get("kb_ids", [])

    # 组装知识库上下文
    context_parts = []
    for kb_id in kb_ids:
        kb = db.get(KnowledgeBase, kb_id)
        if kb is None:
            continue
        try:
            embeddings = get_current_embedding(db).get_embeddings()
            retrieved = vectorstore.search(
                db, kb_id=kb.id, query=question,
                embeddings_model=embeddings, top_k=3,
                chunk_method=kb.chunk_method or "general_auto",
            )
            for chunk, score in retrieved:
                context_parts.append(f"[{chunk.document.filename if chunk.document else ''}] {chunk.content}")
        except Exception:
            traceback.print_exc()

    full_prompt = system_prompt
    if context_parts:
        full_prompt += "\n\n参考资料：\n" + "\n\n".join(context_parts)

    # 获取 provider
    provider_name = config.get("provider", "")
    if provider_name:
        provider = get_provider(db, provider_name)
    else:
        provider = get_current(db)

    llm = provider.get_llm()
    mcp_tools = get_mcp_manager().get_all_tools()
    use_tools = len(mcp_tools) > 0

    # 构建消息列表
    chat_messages = [("system", "{system}")]
    if messages:
        for m in messages:
            role = "human" if getattr(m, 'role', '') == "user" or (isinstance(m, dict) and m.get('role') == 'user') else "ai"
            content = m.content if hasattr(m, 'content') else m.get('content', '')
            chat_messages.append((role, content))
    if question:
        chat_messages.append(("human", "{question}"))

    prompt = ChatPromptTemplate.from_messages(chat_messages)
    input_vars = {"system": full_prompt}
    if question:
        input_vars["question"] = question

    if stream:
        async def event_stream():
            try:
                if use_tools:
                    llm_with_tools = llm.bind_tools(mcp_tools)
                    chain = prompt | llm_with_tools
                    async for chunk in chain.astream(input_vars):
                        if hasattr(chunk, 'content') and chunk.content:
                            yield f"data: {json.dumps({'token': chunk.content})}\n\n"
                        tool_chunks = getattr(chunk, 'tool_call_chunks', None)
                        if tool_chunks:
                            for tcc in tool_chunks:
                                name = getattr(tcc, 'name', None) or (isinstance(tcc, dict) and tcc.get('name'))
                                if name:
                                    yield f"data: {json.dumps({'token': f'[调用工具: {name}]'})}\n\n"
                else:
                    chain = prompt | llm | StrOutputParser()
                    async for chunk in chain.astream_events(input_vars, version="v1"):
                        if chunk["event"] == "on_parser_stream":
                            token = chunk["data"]["chunk"]
                            yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: {\"done\": true}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    # Note: post_chat hooks are not applied to SSE streams
    else:
        chain = prompt | llm | StrOutputParser()
        try:
            if use_tools:
                llm_with_tools = llm.bind_tools(mcp_tools)
                chain = prompt | llm_with_tools
                result = chain.invoke(input_vars)
                answer = result.content if hasattr(result, 'content') else str(result)
            else:
                chain = prompt | llm | StrOutputParser()
                answer = chain.invoke(input_vars)
            # ---- post_chat hook ----
            answer = _hook_dispatcher.dispatch_post_chat(question, answer, {}, db)
            return {"answer": answer}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"调用模型失败：{str(e)}")


def compress_conversation(
    app: App,
    messages: list,
    db: Session,
) -> dict:
    """Compress conversation history into a summary using the app's LLM."""
    config = json.loads(app.config_json or "{}")

    provider_name = config.get("provider", "")
    if provider_name:
        provider = get_provider(db, provider_name)
    else:
        provider = get_current(db)

    llm = provider.get_llm()

    conversation_text = ""
    for m in messages:
        role_name = "用户" if (getattr(m, 'role', '') == "user" or (isinstance(m, dict) and m.get('role') == 'user')) else "助手"
        content = m.content if hasattr(m, 'content') else m.get('content', '')
        conversation_text += f"{role_name}: {content}\n\n"

    prompt = PromptTemplate.from_template(
        "请将以下对话压缩为简洁的中文摘要，保留所有关键信息和上下文关系。\n\n对话：\n{conversation}\n\n压缩摘要："
    )
    chain = prompt | llm | StrOutputParser()
    summary = chain.invoke({"conversation": conversation_text})
    return {"summary": summary}
