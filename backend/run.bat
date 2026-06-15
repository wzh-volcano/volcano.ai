@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist .venv (
  echo [1/3] 创建虚拟环境...
  py -3 -m venv .venv || python -m venv .venv
)

echo [2/3] 安装依赖...
.venv\Scripts\python.exe -m pip install -q --upgrade pip
.venv\Scripts\python.exe -m pip install -q -r requirements.txt

if not exist .env (
  echo [info] 未发现 .env，复制 .env.example -^> .env
  copy .env.example .env >nul
  echo [warn] 请编辑 backend\.env 填入真实 API Key 后再启动
)

echo [3/3] 启动服务 http://127.0.0.1:8000  (Ctrl+C 退出)
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
