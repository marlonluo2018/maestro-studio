#!/usr/bin/env tsx
/**
 * Codex CLI 审计脚本：MCP / Models / Agents
 * 依赖：Node.js 18+，全局安装 codex CLI
 */

import { execFileSync } from "child_process";

interface McpServer {
  name: string;
  [key: string]: any;
}

interface AuditResult {
  mcp: {
    success: boolean;
    servers: McpServer[];
    raw?: string;
    error?: string;
  };
  models: {
    success: boolean;
    catalog?: any;
    current?: string;
    error?: string;
  };
  agents: {
    success: boolean;
    output?: string;
    error?: string;
    note: string;
  };
}

function runCmd(cmd: string, args: string[], timeout = 15000): string {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf-8",
      timeout,
      shell: true, // 强保障 Windows 环境下能正确定位全局 npm 的 codex.cmd 命令行管道
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e: any) {
    if (e.stdout) return e.stdout.trim();
    if (e.stderr) return e.stderr.trim();
    throw e;
  }
}

function auditMcp(): AuditResult["mcp"] {
  try {
    // 优先 JSON 输出
    const jsonOut = runCmd("codex", ["mcp", "list", "--json"]);
    if (jsonOut) {
      try {
        const parsed = JSON.parse(jsonOut);
        const servers = Array.isArray(parsed) ? parsed : (parsed.servers || [parsed]);
        return { success: true, servers };
      } catch {
        // JSON 解析失败，回退到文本
      }
    }
    // 回退：普通文本输出
    const textOut = runCmd("codex", ["mcp", "list"]);
    const servers = textOut
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => ({ name: l.trim() }));
    return { success: true, servers, raw: textOut };
  } catch (e: any) {
    return { success: false, servers: [], error: e.message };
  }
}

function auditModels(): AuditResult["models"] {
  const result: AuditResult["models"] = { success: false };

  // ① 尝试 codex debug models（打印原始模型目录）
  try {
    const out = runCmd("codex", ["debug", "models"]);
    result.catalog = out;
    result.success = true;
  } catch (e: any) {
    result.error = `debug models failed: ${e.message}`;
  }

  // ② 尝试拿到"当前生效模型"——通过 /status
  try {
    const status = runCmd("codex", ["-p", "/status"]);
    const m = status.match(/model:\s*([^\s]+)/i);
    if (m) result.current = m[1];
  } catch {
    // ignore
  }

  // ③ 备用：/model list（部分版本支持）
  if (!result.catalog) {
    try {
      const out = runCmd("codex", ["-p", "/model list"]);
      result.catalog = out;
      result.success = true;
    } catch {
      // ignore
    }
  }

  return result;
}

function auditAgents(): AuditResult["agents"] {
  try {
    const out = runCmd("codex", ["-p", "/agent"]);
    return {
      success: true,
      output: out,
      note: "Codex 无独立 agent list 命令；此为 /agent TUI 命令输出，可能为空或显示当前 subagent 线程",
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message,
      note: "Codex subagent 信息无法通过 CLI 稳定枚举，需进入交互会话查看 /agent",
    };
  }
}

function main() {
  const result: AuditResult = {
    mcp: auditMcp(),
    models: auditModels(),
    agents: auditAgents(),
  };

  console.log(JSON.stringify(result, null, 2));

  // 简要摘要
  console.error("\n========== 摘要 ==========");
  console.error(`MCP servers: ${result.mcp.success ? result.mcp.servers.length : "FAILED"}`);
  console.error(`Models catalog: ${result.models.success ? "OK" : "FAILED"}`);
  console.error(`Current model: ${result.models.current || "unknown"}`);
  console.error(`Agents: ${result.agents.success ? "reported" : "no CLI command"}`);
}

main();
