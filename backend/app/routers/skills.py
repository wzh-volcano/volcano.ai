"""技能管理路由：支持粘贴 Markdown 和上传 .md 文件。"""
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user
from ..models import Skill, User

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("", response_model=list[schemas.SkillOut])
def list_skills(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Skill]:
    """普通用户只看自己的技能，管理员看所有。"""
    stmt = select(Skill)
    if current_user.role != "admin":
        stmt = stmt.where(Skill.owner_id == current_user.id)
    stmt = stmt.order_by(Skill.created_at.desc())
    skills = list(db.scalars(stmt))
    for s in skills:
        s.owner_username = s.owner.username if s.owner else None
    return skills


@router.post("", response_model=schemas.SkillOut, status_code=201)
def create_skill(
    payload: schemas.SkillCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Skill:
    skill = Skill(
        name=payload.name,
        description=payload.description,
        content=payload.content,
        filename="",
        owner_id=current_user.id,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    skill.owner_username = current_user.username
    return skill


@router.post("/upload", response_model=schemas.SkillOut, status_code=201)
def upload_skill(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Skill:
    if not file.filename or not file.filename.lower().endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 .md 文件"
        )
    raw = file.file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="文件编码必须为 UTF-8"
        )
    name = os.path.splitext(file.filename)[0][:256]
    skill = Skill(
        name=name,
        description="",
        content=content,
        filename=file.filename,
        owner_id=current_user.id,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    skill.owner_username = current_user.username
    return skill


@router.get("/{skill_id}", response_model=schemas.SkillOut)
def get_skill(
    skill_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Skill:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="技能不存在")
    if current_user.role != "admin" and skill.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="技能不存在")
    skill.owner_username = skill.owner.username if skill.owner else None
    return skill


@router.patch("/{skill_id}", response_model=schemas.SkillOut)
def update_skill(
    skill_id: int,
    payload: schemas.SkillUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Skill:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="技能不存在")
    if current_user.role != "admin" and skill.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="技能不存在")
    if payload.name is not None:
        skill.name = payload.name
    if payload.description is not None:
        skill.description = payload.description
    if payload.content is not None:
        skill.content = payload.content
    db.commit()
    db.refresh(skill)
    skill.owner_username = skill.owner.username if skill.owner else None
    return skill


@router.delete("/{skill_id}", status_code=204)
def delete_skill(
    skill_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="技能不存在")
    if current_user.role != "admin" and skill.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="技能不存在")
    db.delete(skill)
    db.commit()
