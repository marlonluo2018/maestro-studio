import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "fs";
import path from "path";
import os from "os";

const HOME_DIR = os.homedir();

// ⚡ 核心测试：设置 CLAUDE_CODE_SIMPLE=1 绕过官方 Bootstrap 强访自检 ⚡
process.env.CLAUDE_CODE_SIMPLE = '1';
process.env.DEBUG_CLAUDE_AGENT_SDK = 'true';
process.env.NODE_NO_WARNINGS = '1';

function loadClaudeSettingsAndInject() {
  const settingsPath = path.join(HOME_DIR, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(raw);
      if (settings.env) {
        console.log('>>> 正在注入 settings.json 中的环境变量到 process.env:', Object.keys(settings.env));
        for (const [key, value] of Object.entries(settings.env)) {
          process.env[key] = value as string;
        }

        if (settings.env.ANTHROPIC_AUTH_TOKEN) {
          process.env.ANTHROPIC_API_KEY = settings.env.ANTHROPIC_AUTH_TOKEN;
        }
      }
    } catch (e: any) {
      console.error('读取 settings.json 失败:', e.message);
    }
  }
}

async function testClaudeSDKSimple() {
  console.log('>>> 正在启动 Claude Agent SDK + CLAUDE_CODE_SIMPLE=1 诊断...');
  loadClaudeSettingsAndInject();

  try {
    const stream = (query as any)('hi', {
      max_turns: 1,
      dangerouslyBypassApprovals: true,
      skipGitRepoCheck: true
    });

    let result = '';
    for await (const msg of stream) {
      console.log('接收到 SDK 原始消息事件:', JSON.stringify(msg));
      if (msg.type === 'text_chunk' || msg.type === 'text') {
        result += msg.text;
      }
    }
    console.log('\n>>> 🎉 成功通过官方 SDK 获取回答 (CLAUDE_CODE_SIMPLE=1 生效!):', result);
  } catch (err: any) {
    console.error('\n❌ 诊断失败！报错信息:', err.message);
    if (err.stack) console.error(err.stack);
  }
}

testClaudeSDKSimple();
