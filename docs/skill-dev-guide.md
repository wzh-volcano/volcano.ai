# 技能插件开发指南

## 概述

技能插件（`category="skill"`）是 Plugin System v2 引入的插件类型。它通过向对话注入 markdown 指南来引导 AI 行为，适用于：

- **设计规范** — 注入布局原则、Design Tokens、组件使用规范
- **代码规范** — 注入项目风格约定、API 使用模式
- **领域知识** — 注入专业术语表、业务规则
- **提示词模板** — 为特定场景提供结构化 instructions

## 目录结构

```
my-skill-plugin/
├── manifest.json
└── skills/
    ├── skill-one.md
    ├── skill-two.md
    └── skill-three.md
```

## manifest.json 字段

```json
{
  "name": "my_skill",
  "label": "我的技能",
  "version": "1.0.0",
  "category": "skill",
  "skills": {
    "skill-one": "skills/skill-one.md",
    "skill-two": "skills/skill-two.md",
    "skill-three": "skills/skill-three.md"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 插件标识符，`^[a-zA-Z0-9_]{2,32}$` |
| `label` | string | 是 | 显示名称 |
| `version` | string | 否 | 语义化版本号 |
| `category` | string | 是 | 固定为 `"skill"` |
| `skills` | object | 是 | skill 名称 → 文件路径的映射 |
| `entry` | string | 否 | 技能插件不需要 entry |

## SKILL.md 编写规范

每个 markdown 文件对应一个 skill，在用户消息匹配时注入到 system prompt。

### 格式建议

```markdown
# 技能名称

## 规则

- 规则一
- 规则二

## 示例

### 正确
\```
good example
\```

### 错误
\```
bad example
\```
```

### 最佳实践

1. **标题清晰** — 首个 `#` 后的标题应概括技能用途
2. **结构分明** — 使用二级标题 `##` 分割不同方面的规则
3. **附示例** — 正反例对比最有效
4. **保持简洁** — 单个 skill 控制在 30-50 行，过长应拆分
5. **引用原文** — 如果涉及代码或术语，使用代码块

### web_design 示例

`skills/responsive-design.md`：

```markdown
# 响应式设计

## 断点系统

- 桌面: >= 1280px
- 平板: 768px - 1279px
- 手机: < 768px

## 布局原则

- 使用 CSS Grid 和 Flexbox
- 避免固定宽度
- 内容优先，移动优先
```

## 匹配模式

每个 skill 有两种匹配模式，通过插件管理页面的"配置"按钮设置：

### keyword（关键字匹配）

用户消息中包含任意关键字时注入。适合针对性触发的技能。

- 可设置多个关键字，逗号分隔
- 子串匹配（不区分大小写）
- 例：关键字 `响应式, responsive` → 用户问"如何实现响应式布局"时触发

### always（始终注入）

每次对话都注入。适合通用指南，如设计原则、语气规范等。

## 注入流程

```
用户输入消息
    ↓
chat_service.py 获取 app 配置中的 skill_names
    ↓
SkillInjector 从已激活插件中加载匹配的 SKILL.md
    ↓
match() 按关键字子串匹配
    ↓
匹配成功的 skill content 拼接到 system prompt
    ↓
LLM 生成回答
```

## 打包与上传

### 手动打包

```bash
# 打包为 zip，根目录包含 manifest.json
cd my-skill-plugin
zip -r ../my-skill-plugin-1.0.0.zip .
```

### 上传方式

1. **插件管理页面上传** — 点击"上传插件"，选择 zip 文件
2. **URL 导入** — 输入可直接下载的 zip 链接

上传后系统自动解压到 `backend/data/plugins/<name>/`，注册到 `plugin_extensions` 表。

### 安装与激活

上传后需两步操作：

1. **安装** — 点击"安装"按钮，标记为已安装
2. **激活** — 点击激活按钮，技能才会在对话中生效

## 在应用中使用

1. 进入**工作室** → 选择或创建应用
2. 在配置页的**技能**区段勾选需要的 skill
3. 保存配置
4. 对话时选中的 skill 才会注入（按关键字匹配）

## 完整示例：web_design

`tmp/web-design-skill/` 目录下的文件结构：

```
web-design-skill/
├── manifest.json
└── skills/
    ├── layout-principles.md
    ├── responsive-design.md
    ├── visual-hierarchy.md
    └── design-tokens.md
```

`manifest.json`：

```json
{
  "name": "web_design",
  "label": "网页设计规范",
  "version": "1.0.0",
  "category": "skill",
  "skills": {
    "layout-principles": "skills/layout-principles.md",
    "responsive-design": "skills/responsive-design.md",
    "visual-hierarchy": "skills/visual-hierarchy.md",
    "design-tokens": "skills/design-tokens.md"
  }
}
```

## 限制与注意事项

| 项目 | 说明 |
|------|------|
| 插件名 | 必须匹配 `^[a-zA-Z0-9_]{2,32}$`，无连字符 |
| skill 数量 | 建议不超过 10 个，过多影响匹配效率 |
| SKILL.md 大小 | 单个文件建议 < 10KB |
| 关键字 | 每次 PATCH 会覆盖全部，需全量提交 |
| 匹配方式 | 当前仅支持子串匹配，不支持正则 |
| 注入时机 | 仅在 chat_service.py 处理时注入，不影响其他模块 |

## API 参考

### 配置 skill 关键字

```
PATCH /api/plugins/v2/{plugin_name}/skills
Content-Type: application/json

{
  "name": "responsive-design",
  "keywords": ["响应式", "responsive", "移动端"],
  "match_mode": "keyword"
}
```

### 查询已安装的 skill

```
GET /api/plugins/v2
```

返回的 `skills_json` 字段包含每个 skill 的路径、关键字和匹配模式。

## Troubleshooting

**Q: 上传后插件列表中看不到？**
A: 检查控制台错误。常见原因：`manifest.json` 格式错误、`name` 字段不符合命名规则。

**Q: 技能没有在对话中生效？**
A: 检查：
1. 插件已安装并激活
2. 应用中已勾选该 skill
3. 如果匹配模式是 `keyword`，确认关键字在用户消息中出现（子串匹配，不区分大小写）
4. 如果匹配模式是 `always`，应每次注入

**Q: 更新了 SKILL.md 需要重新上传吗？**
A: 是。系统从 zip 包读取 SKILL.md 写入磁盘，修改文件后需重新打包上传。
