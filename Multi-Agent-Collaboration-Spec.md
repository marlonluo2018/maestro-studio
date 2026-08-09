# Maestro Studio 多智能体协同与交付工作流规格说明书 (Multi-Agent Collaboration Spec)

**版本**：v1.2.0  
**更新日期**：2026 年 8 月  
**状态**：核心机制已落地并验证 (Production Implemented & Tested)  
**维护人**：Ning & Maestro Studio 架构组  

---

## 1. 核心业务价值与目标 (Vision)

在 Maestro Studio 中，Session 会话是一个**多智能体（Multi-Agent）实时协作空间**。
我们的核心设计目标是：
1. **用户主导（Conductor-First）**：用户处于“首席指挥家”位置，控制任务发起、工作计划审批与分派。
2. **多角色协同（Orchestration）**：各专业 Agent（如老马、老罗、老李）在同一会话中共享工作区、感知彼此、互相交接，以串行流水线（Pipeline）或并行（Parallel）模式各显神通。
3. **闭环交付（Traceable Delivery）**：Agent 之间的工作流转必须附带标准的工作总结，并以显式的三方 `@` 标签完成通知流转。

---

## 2. Session 内消息传递与上下文组装机制 (In-Session Message Passing)

系统在后台（`src/server.ts`）收发消息时，采用**“双层级联组装 + Stdin 内存管道”**模式投递给 CLI Agent：

### 2.1 系统级人设与环境组装 (`agentIdentityPrompt`)
在发送给 CLI 引擎时，系统在系统指令（System Prompt）中动态融合三大部分：
1. **Agent 本身人设**：`你的名字是「${activeAgent.name}」。\n${activeAgent.systemPrompt}`。
2. **管理者专属天眼名录 (`Agent Manifest`)**：仅当当前 Agent 扮演管理者（Manager）角色时注入，包含全系统所有已注册 Agent 的名字、ID、标签、绑定 CLI 及能力描述。
3. **强约束交付与交接协议 (`Delivery Protocol`)**：强校验输出格式（`🔔 [交付通知]` 与 `📝 [工作总结]`）。

### 2.2 用户输入与滑动窗口记忆组装 (`finalPromptWithContext`)
1. **滑动窗口历史记忆 (`getFormattedSessionContext`)**：
   从 `maestro-data/sessions/session-xxx.json` 中自动读取最近 `N` 轮问答（默认 4~8 条），格式化为统一的 `--- [历史对话上下文 - 记忆] ---` 块。
2. **当前用户新指令**：追加在历史记忆下方送入。

### 2.3 Stdin 内存管道传输 (Stdin Unified Pipeline)
为了彻底解决 Windows 系统 `cmd.exe` 下 **8,191 字符命令行长度上限（The command line is too long）** 与换行符截断 Bug，所有系统人设、能力名录、多轮历史对话与用户指令全部通过 Node.js 进程内存流写入：
```typescript
const exeName = os.platform() === "win32" ? "claude.cmd" : "claude";
const child = spawn(exeName, [], { shell: true, env: process.env });

child.stdin?.write(fullPromptWithContextAndSystem);
child.stdin?.end();
```
* **优势**：100% 免疫参数超长截断、引号破坏和字符集乱码，支持无限长上下文流式传输！

---

## 3. 管理者 Agent (Manager) 动态调度与闭环机制 (Orchestration Loop)

### 3.1 动态 Hub-and-Spoke 管理者闭环流
在多 Agent 协同流转中，系统的中央编排器（Orchestrator）运行**动态星型管理闭环**：

```text
               ┌────────────────────────┐
               │   用户 (首席指挥家)     │
               └───────────┬────────────┘
                           │ 1. 下达指令 (@老马 让老袁...)
                           ▼
               ┌────────────────────────┐
               │   管理者 Agent (老马)   │ ◄─────────────────────┐
               └───────────┬────────────┘                       │
                           │ 2. 路由分发 (@下一个接收Agent: @老袁)│
                           ▼                                    │
               ┌────────────────────────┐                       │ 4. 交付物回调
               │    Worker Agent (老袁) │ ──────────────────────┘
               └────────────────────────┘  (指定 @下一个接收Agent: @无)
```

1. **管理者发号施令**：用户指定 `@老马`（Manager），老马分析意图，制定计划并指定 `@下一个接收Agent: @老袁`。
2. **角色分工硬性准则 (Role Separation Rule)**：
   * 当 Agent 指定了下一个接收 Agent（即 `@下一个接收Agent` 不是 `@无`），说明其此时扮演【分发者/管理者】。
   * **管理者严禁自己动手执行具体脏活累活**（如不亲自翻译或写具体代码），其回复仅包含分发规划与交接说明。
3. ** Worker 接棒执行**：编排器自动捕获交接信号，启动 `老袁`（Worker）。老袁专注执行具体任务（如 WBS 任务拆解），完成后设定 `@下一个接收Agent: @无`。
4. **自动返回管理者做审阅与终终总结**：
   * 编排器检测到 Worker（老袁）完成且 `@下一个接收Agent` 为 `@无`，**自动将控制权与老袁的成果回调给管理者（老马）**！
   * 老马审阅老袁的成果：若全部完成，向用户做最终总结汇报（将 `@下一个接收Agent` 设为 `@无`）；若还有下一步，指派下一个 Worker（如 `@老李`）继续执行！

---

## 4. 权限隔离与能力边界 (Capability Boundaries)

为防止 Worker 节点 Prompt 膨胀并保持职责纯粹：
- **管理者 Agent (Manager)**：**注入 Agent Manifest**。拥有全局天眼，清楚知道所有队友的名字与专长，负责路由分发。
- **执行者 Agent (Worker)**：**不注入 Agent Manifest**。不被其他 Agent 细节打扰，Token 消耗小，100% 专注完成具体的代码或翻译任务。

---

## 5. 强约束交付通知协议规范 (Delivery Protocol)

```markdown
=== [MANDATORY DELIVERABLE & WORK SUMMARY PROTOCOL] ===
When you complete your assigned task, you MUST format your output with this EXACT structured section at the very top of your response:

🔔 [交付通知]
• 👤 @用户: @${userNicknameToUse}
• 👑 @管理者: @${managerName}
• 🎯 @下一个接收Agent: [下一阶段接收任务的 Agent 名字, 例如 @老罗, 或 @无 if this is the final step]

📝 [工作总结]
1. 交付产物: [简述交付的文件、功能或分析报告]
2. 物理变更: [列出修改或创建的文件路径、执行的命令]
3. 验证结果: [编译、Lint 校验或测试结果，如 "Vite build 100% 成功"]

💬 [交付给下一阶段 Agent 的补充说明]
[提供给下个接收角色的交接注释、风格偏好或重点关注项]

=======================================================
```

---

## 6. 前端流式卡片裂变与无感渲染 (UI Stream Rendering)

1. **按 Agent 身份顺序裂变卡片**：
   前端在接收 SSE 打字流时，检查 `eventData.agentName`。当检测到流中出现了新 Agent（如老马交棒给老老罗，或老袁完成后回调给老马）时，**自动在视窗最下方裂变并生成一张属于该 Agent 的全新消息卡片**，绝对不把不同 Agent 的回复混在同一张卡片里。
2. **隐藏中间合成废话**：
   编排器在后台接棒时，**不向聊天流中写入任何虚假或合成的用户消息**。聊天界面保持 100% 纯粹的用户原消息与各 Agent 独立真实的解答卡片。
3. **毫秒级工作指示器**：
   界面底部的 `⚡ 🤖 【老袁】 正在思考与工作...` 状态指示器，根据 SSE 事件流中的 `activeAgentName` 标记在毫秒级内无延迟响应切换。
4. **自适应输入与自动下滚**：
   * Chat `<textarea>` 输入框支持 `Shift + Enter` 换行，并在 1~6 行间根据内容动态自适应平滑拉伸。
   * 新消息流或新卡片生成时，视窗通过 `scrollIntoView` 自动平滑滚动至最底部。
