# Plugin System v2 设计文档

## 概述

将 Volcano AI 现有的 model provider 插件系统扩展为通用插件框架，支持三类插件：

| 类别 | 说明 | 编程量 |
|------|------|--------|
| `model` | 现有 LLM / Embedding 提供商（向后兼容） | Python |
| `skill` | 纯声明式技能 Markdown 文件，注入 AI 行为 | 零代码 |
| `extension` | 全功能扩展：后端路由 + 前端组件 + Hooks | Python + React |

## 1. Manifest 格式

```json
{
  "name": "code-assist",
  "label": "代码助手技能包",
  "version": "1.0.0",
  "category": "extension",

  "entry": "code_assist.plugin:CodeAssistPlugin",

  "skills": {
    "code-review": "skills/code-review.md",
    "debugging": "skills/debugging.md"
  },

  "backend": {
    "routes": "code_assist.routes:router",
    "hooks": {
      "pre_chat": "code_assist.hooks:preprocess",
      "post_chat": "code_assist.hooks:postprocess"
    }
  },

  "frontend": {
    "components": {
      "ConfigPanel": "ConfigPanel",       # → 扫描 frontend/ConfigPanel.tsx 的 export ConfigPanel
      "SidebarItem": "SidebarItem",
      "SkillList": "SkillList"
    },
    "extension_points": ["plugin-config-tab", "sidebar-bottom"]
  },

  "requires": ["langchain-openai>=0.2"]
}
```

- `category` — `"model"` | `"skill"` | `"extension"`，缺省 `"model"`（向后兼容）
- `skills` — skill 名称到 markdown 文件路径的映射
- `backend.routes` — FastAPI APIRouter 的 dot-path
- `backend.hooks` — Chat 流程的预处理/后处理回调
- `frontend.components` — 组件名到导出名的映射，文件放在插件包 `frontend/` 目录下
- `frontend.extension_points` — 声明插件期望插入的宿主位置标识列表

## 2. 后端架构

### 2.1 目录结构

```
backend/app/
├── plugins/                      # 新增
│   ├── __init__.py
│   ├── registry.py               # 统一注册表（替代 providers/registry.py）
│   ├── base.py                   # Plugin Protocol（替代 providers/base.py）
│   ├── skill_loader.py           # Skill markdown 解析 + 注入
│   └── hooks.py                  # Hook 调度器
├── providers/                    # 保留，逐步迁移
│   ├── __init__.py
│   ├── base.py                   # → plugins/base.py 兼容包装
│   └── registry.py               # → plugins/registry.py 兼容包装
└── services/
    └── chat_service.py           # 修改：接入 skill 注入 + hooks
```

### 2.2 Plugin Protocol

```python
@runtime_checkable
class Plugin(Protocol):
    def name(self) -> str: ...
    def label(self) -> str: ...
    def category(self) -> str: ...
    def available(self) -> bool: ...

    # 可选 hooks
    def get_skills(self) -> list[SkillDef]: ...
    def register_routes(self) -> APIRouter | None: ...
    def get_hooks(self) -> PluginHooks | None: ...
    def get_provider(self) -> Provider | None: ...  # 旧 Provider 接口
```

`Provider` Protocol 保持不变，作为 `Plugin` 的一个可选子接口。

### 2.3 统一注册表

```python
# plugins/registry.py
_PLUGINS: dict[str, tuple[Plugin, str, str, str]] = {}  # name -> (cls, label, source, category)

def register_plugin(name: str, plugin_cls: type, label: str, source: str = "builtin", category: str = "model") -> None: ...
def get_plugin(name: str) -> Plugin | None: ...
def list_plugins(category: str | None = None) -> list[Plugin]: ...
def load_uploaded_plugins() -> list[tuple[str, str | None]]: ...
```

- `_BUILTIN` 字典中的 model 条目自动通过 `register_plugin()` 注册，兼容旧格式
- 上传的 zip 解压后，根据 `manifest.category` 走不同注册路径

### 2.4 Skill 注入

```python
# plugins/skill_loader.py
@dataclass
class SkillDef:
    name: str
    plugin_name: str
    content: str
    match_mode: str       # "always" | "keyword"
    keywords: list[str]   # 匹配关键字（空 = always），子串匹配：query 包含任一关键字即命中

class SkillInjector:
    def load_from_plugin(self, plugin_name: str, skills: dict[str, str]) -> list[SkillDef]: ...

    def match(self, query: str, enabled_skills: list[SkillDef]) -> list[str]:
        """按 query 匹配 skill，返回匹配的 markdown 列表。"""
        matched = []
        for skill in enabled_skills:
            if skill.match_mode == "always":
                matched.append(skill.content)
            elif skill.match_mode == "keyword":
                if any(kw in query for kw in skill.keywords):
                    matched.append(skill.content)
        return matched
```

**注入时机**：`chat_service.py` 的 `build_prompt()` 中，将匹配的 skill content 追加到 system prompt 末尾：

```
System: 你是 Volcano AI 助手。请遵循以下指南：

[Code Review 指南]
按照这些规则审查代码...

[Debugging 指南]
遇到错误时按以下步骤排查...
```

### 2.5 Hook 调度

```python
# plugins/hooks.py
@dataclass
class PluginHooks:
    pre_chat: Callable | None = None      # (query, context) → (query, context)
    post_chat: Callable | None = None     # (query, response, context) → response

class HookDispatcher:
    def dispatch_pre_chat(self, query: str, context: dict) -> tuple[str, dict]: ...
    def dispatch_post_chat(self, query: str, response: str, context: dict) -> str: ...
```

在 `chat_service.py` 的 chat 流程中插入：

```python
query, context = hook_dispatcher.dispatch_pre_chat(query, context)
response = llm.invoke(prompt)
response = hook_dispatcher.dispatch_post_chat(query, response, context)
```

### 2.6 数据库

新建 `plugin_extensions` 表，与 `provider_configs` 并行：

```sql
CREATE TABLE plugin_extensions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    label       TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'extension',
    source      TEXT NOT NULL DEFAULT 'uploaded',  -- 'builtin' | 'uploaded'
    version     TEXT,
    skills_json TEXT,                 -- JSON: {"code-review": "源码审查指南", ...}
    hooks_json  TEXT,                 -- JSON: {"pre_chat": "mod.path:fn", ...}
    frontend_json TEXT,               -- JSON: {components, extension_points}
    installed   BOOLEAN DEFAULT 0,
    is_active   BOOLEAN DEFAULT 0,
    error       TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

- `provider_configs` 保持不动，只存 model 插件
- `plugin_extensions` 存 skill / extension 插件
- 插件名（`name`）全局共享 namespace，不允许 category 间重名
- 前端 `/api/plugins` 列表 API 合并两张表返回，统一展示

## 3. 前端架构

### 3.1 组件注册表

```typescript
// lib/plugin-registry.ts
interface PluginComponent {
  key: string;
  pluginName: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  extensionPoint: string;
}

const registry = new Map<string, PluginComponent[]>();

export function registerPluginComponent(comp: PluginComponent): void { ... }
export function getPluginComponents(point: string): PluginComponent[] { ... }
export function clearPluginComponents(pluginName: string): void { ... }
```

### 3.2 PluginOutlet

```tsx
// components/PluginOutlet.tsx
interface Props {
  extensionPoint: string;
  pluginName?: string;   // 可选：只渲染特定插件的组件
}

function PluginOutlet({ extensionPoint, pluginName }: Props) {
  const components = getPluginComponents(extensionPoint)
    .filter(c => !pluginName || c.pluginName === pluginName);

  return components.map(c => (
    <Suspense key={`${c.pluginName}-${c.key}`} fallback={<Loading />}>
      <c.component pluginName={c.pluginName} />
    </Suspense>
  ));
}
```

### 3.3 预定义挂载点

| 挂载点 | 位置 | 渲染内容 |
|--------|------|----------|
| `plugin-config-tab` | 插件配置弹窗 Tab 区 | 插件的自定义配置面板 |
| `sidebar-bottom` | 左侧导航底部 | 插件快捷入口 |
| `chat-toolbar` | 对话输入框上方 | 插件工具按钮 |
| `kb-toolbar` | 知识库详情页 | 插件操作按钮 |

### 3.4 构建扫描

`scripts/scan-plugin-components.js`（在 `npm run dev` / `build` 时运行）：

1. 遍历 `data/plugins/*/frontend/` 目录
2. 解析各插件的 `manifest.json`，读取 `frontend.components`
3. 按约定 `组件值 → frontend/<值>.tsx` 查找组件文件，生成 `plugin-components.generated.ts`
4. 找不到文件时跳过并告警，不阻塞构建

输出示例：

```typescript
// plugin-components.generated.ts（自动生成，不手动修改）
import { lazy } from 'react';
import { registerPluginComponent } from './lib/plugin-registry';

registerPluginComponent({
  key: 'ConfigPanel', pluginName: 'code-assist',
  component: lazy(() => import('../data/plugins/code-assist/frontend/ConfigPanel.tsx')),
  extensionPoint: 'plugin-config-tab',
});
```

**文件命名约定**：组件值 `"Foo"` 对应 `frontend/Foo.tsx`，导出同名 `Foo` 组件。扫描脚本以此约定查找。

registerPluginComponent({
  key: 'SidebarItem', pluginName: 'code-assist',
  component: lazy(() => import('../data/plugins/code-assist/frontend/SidebarItem.tsx')),
  extensionPoint: 'sidebar-bottom',
});
```

### 3.5 插件管理 UI 调整

现有 `PluginManagementPage.tsx` 做以下改动：

- Tab 分类：`全部 | 模型 | 技能 | 扩展`
- 各 Tab 只展示对应 `category` 的插件
- Skill 类插件：详情面板展示 markdown 文件列表 + 预览 + 关键字编辑
- Extension 类插件：详情面板展示组件数、路由数、挂载点
- 安装/激活/卸载流程跨类别统一

## 4. 生命周期

```
用户上传 zip / URL 导入
    ↓
backend/plugins/loader.py 解压校验
    ↓
读取 manifest.json
    ├── category=model    → providers/registry.py（保持不变）
    ├── category=skill    → skill_loader.py 解析 skills/ → plugin_extensions 写行
    └── category=extension → 注册 Python 模块 + 扫描 frontend/ → plugin_extensions 写行
    ↓
前端展示 → 用户配置（model 需填写 API Key 等） → 点击"安装"
    ↓
installed=True → 前端可见/可用
    ↓
点击"激活" → is_active=True → 正式生效
    ↓
禁用 → is_active=False
卸载 → 删除文件 + 删除 DB 行
```

- skill 插件：安装即生效（无需配置），激活后注入 chat
- extension 插件：安装后注册路由和前端组件，激活后 hooks 进入 chat 流程
- model 插件：流程不变

## 5. 向后兼容

| 版本 | model 插件 | model 内置 provider | 旧 manifest |
|------|-----------|-------------------|------------|
| 发布时 | 可正常上传安装 | 正常注册 | `category` 缺省 = model，正常工作 |
| 未来 | 建议迁移到新 manifest 格式 | Provider → Plugin 兼容包装 | 永不 breaking |

## 6. 安全约束

继承现有安全策略：
- 插件名 `^[a-zA-Z0-9_]{2,32}$`
- zip-slip 防护
- URL 导入限 http/https，后缀 .zip，最大 32MB
- 不自动 pip install
- 仅 admin 角色可访问 `/api/plugins/*`
- 新增：extension 插件的 `frontend/` 组件在宿主同域下运行，不得执行 localStorage 外的敏感操作

## 7. 未覆盖 & 后续

- 插件市场 / 远程仓库（后续）
- 插件版本升级（后续）
- Skill 语义匹配（当前先用 keyword，后续可加 embedding 语义匹配）
- Multistep agent / chain 能力（后续）
