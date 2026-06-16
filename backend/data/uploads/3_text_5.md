# 模型插件配置指南

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
