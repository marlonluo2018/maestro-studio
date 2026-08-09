# Maestro Studio Phase 1 MVP 详细设计与开发指南 (MVP Design & Implementation Guide)

**版本**：v0.1.0  
**目标**：构建 MVP 极简概念验证版（主 Agent 贴身助理 + 1 个 ACP 编码 Sub-Agent 隐式调度）  

---

## 1. MVP 目标与边界 (Scope & Boundaries)

### 1.1 MVP 要做的事情
1. **单点交互界面**：提供一个类似 Chat 视窗的前端界面，用户输入自然语言需求。
2. **主 Agent 意图识别**：主 Agent 接收用户需求，判断是否需要调用 Sub-Agent 编写/修改代码。
3. **ACP 管道拉起与通信**：通过 Node.js `child_process` (STDIO) 拉起一个支持 ACP 协议的子进程 (Sub-Agent CLI)。
4. **隐式工具调用**：主 Agent 通过 ACP 发送 `session/prompt` 请求给 Sub-Agent，Sub-Agent 返回增量修改或发起 ACP 读写文件请求。
5. **结果反馈**：主 Agent 总结 Sub-Agent 的执行结果并流式回复用户。

### 1.2 MVP 暂不做的事情（Non-Goals）
* 不做复杂的多 Agent 并行树状编排（仅 1 主 Agent + 1 Sub-Agent 串行）。
* 不做复杂的账号授权与云端服务，全部本地运行。
* 暂不迁移至 Tauri (MVP 阶段优先采用 Electron / Node.js 快速验证)。

---

## 2. 软件架构设计 (Software Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│ UI / Chat Window (React + TypeScript)                                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC Bridge (Electron ContextBridge)
┌───────────────────────────────────▼────────────────────────────────────┐
│ Node.js Main Process                                                   │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Master Agent Orchestrator                                          │ │
│ │ (Vercel AI SDK Core Tool Calling Loop)                             │ │
│ └─────────────────────────┬──────────────────────────────────────────┘ │
│                           │ Calls Tool: `invoke_sub_agent`             │
│ ┌─────────────────────────▼──────────────────────────────────────────┐ │
│ │ ACP Transport Bridge (ACPClient over STDIO)                       │ │
│ └─────────────────────────┬──────────────────────────────────────────┘ │
└───────────────────────────┼────────────────────────────────────────────┘
                            │ STDIO (JSON-RPC 2.0)
┌───────────────────────────▼────────────────────────────────────────────┐
│ ACP Sub-Agent Subprocess (e.g. Mock ACP Agent / Claude-ACP-Wrapper)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 推荐项目目录结构 (Project Structure)

```text
maestro-studio-mvp/
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主进程入口
│   │   ├── master-agent.ts      # 主 Agent 推理逻辑
│   │   └── acp/
│   │       ├── acp-client.ts    # ACP JSON-RPC 2.0 Over STDIO 客户端
│   │       └── types.ts         # ACP 协议 TypeScript 接口定义
│   ├── preload/                 # Electron Preload 脚本
│   │   └── index.ts
│   └── renderer/                # React 前端渲染层
│       ├── src/
│       │   ├── App.tsx          # 聊天主界面
│       │   ├── components/      # 消息列表与输入框
│       │   └── hooks/           # Chat 状态 Hook
└── mock-agent/                  # 验证用 Mock ACP Sub-Agent CLI
    └── index.js
```

---

## 4. 核心协议与接口代码规范 (Core Specifications)

### 4.1 ACP Protocol JSON-RPC 类型定义 (`src/main/acp/types.ts`)

```typescript
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, any>;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// ACP 初始化与 Session 消息
export interface ACPInitializeParams {
  protocolVersion: string;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface ACPSessionPromptParams {
  sessionId: string;
  prompt: string;
}
```

### 4.2 ACP Transport 客户端核心实现 (`src/main/acp/acp-client.ts`)

```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { JSONRPCRequest, JSONRPCResponse } from './types';

export class ACPClient extends EventEmitter {
  private childProcess: ChildProcess | null = null;
  private requestId = 1;
  private pendingRequests = new Map<number | string, (res: JSONRPCResponse) => void>();

  constructor(private command: string, private args: string[]) {
    super();
  }

  public async start(): Promise<void> {
    this.childProcess = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    this.childProcess.stdout?.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.handleIncomingMessage(JSON.parse(line));
        }
      }
    });

    // 发送 ACP 初始化请求
    await this.request('initialize', {
      protocolVersion: '1.0.0',
      clientInfo: { name: 'MaestroStudio-Master', version: '0.1.0' }
    });
  }

  public async request(method: string, params: Record<string, any>): Promise<any> {
    const id = this.requestId++;
    const req: JSONRPCRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, (response) => {
        if (response.error) reject(new Error(response.error.message));
        else resolve(response.result);
      });

      this.childProcess?.stdin?.write(JSON.stringify(req) + '\n');
    });
  }

  private handleIncomingMessage(msg: any) {
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const resolver = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      resolver(msg);
    } else if (msg.method) {
      // 处理 Sub-Agent 发起的请求/通知（如 fs/writeTextFile 请求）
      this.emit('agent_request', msg);
    }
  }

  public stop() {
    this.childProcess?.kill();
  }
}
```

### 4.3 主 Agent 工具配置 (`src/main/master-agent.ts`)

```typescript
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { ACPClient } from './acp/acp-client';

export async function runMasterAgent(userPrompt: string, acpClient: ACPClient) {
  const result = await generateText({
    model: yourSelectedModel, // 如 openai('gpt-4o') 或 anthropic('claude-3-7-sonnet')
    system: `你是一名贴心的用户助理。用户提出任何编程任务时，你负责分析意图，并通过子 Agent 工具 (delegate_coding_task) 来分发执行，不要自己直接生成长篇大论的代码。`,
    prompt: userPrompt,
    tools: {
      delegate_coding_task: tool({
        description: '将具体的代码编写、重构或调试任务指派给底层的 ACP 编码 Sub-Agent。',
        parameters: z.object({
          subtask: z.string().describe('拆解后投递给 Sub-Agent 的具体指令')
        }),
        execute: async ({ subtask }) => {
          // 调用 ACP Sub-Agent 执行
          const response = await acpClient.request('session/prompt', {
            sessionId: 'default-session',
            prompt: subtask
          });
          return response.text || 'Sub-Agent 已完成任务。';
        }
      })
    },
    maxSteps: 3 // 允许多轮 Tool-Calling
  });

  return result.text;
}
```

---

## 5. MVP 测试与验证流程 (Verification Steps)

### 步骤 1：准备测试用的 Mock Sub-Agent
编写一个极简的 Node.js 脚本 `mock-agent/index.js` 响应 ACP 请求：
```javascript
// 模拟简单的 ACP Agent
process.stdin.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { capabilities: {} } }));
    } else if (req.method === 'session/prompt') {
      console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { text: 'Mock Sub-Agent: 代码已重构完成！' } }));
    }
  }
});
```

### 步骤 2：验证完整链路
1. 启动 Electron / App 节点。
2. 用户在 UI 输入：“帮我把 `utils.js` 重构为 TypeScript 规范”。
3. 主 Agent 捕获意图，调用 `delegate_coding_task` 工具。
4. `ACPClient` 通过 STDIO 投递 ACP 请求给 `mock-agent`。
5. `mock-agent` 返回结果，主 Agent 收到后向用户回复：“我已经安排了编码 Sub-Agent 帮您把 `utils.js` 重写为了 TypeScript 格式。”

---

## 6. Phase 1 交付检查清单 (Definition of Done)

* [ ] 项目脚手架搭设完成（Electron + React + Vite + TS）。
* [ ] 实现了可靠的 ACP JSON-RPC 2.0 Over STDIO 客户端（支持 Request / Response / Pending Map）。
* [ ] 主 Agent 能够正确识别编程类意图并触发 ACP 工具。
* [ ] 完成 Mock ACP Sub-Agent 联调测试。
* [ ] 界面流式输出正常显示对话过程。
