import { spawn } from 'child_process';

export interface CLIRunnerResult {
  success: boolean;
  output: string;
  errorOutput: string;
  exitCode: number | null;
}

// 过滤控制台 ANSI 颜色与格式转义字符 (\u001b[...m)
export function stripAnsiCodes(str: string): string {
  if (!str) return '';
  return str
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    .trim();
}

// 过滤 CLI 运行过程中吐出的状态标识与工具调用诊断日志 (如 "> build · gemini-3.6-flash", "✱ Glob "*"", "→ Read package.json")
export function cleanCLIOutput(str: string): string {
  if (!str) return '';

  const stripped = stripAnsiCodes(str);
  const lines = stripped.split('\n');

  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();

    // 过滤提示头部状态标志，如 "> build · gemini-3.6-flash"
    if (/^>\s*\w+.*[·•]/i.test(trimmed) || /^>\s*build/i.test(trimmed)) {
      return false;
    }

    // 过滤工具调用中间诊断日志，如 "✱ Glob "*"", "→ Read package.json", "✓ Write ..."
    if (/^[✱→✓✦⏺]\s*(Glob|Read|Write|Edit|Bash|Execute|File|Search)/i.test(trimmed)) {
      return false;
    }

    return true;
  });

  // 拼接过滤后的行，并去除多余的前导杂质符号
  let result = filteredLines.join('\n').trim();
  result = result.replace(/^[✱→✓✦⏺]\s*(Glob|Read|Write)\s*".*?"/gi, '').trim();

  return result;
}

export function executeCLICommand(
  commandPattern: string,
  prompt: string,
  systemPrompt: string = '',
  onDataChunk?: (chunk: string) => void
): Promise<CLIRunnerResult> {
  return new Promise((resolve) => {
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const escapedSystemPrompt = systemPrompt.replace(/"/g, '\\"');

    // 1. 替换 {prompt} 与 {systemPrompt} 占位符
    let fullCommand = commandPattern
      .replace('{prompt}', escapedPrompt)
      .replace('{systemPrompt}', escapedSystemPrompt);

    // 2. 如果 commandPattern 没写 {systemPrompt}，且传了非空 systemPrompt，则把 systemPrompt 附在 prompt 前作为兜底
    if (!commandPattern.includes('{systemPrompt}') && systemPrompt.trim()) {
      const combinedPrompt = `[系统角色指令: ${escapedSystemPrompt}]\n\n[用户指令]: ${escapedPrompt}`;
      fullCommand = commandPattern.replace('{prompt}', combinedPrompt);
    }

    console.log(`[CLI Runner] 正在执行: ${fullCommand}`);

    const child = spawn(fullCommand, {
      shell: true,
      env: process.env
    });

    let output = '';
    let errorOutput = '';

    // 关闭 stdin 防挂起
    child.stdin?.end();

    child.stdout?.on('data', (chunk: Buffer) => {
      const str = chunk.toString();
      output += str;
      if (onDataChunk) {
        onDataChunk(str);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const str = chunk.toString();
      errorOutput += str;
      if (onDataChunk) {
        onDataChunk(str);
      }
    });

    child.on('error', (err) => {
      errorOutput += `\n[CLI Spawn Error]: ${err.message}`;
    });

    child.on('close', (code) => {
      const cleanOut = cleanCLIOutput(output);
      const cleanErr = cleanCLIOutput(errorOutput);

      resolve({
        success: code === 0,
        output: cleanOut,
        errorOutput: cleanErr,
        exitCode: code
      });
    });
  });
}
