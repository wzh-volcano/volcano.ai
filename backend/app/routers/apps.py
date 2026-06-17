"""应用（App）CRUD + 聊天路由。"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user
from ..models import App, User
from ..services.chat_service import chat_with_app_config, compress_conversation as compress_service

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
    """使用应用的配置进行聊天测试。"""
    app = get_app_or_404(app_id, db, current_user)
    return chat_with_app_config(
        app=app,
        question=payload.question,
        stream=payload.stream,
        db=db,
        messages=payload.messages,
    )


@router.post("/{app_id}/compress")
def compress_conversation(
    app_id: int,
    payload: schemas.AppCompressRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """用应用的 LLM 压缩对话历史为摘要。"""
    app = get_app_or_404(app_id, db, current_user)
    return compress_service(app=app, messages=payload.messages, db=db)
