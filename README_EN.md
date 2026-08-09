# 🎵 Maestro Studio

> **Orchestrating AI Agents with Official CLI & SDK Engines**  
> A desktop multi-agent workspace powered by native CLI engines (OpenCode, Claude Code, Codex) and official SDK adapters.

[ 🇨🇳 中文文档 ](README_ZH.md) | [ 🇺🇸 English ](README.md)

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/marlonluo2018/maestro-studio)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.x-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff.svg)](https://vitejs.dev/)

---

## 🌟 Core Vision

In **Maestro Studio**, the user acts as the **"Conductor (Maestro)"**, taking full charge of the orchestration wand. You can view agent cards side-by-side or invoke specialized agents (such as Code Reviewers, Refactoring Experts, System Architects) anytime using `@Agent` mentions.

1. **User as the Conductor**: View agent cards side-by-side and invoke specialized agents flexibly using `@Agent` mentions.
2. **Dynamic Hub-and-Spoke Manager Loop**: Designate a Manager Agent to decompose tasks and route work. Once a Worker Agent completes its sub-task, control is automatically handed back to the Manager Agent for review and final summary.
3. **CLI-First Architecture**: Natively drives `OpenCode CLI`, `Claude Code CLI`, and `Codex CLI`, inheriting 100% of the user's local MCP servers and Skills ecosystem configured in the terminal.
4. **Stdin Unified Memory Pipeline**: Ingests multi-turn dialogue history and Agent Manifest directories via memory-level Stdin streams, completely bypassing Windows 8,191-character command-line length limits.
5. **Mandatory Delivery & Work Summary Protocol**: Forces every agent to output a structured `🔔 [Delivery Notice]` and `📝 [Work Summary]`, making handoffs transparent and traceable.

---

## 🚀 Key Features

- 🤖 **Decoupled Agents & Harness Engines**: A single CLI engine can be reused across multiple Agent roles with custom System Prompts and Tags.
- 📋 **Form-Only Agent Management**: Compact, single-form Add and Edit popups with inline `✏️` edit buttons on agent cards.
- ✨ **Prompt Meta-Optimizer**: One-click `✨ Optimize System Prompt` button that uses the default CLI engine to expand rough ideas into structured, production-ready system prompts.
- 💬 **Smooth Stream Rendering & Card Spawning**: SSE typewriter streaming that dynamically spawns new message cards sequentially as different agents take over.
- ⚡ **Real-Time Agent Working Status Banner**: Displays which agent is actively thinking and executing in real-time (`⚡ 🤖 【Lao Yuan】 is thinking and working...`).
- 📝 **Shift + Enter Multiline Input & Auto-Scroll**: Supports Shift+Enter multiline text input with auto-growing textarea rows and smooth `scrollIntoView` auto-scrolling.
- 🛡️ **Smart CLI Delete Guard**: Validates agent dependencies when deleting a CLI engine and guides users to reassign their agents safely.

---

## 🏗️ System Architecture

```text
                       ┌────────────────────────┐
                       │  User (The Conductor)  │
                       └───────────┬────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
      [Single Agent / @Mention]              [Multi-Agent Work Plan]
              │                                         │
              ▼                                         ▼
    Direct Agent Response                   Invoke Manager Agent
              │                                         │
              │                       ┌─────────────────┴─────────────────┐
              │                       ▼                                   ▼
              │              Sequential Pipeline                   Parallel Tasks
              │            Agent A ──► Deliverable ──► Agent B     Agent A  │  Agent B
              │                       │                                   │
              └───────────────────────┴───────────────────────────────────┘
                                      │
                                      ▼
               Maestro Orchestrator (Stdin Memory Pipeline)
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           ▼                          ▼                          ▼
    ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
    │ OpenCode CLI │           │Claude Code CLI│           │  Codex CLI   │
    └──────────────┘           └──────────────┘           └──────────────┘
```

---

## 🛠️ Quick Start

### 1. Requirements
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- At least one native CLI installed in system PATH (`opencode`, `claude`, or `codex`)

### 2. Installation & Run
```bash
# 1. Clone repository
git clone https://github.com/marlonluo2018/maestro-studio.git
cd maestro-studio

# 2. Install dependencies
npm install

# 3. Start development server (boots backend on 3001 & Vite on 5173 concurrently)
npm run dev
```

Open your browser at `http://localhost:5173` to get started!

---

## 📁 Diagnostic Toolkit

Located under `src/diagnostic/` for full runtime discovery and verification:

- `test-cli-live-discovery.ts`: Live discovery probe (scans models, MCP servers, and global skills across all 3 CLIs).
- `test-multi-turn-prompter.ts`: Verifies multi-turn memory compilation, Agent Manifest ingestion, and deliverable parsing.
- `test-optimize-prompt.ts`: Tests prompt meta-optimizer execution across engines.

Run any probe script:
```bash
npx tsx src/diagnostic/test-cli-live-discovery.ts
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
