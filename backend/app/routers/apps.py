"""应用（App）CRUD + 聊天路由。"""
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate

from ..models import App, KnowledgeBase, Skill, User
from ..providers import get_current, get_current_embedding, get_provider
from ..rag import vectorstore

router = APIRouter(prefix="/api/apps", tags=["apps"])


def _to_out(app: App) -> dict:
    return {
        "id": app.id,
        "name": app.name,
        "icon": app.icon,
        "description": app.description,
        "type": app.type,
        "category": app.category,
        "status": app.status,
        "api_enabled": app.api_enabled,
        "config_json": app.config_json,
        "owner_id": app.owner_id,
        "owner_username": app.owner.username if app.owner else None,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
    }


def get_app_or_404(app_id: int, db: Session, current_user: User) -> App:
    app = db.get(App, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="应用不存在")
    if current_user.role != "admin" and app.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="应用不存在")
    return app


@router.get("", response_model=list[schemas.AppOut])
def list_apps(
    all_: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    """列出应用。普通用户只看自己的，admin 传 ?all=true 看全部。"""
    if all_ and current_user.role == "admin":
        stmt = select(App)
    else:
        stmt = select(App).where(App.owner_id == current_user.id)
    stmt = stmt.order_by(App.updated_at.desc())
    apps = list(db.scalars(stmt))
    for a in apps:
        a.owner_username = a.owner.username if a.owner else None
    return [_to_out(a) for a in apps]


@router.post("", response_model=schemas.AppOut, status_code=201)
def create_app(
    payload: schemas.AppCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    app = App(
        name=payload.name,
        icon=payload.icon,
        description=payload.description,
        owner_id=current_user.id,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    app.owner_username = current_user.username
    return _to_out(app)


@router.get("/{app_id}", response_model=schemas.AppOut)
def get_app(
    app_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    app = get_app_or_404(app_id, db, current_user)
    return _to_out(app)


@router.patch("/{app_id}", response_model=schemas.AppOut)
def update_app(
    app_id: int,
    payload: schemas.AppUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    app = get_app_or_404(app_id, db, current_user)
    if payload.name is not None:
        app.name = payload.name
    if payload.icon is not None:
        app.icon = payload.icon
    if payload.description is not None:
        app.description = payload.description
    if payload.config_json is not None:
        try:
            json.loads(payload.config_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="config_json 必须是合法 JSON")
        app.config_json = payload.config_json
    if payload.api_enabled is not None:
        app.api_enabled = payload.api_enabled
    db.commit()
    db.refresh(app)
    app.owner_username = app.owner.username if app.owner else None
    return _to_out(app)


@router.delete("/{app_id}", status_code=204)
def delete_app(
    app_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    app = get_app_or_404(app_id, db, current_user)
    db.delete(app)
    db.commit()


@router.patch("/{app_id}/status", response_model=schemas.AppOut)
def update_app_status(
    app_id: int,
    payload: schemas.AppStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    app = get_app_or_404(app_id, db, current_user)
    app.status = payload.status
    db.commit()
    db.refresh(app)
    return _to_out(app)


@router.post("/{app_id}/chat")
def chat_with_app(
    app_id: int,
    payload: schemas.AppChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """使用应用的配置进行聊天测试。从 app 的 config_json 读取模型/提示词/知识库。"""
    app = get_app_or_404(app_id, db, current_user)
    config = json.loads(app.config_json or "{}")

    system_prompt = config.get("prompt", "") or "你是一个有用的 AI 助手。"
    kb_ids = config.get("kb_ids", [])

    # 组装知识库上下文
    context_parts = []
    for kb_id in kb_ids:
        kb = db.get(KnowledgeBase, kb_id)
        if kb is None or (current_user.role != "admin" and kb.owner_id != current_user.id):
            continue
        try:
            embeddings = get_current_embedding(db).get_embeddings()
            retrieved = vectorstore.search(
                db, kb_id=kb.id, query=payload.question,
                embeddings_model=embeddings, top_k=3,
                chunk_method=kb.chunk_method or "general_auto",
            )
            for chunk, score in retrieved:
                context_parts.append(f"[{chunk.document.filename if chunk.document else ''}] {chunk.content}")
        except Exception as e:
            # 检索失败不应阻断对话，打印日志但继续
            import traceback
            traceback.print_exc()

    full_prompt = system_prompt
    if context_parts:
        full_prompt += "\n\n参考资料：\n" + "\n\n".join(context_parts)

    # 技能拼接（插入在 system prompt 之前）
    skill_ids = config.get("skill_ids", [])
    for sid in skill_ids:
        skill = db.get(Skill, sid)
        if skill and (current_user.role == "admin" or skill.owner_id == current_user.id):
            full_prompt = skill.content + "\n\n" + full_prompt

    # 获取 provider
    provider_name = config.get("provider", "")
    if provider_name:
        provider = get_provider(db, provider_name)
    else:
        provider = get_current(db)  # fallback 全局

    llm = provider.get_llm()

    # 构建消息列表（支持历史上下文）
    chat_messages = [("system", "{system}")]
    if payload.messages:
        for m in payload.messages:
            role = "human" if m.role == "user" else "ai"
            chat_messages.append((role, m["content"] if isinstance(m, dict) else m.content))
    if payload.question:
        chat_messages.append(("human", "{question}"))

    prompt = ChatPromptTemplate.from_messages(chat_messages)

    # 构造输入参数
    input_vars = {"system": full_prompt}
    if payload.question:
        input_vars["question"] = payload.question

    # 检查是否流式
    stream = payload.stream

    if stream:
        async def event_stream():
            chain = prompt | llm | StrOutputParser()
            try:
                async for chunk in chain.astream_events(input_vars, version="v1"):
                    if chunk["event"] == "on_parser_stream":
                        token = chunk["data"]["chunk"]
                        yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: {\"done\": true}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    else:
        chain = prompt | llm | StrOutputParser()
        try:
            answer = chain.invoke(input_vars)
            return {"answer": answer}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"调用模型失败：{str(e)}")


@router.post("/{app_id}/compress")
def compress_conversation(
    app_id: int,
    payload: schemas.AppCompressRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """用应用的 LLM 压缩对话历史为摘要。"""
    app = get_app_or_404(app_id, db, current_user)
    config = json.loads(app.config_json or "{}")

    provider_name = config.get("provider", "")
    if provider_name:
        provider = get_provider(db, provider_name)
    else:
        provider = get_current(db)

    llm = provider.get_llm()

    conversation_text = ""
    for m in payload.messages:
        role = "用户" if m.role == "user" else "助手"
        conversation_text += f"{role}: {m.content}\n\n"

    prompt = PromptTemplate.from_template(
        "请将以下对话压缩为简洁的中文摘要，保留所有关键信息和上下文关系。\n\n对话：\n{conversation}\n\n压缩摘要："
    )
    chain = prompt | llm | StrOutputParser()
    summary = chain.invoke({"conversation": conversation_text})

    return {"summary": summary}
