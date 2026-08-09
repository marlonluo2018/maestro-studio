# Maestro Studio 多智能体协同与交付工作流规格说明书 (Multi-Agent Collaboration Spec)

**版本**：v1.1.0  
**更新日期**：2026 年 8 月  
**状态**：设计已批准（Approved - Ready for Implementation）  
**维护人**：Ning & Maestro Studio 架构组  

---

## 1. 核心业务价值与目标 (Vision)

在 Maestro Studio 中，Session 会话不仅仅是一个静态的对话框，而是一个**多智能体（Multi-Agent）实时协作空间**。
我们的核心设计目标是：
1. **用户主导（Conductor-First）**：用户处于“首席指挥家”位置，灵活控制任务发起、工作计划审批与分派。
2. **多角色协同（Orchestration）**：各专业 Agent（如老马、老罗）在同一会话中共享工作区、感知彼此、互审计划，以串行流水线（Pipeline）或并行（Parallel）模式各显神通。
3. **闭环交付（Traceable Delivery）**：Agent 之间的工作流转必须附带标准的工作总结，并以显式的三方 `@` 标签完成通知流转。

---

## 2. 核心架构设计 (Core Architecture)

### 2.1 全局 Agent 能力互审 (Agent Directory Ingestion)
为了让担任管理、审计或规划职责的 Agent 能够精准分派任务，系统在启动多 Agent 协作时，会将**全量 Agent 注册清单（Agent Manifest）**自动注入给执行模型：

```markdown
[系统可用 Agent 角色与能力目录 (Agent Manifest)]:
- 角色 ID: agent-opencode-reviewer
  名字: 老马 (OpenCode 审查专家)
  绑定的 CLI: OpenCode CLI | 标签: 代码审查
  能力人设: 请重点审查代码中的潜在 Bug、规范性与可读性。
- 角色 ID: agent-codex-arch
  名字: 老罗 (Codex 架构工程师)
  绑定的 CLI: Codex CLI | 标签: 系统架构
  能力人设: 请关注代码架构设计、类型安全与扩展性。
```

---

## 3. 工作计划 (Work Plan) 生成、审查与确认流

系统天然支持以下三种极其灵活的协作路径：

### 3.1 模式 A：指定 Agent 担任管理者 (Agent-as-Manager)
* **用户指令**：`@老马 你来负责这个工作：重构 src/runner 并完成编译验证`。
* **执行步骤**：
  1. `老马` 接收任务，感知 Agent 能力目录。
  2. 生成结构化 JSON 级 `WorkPlan`（包含子任务列表、推荐分配人、执行顺序等）。
  3. UI 渲染交互式 **`📋 协作计划卡片`**，并提供 `[✅ 批准并分发]` 按钮。
  4. 用户点击同意后，系统按顺序驱动各 CLI Agent 执行。

### 3.2 模式 B：用户自带工作计划 (User-Provided Work Plan with Review)
* **用户指令**：`@老马 这是我的计划：1.你来审查 src/server 2.让老罗来做模块解耦。你看可行吗？`。
* **执行步骤**：
  1. `老马` 接收用户的计划，针对可行性、Agent 能力匹配度、缺失项进行智能审查。
  2. 返回建议（如：“建议在步骤 1 后，先由 OpenCode 快速编码员进行接口重修，然后再由老罗重构”）。
  3. 用户点击 **`[✅ 确认并分配]`** 锁定最终计划并分派执行。

### 3.3 模式 C：规划与管理解耦 (Decoupled Planning & Managing)
* **用户指令**：`@老罗 帮我出一份重构方案和分工计划。`
* **执行步骤**：
  1. `老罗` 生成方案与计划表。
  2. 用户在 UI 上浏览并确认计划。
  3. 用户通过下拉选项指派 `@老马` 作为该计划后续的 **管理执行官 (Managing Agent)** 负责监督和流水线跟进。

---

## 4. 强约束交付通知协议 (Delivery & Notification Protocol)

当任意 Agent 完成其分配的任务时，其输出内容的最上方必须强制带有标准的**通知头**，指明协作关系并提供清晰工作总结：

```markdown
🔔 [交付通知]
• 👤 @用户: @Ning (通知人称呼)
• 👑 @管理者: @老马 (通知任务分派者/管理者)
• 🎯 @下一个接收Agent: @老罗 (指示下一阶段执行者，终点则为 @无)

📝 [工作总结]
1. 交付产物: 已经完成对 src/components/AgentModal.tsx 的表单极简化改造。
2. 物理变更: 重写了 1 个 React 文件，完成了 unused vars 的清理。
3. 验证结果: 全局运行 npm run build 与 npx tsc，全部 100% 成功通过。

💬 [交付给下一阶段的补充说明]
请老罗关注该表单接收 targetAgentId 进行回显的扩展能力，在其上进行进一步的架构设计。
```

---

## 5. 存储与数据结构设计 (Data Structures)

### 5.1 协作计划与子任务定义 (`src/config/types.ts`)
```typescript
export interface WorkPlanTask {
  id: string;
  title: string;           // 子任务名称
  assignedAgentId: string; // 被分配的 Agent ID
  assignedAgentName: string; // 被分配的 Agent 名字
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  output?: string;         // 执行后输出总结
}

export interface WorkPlan {
  id: string;
  title: string;
  managerAgentId: string;  // 负责统筹的管理 Agent
  tasks: WorkPlanTask[];
  status: 'draft' | 'approved' | 'active' | 'completed';
}

export interface ChatSession {
  // ... 现有属性
  managerAgentId?: string; // 当前会话的统筹管理者
  activePlan?: WorkPlan;   // 会话当前执行中的计划
}
```

### 5.2 交付通知元数据 (`src/config/types.ts`)
```typescript
export interface DeliverableMeta {
  targetUser: string;
  managerAgentName: string;
  nextAgentName: string;
  summaryPoints: string[];
}

export interface SessionMessage {
  // ... 现有属性
  deliverable?: DeliverableMeta; // 结构化交付物
}
```

---

## 6. UI & 交互设计 (UI/UX)

1. **工作计划树组件 (`WorkPlanCard.tsx`)**：
   在聊天窗口中，以精美的垂直进度树（Timeline）实时展示 `WorkPlan` 中各步骤的进行状态（ pending、in-progress、completed ），点击步骤可以直接查看该 Agent 产生的交付物细节。
2. **多 Agent 实时并行打字流**：
   在并行模式下，聊天窗底部裂变出多栏，`OpenCode` 和 `Codex` 在各自的分栏里进行流式输出，互不干扰，提供极具视觉冲击力的并行感官。
3. **通知高亮**：
   通过自定义 Markdown 渲染器，对文本中以 `@用户昵称`、`@管理者`、`@下一个接收Agent` 开头的词进行卡片级的高亮渲染（绿/蓝/紫三色高亮），提示链路的流动方向。

---

## 7. 实施路线图 (Implementation Roadmap)

1. **Step 1**: 在 `types.ts` 和 `session-manager.ts` 中实现 WorkPlan / Deliverable 的数据类型和 Session 落盘扩展。
2. **Step 2**: 升级 `src/server.ts` 的 Prompter，自动检测并动态在输入中拼装 **`Agent Manifest目录`** 供 Manager Agent 互审。
3. **Step 3**: 升级 Prompter 约束规范，强制 CLI 引擎输出带有标准 `🔔 [交付通知]` 和 `📝 [工作总结]` 的头信息。
4. **Step 4**: 编写 `WorkPlanCard.tsx` React 组件，支持在前端展示步骤并提供「确认并分发」按钮。
5. **Step 5**: 实现前端多 Agent 实时并行流分栏展示。
