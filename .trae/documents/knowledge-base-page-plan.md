# 知识库页面实现计划

## 1. Summary

为当前单页应用引入 `react-router-dom`，在左侧 Sidebar 顶部菜单区域新增"知识库"入口，实现一个完整的知识库管理页面（显示在主内容区）。页面包含知识库列表展示、创建、编辑、删除，以及知识库内的文件添加/删除管理功能。

## 2. Current State Analysis

- **路由现状**：项目未使用任何路由库，`App.tsx` 直接拼接 `TitleBar` + `Sidebar` + `MainContent` + `Rightbar` 四个 section。
- **菜单现状**：`Sidebar.tsx` 顶部菜单为三个硬编码的 `<a>` 标签（新建任务、打开工作区、技能），无点击事件和路由跳转。
- **状态管理**：使用单文件 Zustand store（`useAppStore.ts`），目前仅存储 `taskGroups`、`messages`、`progressItems`、`gitChanges` 等数据，无知识库相关状态。
- **样式体系**：Tailwind CSS + Less + shadcn/ui 已就绪，主题色与 IDE 暗色风格一致。
- **组件库**：已集成 shadcn/ui（Button、Dialog、DropdownMenu、Command、Tooltip、Separator），可直接复用并按需补充 Input/Textarea 等组件。

## 3. Proposed Changes

### Phase A: 基础设施 — 路由引入与布局重构

#### 3.1 安装 react-router-dom
- **命令**：`npm install react-router-dom`
- **说明**：引入 `BrowserRouter`（或 `HashRouter`，视部署环境而定，计划默认使用 `BrowserRouter`）。

#### 3.2 创建路由入口文件
- **新建文件**：`src/router/index.tsx`
- **内容**：定义应用级路由表
  - `/` → 工作台首页（现有 MainContent 对话视图）
  - `/knowledge-base` → 知识库列表页
  - `/knowledge-base/:id` → 知识库详情页（文件管理）
- **模式**：使用 `createBrowserRouter` + `RouterProvider`（React Router v6 推荐方式）。

#### 3.3 重构 App.tsx
- **修改文件**：`src/App.tsx`
- **变更**：
  - 引入 `RouterProvider` 替代直接渲染 section。
  - 或者保留四栏布局结构，将 `MainContent` 区域替换为 `<Outlet />`，使子路由在主内容区渲染。
  - 为保持 Sidebar/TitleBar/Rightbar 在所有路由下常驻，采用 Layout Route 模式：
    ```tsx
    <div className="app">
      <TitleBar />
      <div className="layout">
        <Sidebar />
        <Outlet /> {/* 主内容区由路由决定 */}
        <Rightbar />
      </div>
    </div>
    ```

#### 3.4 重构 main.tsx
- **修改文件**：`src/main.tsx`
- **变更**：移除直接 `<App />` 渲染，改为包裹 `RouterProvider`（或直接在 App.tsx 内处理）。

### Phase B: Sidebar 菜单改造

#### 3.5 新增"知识库"菜单项
- **修改文件**：`src/sections/Sidebar/Sidebar.tsx`
- **变更**：
  - 将顶部三个硬编码 `<a>` 标签改造为使用 `react-router-dom` 的 `<NavLink>` 或 `useNavigate`。
  - 新增第四个菜单项：
    - 图标：`<Library />`（lucide-react）
    - 文字：知识库
    - 点击后导航至 `/knowledge-base`
    - 支持 active 状态高亮（与任务列表 active 样式一致）。
  - "新建任务"菜单项保持原有视觉，同时支持导航回首页 `/`。

### Phase C: 状态层扩展 — Zustand Store

#### 3.6 扩展类型定义
- **修改文件**：`src/types/index.ts`
- **新增类型**：
  ```ts
  export interface KnowledgeBaseFile {
    id: string;
    name: string;
    size: string;
    type: string;
    uploadedAt: string;
  }

  export interface KnowledgeBase {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    files: KnowledgeBaseFile[];
  }
  ```

#### 3.7 扩展 Zustand Store
- **修改文件**：`src/store/useAppStore.ts`
- **新增状态**：
  - `knowledgeBases: KnowledgeBase[]`
- **新增 Actions**：
  - `createKnowledgeBase(name, description)` → 生成 ID 并推入数组
  - `updateKnowledgeBase(id, partial)` → 按 ID 更新名称/描述
  - `deleteKnowledgeBase(id)` → 从数组移除
  - `addFileToKnowledgeBase(kbId, file)` → 向指定知识库添加文件
  - `removeFileFromKnowledgeBase(kbId, fileId)` → 从指定知识库移除文件
- **初始数据**：预置 2-3 条示例知识库数据，便于页面初次渲染即有内容。

### Phase D: 知识库页面实现

#### 3.8 创建页面组件文件

**文件列表**：
1. `src/pages/KnowledgeBase/KnowledgeBasePage.tsx` — 列表页主容器
2. `src/pages/KnowledgeBase/KnowledgeBaseList.tsx` — 知识库卡片/行列表
3. `src/pages/KnowledgeBase/KnowledgeBaseDetail.tsx` — 详情页（文件管理）
4. `src/pages/KnowledgeBase/KnowledgeBaseForm.tsx` — 创建/编辑复用表单
5. `src/pages/KnowledgeBase/KnowledgeBasePage.less` — 页面级 Less（如有需要）

#### 3.9 知识库列表页（`/knowledge-base`）
- **布局**：主内容区顶部标题栏（"知识库" + 新建按钮）+ 下方列表。
- **列表项**：每行/卡片展示知识库名称、描述、文件数量、创建时间。
- **操作按钮**：
  - 点击进入详情 `/knowledge-base/:id`
  - 编辑按钮 → 弹出 Dialog 表单
  - 删除按钮 → 确认后删除（使用 shadcn Dialog 确认）
- **新建按钮**：固定在右上角，点击打开创建 Dialog。
- **空状态**：当知识库为空时展示引导文案 + 新建入口。

#### 3.10 知识库详情页（`/knowledge-base/:id`）
- **布局**：顶部面包屑（知识库 > 名称）+ 返回按钮，下方分左右两栏或上下结构。
- **左侧/上方**：知识库元信息（名称、描述、创建时间、文件统计）。
- **右侧/下方**：文件列表
  - 表头：文件名、类型、大小、上传时间、操作
  - 操作列：删除按钮
  - 底部/顶部："添加文件"按钮（模拟上传，弹窗选择文件后推入 store）。
- **编辑入口**：在元信息区域提供编辑按钮，打开与列表页复用的编辑 Dialog。

#### 3.11 创建/编辑 Dialog
- **组件**：基于 shadcn/ui `Dialog` + `Button` + 自建/补充的 `Input`、`Textarea`、`Label`。
- **字段**：
  - 名称（Input，必填）
  - 描述（Textarea，选填）
- **行为**：
  - 创建：提交后生成新 ID，推入 store，关闭弹窗，列表自动刷新。
  - 编辑：预填充当前数据，提交后更新 store。

#### 3.12 安装/补充 shadcn 组件（按需）
- 若项目当前缺少 `Input`、`Label`、`Textarea`、`Card` 等基础组件，可通过 `npx shadcn@latest add input label textarea card` 安装。
- **主题适配**：安装后需将默认颜色从 `oklch()` 替换为项目 Tailwind token（参照已有 button/dialog 的改造模式）。

### Phase E: 样式与交互细节

#### 3.13 视觉一致性
- 列表项 hover 背景使用 `hover:bg-bg-hover`
- 卡片/面板背景使用 `bg-bg-2` 或 `bg-bg-3`，边框 `border-border`
- 文字层级：`text-text`（主标题）、`text-text-dim`（描述）、`text-text-mute`（时间/统计）
- 按钮尺寸参考项目现有 `Chip` 和 `IconButton` 规格
- 弹窗圆角保持 `rounded-xl`

#### 3.14 响应式
- 列表页在桌面端为常规列表/卡片网格
- 详情页文件列表保持横向滚动适应性
- 保持与现有 App.less 中断点一致（<1024px 隐藏 Rightbar，<768px 单列）

## 4. Assumptions & Decisions

1. **路由库选择**：使用 `react-router-dom@6` 的 `createBrowserRouter` + `RouterProvider`，因其为 React 生态标准方案，与 Vite 无冲突。
2. **布局模式**：采用 Layout Route，Sidebar/TitleBar/Rightbar 常驻，仅主内容区随路由变化。这样最贴近用户"显示在主内容区"的期望。
3. **文件上传模拟**：由于纯前端项目无后端，"添加文件"仅将文件元信息（name、size、type、uploadedAt）写入 Zustand store，不做真实文件上传。
4. **状态持久化**：本次不做 localStorage 持久化，刷新页面后知识库数据回到初始示例状态。如需持久化可在后续迭代中补充。
5. **shadcn 主题化**：新安装的 shadcn 组件（如 Input）默认可能带有 `oklch()` 颜色，安装后需手动替换为项目 Tailwind colors token，保持深色 IDE 风格一致。
6. **Rightbar 内容**：在知识库页面下，Rightbar 保持现有 Git/Goal/Progress 内容不变（或后续可扩展为显示当前知识库统计）。

## 5. Verification Steps

1. `npm run check`（tsc --noEmit）无类型错误。
2. `npm run build`（vite build）成功产出 dist。
3. 浏览器验证：
   - 点击 Sidebar "知识库" 菜单 → 主内容区切换到知识库列表页。
   - 列表页显示示例数据，hover 效果正常。
   - 点击"新建" → Dialog 弹出，填写名称描述后提交 → 列表新增项。
   - 点击列表项 → 进入详情页，显示文件列表。
   - 在详情页点击"添加文件" → 文件出现在列表中。
   - 点击删除文件 → 文件从列表移除。
   - 点击编辑 → Dialog 预填充数据，提交后列表/详情同步更新。
   - 点击"新建任务" → 回到首页工作台对话视图。
