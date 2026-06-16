# Volcano AI · 企业级 AI 平台

React + TypeScript + Vite 前端，Python + FastAPI + SQLite + LangChain 后端。

```
volcano.ai/
├── frontend/   # React + Vite + Tailwind + Zustand + react-router
├── backend/    # FastAPI + SQLite + LangChain（插件化 RAG + 工作室模块）
└── web/        # 早期静态原型（仅设计参考）
```

## 启动

### 1. 后端（默认 http://127.0.0.1:8000）

```bash
cd backend
run.bat            # Windows
```

首次自动创建虚拟环境、安装依赖、复制 `.env.example` → `.env`。
在插件管理页面配置各 Provider 的 API Key 后即可使用。

### 2. 前端（默认 http://localhost:5173）

```bash
cd frontend
npm install        # 首次
npm run dev
```

Vite 已配置 `/api` 代理到 `http://127.0.0.1:8000`。

打开浏览器访问 http://localhost:5173 ，默认账号 `admin / admin123`。

## 功能

### 工作室 (Studio)
- 创建/编辑/发布 AI 聊天助手应用
- 配置模型 Provider、系统提示词、关联技能和知识库
- 实时流式对话预览，支持暂停/恢复/上下文压缩
- 代码高亮、HTML 预览下载、一键复制

### 知识库管理 (RAG)
- 创建/编辑/删除/搜索知识库
- 支持 PDF、Word、Markdown、HTML、CSV、TXT 文档上传
- 自动分片（四种策略：通用自动/自定义分隔符/Markdown 标题/父子分段）
- 向量化存储与检索增强问答（返回答案 + 引用来源）

### 插件管理
- 模块化 Provider 架构，支持热插拔
- 内置：DeepSeek、千问 (Qwen)、智谱 GLM、Ollama、OpenAI 兼容
- 每个 Provider 可独立配置模型列表与上下文大小
- 支持 LLM 与 Embedding 独立激活开关

### 技能管理
- 创建/编辑/搜索/删除技能（Markdown 内容）
- 支持粘贴创建或上传 `.md` 文件
- Markdown 预览与导出 `.md` 文件
- 技能内容作为 System Prompt 注入到 AI 对话中

### 用户管理
- 管理员/普通用户角色
- 账号启用/禁用、密码修改

## 前后端联调

前端 `src/lib/api.ts` 封装了与后端 `1:1` 对齐的接口。

- 类型检查：`cd frontend && npm run check`
- 后端文档：启动后访问 `http://127.0.0.1:8000/docs`

详细架构与生产升级路径见 [`backend/README.md`](./backend/README.md)。
