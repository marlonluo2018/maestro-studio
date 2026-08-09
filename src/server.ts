import express, { Request, Response } from 'express';
import cors from 'cors';
import { loadConfig, saveConfig } from './config/node-config.js';
import { MaestroConfig, SessionMessage, DEFAULT_USER_PROFILE } from './config/types.js';
import {
  loadSessionIndex,
  getSessionDetail,
  createSession,
  appendMessageToSession,
  updateSessionTitle,
  deleteSession,
  getFormattedSessionContext,
  cleanMessageText
} from './config/session-manager.js';
import {
  AgentSDKAdapter,
  ClaudeCodeSDKAdapter,
  CodexSDKAdapter,
  OpenCodeSDKAdapter
} from './runner/sdk-adapters.js';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

let config: MaestroConfig = loadConfig();

const HOME_DIR = process.env.USERPROFILE || process.env.HOME || '';

// SDK 适配器简单抽象工厂
function getSDKAdapter(presetKey: string): AgentSDKAdapter {
  if (presetKey === 'claude-code') {
    return new ClaudeCodeSDKAdapter();
  }
  if (presetKey === 'codex') {
    return new CodexSDKAdapter();
  }
  return new OpenCodeSDKAdapter();
}

// 扫描 ~/.claude/skills/ 获取 Claude Skills
function scanClaudeSkills(): string {
  const skillsDir = path.join(HOME_DIR, '.claude', 'skills');
  if (!fs.existsSync(skillsDir)) return '（~/.claude/skills/ 目录不存在）';

  try {
    const entries = fs.readdirSync(skillsDir);
    const result: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(skillsDir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        const skillMd = path.join(fullPath, 'SKILL.md');
        const skillMdLower = path.join(fullPath, 'skill.md');
        if (fs.existsSync(skillMd) || fs.existsSync(skillMdLower)) {
          const fileToRead = fs.existsSync(skillMd) ? skillMd : skillMdLower;
          const content = fs.readFileSync(fileToRead, 'utf-8');
          const nameMatch = content.match(/name:\s*(.*)/i);
          const descMatch = content.match(/description:\s*(.*)/i);
          const displayName = nameMatch ? nameMatch[1].replace(/['"]/g, '').trim() : entry;
          const displayDesc = descMatch ? descMatch[1].replace(/['"]/g, '').trim() : '无描述';
          result.push(`- **${displayName}** (${entry}): ${displayDesc}`);
        } else {
          result.push(`- **${entry}** (无 SKILL.md)`);
        }
      }
    }
    return result.join('\n') || '（未找到已配置的 Claude 技能）';
  } catch (err: any) {
    return `扫描 Skills 出错: ${err.message}`;
  }
}

// GET /api/config
app.get('/api/config', (_req: Request, res: Response) => {
  res.json(config);
});

// POST /api/config
app.post('/api/config', (req: Request, res: Response) => {
  config = req.body;
  saveConfig(config);
  res.json({ success: true, config });
});

// GET /api/user-profile
app.get('/api/user-profile', (_req: Request, res: Response) => {
  res.json(config.userProfile || DEFAULT_USER_PROFILE);
});

// POST /api/user-profile
app.post('/api/user-profile', (req: Request, res: Response) => {
  config.userProfile = { ...config.userProfile, ...req.body };
  saveConfig(config);
  res.json({ success: true, userProfile: config.userProfile });
});

// --- Session API Routes ---

app.get('/api/sessions', (_req: Request, res: Response) => {
  const indexItems = loadSessionIndex();
  res.json(indexItems);
});

app.post('/api/sessions', (req: Request, res: Response) => {
  const { harnessId, title } = req.body;
  const activeAgentId = harnessId || config.activeAgentId;
  const session = createSession(activeAgentId, title || '新对话');
  res.json(session);
});

app.get('/api/sessions/:id', (req: Request, res: Response) => {
  const session = getSessionDetail(String(req.params.id));
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

app.patch('/api/sessions/:id', (req: Request, res: Response) => {
  const { title } = req.body;
  const updatedSession = updateSessionTitle(String(req.params.id), String(title || ''));
  if (!updatedSession) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(updatedSession);
});

app.delete('/api/sessions/:id', (req: Request, res: Response) => {
  const success = deleteSession(String(req.params.id));
  res.json({ success });
});

// --- ⚡ 重构：通过 100% 官方 SDK 适配器接口检测 CLI 可用性 ⚡ ---
app.post('/api/check-harness', async (req: Request, res: Response) => {
  const { presetKey } = req.body;
  if (!presetKey) {
    return res.status(400).json({ installed: false, message: 'presetKey 参数缺失' });
  }

  const adapter = getSDKAdapter(presetKey);
  const health = await adapter.checkHealth();

  res.json({
    installed: health.success,
    message: health.message
  });
});

// ======================================================================
// ⚡ 方案二核心：Maestro Studio 专属本地反向清洗代理 ⚡
// 自动拦截并翻译 Claude Code v2.1.154+ 发出的 messages[].role: "system" ➔ 提取至顶层 system 字段！
// 完美的桥接代理：使最新版 Claude Code 官方 SDK 完美与 DeepSeek /anthropic 兼容！
// ======================================================================
app.post('/anthropic/v1/messages', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // 1. 过滤清洗：检测 messages 数组中是否嵌套了 role === "system"
    if (body && Array.isArray(body.messages)) {
      const systemMessages = body.messages.filter((m: any) => m.role === 'system');
      if (systemMessages.length > 0) {
        // 合并所有 system prompts 文本
        const combinedSystemText = systemMessages.map((m: any) => m.content).join('\n\n');
        
        // 挂接到顶层的 system 字段
        body.system = (body.system ? body.system + '\n\n' : '') + combinedSystemText;
        
        // 从 messages 数组中彻底移除该 role === "system" 元素，避免 DeepSeek 反序列化 400 崩溃
        body.messages = body.messages.filter((m: any) => m.role !== 'system');
        
        console.log(`[Proxy Interceptor] 成功拦截并清洗 messages 数组中的 role: "system" ➔ 提升至顶层 system 字段！`);
      }
    }

    // 2. 将高兼容性的请求转发给 DeepSeek /anthropic 的真实官方服务器
    const targetUrl = 'https://api.deepseek.com/anthropic/v1/messages';
    
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (req.headers['x-api-key']) {
      headers['x-api-key'] = String(req.headers['x-api-key']);
    }
    if (req.headers['anthropic-version']) {
      headers['anthropic-version'] = String(req.headers['anthropic-version']);
    }

    console.log(`[Proxy Forward] 正在将请求转发给 DeepSeek 真实端点 (模型: ${body.model})...`);
    
    const response = await axios({
      method: 'post',
      url: targetUrl,
      data: body,
      headers: headers,
      responseType: 'stream'
    });

    // 3. 透传状态与头部，并将 DeepSeek 返回的数据流管道式 (pipe) 实时推送回 Claude Code
    res.status(response.status);
    response.data.pipe(res);
  } catch (err: any) {
    console.error('[Proxy Error]:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// --- ⚡ 重构：通过 CLI 适配器接口进行对话测试 ⚡ ---
app.post('/api/test-chat', async (req: Request, res: Response) => {
  const { presetKey, systemPrompt = '' } = req.body;
  if (!presetKey) {
    return res.status(400).json({ success: false, output: 'presetKey 参数缺失' });
  }

  console.log(`[Maestro Server] 正在使用 [${presetKey}] CLI 引擎发起健康测试问答...`);

  const adapter = getSDKAdapter(presetKey);
  try {
    const result = await adapter.streamChat('hi', systemPrompt, () => {});
    if (result.success) {
      res.json({
        success: true,
        output: result.output || '测试成功（CLI 引擎已建立对话连接）'
      });
    } else {
      res.json({
        success: false,
        output: `无法建立 CLI 连接: ${result.error || '未响应'}`
      });
    }
  } catch (err: any) {
    res.json({
      success: false,
      output: `CLI 执行报错: ${err.message || '系统错误'}`
    });
  }
});

// --- ⚡ 提示词元工程优化：调用默认 CLI 智能生成/重写系统提示词 ⚡ ---
app.post('/api/optimize-prompt', async (req: Request, res: Response) => {
  const { draft } = req.body;
  if (!draft || !draft.trim()) {
    return res.status(400).json({ success: false, error: '草稿内容不能为空' });
  }

  // 1. 寻找当前默认 CLI Harness
  const defaultHarnessId = config.defaultHarnessId || (config.harnesses[0]?.id || '');
  const harness = config.harnesses.find((h) => h.id === defaultHarnessId) || config.harnesses[0];

  if (!harness) {
    return res.status(500).json({ success: false, error: '未找到可用的 CLI 引擎' });
  }

  console.log(`[Maestro Server] 正在使用默认 CLI [${harness.name}] 智能优化系统提示词...`);
  const adapter = getSDKAdapter(harness.presetKey);

  // 2. 强力防客套的元提示词
  const metaPrompt = `你是一位世界顶尖的 AI 提示词专家（Prompt Engineer）。你的唯一任务是把用户给出的极其简短、粗糙的草稿，重写并扩写为一篇专业、高质、可以直接在 AI 智能体中使用的标准 System Prompt（系统人设指令）。

严格执行的黄金准则：
1. 必须立即输出最终生成的优化 System Prompt，绝对不要说任何前置客套话（严禁说“好的，我明白了”、“以下是为您生成的提示词”、“Understood”、“How can I help you”等）。
2. 绝对不要向用户提问、绝对不要索要更多输入。你必须当场且立刻完成扩写并直接返回优化后的提示词内容！
3. 语系统一：输入草稿如果是中文或中英混合，输出的系统提示词必须使用专业中文。如果草稿是英文，输出的系统提示词必须使用英文。
4. 结构完整：输出的系统提示词应包含“角色定义”、“核心职责”、“工作流程”、“行为约束”和“输出格式规范”等模块，并使用清晰的 Markdown 标题与列表呈现。
5. 请将生成的 System Prompt 完整地包裹在一个 \`\`\`markdown 和 \`\`\` 代码块之间，这样可以方便系统解析提取。

要优化的草稿内容：
"${draft.trim()}"`;

  try {
    const result = await adapter.streamChat(metaPrompt, '', () => {});
    if (result.success && result.output) {
      let cleanOutput = result.output.trim();

      // 3. 强力后处理器 (Post-processing cleanup) - 精准提取 \`\`\`markdown 块内的内容
      const mdBlockMatch = cleanOutput.match(/```markdown\s*([\s\S]*?)\s*```/i) || cleanOutput.match(/```\s*([\s\S]*?)\s*```/i);
      if (mdBlockMatch) {
        cleanOutput = mdBlockMatch[1].trim();
      } else {
        // 兜底清除首尾的代码框包裹
        if (cleanOutput.startsWith('```markdown')) {
          cleanOutput = cleanOutput.slice(11);
        } else if (cleanOutput.startsWith('```')) {
          cleanOutput = cleanOutput.slice(3);
        }
        if (cleanOutput.endsWith('```')) {
          cleanOutput = cleanOutput.slice(0, -3);
        }
      }
      cleanOutput = cleanOutput.trim();

      // 移除可能存在的残余引导客套话
      cleanOutput = cleanOutput.replace(/^(understood|sure|okay|alright|here is the optimized system prompt|here is the system prompt|here is the prompt)[\s\S]*?\n\n/i, '').trim();
      cleanOutput = cleanOutput.replace(/^(understood|sure|okay|alright|here is the optimized system prompt)[\s\S]*?\n/i, '').trim();

      res.json({ success: true, optimizedPrompt: cleanOutput });
    } else {
      res.json({ success: false, error: result.error || 'CLI 引擎未响应' });
    }
  } catch (err: any) {
    res.json({ success: false, error: err.message || '优化失败' });
  }
});

// 生成全局 Agent 角色清单字符串，供多 Agent 协同与工作计划生成时参考
function getAgentManifestString(): string {
  if (!config.agents || config.agents.length === 0) {
    return "";
  }

  let manifest = "\n=== [可用 AI Agent 角色与能力清单 (Agent Manifest)] ===\n";
  config.agents.forEach((agent, index) => {
    const harness = config.harnesses.find((h) => h.id === agent.harnessId);
    manifest += `${index + 1}. 名字: 「${agent.name}」 (ID: ${agent.id})\n`;
    manifest += `   - 绑定的 CLI: ${harness ? harness.name : '未绑定'}\n`;
    if (agent.tag) {
      manifest += `   - 标签定位: ${agent.tag}\n`;
    }
    if (agent.systemPrompt) {
      manifest += `   - 系统人设指令/能力: ${agent.systemPrompt.trim()}\n`;
    }
    if (agent.description) {
      manifest += `   - 职责范围: ${agent.description.trim()}\n`;
    }
    manifest += "\n";
  });
  manifest += "========================================================\n\n";
  return manifest;
}

// 格式化时间为 HH:mm
function formatTimeMin(): string {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// ⚡⚡⚡ SSE 实时流式接口：拦截内置命令，并 100% 桥接官方 SDK streamChat 打字流 ⚡⚡⚡
app.post('/api/chat-stream', async (req: Request, res: Response) => {
  const { prompt, sessionId, userNickname } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const userNicknameToUse = userNickname || config.userProfile?.nickname || '用户';
  const timeMin = formatTimeMin();
  const rawSessionId = String(sessionId || '').trim();
  const isNewSession = !rawSessionId || rawSessionId === 'null' || rawSessionId === 'undefined';
  const targetSessionId = isNewSession ? `session-${Date.now()}` : rawSessionId;

  const adapterOpenCode = getSDKAdapter('opencode');
  const adapterCodex = getSDKAdapter('codex');

  // ============================================================
  // ⚡ 1. 拦截内置指令 `/models` (由 SDK / CLI 驱动)
  // ============================================================
  if (prompt.trim() === '/models') {
    res.write(`data: ${JSON.stringify({ chunk: '🔍 正在通过 CLI 引擎探测当前 OpenCode 支持的 AI 模型列表...\n\n' })}\n\n`);
    const result = await adapterOpenCode.streamChat('models', '', () => {});
    const formatted = result.output ? result.output.split('\n').map(m => `- \`${m}\``).join('\n') : '（未探测到模型）';
    
    const userMsg: SessionMessage = { id: `msg-user-${Date.now()}`, sender: 'user', text: prompt, timestamp: timeMin, userNickname: userNicknameToUse };
    const assistantMsg: SessionMessage = { id: `msg-ast-${Date.now() + 1}`, sender: 'assistant', text: `### 🟢 预设可用 AI 模型列表\n\n${formatted}`, timestamp: timeMin, agentName: 'Maestro 助理' };
    const updatedSession = appendMessageToSession(targetSessionId, userMsg, assistantMsg, 'agent-opencode-reviewer');

    res.write(`data: ${JSON.stringify({ chunk: `### 🟢 预设可用 AI 模型列表\n\n${formatted}` })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, session: updatedSession, assistantMessage: assistantMsg })}\n\n`);
    res.end();
    return;
  }

  // ============================================================
  // ⚡ 2. 拦截内置指令 `/mcp` (由 SDK / CLI 驱动)
  // ============================================================
  if (prompt.trim() === '/mcp') {
    res.write(`data: ${JSON.stringify({ chunk: '🔍 正在获取系统当前激活的全局外部 MCP 服务器列表...\n\n' })}\n\n`);
    let result = await adapterCodex.streamChat('mcp list', '', () => {});
    if (!result.success || !result.output) {
      result = await adapterOpenCode.streamChat('mcp list', '', () => {});
    }
    const formatted = result.output ? `\`\`\`text\n${result.output}\n\`\`\`` : '（未探测到外部已连接的 MCP 服务器）';

    const userMsg: SessionMessage = { id: `msg-user-${Date.now()}`, sender: 'user', text: prompt, timestamp: timeMin, userNickname: userNicknameToUse };
    const assistantMsg: SessionMessage = { id: `msg-ast-${Date.now() + 1}`, sender: 'assistant', text: `### 🔌 当前激活的全局 MCP 服务器\n\n${formatted}`, timestamp: timeMin, agentName: 'Maestro 助理' };
    const updatedSession = appendMessageToSession(targetSessionId, userMsg, assistantMsg, 'agent-opencode-reviewer');

    res.write(`data: ${JSON.stringify({ chunk: `### 🔌 当前激活的全局 MCP 服务器\n\n${formatted}` })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, session: updatedSession, assistantMessage: assistantMsg })}\n\n`);
    res.end();
    return;
  }

  // ============================================================
  // ⚡ 3. 拦截内置指令 `/skills` (扫描物理目录)
  // ============================================================
  if (prompt.trim() === '/skills') {
    res.write(`data: ${JSON.stringify({ chunk: '🔍 正在扫描系统全局安装的 Agent 专属技能与插件 (Global Skills)...\n\n' })}\n\n`);
    const claudeSkillsText = scanClaudeSkills();
    const codexPluginsRaw = await adapterCodex.streamChat('plugin list', '', () => {});
    const codexPluginsText = codexPluginsRaw.output ? `\`\`\`text\n${codexPluginsRaw.output}\n\`\`\`` : '（未检测到 Codex 自定义技能）';

    const finalSkillsText = `### 🎒 Claude Code 全局技能 (Global Skills)\n${claudeSkillsText}\n\n### 🔌 Codex 已装载技能插件\n${codexPluginsText}`;

    const userMsg: SessionMessage = { id: `msg-user-${Date.now()}`, sender: 'user', text: prompt, timestamp: timeMin, userNickname: userNicknameToUse };
    const assistantMsg: SessionMessage = { id: `msg-ast-${Date.now() + 1}`, sender: 'assistant', text: finalSkillsText, timestamp: timeMin, agentName: 'Maestro 助理' };
    const updatedSession = appendMessageToSession(targetSessionId, userMsg, assistantMsg, 'agent-opencode-reviewer');

    res.write(`data: ${JSON.stringify({ chunk: finalSkillsText })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, session: updatedSession, assistantMessage: assistantMsg })}\n\n`);
    res.end();
    return;
  }

  // ============================================================
  // ⚡ 4. 核心：通过官方标准 SDK 适配器驱动普通对话流 ⚡
  // ============================================================
  let targetAgent = config.agents.find((a) => a.id === config.activeAgentId) || config.agents[0];
  let cleanedPrompt = prompt;

  for (const agent of config.agents) {
    const mentionTag = `@${agent.name}`;
    if (prompt.includes(mentionTag)) {
      targetAgent = agent;
      cleanedPrompt = prompt.replace(mentionTag, '').trim();
      break;
    }
  }

  const activeAgent = targetAgent;
  const harness = config.harnesses.find((h) => h.id === activeAgent.harnessId) || config.harnesses[0];

  const session = getSessionDetail(targetSessionId);
  const effectiveManagerId = session?.managerAgentId || activeAgent.id;
  const managerAgent = config.agents.find((a) => a.id === effectiveManagerId);
  const managerName = managerAgent ? managerAgent.name : activeAgent.name;

  const isEnglishUser = config.userProfile?.preferredLanguage === 'English';

  const deliveryProtocol = isEnglishUser ? `
=== [MANDATORY DELIVERABLE & WORK SUMMARY PROTOCOL] ===
When you complete your assigned task, you MUST format your output with this EXACT structured section at the very top of your response:

🔔 [DELIVERY NOTICE]
• 👤 @User: @${userNicknameToUse}
• 👑 @Manager: @${managerName}
• 🎯 @NextAgent: [Name of the next Agent to take over, e.g., @LaoLuo, or @无 if this is the final step]

📝 [WORK SUMMARY]
1. Deliverables: [Brief summary of generated files, features, or analysis reports]
2. Physical Changes: [List of modified or created files, executed shell commands]
3. Verification: [Linter, compiler, or test verification results, e.g., "Vite build 100% passed"]

💬 [HANDOFF NOTES FOR NEXT AGENT]
[Handoff instructions, notes, or specific guidelines for the next receiving agent]

⚡ [CRITICAL ROLE SEPARATION RULE]
- If you specify a next receiving agent (@NextAgent is NOT "@无"), you are acting as a ROUTER/MANAGER.
- In this case, you MUST NOT execute the final task (e.g., coding or translation) yourself.
- Your response should ONLY contain the Delivery Notice, Work Summary of your routing plan, and Handoff Notes. Leave the execution 100% to the next agent!
- Only when @NextAgent is "@无" should you act as a WORKER and output final deliverables.

=======================================================
`.trim() : `
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

⚡ [角色分工硬性准则 (CRITICAL ROLE SEPARATION RULE)]
- 如果你指定了下一个接收 Agent（即“@下一个接收Agent”不是“@无”），说明你此时扮演的是【分发者/管理者（Router/Manager）】。
- 在这种情况下，你【严禁自己动手执行最终的具体任务】（例如：不要自己去翻译邮件、不要自己去写具体代码）。
- 你的回复应该【仅包含交付通知、工作总结（阐述你的分发路由规划）以及交接补充说明（指导下个Agent具体干活）】。具体的脏活累活请100%交由下一个接收Agent去执行，防止工作重复与冗余！
- 只有当你指定“@下一个接收Agent: @无”时，你才作为【最终执行者（Worker）】输出具体的执行成果（如翻译好的内容、修改好的代码）。

=======================================================
`.trim();

  console.log(`\n========================================`);
  console.log(`⚡ [SSE CLI 模式] 收到指令 (Session: ${targetSessionId}): "${cleanedPrompt}"`);
  console.log(`🤖 Agent: [${activeAgent.name}], Harness: [${harness.name}]`);
  console.log(`========================================`);

  const isManager = activeAgent.id === effectiveManagerId;
  const agentManifest = isManager ? getAgentManifestString() : "";
  const agentIdentityPrompt = `你的名字是「${activeAgent.name}」。\n${activeAgent.systemPrompt || ''}${agentManifest ? '\n\n' + agentManifest : ''}\n\n${deliveryProtocol}`.trim();

  // 获取会话中此前轮次的对话历史上下文，级联发送，建立多轮会话记忆
  const sessionHistory = getFormattedSessionContext(targetSessionId);
  const finalPromptWithContext = sessionHistory ? `${sessionHistory}当前用户的新指令:\n${cleanedPrompt}` : cleanedPrompt;

  // 获取该 Harness CLI 对应的官方 SDK 适配器实例
  const adapter = getSDKAdapter(harness.presetKey);
  let accumulatedOutput = '';

  try {
    // 启动流式传输
    const result = await adapter.streamChat(finalPromptWithContext, agentIdentityPrompt, (chunk) => {
      accumulatedOutput += chunk;
      // 实时向前端打字机推送纯净字符块！
      res.write(`data: ${JSON.stringify({ chunk, agentName: activeAgent.name, harnessName: harness.name })}\n\n`);
    });

    // 进程执行结束，落盘保存并发送 done 信号
    const userMessage: SessionMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: timeMin,
      userNickname: userNicknameToUse
    };

    const finalText = accumulatedOutput.trim() || result.output || '（命令运行结束，无输出返回）';

    const assistantMessage: SessionMessage = {
      id: `msg-ast-${Date.now() + 1}`,
      sender: 'assistant',
      text: finalText,
      timestamp: timeMin,
      agentName: activeAgent.name,
      harnessName: harness.name
    };

    let updatedSession = appendMessageToSession(targetSessionId, userMessage, assistantMessage, activeAgent.id, effectiveManagerId);

    // 🌟 第一个 Agent 完成时立即保存并推送到前端 Checkpoint，保障磁盘 100% 安全落盘 🌟
    res.write(`data: ${JSON.stringify({ sessionCheckpoint: updatedSession, activeAgentName: activeAgent.name })}\n\n`);

    // 🌟🌟🌟 中央协调编排器核心：链式接棒流转监听 🌟🌟🌟
    // 检查刚才第一个 Agent 运行结束产生的 deliverable 里是否包含了下一个接收者 nextAgentName
    const parsedDeliverable = updatedSession.messages[updatedSession.messages.length - 1]?.deliverable;
    
    if (parsedDeliverable && parsedDeliverable.nextAgentName && parsedDeliverable.nextAgentName !== '无' && parsedDeliverable.nextAgentName !== activeAgent.name) {
      const nextAgentNameClean = parsedDeliverable.nextAgentName.replace(/@/g, '').trim();
      const nextAgent = config.agents.find((a) => a.name === nextAgentNameClean || a.name.includes(nextAgentNameClean));

      if (nextAgent) {
        console.log(`\n🔗 [Orchestrator] 自动拦截到交付接棒信号！[${activeAgent.name}] ➔ [${nextAgent.name}]`);
        
        // 仅推送 activeAgentName 更新前端正在思考工作的 Agent 名字指示器，不写任何合成过渡废话消息！
        res.write(`data: ${JSON.stringify({ activeAgentName: nextAgent.name, agentName: nextAgent.name })}\n\n`);

        const nextHarness = config.harnesses.find((h) => h.id === nextAgent.harnessId) || config.harnesses[0];
        const nextAdapter = getSDKAdapter(nextHarness.presetKey);
        
        // 仅当下一个 Agent 是统筹管理者时才注入 Agent 清单，普通 Worker 保持人设专注执行
        const isNextManager = nextAgent.id === effectiveManagerId;
        const nextManifest = isNextManager ? getAgentManifestString() : "";
        const nextAgentIdentityPrompt = `你的名字是「${nextAgent.name}」。\n${nextAgent.systemPrompt || ''}${nextManifest ? '\n\n' + nextManifest : ''}\n\n${deliveryProtocol}`.trim();
        
        // 提取交接的补充说明段落
        const handoverMatch = cleanMessageText(finalText).match(/💬\s*\[交付给下一阶段 Agent 的补充说明\]([\s\S]*)/i);
        const handoverNotes = handoverMatch ? handoverMatch[1].trim() : "请根据上一步工作总结与要求继续完成工作。";

        // 构造给下一个 Agent 的真正输入
        const nextPrompt = `
[交接任务指示]
上一个 Agent [${activeAgent.name}] 已为你完成了前置处理，并为你留下了工作总结与具体交接指示。
请仔细阅读以下交接内容，并根据当前用户最原始的指令与待处理内容，完成你的专业工作！

工作总结:
${parsedDeliverable.workSummary}

交付给你的交接补充说明:
${handoverNotes}

用户最原始的需求与待处理内容:
${cleanedPrompt}
`.trim();

        console.log(`[Orchestrator] 正在无感接棒派发给 [${nextAgent.name}] CLI (${nextHarness.name})...`);
        let nextAccumulatedOutput = '';
        
        // 启动下一个 Agent (如老罗 / 老李) 独立原汁原味流式输出
        const nextResult = await nextAdapter.streamChat(nextPrompt, nextAgentIdentityPrompt, (chunk) => {
          nextAccumulatedOutput += chunk;
          res.write(`data: ${JSON.stringify({ chunk, agentName: nextAgent.name, harnessName: nextHarness.name })}\n\n`);
        });

        // 拼接下一个 Agent 消息对象并独立写盘保存
        const nextAssistantMessage: SessionMessage = {
          id: `msg-ast-chained-${Date.now()}`,
          sender: 'assistant',
          text: nextAccumulatedOutput.trim() || nextResult.output || '（命令执行结束，无输出返回）',
          timestamp: formatTimeMin(),
          agentName: nextAgent.name,
          harnessName: nextHarness.name
        };

        // 直接落盘保存该 Agent 自己的独立回复，绝不插入任何虚假 user 消息！
        updatedSession = appendMessageToSession(targetSessionId, {
          id: `msg-user-chained-${Date.now()}`,
          sender: 'user',
          text: `[自动交接] 指派 ${nextAgent.name} 执行`,
          timestamp: formatTimeMin(),
          userNickname: 'Maestro 协调器'
        }, nextAssistantMessage, nextAgent.id);

        // 🌟🌟🌟 动态 Hub-and-Spoke 管理者闭环 🌟🌟🌟
        // 检查 Worker (如老袁) 运行结束后的交付物：如果它的 nextAgentName 是 '无'，且当前存在统筹管理者 (如老马)，自动返回管理者做最终汇总与下一阶段决策！
        const chainedDeliverable = updatedSession.messages[updatedSession.messages.length - 1]?.deliverable;
        const currentManagerName = managerName !== '无' ? managerName : activeAgent.name;
        const managerAgentObj = config.agents.find((a) => a.name === currentManagerName || a.name.includes(currentManagerName));

        if (
          chainedDeliverable &&
          (!chainedDeliverable.nextAgentName || chainedDeliverable.nextAgentName === '无' || chainedDeliverable.nextAgentName === 'none') &&
          managerAgentObj &&
          managerAgentObj.name !== nextAgent.name
        ) {
          console.log(`\n👑 [Orchestrator Manager Loop] Worker [${nextAgent.name}] 完成工作，自动返回管理者 [${managerAgentObj.name}] 审阅并做汇总/分发决策...`);

          res.write(`data: ${JSON.stringify({ activeAgentName: managerAgentObj.name, agentName: managerAgentObj.name })}\n\n`);

          const managerHarness = config.harnesses.find((h) => h.id === managerAgentObj.harnessId) || config.harnesses[0];
          const managerAdapter = getSDKAdapter(managerHarness.presetKey);
          const managerIdentityPrompt = `你的名字是「${managerAgentObj.name}」。\n${managerAgentObj.systemPrompt || ''}\n\n${agentManifest}\n\n${deliveryProtocol}`.trim();

          const returnToManagerPrompt = `
[管理者回调审阅指示]
你指定的 Worker 节点 [${nextAgent.name}] 已完成了分配给它的任务，并提交了工作总结。
作为统筹管理者 (Manager)，请审阅 [${nextAgent.name}] 的成果，并做最终决策：
1. 如果所有子任务已全部完成，请为用户 (@${userNicknameToUse}) 给出清晰简洁的总结汇报，并将 @下一个接收Agent 设为 @无。
2. 如果根据 [${nextAgent.name}] 的分析，还有下一步工作需要其他 Agent 执行，请分配给对应的 Agent 角色（将 @下一个接收Agent 设为对应 Agent 名字）。

Worker [${nextAgent.name}] 的工作总结:
${chainedDeliverable.workSummary}

Worker [${nextAgent.name}] 的完整输出内容:
${nextAccumulatedOutput.slice(0, 1500)}

用户最原始的需求:
${cleanedPrompt}
`.trim();

          let managerAccumulatedOutput = '';
          const managerResult = await managerAdapter.streamChat(returnToManagerPrompt, managerIdentityPrompt, (chunk) => {
            managerAccumulatedOutput += chunk;
            res.write(`data: ${JSON.stringify({ chunk, agentName: managerAgentObj.name, harnessName: managerHarness.name })}\n\n`);
          });

          const finalManagerMessage: SessionMessage = {
            id: `msg-ast-manager-summary-${Date.now()}`,
            sender: 'assistant',
            text: managerAccumulatedOutput.trim() || managerResult.output || '（管理者审阅结束）',
            timestamp: formatTimeMin(),
            agentName: managerAgentObj.name,
            harnessName: managerHarness.name
          };

          updatedSession = appendMessageToSession(targetSessionId, {
            id: `msg-user-manager-${Date.now()}`,
            sender: 'user',
            text: `[管理者回调] 提交 ${nextAgent.name} 成果给 ${managerAgentObj.name} 审阅`,
            timestamp: formatTimeMin(),
            userNickname: 'Maestro 协调器'
          }, finalManagerMessage, managerAgentObj.id);
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, session: updatedSession, assistantMessage })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

const PORT = 3001;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🎵 Maestro Studio Server running on http://127.0.0.1:${PORT}`);
});
