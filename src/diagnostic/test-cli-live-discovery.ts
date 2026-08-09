import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { auditOpenCodeSkills } from './test-opencode-skills.js';
import { auditCodexSkills } from './test-codex-skills.js';

// Helper to get home directory
const HOME_DIR = os.homedir();

// 过滤控制台 ANSI 颜色与格式
function stripAnsi(str: string): string {
  if (!str) return '';
  return str
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    .trim();
}

// 封装一个不挂起的单次命令执行收集器 (将完整指令拼为一个 string 传给 spawn 解决 Windows 传参丢失 bug，并支持自定义初次超时)
function runLiveCommand(fullCommand: string, initialTimeoutMs: number = 4000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(fullCommand, {
      shell: true,
      env: process.env
    });

    let output = '';
    let errorOutput = '';

    child.stdin?.end();

    // 设置非活动超时保障
    let timer = setTimeout(() => {
      child.kill();
      resolve(output.trim() || errorOutput.trim() || '');
    }, initialTimeoutMs);

    child.stdout?.on('data', (chunk) => {
      clearTimeout(timer);
      output += chunk.toString();
      timer = setTimeout(() => {
        child.kill();
        resolve(output.trim());
      }, 1500); // 1.5 秒非活动即关闭
    });

    child.stderr?.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    child.on('error', (err) => {
      resolve(`[Spawn Error]: ${err.message}`);
    });

    child.on('close', () => {
      clearTimeout(timer);
      resolve(output.trim() || errorOutput.trim() || '');
    });
  });
}

// 同步、阻塞式执行单发命令 (对于诊断、只读类查询，execSync 100% 稳妥且能等进程自然结束)
function runSyncCommand(cmd: string): string {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"]
    } as any).trim();
  } catch {
    return "";
  }
}

function loadJson(p: string): Record<string, any> {
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch {}
  return {};
}

// ======================================================================
// 🎒 CLAUDE CODE 专属探测器方法 (完全提取自 test-claude-mcp-skills)
// ======================================================================

// 1. 级联探测当前活跃模型
function detectClaudeActiveModel() {
  if (process.env.ANTHROPIC_MODEL) {
    return { source: "env:ANTHROPIC_MODEL", model: process.env.ANTHROPIC_MODEL };
  }
  const globalSettings = loadJson(path.join(HOME_DIR, ".claude/settings.json"));
  if (globalSettings.model) {
    return { source: "~/.claude/settings.json", model: globalSettings.model };
  }
  const projectShared = loadJson(".claude/settings.json");
  if (projectShared.model) {
    return { source: ".claude/settings.json", model: projectShared.model };
  }
  const projectLocal = loadJson(".claude/settings.local.json");
  if (projectLocal.model) {
    return { source: ".claude/settings.local.json", model: projectLocal.model };
  }
  return { source: "account-default", model: "default" };
}

// 2. 自适应解析 Claude Code MCP 服务器列表 (Windows + Unix 双重兼容)
function detectClaudeMcpServers(): any[] {
  try {
    const jsonRaw = runSyncCommand("claude mcp list --json");
    if (jsonRaw && jsonRaw.trim().startsWith("{")) {
      const parsed = JSON.parse(jsonRaw);
      return Array.isArray(parsed) ? parsed : (parsed.servers || [parsed]);
    }
  } catch (e) {}

  const output = runSyncCommand("claude mcp list");
  if (!output) return [];

  const lines = output.split("\n");
  const mcpServers: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes("Checking MCP") || !trimmed.includes("Connected")) {
      continue;
    }

    if (trimmed.includes(":") && trimmed.includes("Connected")) {
      const [name, ...restParts] = trimmed.split(":");
      const rest = restParts.join(":").split("-")[0].trim();
      mcpServers.push({ name: name.trim(), scope: "global", command: rest });
    } else if (trimmed.startsWith("- ")) {
      const [, rest] = trimmed.split("- ");
      const [nameScope, command] = rest.split(":");
      const match = nameScope.match(/^(.+?)\s\((.+?)\)$/);
      if (match) {
        mcpServers.push({ name: match[1], scope: match[2], command: command?.trim() ?? "" });
      }
    }
  }
  return mcpServers;
}

// 3. 扫描本地及项目级 Skills
function scanClaudeSkills(dir: string, scope: string): any[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
      .map(name => {
        const skillMd = path.join(dir, name, "SKILL.md");
        const skillMdLower = path.join(dir, name, "skill.md");
        const filePath = fs.existsSync(skillMd) ? skillMd : skillMdLower;
        let description = '无描述信息';

        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const descMatch = content.match(/description:\s*(.*)/i);
            if (descMatch) {
              description = descMatch[1].replace(/['"]/g, '').trim();
            }
          } catch {}
        }

        return { scope, name, description, path: filePath };
      })
      .filter(s => fs.existsSync(s.path));
  } catch {
    return [];
  }
}

// ======================================================================
// 🤖 OPENAI CODEX 专属探测器方法 
// ======================================================================

// 1. 读取 config.toml 与自适应解析模型目录 JSON
function detectCodexModels(): { activeModel: string; models: string[] } {
  const pathsToTry = [
    path.join(HOME_DIR, '.codex', 'config.toml'),
    path.join(HOME_DIR, '.config', 'codex', 'config.toml')
  ];

  let activeModel = '未检测到默认配置模型';
  let catalogFileName = 'cc-switch-model-catalog.json';

  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const modelMatch = content.match(/^model\s*=\s*"(.*?)"/m);
        const catalogMatch = content.match(/^model_catalog_json\s*=\s*"(.*?)"/m);
        if (modelMatch) activeModel = modelMatch[1];
        if (catalogMatch) catalogFileName = catalogMatch[1];
      } catch (e) {}
    }
  }

  const models: string[] = [];
  try {
    const rawCatalog = runSyncCommand('codex debug models');
    if (rawCatalog && rawCatalog.trim().startsWith('{')) {
      const parsed = JSON.parse(rawCatalog);
      if (parsed && Array.isArray(parsed.models)) {
        for (const m of parsed.models) {
          if (m && m.slug) models.push(m.slug);
        }
      }
    }
  } catch {}

  if (models.length === 0) {
    const cp = path.join(HOME_DIR, '.codex', catalogFileName);
    if (fs.existsSync(cp)) {
      try {
        const raw = fs.readFileSync(cp, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.models)) {
          for (const m of parsed.models) {
            if (m && m.slug) models.push(m.slug);
          }
        }
      } catch {}
    }
  }

  return { activeModel, models };
}

// 2. 自适应解析 Codex MCP 服务器
function detectCodexMcpServers(): any[] {
  try {
    const jsonOut = runSyncCommand('codex mcp list --json');
    if (jsonOut && jsonOut.trim().startsWith('[')) {
      return JSON.parse(jsonOut);
    }
  } catch (e) {}

  const textOut = runSyncCommand('codex mcp list');
  if (!textOut) return [];
  return textOut
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => ({ name: l.trim(), scope: 'global' }));
}


// ======================================================================
// 🎬 主探测入口 (Live Discovery Launcher)
// ======================================================================
async function startLiveDiscovery() {
  console.log(`\n======================================================================`);
  console.log(`🎵 Maestro Studio - 运行态能力、全局 MCP 与 3 大 CLI 专属 Skills 探测系统`);
  console.log(`安全机制：采用 100% 运行态指令与级联检测，完美适应 cc-switch 等环境切换`);
  console.log(`======================================================================\n`);

  // ==================== 1. OpenCode CLI 探测 ====================
  console.log(`[探测 1/3] 正在探测 OpenCode CLI 运行态能力...`);
  
  const opencodeModels = stripAnsi(runSyncCommand('opencode models'));
  console.log(`\n🟢 OpenCode - 预设可用 AI 模型列表:`);
  console.log(`----------------------------------------`);
  console.log(opencodeModels || '（未探测到可用模型列表）');
  console.log(`----------------------------------------`);

  const opencodeMcp = stripAnsi(runSyncCommand('opencode mcp list'));
  console.log(`\n🟢 OpenCode - 当前激活的全局 MCP 插件:`);
  console.log(`----------------------------------------`);
  console.log(opencodeMcp || '（未探测到已连接的 MCP 服务器）');
  console.log(`----------------------------------------`);

  const opencodeAgents = stripAnsi(runSyncCommand('opencode agent list'));
  const opencodeAgentNames = opencodeAgents
    .split('\n')
    .filter(line => line.includes('(primary)') || line.includes('(subagent)'))
    .map(line => `   🤖 ${line.trim()}`);

  console.log(`\n🟢 OpenCode - 内置 Agents 角色列表:`);
  console.log(`----------------------------------------`);
  if (opencodeAgentNames.length > 0) {
    console.log(opencodeAgentNames.join('\n'));
  } else {
    console.log(opencodeAgents || '（未探测到 Agents 角色列表）');
  }
  console.log(`----------------------------------------`);

  // 关键新增：扫描并展示 OpenCode 已装载的全局/项目级 Markdown Skills 与规则
  const opencodeSkills = auditOpenCodeSkills();
  console.log(`\n🟢 OpenCode - 探测到的专属技能列表 (Global & Project Skills):`);
  console.log(`----------------------------------------`);
  if (opencodeSkills.length > 0) {
    opencodeSkills.forEach((s) => {
      console.log(`   🎒 [Skill - ${s.scope}] ${s.name} - ${s.description || '无描述'}`);
    });
  } else {
    console.log('（未检测到 OpenCode 专属技能）');
  }
  console.log(`----------------------------------------\n`);


  // ==================== 2. OpenAI Codex CLI 探测 ====================
  console.log(`[探测 2/3] 正在探测 OpenAI Codex CLI 运行态能力...`);

  const codexVersion = stripAnsi(runSyncCommand('codex --version'));
  console.log(`\n🟢 Codex - 版本信息:`);
  console.log(`----------------------------------------`);
  console.log(codexVersion || '（未检测到 Codex CLI 安装）');
  console.log(`----------------------------------------`);

  const { activeModel, models: codexModelList } = detectCodexModels();
  console.log(`\n🟢 Codex - 活跃及可用 AI 模型列表 (自适应解析 debug models JSON):`);
  console.log(`----------------------------------------`);
  console.log(`当前选中主模型: ${activeModel}`);
  if (codexModelList.length > 0) {
    console.log(`支持的可用模型系列:\n` + codexModelList.map(m => `- ${m}`).join('\n'));
  }
  console.log(`----------------------------------------`);

  const codexMcps = detectCodexMcpServers();
  console.log(`\n🟢 Codex - 当前激活的外置 MCP 服务器列表:`);
  console.log(`----------------------------------------`);
  if (codexMcps.length > 0) {
    console.log(JSON.stringify(codexMcps, null, 2));
  } else {
    console.log('（未探测到已连接 the MCP 服务器）');
  }
  console.log(`----------------------------------------`);

  // 关键新增：扫描并展示 Codex 的全局/项目级专属技能（Skills & Plugins）
  const codexSkills = auditCodexSkills();
  console.log(`\n🟢 Codex - 探测到的专属技能与插件列表 (Global & Project Skills):`);
  console.log(`----------------------------------------`);
  if (codexSkills.length > 0) {
    codexSkills.forEach((s) => {
      console.log(`   🎒 [Skill - ${s.source}] ${s.name} - ${s.description || '无描述'}`);
    });
  } else {
    const codexPlugins = stripAnsi(runSyncCommand('codex plugin list'));
    console.log(codexPlugins || '（暂无已加载的自定义 Plugin）');
  }
  console.log(`----------------------------------------\n`);


  // ==================== 3. Claude Code CLI 探测 ====================
  console.log(`[探测 3/3] 正在探测 Claude Code CLI 运行态能力...`);

  let claudeVersion = stripAnsi(runSyncCommand('claude --version'));
  if (!claudeVersion || claudeVersion.includes('not found') || claudeVersion.includes('Error')) {
    console.log(`   (直接运行 'claude' 失败，正在通过 npx 启动探测，这可能需要数秒时间...)`);
    claudeVersion = stripAnsi(await runLiveCommand('npx -y @anthropic-ai/claude-code --version', 18000));
  }

  console.log(`\n🟢 Claude Code - 版本信息:`);
  console.log("----------------------------------------");
  console.log(claudeVersion || '（未检测到 Claude Code CLI）');
  console.log("----------------------------------------");

  const claudeModelInfo = detectClaudeActiveModel();
  console.log(`\n🟢 Claude Code - 当前活跃模型 (通过级联策略探测):`);
  console.log("----------------------------------------");
  console.log(`当前选中主模型: ${claudeModelInfo.model} (数据源自: ${claudeModelInfo.source})`);
  console.log("----------------------------------------");

  // 使用最稳健的同步检查获取外部 MCP 列表，防止被超时拦截！
  const claudeMcps = detectClaudeMcpServers();
  console.log(`\n🟢 Claude Code - 当前激活的外置 MCP 服务器列表:`);
  console.log("----------------------------------------");
  if (claudeMcps.length > 0) {
    console.log(JSON.stringify(claudeMcps, null, 2));
  } else {
    console.log('（未探测到已配置的 MCP 服务器）');
  }
  console.log("----------------------------------------");

  const userSkills = scanClaudeSkills(path.join(HOME_DIR, ".claude/skills"), "user");
  const projectSkills = scanClaudeSkills(".claude/skills", "project");
  const allClaudeSkills = [...userSkills, ...projectSkills];

  console.log(`\n🟢 Claude Code - 双重域专属技能列表 (Global & Project Skills):`);
  console.log("----------------------------------------");
  if (allClaudeSkills.length > 0) {
    allClaudeSkills.forEach((s) => {
      console.log(`   🎒 [Skill - ${s.scope}] ${s.name} - ${s.description}`);
    });
  } else {
    console.log('（未检测到自定义全局/项目专属技能）');
  }
  console.log("----------------------------------------\n");

  console.log(`======================================================================`);
  console.log(`🎉 运行态多维大探测成功！测试逻辑已合并至 src/test-cli-live-discovery.ts`);
  console.log(`======================================================================`);
}

startLiveDiscovery();
