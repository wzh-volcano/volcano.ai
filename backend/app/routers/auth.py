"""认证路由：登录、修改自己的密码。

`/api/me` 挂在同一 router 上（不使用 auth 前缀），便于前端统一管理。
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user
from ..models import ApiKey, User
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(tags=["auth"])


@router.post("/api/auth/login", response_model=schemas.TokenOut)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)) -> schemas.TokenOut:
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误"
        )
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用，请联系管理员"
        )
    token = create_access_token(user.id)
    return schemas.TokenOut(access_token=token)


@router.post("/api/auth/change-password", status_code=204)
def change_password(
    payload: schemas.ChangePasswordRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not verify_password(payload.old_password, current.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误")
    current.password_hash = hash_password(payload.new_password)
    db.commit()


@router.get("/api/me", response_model=schemas.UserOut)
def me(current: User = Depends(get_current_user)) -> User:
    return current


# ---------- API Keys ----------

def _generate_api_key() -> tuple[str, str, str]:
    """生成 API key，返回 (full_key, key_prefix, key_hash)。"""
    raw = "vol_" + secrets.token_urlsafe(32)
    prefix = raw[:12]
    from hashlib import sha256
    key_hash = sha256(raw.encode()).hexdigest()
    return raw, prefix, key_hash


@router.post("/api/auth/api-keys", response_model=schemas.ApiKeyCreatedOut, status_code=201)
def create_api_key(
    payload: schemas.ApiKeyCreate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.ApiKeyCreatedOut:
    full_key, prefix, key_hash = _generate_api_key()
    api_key = ApiKey(
        user_id=current.id,
        name=payload.name,
        key_prefix=prefix,
        key_hash=key_hash,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    return schemas.ApiKeyCreatedOut(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        full_key=full_key,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
    )


@router.get("/api/auth/api-keys", response_model=list[schemas.ApiKeyOut])
def list_api_keys(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[schemas.ApiKeyOut]:
    keys = db.scalars(
        select(ApiKey).where(ApiKey.user_id == current.id).order_by(ApiKey.created_at.desc())
    ).all()
    return keys


@router.delete("/api/auth/api-keys/{key_id}", status_code=204)
def delete_api_key(
    key_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    api_key = db.scalar(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current.id)
    )
    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key 不存在")
    db.delete(api_key)
    db.commit()
