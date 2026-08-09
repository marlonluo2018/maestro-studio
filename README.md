# 🎵 Maestro Studio

> **Orchestrating AI Agents with Official CLI & SDK Engines**  
> 一款基于原厂 CLI (OpenCode, Claude Code, Codex) 与官方 SDK 驱动的桌面多智能体对话工作台应用。

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/marlonluo2018/maestro-studio)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.x-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff.svg)](https://vitejs.dev/)

---

## 🌟 核心理念 (Product Vision)

在 **Maestro Studio** 中，用户担任**“首席指挥家（Maestro）”**，直接掌控指挥棒。你可以在主界面平铺卡片或通过输入框 `@Agent` 随时自主、灵活地召唤不同的专业 Agent（如审查专家、重构专家、架构师等）开展协同工作。

1. **用户是“首席指挥家”**：平铺 Agent 卡片，支持通过输入框 `@Agent` 灵活切唤不同角色的智能体。
2. **多智能体链式闭环 (Hub-and-Spoke Manager Loop)**：指定管理者 Agent 负责规划路由，子任务完成后自动接棒给 Worker Agent，Worker 结束后自动回调给管理者做审阅与汇总。
3. **原生 CLI 引擎驱动 (CLI-First Architecture)**：统一驱动 `OpenCode CLI`、`Claude Code CLI` 和 `Codex CLI`，100% 继承用户本地在终端配置好的 MCP 服务器与 Skills 生态。
4. **Stdin 内存管道流传输 (Stdin Unified Pipeline)**：采用内存级 Stdin 管道流写入长上下文，彻底解决 Windows 8,191 字符命令行长度截断与转义 Bug。
5. **强约束交付与工作总结协议**：所有 Agent 在完成任务时均强制带上结构化的 `🔔 [交付通知]` 和 `📝 [工作总结]`，交接关系一目了然。

---

## 🚀 功能特性 (Key Features)

- 🤖 **Agent 角色与 Harness 引擎解耦**：同一个 CLI 引擎可以复用于创建多个具有不同 Prompt 与 Tag 的 Agent 角色。
- 📋 **极简表单化 Agent 管理**：采用一卡一表单设计，支持在卡片上点击 `✏️` 快捷编辑或删除角色，无重叠列表弹窗。
- ✨ **提示词元工程优化器 (Prompt Meta-Optimizer)**：在表单中提供 `✨ 优化系统提示词` 按钮，通过默认 CLI 引擎自动将粗糙想法扩写为工业级 System Prompt，并进行 Markdown 代码块物理提取与无感填充。
- 💬 **平滑流式打字与多卡片裂变**：基于 SSE 打字机流式推送，前端自动按时间线为不同的接棒 Agent 裂变独立消息卡片，绝不上串下跳。
- ⚡ **动态 Agent 工作状态指示器**：实时呈现当前后台正处于思考与工作状态的 Agent 名字（`⚡ 🤖 【老袁】 正在思考与工作...`）。
- 📝 **Shift + Enter 换行与自动下滚**：聊天输入框支持 Shift+Enter 多行换行，有新消息流时自动平滑滚动至最底部。
- 🛡️ **智能 CLI 删除保护**：删除 CLI 引擎时强校验关联 Agent，列举受影响角色并提示引导更换。

---

## 🏗️ 总体系统架构 (System Architecture)

```text
                       ┌────────────────────────┐
                       │  用户 (首席指挥家)     │
                       └───────────┬────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
      [单 Agent / 显式 @]                     [多 Agent / 协作指令]
              │                                         │
              ▼                                         ▼
    直连目标 Agent 响应                      启动 Maestro 助理 (Manager)
              │                                         │
              │                       ┌─────────────────┴─────────────────┐
              │                       ▼                                   ▼
              │                串行链路 (Pipeline)                 并行任务 (Parallel)
              │            Agent A ──► 交付物 ──► Agent B       Agent A  │  Agent B (同时运行)
              │                       │                                   │
              └───────────────────────┴───────────────────────────────────┘
                                      │
                                      ▼
               中央编排器 (Maestro Orchestrator & Stdin Pipeline)
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           ▼                          ▼                          ▼
    ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
    │ OpenCode CLI │           │Claude Code CLI│           │  Codex CLI   │
    └──────────────┘           └──────────────┘           └──────────────┘
```

---

## 🛠️ 快速开始 (Quick Start)

### 1. 环境要求
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- 系统 PATH 中已安装至少一款原厂 CLI（`opencode`, `claude`, 或 `codex`）

### 2. 安装与运行
```bash
# 1. 克隆仓库
git clone https://github.com/marlonluo2018/maestro-studio.git
cd maestro-studio

# 2. 安装依赖
npm install

# 3. 启动开发服务器 (自动启动后端 3001 端口与前端 Vite 5173 端口)
npm run dev
```

打开浏览器访问 `http://localhost:5173` 即可体验！

---

## 📁 诊断与探针工具集 (Diagnostic Toolkit)

包含在 `src/diagnostic/` 目录下，用于全量运行态能力探测与验证：

- `test-cli-live-discovery.ts`：三合一全量探针（成功抓取可用模型列表、MCP 服务器与全局 Skills）。
- `test-multi-turn-prompter.ts`：多轮会话记忆、Agent Manifest 目录与交付协议编译测试。
- `test-optimize-prompt.ts`：提示词元工程优化器三合一并发驱动测试。

运行任意探针脚本：
```bash
npx tsx src/diagnostic/test-cli-live-discovery.ts
```

---

## 📄 开源协议 (License)

本项目基于 [MIT License](LICENSE) 开源。
