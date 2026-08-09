export type PresetKey = 'opencode' | 'claude-code' | 'codex';

export interface HarnessConfig {
  id: string;
  presetKey: PresetKey;
  name: string;
  commandPattern: string; // 命令模板，如: 'opencode run "{prompt}"'
  description: string;
  defaultAgentId?: string; // 该 Harness CLI 引擎关联的默认 Agent 角色 ID
  testStatus?: 'untested' | 'testing' | 'passed' | 'failed';
  testOutput?: string;
}

export interface SubAgentConfig {
  id: string;
  name: string;          // Agent 名字 (如 "代码审查专家")
  tag: string;           // Agent 区分 Tag/标签 (仅展示用，如 "审查", "重构", "架构")
  harnessId: string;     // 绑定的 CLI Harness ID
  systemPrompt: string;  // 专属角色提示词
  description: string;   // 描述/职责说明
}

export interface UserProfile {
  nickname: string;          // 昵称
  role: string;              // 角色
  preferredLanguage: string; // 偏好语言
  customInstructions: string;// 偏好习惯/自定义 Prompt 约束
}

export interface SessionMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;        // 格式 HH:mm
  userNickname?: string;    // 用户发送时的昵称
  agentName?: string;       // 响应该消息的 Agent 名字
  harnessName?: string;     // 响应该消息的 Harness CLI 名称
}

export interface SessionIndexItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeAgentId: string;
  messageCount: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeAgentId: string;
  messages: SessionMessage[];
}

export interface MaestroConfig {
  activeAgentId: string;
  defaultHarnessId?: string; // 默认全局直接调用的 CLI 引擎 ID
  userProfile: UserProfile;
  harnesses: HarnessConfig[];
  agents: SubAgentConfig[];
}

export const HARNESS_PRESETS: Array<{ presetKey: PresetKey; name: string; commandPattern: string; description: string }> = [
  {
    presetKey: 'opencode',
    name: 'OpenCode CLI',
    commandPattern: 'opencode run "{prompt}"',
    description: '使用 OpenCode 原厂 CLI 驱动 (`opencode run "..."`)'
  },
  {
    presetKey: 'claude-code',
    name: 'Claude Code CLI',
    commandPattern: 'npx @anthropic-ai/claude-code "{prompt}"',
    description: '使用 Anthropic Claude Code CLI (`claude "..."`)'
  },
  {
    presetKey: 'codex',
    name: 'Codex CLI',
    commandPattern: 'codex exec "{prompt}" --skip-git-repo-check -c developer_instructions="{systemPrompt}"',
    description: '使用 OpenAI Codex CLI (`codex exec "..." -c developer_instructions="..."`)'
  }
];

export const DEFAULT_USER_PROFILE: UserProfile = {
  nickname: '',
  role: '',
  preferredLanguage: '中文',
  customInstructions: ''
};

export const DEFAULT_CONFIG: MaestroConfig = {
  activeAgentId: 'agent-opencode-reviewer',
  defaultHarnessId: 'harness-opencode-default',
  userProfile: DEFAULT_USER_PROFILE,
  harnesses: [
    {
      id: 'harness-opencode-default',
      presetKey: 'opencode',
      name: 'OpenCode CLI',
      commandPattern: 'opencode run "{prompt}"',
      description: '使用 OpenCode 原厂 CLI 驱动 (`opencode run "..."`)',
      defaultAgentId: 'agent-opencode-reviewer',
      testStatus: 'passed',
      testOutput: '对话测试通过 (Hello to you!)'
    },
    {
      id: 'harness-codex-default',
      presetKey: 'codex',
      name: 'Codex CLI',
      commandPattern: 'codex exec "{prompt}" --skip-git-repo-check -c developer_instructions="{systemPrompt}"',
      description: '使用 OpenAI Codex CLI (`codex exec "..." -c developer_instructions="..."`)',
      defaultAgentId: 'agent-codex-arch',
      testStatus: 'passed',
      testOutput: '对话测试通过 (Hi! How can I help you today?)'
    }
  ],
  agents: [
    {
      id: 'agent-opencode-reviewer',
      name: 'OpenCode 审查专家',
      tag: '代码审查',
      harnessId: 'harness-opencode-default',
      systemPrompt: '请重点审查代码中的潜在 Bug、规范性与可读性。',
      description: '基于 OpenCode CLI 驱动的代码审查角色'
    },
    {
      id: 'agent-opencode-coder',
      name: 'OpenCode 快速编码员',
      tag: '快速重构',
      harnessId: 'harness-opencode-default',
      systemPrompt: '请直接给出高清干净的代码与具体改动。',
      description: '复用 OpenCode CLI 驱动的纯编码角色'
    },
    {
      id: 'agent-codex-arch',
      name: 'Codex 架构工程师',
      tag: '系统架构',
      harnessId: 'harness-codex-default',
      systemPrompt: '请关注代码架构设计、类型安全与扩展性。',
      description: '基于 Codex CLI 驱动的架构角色'
    }
  ]
};
