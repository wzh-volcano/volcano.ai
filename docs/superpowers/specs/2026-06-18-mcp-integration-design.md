# MCP (Model Context Protocol) 集成设计

## 概述

在 Transformer 项目中集成 MCP 协议，支持：
- **MCP Server 插件**：用户可上传独立的 MCP Server 程序作为插件，通过子进程 spawn 运行
- **MCP Client**：主进程聚合所有激活的 MCP Server 插件暴露的工具，接入 LangChain tool calling 管线
- **双向 MCP**：既能消费外部 MCP Server 的工具，也将系统能力（知识库检索、技能注入）暴露为 MCP Server

## 总体架构

```
┌──────────────────────────────────────────┐
│            FastAPI 主进程                   │
│  ┌────────────────────────────────────┐   │
│  │  chat_service.py                   │   │
│  │  AgentExecutor(agent, tools)       │   │
│  │         ⇅                          │   │
│  │  MCPClientManager (tools 聚合层)    │   │
│  └──────┬──────┬──────┬───────────────┘   │
│         │      │      │  MCP Client SDK   │
├─────────┼──────┼──────┼───────────────────┤
│         │      │      │  stdio transport  │
│  ┌──────▼──┐ ┌─▼──┐ ┌─▼────────────┐      │
│  │ 内置 MCP  │ │插件1│ │ 插件2         │      │
│  │ Server   │ │MCP  │ │MCP Server    │      │
│  │kb_search │ │Server│ │web_search    │      │
│  │skill_guide│ │tools│ │tools         │      │
│  └─────────┘ └────┘ └──────────────┘      │
└──────────────────────────────────────────┘
```

## MCP Server 插件

### 插件类型

`plugin_extensions` 表新增 `type="mcp_server"` 枚举值。

### Manifest 格式

插件包内需包含 `manifest.json`：

```json
{
  "name": "web_search",
  "description": "Web search via MCP",
  "version": "1.0.0",
  "entry": "server.py",
  "dependencies": ["httpx"]
}
```

### 插件上传流程

1. 用户上传一个 `.py` 文件或 `.zip` 包（含 `manifest.json`）
2. 主进程解压/存储到 `plugins/mcp_servers/<name>/`
3. 注册到 `plugin_extensions`（`type="mcp_server"`, `is_active=false`）

### 内置 MCP Server

系统预置一个默认 MCP Server 插件（`app/mcp/builtin_server.py`），不可删除，暴露：

| Tool 名称 | 入参 | 功能 |
|-----------|------|------|
| `knowledge_search` | `query: str`, `kb_ids?: list[int]` | 向量检索，返回 top-3 chunk |
| `skill_get_guide` | `query: str`, `app_id?: int` | 技能关键字匹配，返回注入的 SKILL.md |

### 生命周期

```
激活 → spawn 子进程 (subprocess.Popen stdio) → MCPClient 连接 → list_tools → 注册到 Manager
停用 → close stdio → kill 子进程 → 注销 tools
删除 → 先停用 → 删 DB 行 → 删磁盘文件
```

## MCP Client Manager

位置：`app/mcp/client_manager.py`

```python
class MCPClientManager:
    _servers: dict[str, MCPClient]

    async def start_plugin(self, name: str, entry: str, env: dict):
        """spawn 子进程并连接 MCP"""

    def get_all_tools(self) -> list[BaseTool]:
        """聚合所有激活插件的 tools，包装为 LangChain BaseTool"""

    async def call_tool(self, server_name: str, tool_name: str, args: dict):
        """调用指定插件上的工具"""
```

## LangChain Tool Calling 集成

### 改动前

```python
chain = prompt | llm | StrOutputParser()
async for chunk in chain.astream_events(input_vars, version="v1"):
    if chunk["event"] == "on_parser_stream":
        yield f"data: {json.dumps({'token': chunk['data']['chunk']})}\n\n"
```

### 改动后

```python
from langchain.agents import create_tool_calling_agent, AgentExecutor

agent = create_tool_calling_agent(llm, all_tools, prompt)
executor = AgentExecutor(agent=agent, tools=all_tools, ...)

async for event in executor.astream_events(inputs, version="v1"):
    if event["event"] == "on_chat_model_stream":
        token = event["data"]["chunk"].content
        yield f"data: {json.dumps({'token': token})}\n\n"
    elif event["event"] == "on_tool_end":
        # 可选通知
        pass
yield "data: {\"done\": true}\n\n"
```

### 调用时序

```
User: "搜索2026年AI趋势"
  ↓
1. Agent 收到消息，LLM 决定调用 web_search
2. Agent 拦截 tool_call → MCPClientManager.call_tool("web_search", ...)
3. 插件子进程执行工具 → 返回结果
4. Agent 将 ToolMessage 回注 LLM
5. LLM 继续生成最终回复
6. Agent 流式输出 token → SSE → 前端
```

## 启动时序

```
FastAPI 启动 → 扫描 plugin_extensions 中 type="mcp_server"
  → 对每个 is_active=true 的插件: spawn → connect → list_tools
  → MCPClientManager 聚合所有 tools
  → chat_service 后续请求使用聚合后的 tools
```

## 前端改动

| 文件 | 改动 |
|------|------|
| `PluginManagementPage.tsx` | 上传弹窗添加 type 选择（Skill / MCP Server） |
| `PluginManagementPage.tsx` | MCP 类型卡片显示 `已注册 N 个工具` |
| `PluginManagementPage.tsx` | MCP 卡片增加"连接状态"指示（connected/disconnected） |
| `AppConfigPage.tsx` | 技能选择区段同时显示可用的 MCP Server（可选勾选） |

## DB Schema 改动

`plugin_extensions` 表：`type` 字段枚举扩展为 `"extension" | "skill" | "mcp_server"`。

无需迁移脚本，应用层校验。

## 模型兼容性

如果当前模型不支持 tool calling（function calling），则降级方案 B：MCP Client 获取 tool schema 并注入到 system prompt，后端解析 LLM 输出的 JSON tool call 自行执行。代码中通过 `provider.get_llm().bind_tools` 是否可用判断。

## 错误处理

| 场景 | 处理 |
|------|------|
| 子进程启动失败 | 标记插件为 `error` 状态，前端显示错误信息 |
| 子进程崩溃 | `MCPClientManager` 检测到连接断开，自动重试或标记为 disconnected |
| 工具调用超时 | 设置 `AgentExecutor.max_execution_time`，超时后继续回复 |
| 工具调用失败 | Agent 捕获异常，通知 LLM 工具调用失败，继续生成 |
