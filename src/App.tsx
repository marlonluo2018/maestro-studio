import React, { useState, useEffect, useRef } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { AgentModal } from './components/AgentModal';
import { SessionSidebar } from './components/SessionSidebar';
import { MaestroConfig, DEFAULT_CONFIG, ChatSession, SessionMessage, SubAgentConfig } from './config/types';

function formatTimeMin(): string {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const App: React.FC = () => {
  const [config, setConfig] = useState<MaestroConfig>(DEFAULT_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  // Session State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // @Mention Dropdown State
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 1. 加载后端 Config 与 Sessions
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch((err) => console.error('Failed to load server config:', err));

    loadSessionsFromBackend();
  }, []);

  const loadSessionsFromBackend = async (targetActiveId?: string | null) => {
    try {
      const res = await fetch('/api/sessions');
      const data: ChatSession[] = await res.json();
      setSessions(data);

      const idToActivate = targetActiveId !== undefined ? targetActiveId : (data.length > 0 ? data[0].id : null);
      if (idToActivate) {
        handleSelectSession(idToActivate);
      } else {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  // 切换选中历史 Session
  const handleSelectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const sessionDetail: ChatSession = await res.json();
        setMessages(sessionDetail.messages || []);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load session detail:', err);
      setMessages([]);
    }
  };

  // 点击主界面的 Agent 卡片快速切换激活 Agent
  const handleSelectActiveAgent = (agentId: string) => {
    const updatedConfig = { ...config, activeAgentId: agentId };
    handleSaveConfig(updatedConfig);
  };

  // 点击 "+ 新建对话"：进入空白新对话准备状态
  const handleNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
  };

  // 删除 Session
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      const updatedList = sessions.filter((s) => s.id !== sessionId);
      setSessions(updatedList);

      if (currentSessionId === sessionId) {
        if (updatedList.length > 0) {
          setCurrentSessionId(updatedList[0].id);
          setMessages(updatedList[0].messages || []);
        } else {
          setCurrentSessionId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  // 重命名 Session 标题
  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      const updatedSession: ChatSession = await res.json();

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: updatedSession.title } : s))
      );
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  };

  // 保存配置
  const handleSaveConfig = async (newConfig: MaestroConfig) => {
    setConfig(newConfig);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error('Failed to save server config:', err);
    }
  };

  // --- 监听 @ 输入与 Mention 匹配过滤 ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);

    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      if (!query.includes(' ')) {
        setShowMentionPopup(true);
        setMentionFilter(query.toLowerCase());
        setMentionSelectedIndex(0);
        return;
      }
    }
    setShowMentionPopup(false);
  };

  const filteredAgents = config.agents.filter((agent) =>
    agent.name.toLowerCase().includes(mentionFilter)
  );

  const handleSelectMentionAgent = (agent: SubAgentConfig) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const newText = textBeforeCursor.slice(0, lastAtIndex) + `@${agent.name} ` + textAfterCursor;
      setInput(newText);
    }
    setShowMentionPopup(false);
    inputRef.current?.focus();
  };

  // 发送消息与流式响应
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    setShowMentionPopup(false);
    const timeMin = formatTimeMin();
    const currentNickname = config.userProfile?.nickname?.trim() || '用户';

    // 1. 确定本次调用的 Agent：若 Prompt 中没写 @AgentName，自动拼接当前主 Agent 名字
    let activeAgent = config.agents.find((a) => a.id === config.activeAgentId) || config.agents[0];
    let fullPromptToSend = input.trim();

    // 检查用户是否在文本中显式 @了其他 Agent
    let hasExplicitMention = false;
    for (const agent of config.agents) {
      if (input.includes(`@${agent.name}`)) {
        activeAgent = agent;
        hasExplicitMention = true;
        break;
      }
    }

    // 规规则 2 & 3: 若未显式输入 @，自动补全 @AgentName 前缀，确保界面显示与卡片选中效果完全一致
    if (!hasExplicitMention && activeAgent) {
      fullPromptToSend = `@${activeAgent.name} ${input.trim()}`;
    }

    const userMsg: SessionMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: fullPromptToSend, // 消息记录中一律保留 @AgentName 标记
      timestamp: timeMin,
      userNickname: currentNickname
    };

    const assistantMsgId = `msg-ast-${Date.now() + 1}`;
    const initialAssistantMsg: SessionMessage = {
      id: assistantMsgId,
      sender: 'assistant',
      text: '',
      timestamp: timeMin,
      agentName: activeAgent.name
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPromptToSend,
          sessionId: currentSessionId,
          userNickname: currentNickname
        })
      });

      if (!res.body) {
        throw new Error('ReadableStream not supported');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.replace(/^data:\s*/, '').trim();
          if (!cleanLine) continue;

          try {
            const eventData = JSON.parse(cleanLine);

            if (eventData.chunk) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, text: msg.text + eventData.chunk }
                    : msg
                )
              );
            }

            if (eventData.done && eventData.session) {
              const returnedSession: ChatSession = eventData.session;
              setCurrentSessionId(returnedSession.id);

              setSessions((prevSessions) => {
                const index = prevSessions.findIndex((s) => s.id === returnedSession.id);
                if (index !== -1) {
                  const updated = [...prevSessions];
                  updated[index] = returnedSession;
                  return updated;
                } else {
                  return [returnedSession, ...prevSessions];
                }
              });
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, text: `⚠️ 与 Maestro Server 通信失败: ${err.message || '网络连接错误'}` }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionPopup && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredAgents.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + filteredAgents.length) % filteredAgents.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMentionAgent(filteredAgents[mentionSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionPopup(false);
        return;
      }
    }

    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const activeAgent = config.agents.find((a) => a.id === config.activeAgentId) || config.agents[0];

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#0f172a', color: '#f8fafc' }}>
      {/* 1. 左侧 Session 历史会话边栏 */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      {/* 2. 右侧 Chat 对话主视窗 */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box' }}>
        <header style={{ borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', color: '#38bdf8' }}>🎵 Maestro Studio</h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
              直接驱动 CLI 命令行（OpenCode, Claude Code, Codex）的多 Agent 工作台
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => {
                setEditingAgentId(null);
                setIsAgentModalOpen(true);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #38bdf8',
                backgroundColor: '#0284c7',
                color: '#f8fafc',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              + 添加 Agent
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #334155',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ⚙️ 系统设置
            </button>
          </div>
        </header>

        {/* 🌟🌟🌟 主界面展示所有配置好的 Agent 角色卡片列表 🌟🌟🌟 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 'bold' }}>
            选择当前对话的 Agent 角色（点击快速切换）:
          </div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {config.agents.map((agent) => {
              const isSelected = config.activeAgentId === agent.id;
              const harness = config.harnesses.find((h) => h.id === agent.harnessId);

              return (
                <div
                  key={agent.id}
                  onClick={() => handleSelectActiveAgent(agent.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#0284c7' : '#1e293b',
                    border: isSelected ? '1px solid #38bdf8' : '1px solid #334155',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    minWidth: '160px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '13px', color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                      🤖 {agent.name}
                    </strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {agent.tag && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: isSelected ? '#0369a1' : '#334155',
                            color: '#e0f2fe'
                          }}
                        >
                          {agent.tag}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAgentId(agent.id);
                          setIsAgentModalOpen(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: isSelected ? '#ffffff' : '#94a3b8',
                          fontSize: '12px',
                          cursor: 'pointer',
                          padding: '0 2px'
                        }}
                        title="编辑此 Agent 角色"
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: isSelected ? '#bae6fd' : '#64748b' }}>
                    CLI: {harness ? harness.name : '未绑定'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 消息历史区域 */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '14px', gap: '8px' }}>
              <div style={{ fontSize: '32px' }}>🎵</div>
              <div>输入指令，或输入 <code style={{ color: '#38bdf8' }}>@</code> 选择特定的 Agent 响应对话...</div>
            </div>
          ) : (
            messages.map((msg) => {
              const userDisplayName = msg.userNickname || config.userProfile?.nickname?.trim() || '用户';
              const assistantDisplayName = msg.agentName || activeAgent?.name || 'Maestro 助理';
              const displayName = msg.sender === 'user' ? userDisplayName : assistantDisplayName;

              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: msg.sender === 'user' ? '#0284c7' : '#1e293b',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    maxWidth: '80%',
                    whiteSpace: 'pre-wrap',
                    fontSize: '14px',
                    lineHeight: '1.5'
                  }}
                >
                  <div style={{ fontSize: '11px', color: msg.sender === 'user' ? '#bae6fd' : '#64748b', marginBottom: '4px' }}>
                    {displayName} • {msg.timestamp}
                  </div>
                  {msg.text || (loading && msg.sender === 'assistant' ? '⚡ 输入流实时打字中...' : '')}
                </div>
              );
            })
          )}
        </div>

        {/* 底部输入框与 @Mention 浮动选择面板 */}
        <div style={{ position: 'relative', marginTop: '16px' }}>
          {/* @Mention 选择菜单 */}
          {showMentionPopup && filteredAgents.length > 0 && (
            <div style={mentionPopupStyle}>
              <div style={{ fontSize: '11px', color: '#64748b', padding: '6px 10px', borderBottom: '1px solid #334155' }}>
                选择要 @调用的 Agent 角色
              </div>
              {filteredAgents.map((agent, idx) => {
                const harness = config.harnesses.find((h) => h.id === agent.harnessId);
                const isSelected = idx === mentionSelectedIndex;
                return (
                  <div
                    key={agent.id}
                    onClick={() => handleSelectMentionAgent(agent)}
                    style={{
                      ...mentionItemStyle,
                      backgroundColor: isSelected ? '#0284c7' : 'transparent',
                      color: isSelected ? '#ffffff' : '#f8fafc'
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '13px' }}>🤖 {agent.name}</strong>
                      {agent.tag && (
                        <span style={{ fontSize: '10px', marginLeft: '6px', color: '#38bdf8', border: '1px solid #0284c7', padding: '1px 4px', borderRadius: '4px' }}>
                          {agent.tag}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: isSelected ? '#e0f2fe' : '#94a3b8', marginLeft: '6px' }}>
                        ({harness ? harness.name : '未绑定 CLI'})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`给 ${activeAgent?.name || 'Maestro'} 下达任务 (输入 @ 快速切唤指定 Agent)...`}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #334155',
                backgroundColor: '#1e293b',
                color: '#fff',
                outline: 'none'
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading}
              style={{
                padding: '12px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#0284c7',
                color: '#fff',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              发送
            </button>
          </div>
        </div>

        {/* Agent 角色管理 Modal */}
        <AgentModal
          config={config}
          isOpen={isAgentModalOpen}
          onClose={() => {
            setIsAgentModalOpen(false);
            setEditingAgentId(null);
          }}
          onSave={handleSaveConfig}
          targetAgentId={editingAgentId}
        />

        {/* 系统设置 Modal */}
        <SettingsModal
          config={config}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveConfig}
        />
      </main>
    </div>
  );
};

const mentionPopupStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  marginBottom: '8px',
  backgroundColor: '#0f172a',
  border: '1px solid #38bdf8',
  borderRadius: '8px',
  width: '320px',
  maxHeight: '200px',
  overflowY: 'auto',
  boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
  zIndex: 900
};

const mentionItemStyle: React.CSSProperties = {
  padding: '8px 12px',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '13px'
};
