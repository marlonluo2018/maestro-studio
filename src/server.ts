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
  getFormattedSessionContext
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

  console.log(`\n========================================`);
  console.log(`⚡ [SSE CLI 模式] 收到指令 (Session: ${targetSessionId}): "${cleanedPrompt}"`);
  console.log(`🤖 Agent: [${activeAgent.name}], Harness: [${harness.name}]`);
  console.log(`========================================`);

  const agentManifest = getAgentManifestString();
  const agentIdentityPrompt = `你的名字是「${activeAgent.name}」。\n${activeAgent.systemPrompt || ''}\n\n${agentManifest}`.trim();

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

    const updatedSession = appendMessageToSession(targetSessionId, userMessage, assistantMessage, activeAgent.id);

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
