# MCP Marketplace 设计

## 概述

在现有 MCP 插件系统基础上，增加从 [官方 MCP Registry](https://registry.modelcontextprotocol.io/) 搜索和导入 MCP Server 的能力。不建独立市场页面，只在 PluginManagementPage 上加一个搜索弹窗。

## 架构

```
PluginManagementPage
  └─ "从市场导入" 按钮
        └─ MarketImportModal（搜索 + 详情 + 导入）
              │
              ▼
        后端  /api/mcp-marketplace/*   ← 代理 Registry GraphQL API
              │
              ▼
        现有 install → plugin_extensions 流水线
```

后端不做本地缓存，纯透传代理。前端搜索弹窗一次性查询 Registry。

## Registry API

**端点：** `GET https://registry.modelcontextprotocol.io/v0.1/servers`

参数：
- `limit` — 每页条数（默认 20）
- `cursor` — 游标分页（响应中 `metadata.nextCursor`）
- 搜索通过客户端过滤（Registry 不支持服务端 `?q=`）

响应结构（简化）：
```json
{
  "servers": [{
    "server": {
      "name": "ai.adeu/adeu",
      "title": "adeu",
      "description": "...",
      "version": "1.7.1",
      "packages": [{
        "registryType": "npm",
        "identifier": "@adeu/mcp-server",
        "transport": {"type": "stdio"},
        "environmentVariables": [...]
      }]
    }
  }],
  "metadata": {"nextCursor": "..."}
}
```

## 后端 API

### GET /api/mcp-marketplace/search

代理 Registry 查询，返回简化结果。

请求：`?q={keyword}&cursor={cursor}&limit={20}`

响应：
```json
{
  "servers": [{
    "name": "ai.adeu/adeu",
    "title": "adeu",
    "description": "...",
    "version": "1.7.1",
    "packageType": "npm",
    "packageId": "@adeu/mcp-server",
    "runtime": "npx",
    "transport": "stdio",
    "envVars": [{"name": "API_KEY", "required": true, "secret": true}]
  }],
  "nextCursor": "xxx"
}
```

实现：调用 Registry `/v0.1/servers`，如果带 `q` 参数则在返回结果中做客户端过滤（按 name/title/description 模糊匹配）。

### GET /api/mcp-marketplace/package/{name}/{version}

查询单个包的详情。

实现：构建 Registry URL `https://registry.modelcontextprotocol.io/v0.1/servers?filter=name:{name}`（或取全部后过滤）。

### POST /api/mcp-marketplace/import

请求：
```json
{
  "name": "ai.adeu/adeu",
  "version": "1.7.1",
  "env": {"API_KEY": "xxx"}
}
```

处理流程：
1. 从 Registry 拉取该版本的 package 信息
2. 按 `registryType` 决定安装方式（npm / pypi / oci）
3. 在 `data/plugins/{normalized_name}/` 下创建插件目录和 entry 文件
4. 写入 manifest.json（`category: "mcp_server"`，`entry` 根据 runtime 生成）
5. 调用 `load_uploaded_plugins()` + `sync_extensions_to_db()` 注册到 DB
6. 返回 `{ name, installed, error }`

注意：`import` 只注册到 DB，不自动激活。用户需要在 PluginManagementPage 上手动激活。

## 运行时支持

### 当前状态

`MCPClientManager.start_plugin` 只支持 `sys.executable server.py`。

### 扩展后

| packageType | entry 生成 | spawn |
|-------------|-----------|-------|
| `npm` | `data/plugins/{name}/run.sh` 内容为 `npx {packageId}` | `command: "npx", args: [packageId]` |
| `pypi` | 执行 `pip install {packageId}`，查找内置 server.py | 现有 `sys.executable server.py` |
| `streamable-http` | 不 spawn 进程，只存 remoteUrl | HTTP 调用（暂不实现） |

### DB 扩展

`plugin_extensions` 表新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `runtime` | varchar(32) | `python` / `npx` / `http`，默认 `python` |
| `package_id` | varchar(255) | npm/pypi 包名，如 `@adeu/mcp-server` |
| `env_vars_json` | text | 用户配置的环境变量 `{"KEY": "val"}` |

### npx 前置检查

`POST /api/mcp-marketplace/import` 时检查系统是否有 `npx` 命令（`where npx`），没有则返回错误。不在 import 时自动安装 npm 包——`npx` 会在首次启动时自动下载。

## 前端 — MarketImportModal

### 位置

`frontend/src/components/MarketImportModal.tsx` — 新文件。

### 触发

PluginManagementPage 标题旁边加一个「从市场导入」按钮。

### 弹窗内容

- 搜索输入框（placeholder: "搜索 MCP Server..."）
- 结果列表 —— 每项显示：名称 / 标题 / 描述（截断） / 版本 / 运行时标签 `npx` / `python`
- 滚动到底自动加载下一页（游标分页）
- 点击一项 → 展开详情区域：
  - 完整描述
  - 所需环境变量（如有 required 的 env var，显示 input 让用户填写）
  - 「导入并安装」按钮

### 导入后行为

- 调用 `POST /api/mcp-marketplace/import`
- 成功 → 关闭弹窗 → 刷新插件列表 → 新插件出现在列表中（未激活状态）
- 失败 → 弹窗内显示错误消息

### 与现有页面的关系

PluginManagementPage 已有 tab 筛选（All / Skill / MCP Server / Extension）。import 进来的 MCP Server 会出现在 MCP Server tab 下。用户需要手动点击激活。

## 文件清单

| 文件 | 操作 |
|------|------|
| `backend/app/routers/mcp_marketplace.py` | 新增：3 个 API 端点 |
| `backend/app/mcp/client_manager.py` | 修改：`start_plugin` 支持 npx runtime |
| `backend/app/models.py` | 修改：`PluginExtension` 加 runtime/package_id/env_vars_json 字段 |
| `backend/app/services/plugin_loader.py` | 修改：`install_from_registry` 方法 |
| `backend/app/main.py` | 修改：注册 `mcp_marketplace` router |
| `frontend/src/components/MarketImportModal.tsx` | 新增 |
| `frontend/src/pages/Plugins/PluginManagementPage.tsx` | 修改：加「从市场导入」按钮 |
| `frontend/src/lib/api.ts` | 修改：加 marketplace API 调用 |
| `frontend/src/types/index.ts` | 修改：加 MarketServer 等类型 |

## 不做的

- 不建独立市场浏览页面
- 不缓存 Registry 数据到本地
- 不支持 OCI/Docker 运行时（暂不实现）
- `import` 不自动激活插件
- 不处理 HTTP/SSE 远程 MCP Server
