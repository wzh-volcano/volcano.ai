# RAG 知识库后端

Python + FastAPI + SQLite + LangChain 构建的 RAG 系统，支持**插件化** LLM/Embedding 提供商。

## 特性

- **插件化 Provider**：根据安装的依赖自动启用厂商。底座走 OpenAI 兼容协议，支持智谱 GLM / DeepSeek / Moonshot / OpenAI / 自建代理；可选安装 Ollama 走本地模型。
- **纯 SQLite 向量存储**：embedding 以 BLOB 存表，numpy 余弦检索，零 native 依赖。
- **文档入库**：支持 PDF / Word / Markdown / TXT / CSV / HTML。
- **RESTful API**：知识库 CRUD、文档上传/删除、RAG 问答。

## 快速开始

```bash
# Windows
run.bat

# macOS / Linux
bash run.sh
```

脚本会自动：建虚拟环境 → 装依赖 → 复制 `.env.example` → 启动 `http://127.0.0.1:8000`。

启动后访问交互式文档：`http://127.0.0.1:8000/docs`。

## 配置

复制 `.env.example` 为 `.env` 并填入真实值：

```ini
LLM_PROVIDER=zhipu                       # zhipu | openai_like | ollama
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_API_KEY=your_key
LLM_MODEL=glm-4
EMBEDDING_MODEL=embedding-3
```

各 provider 关键差异：

| Provider | 说明 | 依赖 | 需要 Key |
|---|---|---|---|
| `zhipu` | 智谱 GLM（OpenAI 兼容端点） | langchain-openai | 是 |
| `openai_like` | OpenAI 官方/DeepSeek/Moonshot/代理 | langchain-openai | 是 |
| `ollama` | 本地 Ollama（可选） | langchain-ollama | 否 |

> **切换本地 Ollama**：`pip install langchain-ollama`，然后把 `LLM_PROVIDER=ollama` 并填写 `LLM_BASE_URL`（默认 http://localhost:11434）。未安装该包时 `/api/providers` 不会返回 ollama。

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/providers` | 可用 provider 列表（含配置状态） |
| POST | `/api/kb` | 创建知识库 |
| GET | `/api/kb` | 知识库列表 |
| GET | `/api/kb/{id}` | 知识库详情 |
| DELETE | `/api/kb/{id}` | 删除知识库 |
| POST | `/api/kb/{id}/documents` | 上传文档（multipart，支持多文件） |
| GET | `/api/kb/{id}/documents` | 文档列表 |
| DELETE | `/api/documents/{id}` | 删除文档 |
| POST | `/api/kb/{id}/chat` | RAG 问答，返回 `{answer, sources[]}` |

### 示例：上传文档并提问

```bash
# 1. 创建知识库
curl -X POST http://127.0.0.1:8000/api/kb \
  -H "Content-Type: application/json" \
  -d '{"name":"我的知识库","description":"测试"}'
# => {"id":1, ...}

# 2. 上传文档（自动切分 + 向量化 + 入库）
curl -X POST http://127.0.0.1:8000/api/kb/1/documents \
  -F "files=@notes.txt"

# 3. 提问
curl -X POST http://127.0.0.1:8000/api/kb/1/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"notes 里讲了什么？"}'
```

## 目录结构

```
backend/
├── app/
│   ├── main.py            # FastAPI 入口
│   ├── config.py          # .env 配置
│   ├── database.py        # SQLAlchemy 引擎/会话
│   ├── models.py          # ORM: KnowledgeBase / Document / Chunk
│   ├── schemas.py         # Pydantic 入参/出参
│   ├── routers/           # providers / knowledge_bases / documents / chat
│   ├── providers/         # ★ 插件系统: base / registry / zhipu / openai_like / ollama
│   ├── rag/               # loader / splitter / vectorstore(纯 SQLite) / chain
│   └── services/          # kb_service: 文档入库流水线
├── data/                  # 运行期生成: rag.db + uploads/
├── requirements.txt
├── .env.example
└── run.bat / run.sh
```

## 约束与说明

- **embedding 维度一致性**：每个知识库在创建时锁定 `embedding_model`；同一知识库的检索必须用同款 embedding，混用会被拒绝。
- **向量检索规模**：纯 Python 余弦适合演示（千级 chunk）。生产建议升级到 sqlite-vec / FAISS / Chroma，替换 `app/rag/vectorstore.py` 即可。
- **文件大小**：默认 20MB/文件，可在 `.env` 的 `MAX_FILE_SIZE_MB` 修改。
- **无 Key 也能起服务**：KB CRUD 正常，但上传文档向量化与 chat 会返回清晰错误。`/api/providers` 会标记 `configured: false`。
