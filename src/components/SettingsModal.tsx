import React, { useState, useEffect } from 'react';
import { MaestroConfig, HarnessConfig, HARNESS_PRESETS, PresetKey, UserProfile, DEFAULT_USER_PROFILE } from '../config/types';

interface SettingsModalProps {
  config: MaestroConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newConfig: MaestroConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ config, isOpen, onClose, onSave }) => {
  const [localConfig, setLocalConfig] = useState<MaestroConfig>(config);
  const [activeTab, setActiveTab] = useState<'profile' | 'harnesses'>('profile');
  const [selectedPresetKey, setSelectedPresetKey] = useState<PresetKey>('opencode');

  // Profile form state
  const [profile, setProfile] = useState<UserProfile>(config.userProfile || DEFAULT_USER_PROFILE);

  // 过滤已添加的预设：仅显示尚未添加的预设引擎
  const existingPresetKeys = new Set(localConfig.harnesses.map((h) => h.presetKey));
  const availablePresets = HARNESS_PRESETS.filter((p) => !existingPresetKeys.has(p.presetKey));

  // 当弹窗打开或外部 config 变更时同步最新的 config 数据
  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      setProfile(config.userProfile || DEFAULT_USER_PROFILE);
    }
  }, [isOpen, config]);

  useEffect(() => {
    if (availablePresets.length > 0) {
      setSelectedPresetKey(availablePresets[0].presetKey);
    }
  }, [localConfig.harnesses]);

  if (!isOpen) return null;

  // 删除 Harness ITEM，强校验关联 Agent 并给予引导提示
  const handleDeleteHarness = (id: string) => {
    const harnessToDelete = localConfig.harnesses.find((h) => h.id === id);
    const boundAgents = localConfig.agents.filter((a) => a.harnessId === id);

    if (boundAgents.length > 0) {
      const agentNames = boundAgents.map((a) => `• ${a.name}`).join('\n');
      const confirmDelete = window.confirm(
        `⚠️ 警告：当前有以下 ${boundAgents.length} 个 Agent 角色绑定了 [${harnessToDelete?.name || '此 CLI 引擎'}]：\n\n${agentNames}\n\n确定要继续删除此 CLI 引擎吗？`
      );

      if (!confirmDelete) return;

      setLocalConfig((prev) => ({
        ...prev,
        harnesses: prev.harnesses.filter((h) => h.id !== id)
      }));

      setTimeout(() => {
        alert(
          `✅ 已成功删除 CLI 引擎 [${harnessToDelete?.name || ''}]！\n\n提示：请前往「🤖 管理 Agent 角色」为以下 Agent 更换绑定的 CLI 引擎：\n${agentNames}`
        );
      }, 100);
    } else {
      setLocalConfig((prev) => ({
        ...prev,
        harnesses: prev.harnesses.filter((h) => h.id !== id)
      }));
    }
  };

  // 设置全局默认直接调用的 CLI 引擎
  const handleSetDefaultHarness = (harnessId: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      defaultHarnessId: harnessId
    }));
  };

  // 测试真实对话连通性
  const handleTestChat = async (id: string, presetKey: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      harnesses: prev.harnesses.map((h) =>
        h.id === id ? { ...h, testStatus: 'testing', testOutput: '正在向 CLI 引擎发起健康连通握手...' } : h
      )
    }));

    try {
      const res = await fetch('/api/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetKey, systemPrompt: '' })
      });
      const data = await res.json();

      setLocalConfig((prev) => ({
        ...prev,
        harnesses: prev.harnesses.map((h) =>
          h.id === id
            ? {
                ...h,
                testStatus: data.success ? 'passed' : 'failed',
                testOutput: data.output || '无输出'
              }
            : h
        )
      }));
    } catch (err: any) {
      setLocalConfig((prev) => ({
        ...prev,
        harnesses: prev.harnesses.map((h) =>
          h.id === id ? { ...h, testStatus: 'failed', testOutput: '无法连接后端服务' } : h
        )
      }));
    }
  };

  // 从下拉选择添加预设 Harness CLI
  const handleAddHarness = () => {
    const preset = HARNESS_PRESETS.find((p) => p.presetKey === selectedPresetKey);
    if (!preset) return;

    const newHarness: HarnessConfig = {
      id: `harness-${preset.presetKey}-${Date.now()}`,
      presetKey: preset.presetKey,
      name: preset.name,
      commandPattern: preset.commandPattern,
      description: preset.description,
      testStatus: 'untested'
    };

    setLocalConfig((prev) => ({
      ...prev,
      harnesses: [...prev.harnesses, newHarness]
    }));
  };

  const handleSave = () => {
    if (!profile.nickname || !profile.nickname.trim()) {
      alert('⚠️ 保存失败：用户昵称为必填项！');
      return;
    }

    if (localConfig.harnesses.length === 0) {
      alert('⚠️ 保存失败：必须保留至少一个 Harness CLI 引擎！');
      return;
    }

    const hasDefault = localConfig.harnesses.some((h) => h.id === localConfig.defaultHarnessId);
    if (!hasDefault) {
      alert('⚠️ 保存失败：必须指定一个默认 CLI 引擎！请在 CLI 列表中点击「设为默认 CLI」。');
      return;
    }

    const unpassedHarnesses = localConfig.harnesses.filter((h) => h.testStatus !== 'passed');
    if (unpassedHarnesses.length > 0) {
      const names = unpassedHarnesses.map((h) => `「${h.name}」`).join('、');
      alert(`⚠️ 保存失败：项目中的 ${names} 尚未通过对话测试！\n必须确保每个 CLI 都测试通过 (🟢 绿灯) 方可保存。`);
      return;
    }

    const finalConfig: MaestroConfig = {
      ...localConfig,
      userProfile: profile
    };

    onSave(finalConfig);
    onClose();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#38bdf8' }}>⚙️ Maestro Studio 系统设置</h2>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Tab Header */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #334155', paddingBottom: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setActiveTab('profile')}
            style={{ ...tabStyle, borderBottom: activeTab === 'profile' ? '2px solid #38bdf8' : 'none', color: activeTab === 'profile' ? '#38bdf8' : '#94a3b8' }}
          >
            👤 用户 Profile 设置
          </button>
          <button
            onClick={() => setActiveTab('harnesses')}
            style={{ ...tabStyle, borderBottom: activeTab === 'harnesses' ? '2px solid #38bdf8' : 'none', color: activeTab === 'harnesses' ? '#38bdf8' : '#94a3b8' }}
          >
            💻 Harness CLI 引擎管理
          </button>
        </div>

        {/* Tab 1: User Profile Settings */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '340px', overflowY: 'auto' }}>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              设置您的个人身份与偏好信息。之后 AI 交互时会根据这些背景信息更好地为您服务。
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>
                  用户昵称 / 称呼 <span style={{ color: '#ef4444' }}>*</span>:
                </label>
                <input
                  type="text"
                  value={profile.nickname}
                  onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                  placeholder="如: Ning 或 开发者 (必填)"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={labelStyle}>职业 / 角色定位:</label>
                <input
                  type="text"
                  value={profile.role}
                  onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                  placeholder="如: 高级全栈工程师"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>AI 回答偏好语言:</label>
              <select
                value={profile.preferredLanguage}
                onChange={(e) => setProfile({ ...profile, preferredLanguage: e.target.value })}
                style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}
              >
                <option value="中文">中文 (Chinese)</option>
                <option value="English">English</option>
                <option value="双语 (Bilingual)">双语 (Bilingual)</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>自定义交互指令 / 代码风格偏好 (Custom Instructions):</label>
              <textarea
                value={profile.customInstructions}
                onChange={(e) => setProfile({ ...profile, customInstructions: e.target.value })}
                placeholder="例如: 简明扼要，直接给出高质量代码，包含类型声明与必要注释..."
                rows={4}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontFamily: 'sans-serif', resize: 'vertical' }}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Harness CLI Management */}
        {activeTab === 'harnesses' && (
          <div>
            {/* 下拉菜单与添加区域 */}
            <div style={addBarSectionStyle}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                <label style={{ fontSize: '13px', color: '#94a3b8', whiteSpace: 'nowrap' }}>选择 Harness:</label>
                {availablePresets.length > 0 ? (
                  <>
                    <select
                      value={selectedPresetKey}
                      onChange={(e) => setSelectedPresetKey(e.target.value as PresetKey)}
                      style={selectStyle}
                    >
                      {availablePresets.map((preset) => (
                        <option key={preset.presetKey} value={preset.presetKey}>
                          {preset.name}
                        </option>
                      ))}
                    </select>

                    <button onClick={handleAddHarness} style={addBtnStyle}>
                      + 添加 Harness
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: '12px', color: '#4ade80' }}>
                    已添加全部支持的原厂 CLI 引擎（OpenCode, Claude Code, Codex）。
                  </div>
                )}
              </div>
            </div>

            {/* ITEM 列表区域 */}
            <div style={{ marginTop: '12px' }}>
              <h4 style={{ color: '#f8fafc', margin: '0 0 8px 0', fontSize: '14px' }}>已配置的 Harness CLI 引擎列表</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {localConfig.harnesses.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                    暂无 Harness 节点，请从上方下拉框选择并点击添加。
                  </div>
                ) : (
                  localConfig.harnesses.map((item) => (
                    <div key={item.id} style={{ ...cardStyle, border: '1px solid #334155' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1, marginRight: '12px' }}>
                        <TrafficLight status={item.testStatus || 'untested'} />

                        <div style={{ flex: 1 }}>
                          <strong style={{ color: '#e2e8f0', fontSize: '14px' }}>{item.name}</strong>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{item.description}</div>
                          <div style={{ fontSize: '12px', color: '#38bdf8', fontFamily: 'monospace', marginTop: '4px' }}>
                            {item.commandPattern}
                          </div>

                          {item.testOutput && (
                            <div style={{ fontSize: '11px', marginTop: '6px', color: item.testStatus === 'passed' ? '#4ade80' : '#f87171', whiteSpace: 'pre-wrap', backgroundColor: '#0f172a', padding: '4px 8px', borderRadius: '4px' }}>
                              {item.testOutput}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {localConfig.defaultHarnessId === item.id ? (
                          <button style={activeDefaultBtnStyle} disabled>
                            ⭐ 默认 CLI
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSetDefaultHarness(item.id)}
                            style={setDefaultBtnStyle}
                            title="设为直连驱动的默认 CLI 引擎"
                          >
                            设为默认 CLI
                          </button>
                        )}

                        <button
                          onClick={() => handleTestChat(item.id, item.presetKey)}
                          disabled={item.testStatus === 'testing'}
                          style={testBtnStyle}
                        >
                          {item.testStatus === 'testing' ? '测试中...' : '⚡ 测试'}
                        </button>

                        <button
                          onClick={() => handleDeleteHarness(item.id)}
                          style={deleteBtnStyle}
                          title="删除该 Harness 节点"
                        >
                          🗑️ 删除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button onClick={onClose} style={cancelBtnStyle}>取消</button>
          <button onClick={handleSave} style={saveBtnStyle}>
            保存并应用
          </button>
        </div>
      </div>
    </div>
  );
};

// 🚦 红绿灯指示灯组件
const TrafficLight: React.FC<{ status: 'untested' | 'testing' | 'passed' | 'failed' }> = ({ status }) => {
  let color = '#64748b';
  let tooltip = '未测试';

  if (status === 'passed') {
    color = '#22c55e';
    tooltip = '对话连通测试通过';
  } else if (status === 'failed') {
    color = '#ef4444';
    tooltip = '对话测试失败/超时';
  } else if (status === 'testing') {
    color = '#eab308';
    tooltip = '正在测试对话连通中...';
  }

  return (
    <div
      title={tooltip}
      style={{
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: status === 'passed' ? '0 0 8px #22c55e' : status === 'failed' ? '0 0 8px #ef4444' : 'none',
        marginTop: '4px',
        flexShrink: 0
      }}
    />
  );
};

// Styles
const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '680px', maxWidth: '95vw', color: '#f8fafc'
};

const tabStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: '8px 12px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer'
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px', fontWeight: 'bold'
};

const addBarSectionStyle: React.CSSProperties = {
  backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px'
};

const cardStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: '#1e293b', borderRadius: '8px', padding: '12px 14px'
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', fontSize: '13px', outline: 'none', flex: 1
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', fontSize: '13px', outline: 'none'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer'
};

const addBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#0284c7', color: '#fff', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap'
};

const setDefaultBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: '4px', border: '1px solid #38bdf8', backgroundColor: 'transparent', color: '#38bdf8', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap'
};

const activeDefaultBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: '4px', border: 'none', backgroundColor: '#0284c7', color: '#f8fafc', fontSize: '12px', fontWeight: 'bold', cursor: 'default', whiteSpace: 'nowrap'
};

const testBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: '4px', border: '1px solid #eab308', backgroundColor: 'transparent', color: '#eab308', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap'
};

const deleteBtnStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: '4px', border: '1px solid #ef4444', backgroundColor: 'transparent', color: '#ef4444', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap'
};

const saveBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontWeight: 'bold', cursor: 'pointer'
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 16px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer'
};
