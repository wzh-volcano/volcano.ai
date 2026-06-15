#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[1/3] 创建虚拟环境..."
  python3 -m venv .venv
fi

echo "[2/3] 安装依赖..."
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q -r requirements.txt

if [ ! -f .env ]; then
  echo "[info] 未发现 .env，复制 .env.example -> .env"
  cp .env.example .env
  echo "[warn] 请编辑 backend/.env 填入真实 API Key 后再启动"
fi

echo "[3/3] 启动服务 http://127.0.0.1:8000  (Ctrl+C 退出)"
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
