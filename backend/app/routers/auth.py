"""认证路由：登录、修改自己的密码。

`/api/me` 挂在同一 router 上（不使用 auth 前缀），便于前端统一管理。
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user
from ..models import User
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
