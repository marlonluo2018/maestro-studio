import { execSync, spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";

export interface SDKAdapterResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface AgentSDKAdapter {
  checkHealth(): Promise<{ success: boolean; message: string }>;
  streamChat(
    prompt: string,
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<SDKAdapterResult>;
}

// 过滤控制台 ANSI 颜色与格式转义字符 (\u001b[...m)
export function stripAnsi(str: string): string {
  if (!str) return "";
  return str
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    .trim();
}

// 过滤 OpenCode / Claude Code / Codex 的 CLI 运行状态日志与工具诊断
export function cleanCLIOutput(str: string): string {
  if (!str) return '';

  const stripped = stripAnsi(str);
  const lines = stripped.split('\n');

  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();

    // 过滤 OpenCode 提示头部状态标志，如 "> build · gemini-3.6-flash"
    if (/^>\s*\w+.*[·•]/i.test(trimmed) || /^>\s*build/i.test(trimmed)) {
      return false;
    }

    // 过滤工具调用中间诊断日志，如 "✱ Glob "*"", "→ Read package.json", "✓ Write ..."
    if (/^[✱→✓✦⏺]\s*(Glob|Read|Write|Edit|Bash|Execute|File|Search)/i.test(trimmed)) {
      return false;
    }

    // 过滤 Codex CLI 头部信息与诊断标志
    if (/^Reading (additional input|prompt) from stdin/i.test(trimmed)) return false;
    if (/^OpenAI Codex v\d+/i.test(trimmed)) return false;
    if (/^-{3,}$/.test(trimmed)) return false;
    if (/^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i.test(trimmed)) return false;
    if (/^tokens used/i.test(trimmed)) return false;
    if (/^\d{1,3}(,\d{3})*$/.test(trimmed)) return false; // 过滤独立的 token 数量行如 8,617
    if (/^user.*codex/i.test(trimmed)) return false;

    return true;
  });

  let result = filteredLines.join('\n').trim();
  result = result.replace(/^[✱→✓✦⏺]\s*(Glob|Read|Write)\s*".*?"/gi, '').trim();

  return result;
}

// ======================================================================
// 🎒 1. Claude Code 适配器（基于 Claude CLI 原生流式驱动）
// ======================================================================
export class ClaudeCodeSDKAdapter implements AgentSDKAdapter {
  public async checkHealth(): Promise<{ success: boolean; message: string }> {
    try {
      const out = execSync("claude --version", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
      if (out.trim()) {
        return { success: true, message: `Claude Code CLI 已就绪 (${stripAnsi(out)})` };
      }
    } catch {}
    return { success: false, message: "在系统 PATH 中未检测到 Claude Code CLI 可执行文件" };
  }

  public async streamChat(
    prompt: string,
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<SDKAdapterResult> {
    let accumulatedText = "";

    try {
      const HOME_DIR = os.homedir();
      const settingsPath = path.join(HOME_DIR, '.claude', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(raw);
        if (settings.env) {
          for (const [key, value] of Object.entries(settings.env)) {
            process.env[key] = value as string;
          }
          if (settings.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
            process.env.ANTHROPIC_API_KEY = settings.env.ANTHROPIC_AUTH_TOKEN;
          }
        }
      }

      const fullSystemPrompt = systemPrompt ? `[系统角色指令: ${systemPrompt}]\n\n` : "";
      const queryPrompt = `${fullSystemPrompt}${prompt}`;

      console.log(`[Claude CLI Runner] 正在通过 Stdin 管道流原生驱动...`);

      // 🌟 核心升级：通过标准输入 (Stdin) 将多行长提示词级联写入，完全绕过 Windows 8191 字符命令行长度限制与转义 bug！ 🌟
      const exeName = os.platform() === "win32" ? "claude.cmd" : "claude";
      const child = spawn(exeName, [], { shell: true, env: process.env });
      
      child.stdin?.write(queryPrompt);
      child.stdin?.end();

      child.stdout?.on("data", (data) => {
        const cleanChunk = cleanCLIOutput(data.toString());
        if (cleanChunk) {
          accumulatedText += cleanChunk;
          onChunk(cleanChunk);
        }
      });

      child.stderr?.on("data", (data) => {
        const cleanChunk = cleanCLIOutput(data.toString());
        if (cleanChunk && !cleanChunk.includes("Checking") && !cleanChunk.includes("connected")) {
          accumulatedText += cleanChunk;
          onChunk(cleanChunk);
        }
      });

      return new Promise((resolve) => {
        child.on("close", (code) => {
          resolve({
            success: code === 0 || accumulatedText.length > 0,
            output: accumulatedText.trim()
          });
        });
      });
    } catch (err: any) {
      return {
        success: false,
        output: accumulatedText,
        error: err.message
      };
    }
  }
}

// ======================================================================
// 🤖 2. OpenAI Codex 官方 SDK 适配器
// ======================================================================
export class CodexSDKAdapter implements AgentSDKAdapter {
  public async checkHealth(): Promise<{ success: boolean; message: string }> {
    try {
      const out = execSync("codex --version", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
      if (out.trim()) {
        return { success: true, message: `Codex CLI 已就绪 (${stripAnsi(out)})` };
      }
    } catch {}
    return { success: false, message: "在系统 PATH 中未检测到 Codex CLI 可执行文件" };
  }

  public async streamChat(
    prompt: string,
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<SDKAdapterResult> {
    let accumulatedText = "";
    try {
      console.log(`[Codex CLI Runner] 正在通过 Stdin 管道流原生驱动...`);

      // 🌟 核心升级：将系统指令与用户提示词全部合并入 Stdin 内存流写入，彻底消除 -c developer_instructions 参数溢出 8191 字符死穴 🌟
      const fullPrompt = systemPrompt ? `[系统角色与全局环境规约]:\n${systemPrompt}\n\n[当前用户任务与数据]:\n${prompt}` : prompt;
      const args = ["exec", "--skip-git-repo-check", "--json"];
      
      const exeName = os.platform() === "win32" ? "codex.cmd" : "codex";
      const child = spawn(exeName, args, { shell: true, env: process.env });
      
      child.stdin?.write(fullPrompt);
      child.stdin?.end();

      let stdoutBuffer = "";

      child.stdout?.on("data", (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || ""; // 剩余未换行的保留在 buffer 中

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const json = JSON.parse(trimmed);
              // 提取 Codex JSONL 中的 agent_message 文本内容
              if (json.type === "item.completed" && json.item?.type === "agent_message" && json.item?.text) {
                const text = cleanCLIOutput(json.item.text);
                if (text) {
                  accumulatedText += text;
                  onChunk(text);
                }
              } else if (json.type === "agent_message" && json.text) {
                const text = cleanCLIOutput(json.text);
                if (text) {
                  accumulatedText += text;
                  onChunk(text);
                }
              } else if (json.type === "response.text.delta" && json.delta) {
                const text = cleanCLIOutput(json.delta);
                if (text) {
                  accumulatedText += text;
                  onChunk(text);
                }
              }
            } catch {
              // 解析失败时作为普通行清洗输出
              const cleanChunk = cleanCLIOutput(trimmed);
              if (cleanChunk) {
                accumulatedText += cleanChunk;
                onChunk(cleanChunk);
              }
            }
          } else {
            const cleanChunk = cleanCLIOutput(trimmed);
            if (cleanChunk) {
              accumulatedText += cleanChunk;
              onChunk(cleanChunk);
            }
          }
        }
      });

      child.stderr?.on("data", (data) => {
        const str = data.toString();
        if (!str.includes("Checking") && !str.includes("connected")) {
          const cleanChunk = cleanCLIOutput(str);
          if (cleanChunk) {
            accumulatedText += cleanChunk;
            onChunk(cleanChunk);
          }
        }
      });

      return new Promise((resolve) => {
        child.on("close", (code) => {
          // 处理最后可能残留在 buffer 中的数据
          if (stdoutBuffer.trim()) {
            if (stdoutBuffer.startsWith("{") && stdoutBuffer.endsWith("}")) {
              try {
                const json = JSON.parse(stdoutBuffer.trim());
                if (json.type === "item.completed" && json.item?.type === "agent_message" && json.item?.text) {
                  const text = cleanCLIOutput(json.item.text);
                  if (text && !accumulatedText.includes(text)) {
                    accumulatedText += text;
                    onChunk(text);
                  }
                }
              } catch {}
            }
          }

          resolve({
            success: code === 0 || accumulatedText.length > 0,
            output: accumulatedText.trim()
          });
        });
      });
    } catch (err: any) {
      return {
        success: false,
        output: accumulatedText,
        error: err.message
      };
    }
  }
}

// ======================================================================
// 🔌 3. OpenCode 官方 SDK 适配器
// ======================================================================
export class OpenCodeSDKAdapter implements AgentSDKAdapter {
  public async checkHealth(): Promise<{ success: boolean; message: string }> {
    try {
      const out = execSync("opencode --version", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
      if (out.trim()) {
        return { success: true, message: `OpenCode CLI 已就绪 (${stripAnsi(out)})` };
      }
    } catch {}
    return { success: false, message: "在系统 PATH 中未检测到 OpenCode CLI 可执行文件" };
  }

  public async streamChat(
    prompt: string,
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<SDKAdapterResult> {
    let accumulatedText = "";
    try {
      console.log(`[OpenCode CLI Runner] 正在通过 Stdin 管道流原生驱动...`);

      // 🌟 核心升级：通过标准输入 (Stdin) 将多行长提示词级联写入，完全绕过 Windows 8191 字符限制！ 🌟
      const queryPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      const args = ["run", "--auto"];

      const exeName = os.platform() === "win32" ? "opencode.cmd" : "opencode";
      const child = spawn(exeName, args, { shell: true, env: process.env });

      child.stdin?.write(queryPrompt);
      child.stdin?.end();

      child.stdout?.on("data", (data) => {
        const cleanChunk = cleanCLIOutput(data.toString());
        if (cleanChunk) {
          accumulatedText += cleanChunk;
          onChunk(cleanChunk);
        }
      });

      child.stderr?.on("data", (data) => {
        const str = data.toString();
        if (!str.includes("Checking") && !str.includes("connected")) {
          const cleanChunk = cleanCLIOutput(str);
          if (cleanChunk) {
            accumulatedText += cleanChunk;
            onChunk(cleanChunk);
          }
        }
      });

      return new Promise((resolve) => {
        child.on("close", (code) => {
          resolve({
            success: code === 0 || accumulatedText.length > 0,
            output: accumulatedText.trim()
          });
        });
      });
    } catch (err: any) {
      return {
        success: false,
        output: accumulatedText,
        error: err.message
      };
    }
  }
}
