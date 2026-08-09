# Maestro Studio Session 会话管理架构与重构设计文档

**版本**：v1.0.0  
**状态**：已落地实现（Implementation Standard）  
**维护人**：Maestro Studio 架构组  

---

## 1. 概述 (Overview)

本文档定义了 **Maestro Studio** 内部 Session（对话会话）的生命周期、数据模型、API 接口规格以及前端组件集成范式。

Session 管理的核心目标是实现：
1. **多会话上下文隔离**：用户可以创建、切换和删除多个独立的对话窗口。
2. **本地持久化 (Persistence)**：对话历史与 Harness 运行输出自动落盘，保证应用重启或刷新后对话不丢失。
3. **智能标题归纳**：首轮对话时根据用户输入自动生成会话简短标题。

---

## 2. 数据模型与接口规格 (Data Models & Schemas)

### 2.1 消息结构 (`SessionMessage`)
```typescript
export interface SessionMessage {
  id: string;               // 唯一消息 ID (如: msg-user-1700000000000)
  sender: 'user' | 'assistant'; // 消息发送方
  text: string;             // 消息文本或 Markdown/输出内容
  timestamp: string;        // 消息发送时间 (如: "14:32:05")
  harnessName?: string;     // 响应该消息的 Harness CLI 名称 (如: "OpenCode CLI")
}
```

### 2.2 会话结构 (`ChatSession`)
```typescript
export interface ChatSession {
  id: string;               // 唯一 Session ID (如: session-1700000000000)
  title: string;            // 会话标题 (默认 "新对话"，首轮对话后自动归纳)
  createdAt: string;        // 创建时间戳
  updatedAt: string;        // 最近更新时间戳
  activeHarnessId: string;  // 创建该 Session 时绑定的默认 Harness ID
  messages: SessionMessage[]; // 该 Session 下的消息队列
}
```

### 2.3 本地落盘 JSON 格式 (`maestro-sessions.json`)
```json
[
  {
    "id": "session-1700000000000",
    "title": "写一段 JS 函数计...",
    "createdAt": "2026/8/7 21:45:00",
    "updatedAt": "2026/8/7 21:45:05",
    "activeHarnessId": "harness-opencode-default",
    "messages": [
      {
        "id": "msg-user-1700000000001",
        "sender": "user",
        "text": "写一段 JS 函数计算 1 到 100 的和",
        "timestamp": "21:45:00"
      },
      {
        "id": "msg-ast-1700000000002",
        "sender": "assistant",
        "text": "**[OpenCode CLI] 执行输出**:\n\n```javascript\nfunction sum1To100() { ... }\n```",
        "timestamp": "21:45:05",
        "harnessName": "OpenCode CLI"
      }
    ]
  }
]
```

---

## 3. 后端 API 路由规格 (Backend API Endpoints)

| HTTP 方法 | Endpoint | 参数 (Req Body / Params) | 描述 |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/sessions` | None | 获取所有历史会话列表（按 `createdAt` 降序排列）。 |
| **POST** | `/api/sessions` | `{ harnessId?: string, title?: string }` | 创建一个全新的 Session。 |
| **GET** | `/api/sessions/:id` | `:id` | 查询指定 Session 的详细信息及完整消息队列。 |
| **DELETE** | `/api/sessions/:id` | `:id` | 删除指定的 Session 及其历史落盘数据。 |
| **POST** | `/api/chat` | `{ prompt: string, sessionId?: string }` | 驱动当前 Harness 运行，并将问答自动追加至对应 `sessionId`。 |

---

## 4. 业务流程与逻辑 (Business Workflows)

### 4.1 创建与自动命名逻辑
```
[用户点击 "+ 新建对话"] ──► 发起 POST /api/sessions ──► 生成新 Session (title: "新对话")
                                                                 │
[用户发送首条 Prompt] ◄──────────────────────────────────────────┘
       │
       ├──► 执行 CLI Harness 获得回答
       └──► 追加消息，若 title 为 "新对话"，则截取 Prompt 前 15 字作为新 title，刷盘存入 maestro-sessions.json
```

---

## 5. 未来重构与扩展建议 (Future Refactoring Roadmap)

1. **持久化存储迁移（由 JSON 迁移至 SQLite / Drizzle ORM）**：
   * **当前方案**：全量 JSON 文件读写 (`maestro-sessions.json`)，适合 MVP 验证。
   * **建议重构**：当 Session 数量超过 100+ 时，建议使用 SQLite 存储，优化按需分页加载 (`offset/limit`) 性能。

2. **多轮对话上下文传递 (Context Memory for CLI)**：
   * **当前方案**：单轮 Prompt 驱动 CLI 执行。
   * **建议重构**：根据 Harness 特性（如 `opencode run --continue` 或 `codex resume`），在发送请求时自动传入当前 Session 的历史 ID，实现真实的多轮连续上下文对话。

3. **Session 导出与导入 (Export & Import)**：
   * 增加将指定 Session 导出为 `Markdown` 或 `JSON` 文件的功能，方便分享对话结果。
