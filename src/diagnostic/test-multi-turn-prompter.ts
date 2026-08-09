import { loadConfig } from "../config/node-config.js";
import { getFormattedSessionContext, parseDeliverableText, appendMessageToSession } from "../config/session-manager.js";
import { WorkPlan, SessionMessage } from "../config/types.js";
import fs from "fs";
import path from "path";

// Mock a test session file
const DATA_DIR = path.resolve(process.cwd(), 'maestro-data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const TEST_SESSION_ID = "session-test-multi-turn";
const TEST_SESSION_FILE = path.join(SESSIONS_DIR, `${TEST_SESSION_ID}.json`);

function setupMockSession() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  const mockSession = {
    id: TEST_SESSION_ID,
    title: "React Component Test",
    createdAt: new Date().toLocaleString(),
    updatedAt: new Date().toLocaleString(),
    activeAgentId: "agent-opencode-reviewer",
    managerAgentId: "agent-codex-arch", // Set a manager agent
    messages: [
      {
        id: "msg-1",
        sender: "user",
        text: "Can you help me design a React component?",
        timestamp: "10:30",
        userNickname: "Ning"
      },
      {
        id: "msg-2",
        sender: "assistant",
        text: "Sure! I can help you design professional React components. What kind of component are you looking to build?",
        timestamp: "10:31",
        agentName: "老罗"
      },
      {
        id: "msg-3",
        sender: "user",
        text: "I need a simple button counter with state.",
        timestamp: "10:32",
        userNickname: "Ning"
      },
      {
        id: "msg-4",
        sender: "assistant",
        text: "Here is a standard Counter component using useState...",
        timestamp: "10:33",
        agentName: "老马"
      }
    ]
  };

  fs.writeFileSync(TEST_SESSION_FILE, JSON.stringify(mockSession, null, 2), "utf-8");
  console.log(`🟢 [Mock Setup] Successfully wrote mock session to: ${TEST_SESSION_FILE}`);
}

function getAgentManifestString(config: any): string {
  if (!config.agents || config.agents.length === 0) {
    return "";
  }

  let manifest = "\n=== [可用 AI Agent 角色与能力清单 (Agent Manifest)] ===\n";
  config.agents.forEach((agent: any, index: number) => {
    const harness = config.harnesses.find((h: any) => h.id === agent.harnessId);
    manifest += `${index + 1}. 名字: 「${agent.name}」 (ID: ${agent.id})\n`;
    manifest += `   - 绑定的 CLI: ${harness ? harness.name : '未绑定'}\n`;
    if (agent.tag) {
      manifest += `   - 标签定位: ${agent.tag}\n`;
    }
    if (agent.systemPrompt) {
      manifest += `   - 系统人设指令/能力: ${agent.systemPrompt.trim()}\n`;
    }
    manifest += "\n";
  });
  manifest += "========================================================\n\n";
  return manifest;
}

function testPrompterCompilation() {
  console.log('======================================================================');
  console.log('🧪 多轮会话记忆、系统 Manifest 与交付协议 编译测试');
  console.log('======================================================================\n');

  setupMockSession();

  // 1. 加载 Config
  const config = loadConfig();
  console.log("🟢 [Config Loaded] Default Harness ID:", config.defaultHarnessId);

  // 2. 模拟新输入
  const cleanedPrompt = "Please add a reset button to that Counter component.";
  const userNicknameToUse = "Ning";

  // 3. 提取历史记忆 (最近 4 条消息)
  const sessionHistory = getFormattedSessionContext(TEST_SESSION_ID, 4);
  const finalPromptWithContext = sessionHistory ? `${sessionHistory}当前用户的新指令:\n${cleanedPrompt}` : cleanedPrompt;

  // 4. 提取角色 Manifest 与 交付协议
  const activeAgent = config.agents.find((a) => a.id === config.activeAgentId) || config.agents[0];
  const managerAgentId = "agent-codex-arch"; // From mock session
  const managerAgent = config.agents.find((a) => a.id === managerAgentId);
  const managerName = managerAgent ? managerAgent.name : "无";

  const agentManifest = getAgentManifestString(config);
  const deliveryProtocol = `
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
`.trim();

  const agentIdentityPrompt = `你的名字是「${activeAgent.name}」。\n${activeAgent.systemPrompt || ''}\n\n${agentManifest}\n\n${deliveryProtocol}`.trim();

  console.log("\n======================================================================");
  console.log("🕵️ 编译出的 System Prompt (送给 CLI 的系统人设级联环境):");
  console.log("======================================================================");
  console.log(agentIdentityPrompt);
  console.log("======================================================================");

  console.log("\n======================================================================");
  console.log("🕵️ 编译出的 User Prompt (送给 CLI 的历史对话与当前新指令):");
  console.log("======================================================================");
  console.log(finalPromptWithContext);
  console.log("======================================================================");

  // ======================================================================
  // 5. 验证 🔔 [交付通知] 和 📝 [工作总结] 正则解析器与工作计划状态推动
  // ======================================================================
  console.log("\n======================================================================");
  console.log("🧪 [测试验证] 交付物解析器与工作计划状态推动流程");
  console.log("======================================================================");

  const sampleAgentReply = `
🔔 [交付通知]
• 👤 @用户: @Ning
• 👑 @管理者: @老老罗
• 🎯 @下一个接收Agent: @老罗

📝 [工作总结]
1. 交付产物: 重构完成的 Counter 计数器代码。
2. 物理变更: 修改了 src/components/Counter.tsx 文件。
3. 验证结果: 全局运行 npm run build，全部 100% 成功。

💬 [交付给下一阶段 Agent 的补充说明]
请老罗接入并检查重写后的 CSS 样式适配性。
  `;

  const parsed = parseDeliverableText(sampleAgentReply);
  console.log("🟢 [Parser Output] Successfully parsed deliverable:", parsed);

  if (parsed) {
    const mockPlan: WorkPlan = {
      id: "plan-001",
      title: "React Counter Heavy Refactoring",
      managerAgentId: "agent-codex-arch",
      status: "active",
      tasks: [
        {
          id: "task-1",
          title: "重构 Counter.tsx",
          assignedAgentId: "agent-opencode-reviewer",
          assignedAgentName: "老马",
          status: "in_progress"
        },
        {
          id: "task-2",
          title: "接入并调整 CSS 样式",
          assignedAgentId: "agent-codex-arch",
          assignedAgentName: "老罗",
          status: "pending"
        }
      ]
    };

    const userMsg: SessionMessage = { id: `msg-user-999`, sender: 'user', text: cleanedPrompt, timestamp: "10:35", userNickname: "Ning" };
    const assistantMsg: SessionMessage = { id: `msg-ast-999`, sender: 'assistant', text: sampleAgentReply, timestamp: "10:36", agentName: "老马" };

    console.log("\n>>> 正在调用 appendMessageToSession 追加回复并自动推进任务进度...");
    const updatedSession = appendMessageToSession(TEST_SESSION_ID, userMsg, assistantMsg, "agent-opencode-reviewer", "agent-codex-arch", mockPlan);

    console.log("\n🟢 [Orchestration Output] Updated Session Active Plan tasks:");
    console.log(JSON.stringify(updatedSession.activePlan?.tasks, null, 2));
    console.log(`\n🟢 [Orchestration Status] Plan overall status: ${updatedSession.activePlan?.status}`);
  }

  // Clean up mock file
  if (fs.existsSync(TEST_SESSION_FILE)) {
    fs.unlinkSync(TEST_SESSION_FILE);
    console.log("\n🟢 [Cleanup] Successfully cleaned up temporary mock session file.");
  }
}

testPrompterCompilation();
