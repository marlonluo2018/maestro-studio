import React, { useState } from 'react';
import { ChatSession, SessionIndexItem, UserProfile } from '../config/types';
import { getTranslation, getThemeColors } from '../i18n/locales';

interface SessionSidebarProps {
  sessions: Array<SessionIndexItem | ChatSession>;
  activeSessionId: string | null;
  userProfile?: UserProfile;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  sessions,
  activeSessionId,
  userProfile,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession
}) => {
  const t = getTranslation(userProfile?.preferredLanguage);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // 待确认删除的 Session 对象
  const [sessionToDelete, setSessionToDelete] = useState<SessionIndexItem | ChatSession | null>(null);

  const handleStartRename = (session: SessionIndexItem | ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleSaveRename = (sessionId: string, e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    if (editingTitle.trim()) {
      onRenameSession(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(null);
  };

  const handlePromptDelete = (session: SessionIndexItem | ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const handleConfirmDelete = () => {
    if (sessionToDelete) {
      onDeleteSession(sessionToDelete.id);
      setSessionToDelete(null);
    }
  };

  const colors = getThemeColors(userProfile?.theme);

  return (
    <aside style={{ ...sidebarContainerStyle, backgroundColor: colors.sidebarBg, borderRight: `1px solid ${colors.border}` }}>
      {/* Sidebar Header & New Session Button */}
      <div style={{ padding: '16px 12px 12px 16px', borderBottom: `1px solid ${colors.border}` }}>
        <button onClick={onNewSession} style={newSessionBtnStyle}>
          {t.newSession}
        </button>
      </div>

      {/* Session History List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        <div style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 'bold', padding: '6px 8px', textTransform: 'uppercase' }}>
          {t.sessionHistory}
        </div>

        {sessions.length === 0 ? (
          <div style={{ padding: '16px 8px', fontSize: '12px', color: colors.textMuted, textAlign: 'center' }}>
            暂无历史对话
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = activeSessionId === session.id;
            const isEditing = editingSessionId === session.id;

            return (
              <div
                key={session.id}
                onClick={() => !isEditing && onSelectSession(session.id)}
                style={{
                  ...sessionItemStyle,
                  backgroundColor: isActive ? colors.activeBg : 'transparent',
                  color: isActive ? '#ffffff' : colors.text
                }}
              >
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(session.id, e);
                        if (e.key === 'Escape') setEditingSessionId(null);
                      }}
                      autoFocus
                      style={editInputStyle}
                    />
                    <button onClick={(e) => handleSaveRename(session.id, e)} style={iconBtnStyle} title="保存标题">
                      ✓
                    </button>
                    <button onClick={handleCancelRename} style={iconBtnStyle} title="取消">
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      💬 {session.title}
                    </div>
                    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                      <button
                        onClick={(e) => handleStartRename(session, e)}
                        style={iconBtnStyle}
                        title="重命名会话"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => handlePromptDelete(session, e)}
                        style={iconBtnStyle}
                        title="删除此会话"
                      >
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 删除确认二次弹窗 Modal */}
      {sessionToDelete && (
        <div style={overlayStyle} onClick={() => setSessionToDelete(null)}>
          <div style={{ ...confirmModalStyle, backgroundColor: colors.card, border: `1px solid ${colors.border}` }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#ef4444' }}>
              ❓ {t.delete}
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: colors.text, lineHeight: '1.5' }}>
              您确定要删除历史对话 <strong style={{ color: '#38bdf8' }}>「{sessionToDelete.title}」</strong> 吗？
              <br />
              <span style={{ fontSize: '12px', color: colors.textMuted }}>此操作无法撤销。</span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setSessionToDelete(null)} style={{ ...cancelBtnStyle, color: colors.textMuted, border: `1px solid ${colors.border}` }}>
                {t.cancel}
              </button>
              <button onClick={handleConfirmDelete} style={deleteConfirmBtnStyle}>
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

const sidebarContainerStyle: React.CSSProperties = {
  width: '240px',
  backgroundColor: '#0f172a',
  borderRight: '1px solid #334155',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  boxSizing: 'border-box'
};

const newSessionBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  fontWeight: 'bold',
  fontSize: '13px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px'
};

const sessionItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  borderRadius: '6px',
  fontSize: '13px',
  cursor: 'pointer',
  marginBottom: '4px',
  transition: 'background-color 0.15s ease'
};

const editInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 6px',
  borderRadius: '4px',
  border: '1px solid #38bdf8',
  backgroundColor: '#1e293b',
  color: '#ffffff',
  fontSize: '12px',
  outline: 'none'
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#f8fafc',
  fontSize: '12px',
  cursor: 'pointer',
  padding: '2px 4px',
  opacity: 0.8
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100
};

const confirmModalStyle: React.CSSProperties = {
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '20px',
  width: '360px',
  maxWidth: '90vw',
  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '6px',
  border: '1px solid #475569',
  backgroundColor: 'transparent',
  color: '#cbd5e1',
  cursor: 'pointer',
  fontSize: '13px'
};

const deleteConfirmBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: '#ef4444',
  color: '#ffffff',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontSize: '13px'
};
