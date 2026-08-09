import fs from 'fs';
import path from 'path';
import { ChatSession, SessionIndexItem, SessionMessage, WorkPlan, DeliverableMeta } from './types.js';

const DATA_DIR = path.resolve(process.cwd(), 'maestro-data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const INDEX_FILE_PATH = path.join(DATA_DIR, 'index.json');
const LEGACY_FILE_PATH = path.resolve(process.cwd(), 'maestro-sessions.json');

// 保证目录存在
function ensureDirectories(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// 彻底清除文本中的旧版前缀
export function cleanMessageText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^\*\*\[.*?\]\s*执行输出\*\*:\s*```text\n?/gi, '')
    .replace(/\n?```\s*$/gi, '')
    .trim();
}

// 一次性永久清洗磁盘上已存的所有历史 session JSON 文件
function sanitizeDiskSessionFiles(): void {
  ensureDirectories();
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      const files = fs.readdirSync(SESSIONS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(SESSIONS_DIR, file);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const session: ChatSession = JSON.parse(raw);

          if (session && session.messages) {
            let modified = false;
            session.messages = session.messages.map((msg) => {
              const cleaned = msg.sender === 'assistant' ? cleanMessageText(msg.text) : msg.text;
              if (cleaned !== msg.text) {
                modified = true;
              }
              return { ...msg, text: cleaned };
            });

            if (modified) {
              fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
              console.log(`[Session Disk Cleaner] 已永久清洗磁盘文件: ${file}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to sanitize disk session files:', err);
  }
}

// 自动迁移旧版数据
function migrateLegacyDataIfNeeded(): void {
  try {
    if (fs.existsSync(LEGACY_FILE_PATH)) {
      console.log('[Session Manager] 检测到旧版数据，正在执行平滑迁移...');
      ensureDirectories();

      const legacyContent = fs.readFileSync(LEGACY_FILE_PATH, 'utf-8');
      const legacySessions: ChatSession[] = JSON.parse(legacyContent);

      const indexItems: SessionIndexItem[] = [];

      for (const session of legacySessions) {
        session.messages = (session.messages || []).map((msg) => ({
          ...msg,
          text: msg.sender === 'assistant' ? cleanMessageText(msg.text) : msg.text
        }));

        const sessionFilePath = path.join(SESSIONS_DIR, `${session.id}.json`);
        fs.writeFileSync(sessionFilePath, JSON.stringify(session, null, 2), 'utf-8');

        indexItems.push({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          activeAgentId: session.activeAgentId || 'default-agent',
          messageCount: session.messages.length
        });
      }

      fs.writeFileSync(INDEX_FILE_PATH, JSON.stringify(indexItems, null, 2), 'utf-8');
      fs.renameSync(LEGACY_FILE_PATH, `${LEGACY_FILE_PATH}.bak`);
    }
  } catch (err) {
    console.error('[Session Manager] 迁移旧版数据时出错:', err);
  }
}

// 读取侧边栏轻量级索引列表
export function loadSessionIndex(): SessionIndexItem[] {
  ensureDirectories();
  migrateLegacyDataIfNeeded();
  sanitizeDiskSessionFiles();

  try {
    if (fs.existsSync(INDEX_FILE_PATH)) {
      const data = fs.readFileSync(INDEX_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load session index.json:', err);
  }
  return [];
}

// 保存索引列表
function saveSessionIndex(indexItems: SessionIndexItem[]): void {
  ensureDirectories();
  try {
    fs.writeFileSync(INDEX_FILE_PATH, JSON.stringify(indexItems, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save session index.json:', err);
  }
}

// 按需获取单个 Session 详细数据 (包含 messages)
export function getSessionDetail(sessionId: string): ChatSession | null {
  ensureDirectories();
  const sessionFilePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    if (fs.existsSync(sessionFilePath)) {
      const data = fs.readFileSync(sessionFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Failed to read session file ${sessionFilePath}:`, err);
  }
  return null;
}

// 保存单个 Session 详细文件
export function saveSessionDetail(session: ChatSession): void {
  ensureDirectories();
  const sessionFilePath = path.join(SESSIONS_DIR, `${session.id}.json`);
  try {
    fs.writeFileSync(sessionFilePath, JSON.stringify(session, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to save session file ${sessionFilePath}:`, err);
  }
}

// 创建新会话
export function createSession(
  activeAgentId: string,
  initialTitle: string = '新对话',
  managerAgentId?: string
): ChatSession {
  const now = new Date().toLocaleString();
  const newSessionId = `session-${Date.now()}`;

  const newSession: ChatSession = {
    id: newSessionId,
    title: initialTitle,
    createdAt: now,
    updatedAt: now,
    activeAgentId,
    managerAgentId,
    messages: []
  };

  saveSessionDetail(newSession);

  const indexItems = loadSessionIndex();
  indexItems.unshift({
    id: newSession.id,
    title: newSession.title,
    createdAt: newSession.createdAt,
    updatedAt: newSession.updatedAt,
    activeAgentId: newSession.activeAgentId,
    managerAgentId: newSession.managerAgentId,
    messageCount: 0
  });
  saveSessionIndex(indexItems);

  return newSession;
}

// 智能正则解析 Agent 回复中的 🔔 [交付通知] 和 📝 [工作总结]
export function parseDeliverableText(text: string): DeliverableMeta | null {
  if (!text) return null;

  // 必须含有核心关键字才认为是正式的交付物通知
  if (!text.includes('交付通知') && !text.includes('工作总结')) {
    return null;
  }

  try {
    // 1. 匹配目标用户 (如: • 👤 @用户: @Marlon 或 @Ning)
    const userMatch = text.match(/@用户\s*:\s*@?([a-zA-Z0-9_\u4e00-\u9fa5]+)/i) || text.match(/👤\s*@?用户\s*:\s*@?([a-zA-Z0-9_\u4e00-\u9fa5]+)/i);
    const targetUser = userMatch ? userMatch[1].trim() : 'Ning';

    // 2. 匹配管理者 (如: • 👑 @管理者: @无 或 @老马)
    const managerMatch = text.match(/@管理者\s*:\s*@?([a-zA-Z0-9_\u4e00-\u9fa5]+)/i) || text.match(/👑\s*@?管理者\s*:\s*@?([a-zA-Z0-9_\u4e00-\u9fa5]+)/i);
    const managerAgentName = managerMatch ? managerMatch[1].trim() : '无';

    // 3. 匹配下一个接收 Agent (如: • 🎯 @下一个接收Agent: @老罗)
    const nextMatch = text.match(/@下一个接收Agent\s*:\s*@?([a-zA-Z0-9_\u4e00-\u9fa5]+)/i) || text.match(/🎯\s*@下一个接收Agent\s*:\s*@?([a-zA-Z0-9_\u4e00-\u9fa5]+)/i) || text.match(/🎯\s*@?下一个接收\s*:\s*@?([a-zA-Z0-9_\u4e00-\u9fa5]+)/i);
    const nextAgentName = nextMatch ? nextMatch[1].trim() : '无';

    // 4. 提取 [工作总结] 段落内容
    let workSummary = "";
    const summaryMatch = text.match(/📝\s*\[工作总结\]([\s\S]*?)(💬|===|$)/i) || text.match(/\[工作总结\]([\s\S]*?)(💬|===|$)/i);
    if (summaryMatch) {
      workSummary = summaryMatch[1].trim();
    } else {
      workSummary = "完成阶段性工作交付。";
    }

    return {
      targetUser,
      managerAgentName,
      nextAgentName,
      workSummary
    };
  } catch (err) {
    console.error('[Session Manager] Failed to parse deliverable text:', err);
  }

  return null;
}

// 向会话中追加消息并原子覆写该独立 session 文件
export function appendMessageToSession(
  targetSessionId: string,
  userMessage: SessionMessage,
  assistantMessage: SessionMessage,
  activeAgentId: string = 'default',
  managerAgentId?: string,
  activePlan?: WorkPlan
): ChatSession {
  let session = getSessionDetail(targetSessionId);
  const indexItems = loadSessionIndex();

  const cleanAssistantMessage: SessionMessage = {
    ...assistantMessage,
    text: cleanMessageText(assistantMessage.text)
  };

  // 🌟 自动解析交付物通知并附加结构化元数据 🌟
  const parsedDeliverable = parseDeliverableText(cleanAssistantMessage.text);
  if (parsedDeliverable) {
    cleanAssistantMessage.deliverable = parsedDeliverable;
  }

  if (!session) {
    const cleanPrompt = userMessage.text.trim().replace(/\n/g, ' ');
    const autoTitle = cleanPrompt.slice(0, 15) + (cleanPrompt.length > 15 ? '...' : '');

    session = {
      id: targetSessionId,
      title: autoTitle || '新对话',
      createdAt: new Date().toLocaleString(),
      updatedAt: new Date().toLocaleString(),
      activeAgentId,
      managerAgentId,
      activePlan,
      messages: []
    };
  } else {
    if (session.title === '新对话' && userMessage.text) {
      const cleanPrompt = userMessage.text.trim().replace(/\n/g, ' ');
      session.title = cleanPrompt.slice(0, 15) + (cleanPrompt.length > 15 ? '...' : '');
    }
    if (managerAgentId) {
      session.managerAgentId = managerAgentId;
    }
    if (activePlan) {
      session.activePlan = activePlan;
    }
  }

  // 🌟 自动推动工作计划链条 (Work Plan State Advancement) 🌟
  if (session.activePlan && session.activePlan.tasks) {
    // 寻找当前响应 Agent 负责且尚未完成的第一个子任务
    const activeTaskIdx = session.activePlan.tasks.findIndex(
      (t) => t.assignedAgentName === assistantMessage.agentName && t.status !== 'completed'
    );

    if (activeTaskIdx !== -1) {
      session.activePlan.tasks[activeTaskIdx].status = 'completed';
      session.activePlan.tasks[activeTaskIdx].output = parsedDeliverable ? parsedDeliverable.workSummary : '完成工作交付。';

      // 自动流转激活下一个子任务
      if (session.activePlan.tasks[activeTaskIdx + 1]) {
        session.activePlan.tasks[activeTaskIdx + 1].status = 'in_progress';
      } else {
        session.activePlan.status = 'completed'; // 所有子任务执行完毕，计划整体标记完成
      }
    }
  }

  session.messages.push(userMessage, cleanAssistantMessage);
  session.updatedAt = new Date().toLocaleString();

  saveSessionDetail(session);

  const indexIdx = indexItems.findIndex((item) => item.id === session!.id);
  const updatedIndexItem: SessionIndexItem = {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    activeAgentId: session.activeAgentId,
    messageCount: session.messages.length,
    managerAgentId: session.managerAgentId
  };

  if (indexIdx !== -1) {
    indexItems[indexIdx] = updatedIndexItem;
  } else {
    indexItems.unshift(updatedIndexItem);
  }
  saveSessionIndex(indexItems);

  return session;
}

// 重命名会话标题
export function updateSessionTitle(sessionId: string, newTitle: string): ChatSession | null {
  const session = getSessionDetail(sessionId);
  if (!session) return null;

  session.title = newTitle.trim() || '未命名对话';
  session.updatedAt = new Date().toLocaleString();
  saveSessionDetail(session);

  const indexItems = loadSessionIndex();
  const indexIdx = indexItems.findIndex((item) => item.id === sessionId);
  if (indexIdx !== -1) {
    indexItems[indexIdx].title = session.title;
    indexItems[indexIdx].updatedAt = session.updatedAt;
    saveSessionIndex(indexItems);
  }

  return session;
}

// 删除会话及其独立文件
export function deleteSession(sessionId: string): boolean {
  ensureDirectories();
  const sessionFilePath = path.join(SESSIONS_DIR, `${sessionId}.json`);

  try {
    if (fs.existsSync(sessionFilePath)) {
      fs.unlinkSync(sessionFilePath);
    }
  } catch (err) {
    console.error(`Failed to delete session file ${sessionFilePath}:`, err);
  }

  const indexItems = loadSessionIndex();
  const newIndexItems = indexItems.filter((item) => item.id !== sessionId);
  saveSessionIndex(newIndexItems);

  return newIndexItems.length < indexItems.length;
}

// 获取会话的结构化历史对话上下文 (支持滑动窗口防 Token 溢出)
export function getFormattedSessionContext(sessionId: string, maxTurnCount: number = 8): string {
  const session = getSessionDetail(sessionId);
  if (!session || !session.messages || session.messages.length === 0) {
    return '';
  }

  // 截取最近的 maxTurnCount 条消息 (例如最近的 4 轮对话 = 8 条消息)
  const recentMessages = session.messages.slice(-maxTurnCount);

  let context = "--- [历史对话上下文 - 记忆记忆] ---\n";
  for (const msg of recentMessages) {
    const senderLabel = msg.sender === 'user' ? `用户 (${msg.userNickname || 'Ning'})` : `助理 (${msg.agentName || 'Maestro'})`;
    context += `[${senderLabel} • ${msg.timestamp}]:\n${msg.text}\n\n`;
  }
  context += "--- [历史对话记忆结束] ---\n\n";

  return context;
}
