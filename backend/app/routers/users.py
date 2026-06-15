"""用户管理路由（仅管理员）。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_admin, get_current_user
from ..models import User
from ..security import generate_temp_password, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[schemas.UserOut])
def list_users(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


@router.post("", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.UserCreate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> User:
    exists = db.scalar(select(User).where(User.username == payload.username))
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if payload.role is not None:
        # 防止把最后一个管理员降级
        if (
            user.role == "admin"
            and payload.role != "admin"
            and _count_admins(db) <= 1
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="至少需要保留一个管理员"
            )
        user.role = payload.role
    if payload.status is not None:
        # 防止禁用自己
        if payload.status == "disabled" and user.id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="不能禁用当前登录账号"
            )
        # 防止禁用最后一个管理员
        if (
            user.role == "admin"
            and payload.status == "disabled"
            and _count_admins(db) <= 1
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="不能禁用最后一个管理员"
            )
        user.status = payload.status

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除当前登录账号")
    if user.role == "admin" and _count_admins(db) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除最后一个管理员"
        )
    db.delete(user)
    db.commit()


@router.post("/{user_id}/reset-password", response_model=schemas.ResetPasswordOut)
def reset_password(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> schemas.ResetPasswordOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    temp = generate_temp_password()
    user.password_hash = hash_password(temp)
    db.commit()
    return schemas.ResetPasswordOut(new_password=temp)


@router.post("/{user_id}/toggle-status", response_model=schemas.UserOut)
def toggle_status(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> User:
    """在 active / disabled 之间切换。"""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    next_status = "disabled" if user.status == "active" else "active"
    if next_status == "disabled":
        if user.id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="不能禁用当前登录账号"
            )
        if user.role == "admin" and _count_admins(db) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="不能禁用最后一个管理员"
            )
    user.status = next_status
    db.commit()
    db.refresh(user)
    return user


def _count_admins(db: Session) -> int:
    return int(
        db.scalar(select(func.count(User.id)).where(User.role == "admin")) or 0
    )
