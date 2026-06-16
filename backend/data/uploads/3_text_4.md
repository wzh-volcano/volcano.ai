# 火山 AI 平台简介

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
