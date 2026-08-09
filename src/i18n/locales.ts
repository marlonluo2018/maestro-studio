export type LanguageKey = '中文' | 'English';

export const translations = {
  '中文': {
    appName: 'Maestro Studio',
    appSubtitle: '直接驱动 CLI 命令行（OpenCode, Claude Code, Codex）的多 Agent 工作台',
    addAgent: '+ 添加 Agent',
    settings: '⚙️ 系统设置',
    selectAgentNotice: '选择当前对话的 Agent 角色（点击快速切换）:',
    cliUnbound: '未绑定 CLI',
    editAgentTitle: '编辑此 Agent 角色',
    inputPlaceholder: '下达任务 (输入 @ 快速切唤指定 Agent，Shift + Enter 换行)...',
    send: '发送',
    thinking: '正在思考与工作，请稍候...',
    newSession: '+ 新建对话',
    sessionHistory: '会话历史',
    rename: '重命名',
    delete: '删除',
    save: '保存',
    cancel: '取消',
    
    // Agent Modal
    agentModalAddTitle: '🤖 添加新 Agent 角色',
    agentModalEditTitle: '✏️ 编辑 Agent 角色',
    agentNameLabel: 'Agent 名字',
    agentTagLabel: 'Tag 区分标签',
    boundCliLabel: '绑定的 CLI 引擎',
    systemPromptLabel: '专属 System Prompt / 角色提示词:',
    optimizePromptBtn: '✨ 优化系统提示词',
    optimizingBtn: '⏳ 正在智能优化中...',
    descriptionLabel: '角色职责描述',
    confirmAdd: '确认添加',
    saveChanges: '保存修改',
    deleteRole: '🗑️ 删除该角色',

    // Settings Modal
    settingsTitle: '⚙️ Maestro Studio 系统设置',
    userProfileTab: '👤 用户 Profile 设置',
    harnessManagerTab: '💻 Harness CLI 引擎管理',
    userNicknameLabel: '用户昵称 / 称呼',
    userRoleLabel: '职业 / 角色定位',
    preferredLangLabel: '用户偏好语言',
    customInstructionsLabel: '自定义交互指令 / 代码风格偏好 (Custom Instructions)',
    selectHarnessLabel: '选择 Harness:',
    addHarnessBtn: '+ 添加 Harness',
    configuredHarnessesTitle: '已配置的 Harness CLI 引擎列表',
    setAsDefaultCli: '设为默认 CLI',
    currentDefaultCli: '⭐ 默认 CLI',
    testBtn: '⚡ 测试',
    testingBtn: '测试中...',
    saveAndApply: '保存并应用'
  },
  'English': {
    appName: 'Maestro Studio',
    appSubtitle: 'Desktop multi-agent workspace driving native CLIs (OpenCode, Claude Code, Codex)',
    addAgent: '+ Add Agent',
    settings: '⚙️ Settings',
    selectAgentNotice: 'Select active Agent role (click to switch):',
    cliUnbound: 'Unbound',
    editAgentTitle: 'Edit this Agent role',
    inputPlaceholder: 'Assign a task (type @ to mention Agent, Shift + Enter for new line)...',
    send: 'Send',
    thinking: 'is thinking and working, please wait...',
    newSession: '+ New Chat',
    sessionHistory: 'Chat History',
    rename: 'Rename',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    
    // Agent Modal
    agentModalAddTitle: '🤖 Add New Agent Role',
    agentModalEditTitle: '✏️ Edit Agent Role',
    agentNameLabel: 'Agent Name',
    agentTagLabel: 'Tag Label',
    boundCliLabel: 'Bound CLI Engine',
    systemPromptLabel: 'Dedicated System Prompt:',
    optimizePromptBtn: '✨ Optimize System Prompt',
    optimizingBtn: '⏳ Optimizing Prompt...',
    descriptionLabel: 'Role Description',
    confirmAdd: 'Add Agent',
    saveChanges: 'Save Changes',
    deleteRole: '🗑️ Delete Role',

    // Settings Modal
    settingsTitle: '⚙️ Maestro Studio Settings',
    userProfileTab: '👤 User Profile',
    harnessManagerTab: '💻 Harness CLI Management',
    userNicknameLabel: 'User Nickname',
    userRoleLabel: 'Occupation / Role',
    preferredLangLabel: 'User Preferred Language',
    customInstructionsLabel: 'Custom Instructions / Code Style Preferences',
    selectHarnessLabel: 'Select Harness:',
    addHarnessBtn: '+ Add Harness',
    configuredHarnessesTitle: 'Configured Harness CLI Engines',
    setAsDefaultCli: 'Set as Default CLI',
    currentDefaultCli: '⭐ Default CLI',
    testBtn: '⚡ Test',
    testingBtn: 'Testing...',
    saveAndApply: 'Save & Apply'
  }
};

export function getTranslation(lang?: string) {
  if (lang && (lang.includes('English') || lang.includes('en'))) {
    return translations['English'];
  }
  return translations['中文'];
}

export interface ThemeColors {
  bg: string;
  sidebarBg: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  inputBg: string;
  activeBg: string;
  activeBorder: string;
}

export const themes = {
  dark: {
    bg: '#0f172a',        // slate-900
    sidebarBg: '#090d16', // darker slate
    card: '#1e293b',      // slate-800
    border: '#334155',    // slate-700
    text: '#f8fafc',      // slate-50
    textMuted: '#94a3b8', // slate-400
    inputBg: '#0f172a',   // slate-900
    activeBg: '#0284c7',   // sky-600
    activeBorder: '#38bdf8' // sky-400
  },
  light: {
    bg: '#f8fafc',        // slate-50
    sidebarBg: '#e2e8f0', // slate-200
    card: '#ffffff',      // white
    border: '#cbd5e1',    // slate-300
    text: '#0f172a',      // slate-900
    textMuted: '#475569', // slate-600
    inputBg: '#f1f5f9',   // slate-100
    activeBg: '#0284c7',   // sky-600 (已加深蓝色，白字极度清晰)
    activeBorder: '#0369a1' // sky-700
  }
};

export function getThemeColors(theme?: 'dark' | 'light'): ThemeColors {
  if (theme === 'light') {
    return themes.light;
  }
  return themes.dark;
}
