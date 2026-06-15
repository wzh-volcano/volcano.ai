"""密码哈希、JWT 签发与校验。

使用 bcrypt 5.x 原生 API；若 bcrypt 不可用则回退到标准库 pbkdf2_hmac。
"""
import hashlib
import hmac
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from .config import settings

# ---------- 哈希策略 ----------
try:
    import bcrypt  # noqa: F401

    _USE_BCRYPT = True
except Exception:  # noqa: BLE001
    _USE_BCRYPT = False

# pbkdf2 回退参数
_PBKDF2_ALGO = "sha256"
_PBKDF2_ITER = 200_000


def hash_password(plain: str) -> str:
    """对明文密码做单向哈希。"""
    if _USE_BCRYPT:
        return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac(_PBKDF2_ALGO, plain.encode("utf-8"), salt, _PBKDF2_ITER)
    return f"pbkdf2${_PBKDF2_ITER}${salt.hex()}${dk.hex()}"


def verify_password(plain: str, hashed: str) -> bool:
    """校验明文密码与哈希是否匹配。"""
    if not hashed:
        return False
    if hashed.startswith("$2"):  # bcrypt 哈希
        if not _USE_BCRYPT:
            return False
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    if hashed.startswith("pbkdf2$"):
        try:
            _, iters, salt_hex, dk_hex = hashed.split("$")
            salt = bytes.fromhex(salt_hex)
            expected = bytes.fromhex(dk_hex)
            dk = hashlib.pbkdf2_hmac(
                _PBKDF2_ALGO, plain.encode("utf-8"), salt, int(iters)
            )
            return hmac.compare_digest(dk, expected)
        except (ValueError, AttributeError):
            return False
    return False


# ---------- JWT ----------
def create_access_token(subject: str | int) -> str:
    """签发 JWT，subject 通常是用户 id。"""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """解码并校验 JWT，失败抛 jwt 异常。"""
    return jwt.decode(
        token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )


# ---------- 临时密码 ----------
_ALPHABET = string.ascii_letters + string.digits


def generate_temp_password(length: int = 8) -> str:
    """生成指定长度的随机字母数字临时密码。"""
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))
