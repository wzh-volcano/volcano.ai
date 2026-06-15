# DeepSeek 模型插件

DeepSeek 官方 API 的火山平台接入插件，基于 OpenAI 兼容协议。

## 前置依赖

在后端 Python 环境中安装：

```bash
pip install langchain-openai>=0.2
```

## 配置说明

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `base_url` | DeepSeek API 端点 | `https://api.deepseek.com/v1` |
| `api_key` | DeepSeek API Key（从 [platform.deepseek.com](https://platform.deepseek.com/) 获取） | — |
| `llm_model` | LLM 模型名 | `deepseek-chat` |
| `embedding_model` | Embedding 模型名（DeepSeek 暂未提供，可留空或搭配其他服务） | — |

## 可用模型

- `deepseek-chat` — 通用对话（推荐）
- `deepseek-reasoner` — 推理模型（思维链）
- 更多模型参考 [DeepSeek 官方文档](https://platform.deepseek.com/docs)

## 注意事项

- DeepSeek 暂无官方 Embedding API，如需向量化功能建议同时部署 `openai_like` 插件指向支持 Embedding 的端点
- 由于平台一次只能激活一个 provider，Embedding 功能需依赖同一端点的兼容实现
