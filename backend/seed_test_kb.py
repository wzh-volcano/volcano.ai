"""创建测试知识库：登录 admin → 新建 KB → 上传文本文档。"""
import httpx

BASE = "http://127.0.0.1:8000"

# 登录
r = httpx.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin123"})
r.raise_for_status()
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 创建知识库
kb = httpx.post(f"{BASE}/api/kb", headers=headers, json={
    "name": "火山 AI 帮助文档",
    "description": "关于火山 AI 平台的产品介绍、使用指南和常见问题",
    "visibility": "private",
}).raise_for_status().json()
print(f"知识库创建成功: id={kb['id']}, name={kb['name']}")

# 上传文本文档
docs_data = [
    {
        "title": "火山 AI 平台简介",
        "content": """# 火山 AI 平台简介

## 概述
火山 AI 是一个新一代企业级人工智能平台，提供大语言模型调用、知识库管理、智能体编排等核心能力。

## 核心功能
1. **模型调用** - 支持主流大语言模型（DeepSeek、千问、GLM 等），提供统一的 API 接口
2. **知识库管理** - 支持多种文档格式（PDF、Word、Markdown、HTML），自动分片与向量化
3. **智能体（Agent）** - 通过拖拽式工作流编排，快速构建 AI 应用
4. **RAG 增强检索** - 结合知识库与 LLM，提供基于事实的精准问答

## 技术架构
- 后端：Python FastAPI + SQLAlchemy + SQLite
- 前端：React + TypeScript + Tailwind CSS
- 向量存储：基于 SQLite 的内置向量引擎
- 插件系统：模块化 Provider 架构，支持热插拔
""",
        "file_type": "md",
    },
    {
        "title": "模型插件配置指南",
        "content": """# 模型插件配置指南

## 支持的 Provider
- **OpenAI 兼容** - 任意兼容 OpenAI API 的服务
- **DeepSeek** - deepseek-chat / deepseek-reasoner
- **千问 (Qwen)** - qwen-plus / qwen-turbo
- **智谱 GLM** - glm-4-plus / glm-4-flash
- **Ollama** - 本地部署的开源模型

## 配置步骤
1. 进入「插件管理」页面
2. 找到目标 Provider，点击「配置」
3. 填写 Base URL 和 API Key
4. 在「已拉取的模型列表」中选择可用模型
5. 保存配置并激活

## 注意事项
- API Key 请妥善保管，建议使用环境变量
- 如果拉取模型列表失败，可以手动添加模型名称
- 同一时间只能激活一个 LLM Provider
""",
        "file_type": "md",
    },
    {
        "title": "工作室使用说明",
        "content": """# 工作室使用说明

## 什么是工作室？
工作室是火山 AI 的应用管理中心，您可以在这里创建、配置和发布 AI 应用。

## 创建应用
1. 点击「新建应用」按钮
2. 填写应用名称、图标和介绍
3. 选择模型 Provider 和具体模型
4. 编写系统提示词（System Prompt）
5. 关联技能和知识库
6. 保存并发布

## 预览与测试
在应用配置页面右侧可以实时预览对话效果，支持：
- 流式输出
- 暂停/恢复
- 上下文压缩（超过阈值自动折叠历史消息）
- 代码高亮与复制

## 发布流程
- 草稿状态：仅自己可见，可继续编辑
- 已发布：所有用户可见
""",
        "file_type": "md",
    },
    {
        "title": "常见问题 FAQ",
        "content": """# 常见问题 FAQ

## 1. 如何接入自定义模型？
在「插件管理」中配置 OpenAI 兼容的 Provider，填写自定义的 Base URL 和 API Key 即可。

## 2. 知识库支持哪些文件格式？
目前支持 PDF、Word（.docx）、Markdown（.md）、HTML、CSV、纯文本（.txt）。

## 3. 上下文压缩是什么？
当对话上下文占用超过模型限制的 10% 时，系统会自动将历史消息折叠为摘要，节省 Token 消耗。

## 4. 如何让知识库仅匹配部分文档？
在文档列表中，可以单独禁用某些文档（通过 toggle 开关），禁用的文档不会参与 RAG 检索。

## 5. 同一个 Provider 可以配置多个模型吗？
可以。在插件配置弹窗中，从「已拉取的模型列表」勾选需要的模型，并为每个模型设置上下文大小。
""",
        "file_type": "md",
    },
]

for doc in docs_data:
    r = httpx.post(
        f"{BASE}/api/kb/{kb['id']}/documents/text",
        headers=headers,
        json=doc,
    )
    if r.status_code == 201:
        d = r.json()
        print(f"  文档创建成功: id={d['id']}, filename={d['filename']}, status={d['status']}")
    else:
        print(f"  文档创建失败: {r.status_code} {r.text}")

print(f"\n完成！知识库 ID: {kb['id']}")
print(f"管理员账号: admin / admin123")
