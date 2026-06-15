# AI 编码助手 · 知识库（RAG）

仿 ZCode/Cursor 风格的 AI 编码助手界面，含可独立运行的 **RAG 知识库**全栈实现：
React + TypeScript + Vite 前端，Python + FastAPI + SQLite + LangChain 后端。

```
transformer/
├── frontend/   # React + Vite + Tailwind + Zustand + react-router
├── backend/    # FastAPI + SQLite + LangChain（插件化 RAG）
└── web/        # 早期静态原型（HTML/CSS，仅作设计参考）
```

## 启动

### 1. 后端（默认 http://127.0.0.1:8000）

```bash
cd backend
run.bat            # Windows；macOS/Linux 用 bash run.sh
```

首次会自动建虚拟环境、装依赖、复制 `.env.example` → `.env`。
**填入真实 API Key** 后即可提供 embedding 与 RAG 问答（详见 `backend/README.md`）。

无 Key 时后端仍可启动，知识库 CRUD 可用，仅上传文档/问答会提示配置缺失。

### 2. 前端（默认 http://localhost:5173）

```bash
cd frontend
npm install        # 首次
npm run dev
```

vite 已配置 `/api` 代理到 `http://127.0.0.1:8000`，前端零 CORS 配置。

打开浏览器访问 http://localhost:5173 ，左侧 **知识库** 菜单进入知识库页面。

## 功能

- **知识库管理**：创建 / 编辑 / 删除 / 搜索 / 分页
- **文档管理**：拖拽上传（PDF/Word/MD/TXT/CSV/HTML），自动切分 + 向量化 + 入库
- **RAG 问答**：基于知识库内容的检索增强问答，返回答案与引用来源
- **插件化 Provider**：智谱 GLM / OpenAI 兼容（DeepSeek、Moonshot 等）/ 本地 Ollama，按安装的依赖自动启用

## 前后端联调说明

前端 `src/lib/api.ts` 封装了与后端 `1:1` 对齐的接口。store（`useAppStore`）的 KB/文档操作均走真实后端，
**后端不可用时自动回退到本地 mock 数据**，保证 UI 在离线时仍可演示。

- 类型检查：`cd frontend && npm run check`
- 后端文档：启动后访问 `http://127.0.0.1:8000/docs`

详细架构、约束、生产升级路径见 [`backend/README.md`](./backend/README.md)。
