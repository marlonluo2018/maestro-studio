# 基于 ACP 协议的智能体编排桌面应用 (Maestro Studio) 技术架构文档

**版本**：v1.0.0  
**状态**：架构方案（Design Phase）  
**拟定人**：系统架构师  

---

## 1. 系统概述 (System Overview)

本系统旨在打造一款面向通用用户的**双层架构 AI 助手应用 —— Maestro Studio**。系统采用“贴身主 Agent + ACP 隐式编排 Sub-Agent”模式，屏蔽底层多 Agent 协作与原厂 Harness 配置的复杂性。

* **用户层**：保持单点自然语言交互界面，由主 Agent 担任助理，负责接收用户意图、需求拆解、任务派发与最终结果汇总。
* **编排与执行层**：基于 **Agent Client Protocol (ACP)** 标准协议，将主 Agent 赋予 ACP Client (Orchestrator) 职能，动态拉起、调度与审计独立运行的原厂 Sub-Agent（ACP Servers）。

---

## 2. 总体架构图 (Architecture Overview)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           Client / UI Layer                               │
│  React 19 + TypeScript + Tailwind CSS + Shadcn UI (Tauri 2.0 Webview)     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ IPC / Event Bridge
┌─────────────────────────────────────▼─────────────────────────────────────┐
│                       Core Host / Desktop Runtime                         │
│                           Tauri 2.0 Core (Rust)                           │
│  ┌──────────────────────────┐             ┌────────────────────────────┐  │
│  │ Workspace & File System  │             │  ACP Subprocess Manager    │  │
│  │ Authorization & Diff Aud │             │  (STDIO / JSON-RPC Transport│  │
│  └─────────────▲────────────┘             └──────────────┬─────────────┘  │
└────────────────┼─────────────────────────────────────────┼────────────────┘
                 │ Inter-Process Operations                │ ACP Protocol (JSON-RPC 2.0)
┌────────────────┴─────────────────────────────────────────▼────────────────┐
│                       Master Agent Orchestrator Engine                    │
│  - User Assistant Tool Loop (Vercel AI SDK Core / LangGraph)               │
│  - Task Decomposition & Routing Engine                                    │
│  - Standard ACP Tool Wrapper                                              │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ Invokes / Manages
       ┌──────────────────────────────┼──────────────────────────────┐
       ▼                              ▼                              ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│  Sub-Agent A │              │  Sub-Agent B │              │  Sub-Agent C │
│ (Claude Code)│              │  (Goose/OAI) │              │(Custom Agent)│
└──────────────┘              └──────────────┘              └──────────────┘
```

---

## 3. 技术选型 (Technology Stack)

### 3.1 核心技术栈矩阵

| 模块 | 技术选型 | 版本/规范 | 选型依据 |
| :--- | :--- | :--- | :--- |
| **应用宿主 (Desktop Host)** | **Tauri** | 2.x (Rust) | 低内存占用（~30MB），出色的本地 CLI 子进程调度能力，高度安全的沙箱与文件控制权限。 |
| **前端框架 (Frontend)** | **React + TypeScript** | 19.x / 5.x | 生态丰富、响应式交互优异，便于构建复杂的消息流与任务进度树。 |
| **样式与组件库 (UI/UX)** | **Tailwind CSS + Shadcn UI** | Latest | 提供现代、极简、高性能的桌面 UI 体验。 |
| **状态管理 (State Management)** | **Zustand** | 5.x | 状态收敛简单，无过度重渲染，适合管理 Agent 消息队列与多线程任务流。 |
| **主 Agent 引擎 (Master Engine)** | **Vercel AI SDK Core** | 4.x | 统一抽象大语言模型流式输出与 Tool Calling 机制，支持轻量级 Loop 控制。 |
| **通信协议 (Protocol Standard)** | **Agent Client Protocol (ACP)** | v1.0 Standard | 基于 JSON-RPC 2.0 规格，标准解耦 Client（主 Agent/IDE）与 Agent（Sub-Agents）。 |
| **持久化存储 (Local Database)** | **SQLite + Drizzle ORM** | Latest | 本地快速读取会话历史、工作区索引与配置 Preset，保证数据隐私。 |

---

## 4. 核心通信与协议设计 (ACP Integration Design)

### 4.1 通信链路 (Transport)
主 Agent (Client) 与 Sub-Agents (Server) 之间优先采用 **STDIO (Standard Input/Output) JSON-RPC 2.0** 进行进程间通信：
* 主进程通过 Rust / Node.js 拉起 Sub-Agent CLI 进程。
* 消息格式严格遵守 ACP JSON-RPC 2.0 规范，分为 `Methods` (请求-响应) 和 `Notifications` (单向事件)。

### 4.2 消息标准流 (Sequence Flow)

```
User           Master Agent (Client)         Rust Host             Sub-Agent (ACP Server)
 │                     │                         │                           │
 ├─── Natural Prompt ──►                         │                           │
 │                     ├─── 1. Task Decompose ───►                           │
 │                     ├─── 2. Spawn Agent ─────► Spawn Subprocess ─────────►│
 │                     │                         │◄── Establish ACP STDIO ───┤
 │                     ├─── 3. ACP method: initialize ──────────────────────►│
 │                     │◄── ACP result: capabilities ────────────────────────┤
 │                     │                                                     │
 │                     ├─── 4. ACP method: session/prompt ──────────────────►│
 │                     │    (e.g., "Refactor module X")                      │
 │                     │                                                     │
 │                     │◄── 5. ACP method: fs/writeTextFile (Request) ───────┤
 │                     ├─── 6. Security Check & Audit ──────────────────────►│
 │                     ├─── 7. ACP result: Permission Granted ──────────────►│
 │                     │                                                     │
 │                     │◄── 8. ACP Notification: status/update ──────────────┤
 │◄── Streaming UI ────┤                                                     │
```

---

## 5. 主 Agent 编排引擎机制 (Orchestration Engine)

### 5.1 职责分工
1. **意图拆解与派发 (Planning & Dispatch)**：
   将复杂的天然语言任务，转化为针对各能力子项 ACP Sub-Agent 的规范调用序列（支持串行依赖或并行派发）。
2. **上下文隔离与状态维护 (Context Boundary)**：
   负责为每个 Sub-Agent 构造清晰、最小化的 Task-Scope Context，避免全局 Context 污染与 Token 浪费。
3. **隐式权限审核 (Invisible Permission Control)**：
   代理用户审核 Sub-Agent 提起的危险操作请求（如高危文件修改、Shell 命令执行），若超出安全预设才弹窗提示用户。

### 5.2 主 Agent 工具集接口 (Internal Agent Tools Protocol)
主 Agent 拥有一套标准化的 ACP 工具暴露给其推理 Loop：

```typescript
// 主 Agent 内置调度的标准 Tool 结构定义
export interface ACPOperations {
  // 唤醒/获取符合特定能力的 Sub-Agent 节点
  acquireAgent(capability: 'coding' | 'testing' | 'linting' | 'review'): Promise<string>;
  
  // 向指定 Sub-Agent 投递 ACP 级 Prompt 任务
  dispatchTask(agentId: string, instruction: string, contextFiles?: string[]): Promise<ACPResult>;
  
  // 查询 Sub-Agent 运行状态与增量 Diff
  getAgentStatus(agentId: string): Promise<AgentTaskProgress>;
  
  // 终止或复位指定 Sub-Agent
  terminateAgent(agentId: string): Promise<void>;
}
```

---

## 6. 安全与文件审计模型 (Security & File Model)

1. **工作区隔离 (Workspace Sandboxing)**：
   Sub-Agent 无法直接绕过 Host 操作文件。读写文件与命令执行需通过 ACP `fs/readTextFile`, `fs/writeTextFile`, `terminal/create` 提权请求，由 Rust Core 统一执行与审计。
2. **虚拟 Diff 预览 (Virtual Git Diff)**：
   Sub-Agent 产生的所有文件变更先写入暂存区/内存 Diff 树，由主 Agent 汇总展现增量修改面板，用户确认无误后再同步刷盘。

---

## 7. 分阶段实施路线图 (Implementation Roadmap)

### Phase 1: MVP 概念验证（单机极简版）
* **目标**：验证“主 Agent + 单 ACP Sub-Agent”连通性。
* **交付物**：基于 Electron/Tauri + React 构建对话主界面，实现主 Agent 识别意图后通过 ACP (STDIO) 唤醒 1 个本地 ACP Agent 完成代码修改。

### Phase 2: 多 Agent 动态编排与预设库
* **目标**：支持多 Sub-Agent 协同与零配置开箱即用。
* **交付物**：引入任务编排树可视化、内置 3+ 常见场景 Sub-Agent 预设（代码生成、单元测试、语法检查），实现多节点任务流水线调度。

### Phase 3: 性能优化与生态扩展
* **目标**：优化桌面端性能，提供开放式 ACP Plugin 机制。
* **交付物**：全面迁移至 Tauri 2.0 (Rust)，开放用户自建/接入任意符合 ACP 规范的第三方 Agent 接口。
