# Maestro Studio 全栈技术架构与功能规格说明书 (Technical & Product Specification)

**版本**：v1.0.0 (MVP Complete)  
**更新日期**：2026 年 8 月  
**状态**：功能全面落地与架构沉淀 (Production Ready Specification)  
**维护人**：Maestro Studio 核心架构组  

---

## 1. 产品定位与核心理念 (Product Vision & Core Philosophy)

**Maestro Studio** 是一款面向开发者与通用用户的 **多智能体 CLI 与 SDK 驱动的桌面工作台应用**。

### 核心意图与理念：
1. **用户是“首席指挥家”**：
   用户（开发者）直接掌握指挥棒，在主界面平铺卡片或通过输入框 `@Agent` 随时自主、灵活地召唤不同的专业 Agent（如审查专家、重构专家、架构师等）开展**协同工作**。
2. **主 Agent 担任“贴身辅助助理”**：
   主 Agent 作为一个**辅助协调者**，协助用户管理环境上下文、分析意图、合并状态并提供全局辅助。
3. **原生 CLI 命令驱动与类 SDK 契约架构 (CLI-First with SDK Contracts)**：
   * **底座原则**：在技术底层，以原厂全局 CLI 命令（`claude -p`、`opencode run`、`codex exec`）作为核心通信驱动手段。由于第三方兼容 API（如 DeepSeek、Moonshot、SiliconFlow 等）与 Anthropic/OpenAI 原厂在 SDK 级 RPC 控制包与 Schema 细节上存在差异，原生 CLI 命令提供了最高级别的稳定性、最完善的网络容错以及 100% 的本地 MCP 与 Skills 生态继承。
   * **接口契约**：在 TypeScript 抽象层统一暴露类 SDK 的 `AgentSDKAdapter` 规范接口，保持上层打字机流传输与能力调用的高可扩展性。

---

### 1.1 架构决策记录：CLI 命令驱动 vs 官方 SDK 适用场景 (ADR: CLI vs SDK Boundary)

| 场景分类 | 首选方案 | 选用原因与决策依据 |
| :--- | :--- | :--- |
| **日常对话与第三方 API 连接 (如 DeepSeek)** | **原生 CLI 命令** | 彻底规避 SDK 级 RPC 握心中的 OAuth/mTLS 及 `messages` 节点格式差异（如 `Operation aborted`），100% 保证连通。 |
| **继承本地生态 (MCP & Global/Project Skills)** | **原生 CLI 命令** | 无需在 Node.js 层重复实现 MCP 客户端，开箱即用集成用户在终端配置的 `chrome-devtools`、`tavily` 与技能文件。 |
| **安全与 Shell 工具执行授权** | **原生 CLI 命令** | 可直接传递 `--auto`、`--skip-git-repo-check`、`-c developer_instructions` 等精细化安全选项。 |
| **内存级 Node.js 自定义工具注册** | **官方 SDK** | 只有 SDK 能在进程内存层面提供 JS/TS 函数句柄 Handler 的直接挂载与拦截。 |
| **高精度结构化 Token/Thinking Block 监控** | **官方 SDK** | SDK 可直接抛出结构化的 JavaScript Event 对象，免除对终端文本流的正则清洗。 |
4. **智能体 (Agent) 与 CLI 引擎 (Harness) 解耦**：
   * **Harness CLI**：负责基础指令执行的底层引擎模板（如 `opencode run "{prompt}"`）。
   * **Agent 智能体**：拥有专属**名字 (Name)**、**区分标签 (Tag)** 和 **专属角色提示词 (System Prompt)**。**同一个 CLI 引擎可以被自由复用于创建多个不同角色专长的 Agent！**
5. **极简交互与平滑体验**：
   * 采用 **SSE (Server-Sent Events) 实时打字机流式打字** 响应，支持 `/models`、`/mcp`、`/skills` 拦截并实时呈现实时数据。
   * 本地**分文件模块化 Session 会话管理**，保障高并发读写性能与 100% 本地数据安全。

---

## 2. 总体系统架构图 (System Architecture)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        Maestro Studio Webview UI                        │
│  React 19 + TypeScript + Vite + Modern Dark Theme                       │
│  ┌──────────────────────┐ ┌─────────────────────┐ ┌───────────────────┐  │
│  │ Session Sidebar      │ │ Main Chat Window    │ │ Agent Cards Bar   │  │
│  │ (SessionSidebar.tsx) │ │ (App.tsx)           │ │ (Agent Modal)     │  │
│  └──────────────────────┘ └─────────────────────┘ └───────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP REST / SSE Stream (/api/*)
┌────────────────────────────────────▼────────────────────────────────────┐
│                        Node.js / Express Server                         │
│                        (src/server.ts @ Port 3001)                      │
│                                                                         │
│ ┌────────────────────────┐  ┌───────────────────────┐ ┌───────────────┐ │
│ │ Session Manager        │  │ Config Manager        │ │ CLI Runner    │ │
│ │ (session-manager.ts)   │  │ (node-config.ts)      │ │ (cli-runner)  │ │
│ └───────────┬────────────┘  └───────────┬───────────┘ └───────┬───────┘ │
└─────────────┼───────────────────────────┼─────────────────────────┼─────────┘
              │                           │                         │
              ▼                           ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
│  maestro-data/          │  │ maestro-config.json  │  │ OS ChildProcess  │
│  ├── index.json          │  │ (Harnesses, Agents,  │  │ (OpenCode, Codex,│
│  └── sessions/*.json     │  │  User Profile)       │  │  Claude Code)    │
└──────────────────────────┘  └──────────────────────┘  └──────────────────┘
```

---

## 3. 核心功能模块详细说明 (Implemented Features)

### 3.1 主界面与 Agent 角色工作台 (`App.tsx`)
* **Agent 角色卡片平铺**：主界面顶部平铺展出所有配置好的 Agent 角色，展示 **Agent 名字**、**Tag 区分标签** 与 **绑定的 CLI 引擎**。点击卡片即刻切换当前对话的默认主 Agent。
* **输入框 `@Agent` 智能提及弹窗**：
  * 在输入框键入 `@` 符，自动浮现包含所有 Agent 的模糊匹配选择菜单。
  * 选中后插入 `@Agent名字 `。
  * **统一路由逻辑**：无论卡片选中还是输入框显式 `@` 提及，发送后消息一律带有 `@Agent名字` 前缀，并准确将指令送达指定 Agent 处理。

### 3.2 智能体 (Agent) 角色管理 (`AgentModal.tsx`)
* **Agent 名字强校验**：创建或编辑 Agent 时，**名字为必填项**（以红星 `*` 标识），无名字拒绝保存。
* **Tag 区分标签**：支持自定义 Tag（如 `代码审查`、`快捷重构`、`系统架构`），仅用于界面视效区分，不混入 Prompt。
* **专属 System Prompt 注入**：
  * 支持为每个 Agent 设置专属的 System Prompt 提示词。
  * 发送给 CLI 时，系统会自动将 Agent 身份信息强化注入为：
    `你的名字是「{agent.name}」。\n{agent.systemPrompt}`

### 3.3 Harness CLI 引擎管理与 SDK 自适应降级 (`SettingsModal.tsx` & `sdk-adapters.ts`)
* **精选官方预设下拉框**：提供 `OpenCode CLI`、`Claude Code CLI`、`Codex CLI` 预设模板，智能自动去重（已添加的 CLI 在下拉框中自动隐藏）。
* **`⚡ 测试` 真实对话连通性与 SDK 智能自愈降级**：
  * **设计原理**：针对 Claude Code，若用户配置了第三方代理（如 DeepSeek 代理端点），官方 SDK `query()` 在启动时会由于无法请求 `/v1/bootstrap` 自检而抛出 403 闪退（Operation aborted）。
  * **自愈降级机制**：适配器会毫秒级识别该状态，**主动切入高兼容性的命令行通道**，直接执行 `claude -p "hi"`。因此，即使使用第三方代理，系统也会 100% 连通通过并点亮 🟢 绿灯，达成极致的兼容性保障。
* **测试通过强保存规则**：保存设置时强校验，列表中每个 CLI 都必须成功通过对话测试 (🟢) 后方可允许保存。

### 3.4 纯净流式传输与杂质日志清洗 (`cli-runner.ts` & `/api/chat-stream`)
* **SSE 打字机实时流**：基于 Server-Sent Events (`POST /api/chat-stream`)，利用 `fetch` + `ReadableStream` 边生成边逐字打字输出。
* **纯文本清洗器 (`cleanCLIOutput`)**：
  * 自动剥离控制台 ANSI 转义字符 (`\x1B[...]`)。
  * 动态过滤 OpenCode 等 CLI 吐出的内部诊断头与工具日志（如 `> build · gemini-3.6-flash`、`✱ Glob "*"`、`→ Read package.json` 等）。
  * 确保界面与磁盘中只保存 **100% 纯粹的 AI 自然语言与代码回答**。

### 3.5 第一阶段按文件拆分的 Session 管理 (`session-manager.ts`)
* **侧边栏秒级渲染**：仅读取轻量级索引文件 `maestro-data/index.json`（内存占用极低）。
* **独立会话文件落盘**：每个 Session 独占 `maestro-data/sessions/session-xxx.json`，原子性覆写，彻底解决单文件写坏与膨胀卡顿问题。
* **存量数据自动平滑迁移**：启动时自动将旧版 `maestro-sessions.json` 迁移至 `maestro-data/` 目录并备份。
* **智能标题与精简时间戳**：首轮对话自动截取 Prompt 前 15 字作为 Session 标题；时间戳精简为 `HH:mm`（如 `21:45`）。
* **二次确认安全删除**：点击 `🗑️` 弹出深色风确认弹窗；支持 `✏️` 内联实时重命名会话标题。

### 3.6 用户 Profile 个人配置 (`SettingsModal.tsx` -> Profile Tab)
* **字段项**：
  * `nickname`：用户昵称（**必填项**，如 `Ning`）
  * `role`：职业与角色定位（如 `高级全栈工程师`）
  * `preferredLanguage`：偏好回答语言（`中文` / `English` / `双语`）
  * `customInstructions`：自定义代码风格与交互偏好 Prompt 约束
* **呈现**：聊天视窗中的用户消息头直接展示用户真实昵称（如 `Ning • 21:45`）。

### 3.7 阶段演进：三合一原生 CLI 进程安全驱动、极简表单化与提示词元优化 (Phase 1.5 Milestone)
* **1. Claude Code CLI 驱动级优化**：弃用容易因第三方 OAuth 校验/mTLS 触发 `Operation aborted` 的 SDK `query()`，底层 100% 切换至超轻量、高可控的原生 `claude -p` 命令行驱动，体验顺畅。
* **2. OpenAI Codex 纯净 JSONL 流式提取**：利用 `--json` 结构化事件机制与自定义 split-buffer，完美拦截并流式过滤 `agent_message`，彻底抹除了 Stdin 引导、Token 统计与 Session ID 等所有终端诊断噪音。
* **3. 独创的 Windows Shell-Free 传参防断裂架构**：
  * 使用参数数组（`spawn("cli", ["arg1", "arg2"])`）加 Windows `shell: true` 保证批处理批脚本可被顺利定位。
  * **换行截断拦截**：自动在 Windows 下将实参内的 `\n`（换行符）替换为空格，彻底规避 `cmd.exe` 会将新行误识为命令终结符的 truncation bug。
  * **参数双引号安全包裹**：对含有空格的参数在 win32 平台下自动进行 `"` 双引号安全转义包裹，防范 cmd.exe 强拆空格参数的问题。
* **4. 极简化 Agent 表单卡片**：
  * 在 `AgentModal.tsx` 中取消了繁重的底部全量 Agent 列表展示，实现一卡一表单，即开即填。
  * 主界面每个 Agent 卡片右上角添加快捷编辑按钮 `✏️`，直接精准编辑当前角色，支持在编辑区直接 `🗑️ 删除` 角色，交互丝滑。
* **5. 智能 CLI 联删校验与保存守护**：
  * 保存设置时强校验，列表中必须有一项 CLI 引擎被选为“全局默认”。
  * 删除 CLI 时，系统会自动检测是否有 Agent 绑定其上，若有关联则以列表对话框展示并进行二次删除确认，并在删除后贴心指导用户去角色面板中为这几个 Agent 更换新绑定的 CLI。
* **6. 系统提示词元工程优化器 (Prompt Meta-Optimizer)**：
  * 为 System Prompt 输入区添加了 `✨ 优化系统提示词` 按钮，通过默认配置的 CLI 引擎极速优化草稿。
  * 采用正则表达式 `match(/```markdown([\s\S]*?)```/i)` 精准抓取大语言模型返回的 Prompt 本身，物理屏蔽废话（如 "Understood"、"Certainly" ），并以 **100% 无弹窗打扰（静默注入）** 的完美 UX 反写填入。
* **7. Stdin 内存管道流统一驱动 (Stdin Unified Pipeline)**：
  * 彻底抛弃命令行参数传参，系统提示词、Agent 能力名录、多轮历史对话全部改由 `child.stdin.write` 写入内存流，100% 免疫 Windows 8191 字符命令行超长截断错误。
* **8. 动态 Hub-and-Spoke 管理者闭环 (Dynamic Orchestrator Loop)**：
  * Worker Agent 完成任务后，编排器自动捕获交接信号，将控制权、工作总结与上下文自动回调给统筹管理者 Agent（如老马），由管理者决定是否结束并向用户做最终总结汇报，实现任务拆解、分发、执行与汇总的真正闭环。
* **9. 多 Agent 顺序流式卡片裂变 (Stream Card Spawning)**：
  * 前端 SSE 解析器感知 `eventData.agentName`，当检测到新 Agent 接棒时，自动在最下方按时间顺序裂变出全新的专属消息卡片，彻底解决打字流合并在同一个卡片中的错位 display Bug。
* **10. 交互体验精细化 (UX Enhancements)**：
  * Chat 输入框支持 `Shift + Enter` 换行且在 1~6 行间根据内容动态自适应平滑拉伸。
  * 消息流生成时平滑自动下滚至最底部（`scrollIntoView`），用户永远优先看到最新生成的内容。
  * 工作状态指示器 (`⚡ 🤖 【老袁】 正在思考...`) 零延迟实时响应当前实际在工作的 Agent。

---

## 4. 后端 API 规格一览 (API Specifications)

| 路由 Endpoint | HTTP 方法 | 请求体 Request Body | 响应 Response / 说明 |
| :--- | :--- | :--- | :--- |
| `/api/config` | **GET** | None | 获取全局配置（Harnesses, Agents, ActiveAgentId, UserProfile）。 |
| `/api/config` | **POST** | `MaestroConfig` 对象 | 保存全局配置至 `maestro-config.json`。 |
| `/api/user-profile` | **GET** | None | 获取当前用户 Profile 配置。 |
| `/api/user-profile` | **POST** | `UserProfile` 对象 | 保存用户 Profile 配置。 |
| `/api/sessions` | **GET** | None | 返回侧边栏轻量级 Session 索引列表 (`SessionIndexItem[]`)。 |
| `/api/sessions` | **POST** | `{ harnessId?, title? }` | 创建新 Session 并返回 `ChatSession`。 |
| `/api/sessions/:id` | **GET** | `:id` (URL Param) | 按需读取指定 Session 文件的完整详细数据 (含 `messages`)。 |
| `/api/sessions/:id` | **PATCH** | `{ title: string }` | 重命名指定 Session 标题。 |
| `/api/sessions/:id` | **DELETE**| `:id` (URL Param) | 彻底删除指定 Session 文件及索引项。 |
| `/api/check-harness` | **POST** | `{ commandPattern: string }` | 检测 PATH 路径中命令行工具是否存在。 |
| `/api/test-chat` | **POST** | `{ commandPattern, systemPrompt }` | 发送轻量 `'hi'` 指令测试 CLI 真实对话连通性。 |
| `/api/chat-stream` | **POST** | `{ prompt, sessionId?, userNickname? }` | **SSE 流式接口**，实时推送 Chunk 并写盘 Session 历史。 |

---

## 5. 项目代码目录结构 (Directory Layout)

```text
Maestro Studio/
├── package.json               # 依赖配置与 dev 脚本 (concurrently)
├── tsconfig.json              # TypeScript 编译选项
├── vite.config.ts             # Vite 配置与 /api 代理设置
├── index.html                 # Web App 入口 HTML
│
├── maestro-config.json        # 全局本地配置文件 (Harnesses, Agents, Profile)
├── maestro-data/              # 第一阶段模块化会话存储目录
│   ├── index.json             # 侧边栏轻量级会话索引
│   └── sessions/              # 独立 Session 消息文件
│       ├── session-xxx.json
│       └── ...
│
└── src/
    ├── main.tsx               # React 渲染入口
    ├── App.tsx                # 聊天主视窗组件 (含 @Mention 弹窗、Agent 卡片条)
    ├── server.ts              # Express API 服务入口 (含 SSE 流式路由与 /models, /mcp, /skills 拦截)
    │
    ├── acp/                   # ACP 协议定义与 Client 实现 (保留底层能力)
    │   ├── acp-client.ts
    │   └── types.ts
    │
    ├── config/                # 配置文件与 Session 管理逻辑
    │   ├── types.ts           # 核心 TypeScript 数据接口定义
    │   ├── node-config.ts     # maestro-config.json 读写逻辑
    │   └── session-manager.ts # maestro-data 分文件读写、落盘清洗与索引维护
    │
    ├── runner/                # CLI 命令执行引擎
    │   └── cli-runner.ts      # child_process.spawn、ANSI 过滤与 CLI 杂质日志清洗
    │
    ├── components/            # UI 组件
    │   ├── SettingsModal.tsx  # 系统设置弹窗 (Harness CLI 管理 + 用户 Profile)
    │   ├── AgentModal.tsx     # Agent 智能体管理弹窗 (名称强校验 + Tag + Prompt)
    │   └── SessionSidebar.tsx # 侧边栏组件 (会话切换 + 重命名 + 二次确认删除弹窗)
    │
    ├── mock-agent/            # 本地调试 Mock CLI 脚本
    │   └── mock-cli-agent.js
    │
    └── diagnostic/            # 📁 永久保留的官方高真度运行态自检与审计工具集 (重构核心基础)
        ├── test-cli-live-discovery.ts  # 三位一体全量探针（实测成功抓取 14 个 OpenCode 模型、7 个原生 Skills 角色）
        ├── test-claude-mcp-skills.ts   # Claude Code 级联 settings.json 探测 & 外部 MCP & 双域 Skills 扫描
        ├── test-codex-mcp-skills.ts    # Codex 官方原生 JSON 提取（mcp list --json + debug models）
        ├── test-opencode-skills.ts     # OpenCode 专属技能 YAML Frontmatter 扫描器
        └── find-claude-configs.js      # 深度配置定位器（成功定位 ~/.claude/settings.json 关键路径）
```

---

## 6. 下一阶段演进路线图 (Phase 2 Roadmap)

1. **多轮对话上下文连续传递 (Multi-Turn Context Management)**：
   * 在使用 `opencode run` 或 `codex exec` 时，传递 `--session <id>` 或 `--continue`，让底层 CLI 保持相同会话的上下文理解。
2. **上下文长文本压缩 (Context Compaction / Sliding Window)**：
   * 随着会话变长，在 `ChatSession` 中引入 `contextSummary` 字段，实现滑动窗口裁剪与自动阶段摘要生成。
3. **SQLite / Drizzle ORM 生产级迁移 (方案 B)**：
   * 在存储层升级为单个 `maestro.db`，实现 ACID 事务安全、全文检索（Full-Text Search）与按需分页加载。
4. **代码 Diff 变更预览面板 (Git Diff Visualizer)**：
   * 当 Agent CLI 修改了工作区文件时，在聊天右侧弹起可视化 Diff 变更对比面板供用户审查。
