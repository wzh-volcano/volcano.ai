# 千问百炼 (Qwen) 模型插件

基于阿里云 DashScope 平台的 OpenAI 兼容协议，提供 LLM 对话与 Embedding 能力。

## 配置说明

| 字段 | 说明 | 默认值 |
|------|------|--------|
| Base URL | DashScope OpenAI 兼容端点 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| API Key | 阿里云 DashScope API Key | — |
| LLM 模型 | 对话模型名称 | `qwen-plus` |
| Embedding 模型 | 向量化模型名称 | `text-embedding-v3` |

## 依赖

- `langchain-openai>=0.2`（后端环境需提前安装）

## 常用模型

- **LLM**: qwen-turbo, qwen-plus, qwen-max, qwen2.5-72b-instruct 等
- **Embedding**: text-embedding-v1, text-embedding-v2, text-embedding-v3
