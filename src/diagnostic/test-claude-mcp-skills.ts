import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

// 兼容 Windows / Unix 的 Home 目录解析获取
const HOME = os.homedir();
const USER_SKILLS = path.join(HOME, ".claude/skills");
const PROJECT_SKILLS = ".claude/skills";

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function loadJson(p: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

// 探测 Claude Code 的当前活跃模型 (级联探测策略：env -> ~/.claude/settings.json -> .claude/settings.json -> .claude/settings.local.json -> default)
function detectActiveModel() {
  // ① env 环境变量优先
  if (process.env.ANTHROPIC_MODEL) {
    return { source: "env:ANTHROPIC_MODEL", model: process.env.ANTHROPIC_MODEL };
  }

  // ② 全局 ~/.claude/settings.json 配置文件
  const globalSettings = loadJson(path.join(HOME, ".claude/settings.json"));
  if (globalSettings.model) {
    return { source: "~/.claude/settings.json", model: globalSettings.model };
  }

  // ③ 项目级共享设置 .claude/settings.json
  const projectShared = loadJson(".claude/settings.json");
  if (projectShared.model) {
    return { source: ".claude/settings.json", model: projectShared.model };
  }

  // ④ 项目级本地私有设置 .claude/settings.local.json
  const projectLocal = loadJson(".claude/settings.local.json");
  if (projectLocal.model) {
    return { source: ".claude/settings.local.json", model: projectLocal.model };
  }

  // ⑤ 兜底默认值
  return { source: "account-default", model: "default (depends on subscription)" };
}

function listMcp() {
  // 1️⃣ 尝试官方原生 JSON 输出
  try {
    const raw = run("claude mcp list --json");
    if (raw && raw.trim().startsWith("{")) {
      return JSON.parse(raw);
    }
  } catch (e) {
    // 忽略错误，继续执行降级解析
  }

  // 2️⃣ 降级回退：自适应解析不同操作系统下的 stdout 文本格式
  const output = run("claude mcp list");
  if (!output) return [];

  const lines = output.split("\n");
  const mcpServers: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes("Checking MCP") || !trimmed.includes("Connected")) {
      continue;
    }

    // Windows 格式: tavily: cmd /c npx -y tavily-mcp@latest - ✔ Connected
    if (trimmed.includes(":") && trimmed.includes("Connected")) {
      const [name, ...restParts] = trimmed.split(":");
      const rest = restParts.join(":").split("-")[0].trim();
      mcpServers.push({
        name: name.trim(),
        scope: "global",
        command: rest
      });
    } 
    // Unix/macOS 格式: - Name (Scope): Command
    else if (trimmed.startsWith("- ")) {
      const [, rest] = trimmed.split("- ");
      const [nameScope, command] = rest.split(":");
      const match = nameScope.match(/^(.+?)\s\((.+?)\)$/);
      if (match) {
        mcpServers.push({
          name: match[1],
          scope: match[2],
          command: command?.trim() ?? ""
        });
      }
    }
  }

  return mcpServers;
}

function listSkills(dir: string, scope: string) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
      .map(name => ({
        scope,
        name,
        path: path.join(dir, name, "SKILL.md")
      }))
      .filter(s => fs.existsSync(s.path));
  } catch {
    return [];
  }
}

const result = {
  activeModel: detectActiveModel(),
  mcp: listMcp(),
  skills: [
    ...listSkills(USER_SKILLS, "user"),
    ...listSkills(PROJECT_SKILLS, "project")
  ]
};

console.log(JSON.stringify(result, null, 2));
