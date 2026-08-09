import React, { useState, useEffect } from 'react';
import { MaestroConfig, SubAgentConfig } from '../config/types';

interface AgentModalProps {
  config: MaestroConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newConfig: MaestroConfig) => void;
  targetAgentId?: string | null;
}

export const AgentModal: React.FC<AgentModalProps> = ({ config, isOpen, onClose, onSave, targetAgentId }) => {
  const isEditMode = !!targetAgentId;

  // Form Fields State
  const [agentName, setAgentName] = useState('');
  const [agentTag, setAgentTag] = useState('');
  const [harnessId, setHarnessId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);

  // 调用默认 CLI 元工程优化提示词
  const handleOptimizePrompt = async () => {
    if (!systemPrompt || !systemPrompt.trim()) {
      alert('⚠️ 提示：请先在输入框中简单填写一些您对该 Agent 的想法、职责或人设（如：“一名前端 React 性能专家”），然后点击优化！');
      return;
    }

    setIsOptimizing(true);
    try {
      const res = await fetch('/api/optimize-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: systemPrompt })
      });
      const data = await res.json();
      if (data.success && data.optimizedPrompt) {
        setSystemPrompt(data.optimizedPrompt);
      } else {
        alert(`❌ 优化失败：${data.error || '未响应'}`);
      }
    } catch (err: any) {
      alert(`❌ 发生网络错误：${err.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // 初始化与回显表单数据
  useEffect(() => {
    if (isOpen) {
      if (isEditMode && targetAgentId) {
        const agent = config.agents.find((a) => a.id === targetAgentId);
        if (agent) {
          setAgentName(agent.name);
          setAgentTag(agent.tag || '');
          setHarnessId(agent.harnessId);
          setSystemPrompt(agent.systemPrompt || '');
          setDescription(agent.description || '');
        }
      } else {
        // 新增模式：重置为空状态
        setAgentName('');
        setAgentTag('');
        setHarnessId(config.harnesses[0]?.id || '');
        setSystemPrompt('');
        setDescription('');
      }
    }
  }, [isOpen, targetAgentId, config]);

  if (!isOpen) return null;

  // 点击“保存”或者“确认”
  const handleSubmit = () => {
    if (!agentName || !agentName.trim()) {
      alert('⚠️ 无法保存：Agent 名字为必填项！');
      return;
    }

    if (!harnessId) {
      alert('⚠️ 无法保存：请选择绑定的 CLI 引擎！');
      return;
    }

    const harness = config.harnesses.find((h) => h.id === harnessId);
    const descToUse = description.trim() || `基于 ${harness ? harness.name : 'CLI'} 的 Agent 角色`;

    if (isEditMode && targetAgentId) {
      // 1. 编辑保存模式
      const updatedAgents = config.agents.map((agent) =>
        agent.id === targetAgentId
          ? {
              ...agent,
              name: agentName.trim(),
              tag: agentTag.trim(),
              harnessId,
              systemPrompt: systemPrompt.trim(),
              description: descToUse
            }
          : agent
      );

      onSave({
        ...config,
        agents: updatedAgents
      });
    } else {
      // 2. 新建添加模式
      const newAgent: SubAgentConfig = {
        id: `agent-${Date.now()}`,
        name: agentName.trim(),
        tag: agentTag.trim() || '通用',
        harnessId,
        systemPrompt: systemPrompt.trim(),
        description: descToUse
      };

      onSave({
        ...config,
        agents: [...config.agents, newAgent],
        // 如果原本是空列表，默认将第一个新建的角色设为当前选中角色
        activeAgentId: config.agents.length === 0 ? newAgent.id : config.activeAgentId
      });
    }

    onClose();
  };

  // 在编辑弹窗内提供直接删除该角色的按钮
  const handleDelete = () => {
    if (!targetAgentId) return;

    const confirmDelete = window.confirm(`⚠️ 确定要彻底删除 Agent 角色「${agentName}」吗？`);
    if (!confirmDelete) return;

    const remainingAgents = config.agents.filter((a) => a.id !== targetAgentId);
    let newActiveId = config.activeAgentId;

    if (config.activeAgentId === targetAgentId) {
      newActiveId = remainingAgents[0]?.id || '';
    }

    onSave({
      ...config,
      activeAgentId: newActiveId,
      agents: remainingAgents
    });

    onClose();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#38bdf8' }}>
            {isEditMode ? `✏️ 编辑 Agent: ${agentName}` : '🤖 添加新 Agent 角色'}
          </h2>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px 0' }}>
          {isEditMode ? '修改当前 Agent 角色的配置信息，或者直接将其彻底删除。' : '填写下方表单，快速创建一个全新的专业 Agent 智能体角色。'}
        </p>

        {/* 表单输入区域 */}
        <div style={formBoxStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>
                Agent 名字 <span style={{ color: '#ef4444' }}>*</span>:
              </label>
              <input
                type="text"
                placeholder="如: 代码审查专家"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Tag 区分标签:</label>
              <input
                type="text"
                placeholder="如: 审查 / 架构"
                value={agentTag}
                onChange={(e) => setAgentTag(e.target.value)}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={labelStyle}>绑定的 CLI 引擎:</label>
              <select
                value={harnessId}
                onChange={(e) => setHarnessId(e.target.value)}
                style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}
              >
                {config.harnesses.map((h) => (
                  <option key={h.id} value={h.id}>
                    CLI: {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>专属 System Prompt / 角色提示词:</label>
              <button
                type="button"
                onClick={handleOptimizePrompt}
                disabled={isOptimizing}
                style={{
                  padding: '3px 10px',
                  borderRadius: '4px',
                  border: '1px solid #38bdf8',
                  backgroundColor: isOptimizing ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: isOptimizing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {isOptimizing ? '⏳ 正在智能优化中...' : '✨ 优化系统提示词'}
              </button>
            </div>
            <textarea
              placeholder="如: 你是一名前端代码审查员，主要检查类型安全与性能问题..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'sans-serif' }}
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={labelStyle}>角色职责描述:</label>
            <input
              type="text"
              placeholder="如: 基于 OpenCode CLI 驱动的代码审查角色"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <div>
            {isEditMode && (
              <button onClick={handleDelete} style={deleteBtnStyle}>
                🗑️ 删除该角色
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={cancelBtnStyle}>取消</button>
            <button onClick={handleSubmit} style={saveBtnStyle}>
              {isEditMode ? '保存修改' : '确认添加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Styles
const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '640px', maxWidth: '95vw', color: '#f8fafc'
};

const formBoxStyle: React.CSSProperties = {
  backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px'
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', fontSize: '13px', outline: 'none'
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', fontSize: '13px', outline: 'none'
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px', color: '#cbd5e1', display: 'block', marginBottom: '4px', fontWeight: 'bold'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer'
};

const deleteBtnStyle: React.CSSProperties = {
  padding: '10px 16px', borderRadius: '6px', border: '1px solid #ef4444', backgroundColor: 'transparent', color: '#ef4444', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer'
};

const saveBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontWeight: 'bold', cursor: 'pointer'
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 16px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer'
};
