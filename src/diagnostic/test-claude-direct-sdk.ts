import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "fs";
import path from "path";
import os from "os";

const HOME_DIR = os.homedir();

// ⚡ 强力测试：直接连线 DeepSeek 官方 HTTPS 端点 (不走本地 HTTP 代理，彻底解决 TLS 握手问题) ⚡
process.env.CLAUDE_CODE_SIMPLE = '1';
process.env.CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT = '1';
process.env.ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic"; // 必须是 HTTPS，保证 mTLS 握手通过！
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
          if (key !== 'ANTHROPIC_BASE_URL') {
            process.env[key] = value as string;
          }
        }

        if (settings.env.ANTHROPIC_AUTH_TOKEN) {
          process.env.ANTHROPIC_API_KEY = settings.env.ANTHROPIC_AUTH_TOKEN;
          console.log('>>> 已将 ANTHROPIC_AUTH_TOKEN 映射为 ANTHROPIC_API_KEY');
        }
      }
    } catch (e: any) {
      console.error('读取 settings.json 失败:', e.message);
    }
  }
}

async function testClaudeSDKDirect() {
  console.log('======================================================================');
  console.log('🔮 Claude Code 官方 SDK ➔ 直连 DeepSeek 官方 HTTPS 端点 连通性测试');
  console.log('======================================================================\n');
  
  loadClaudeSettingsAndInject();

  try {
    console.log(`\n>>> 正在直接通过官方 HTTPS 接口 (${process.env.ANTHROPIC_BASE_URL}) 呼叫官方 SDK query()...`);
    
    const stream = (query as any)('say hi in 3 words', {
      max_turns: 1,
      dangerouslyBypassApprovals: true,
      skipGitRepoCheck: true
    });

    let result = '';
    for await (const msg of stream) {
      if (msg.type === 'text_chunk' || msg.type === 'text') {
        result += msg.text;
        process.stdout.write(msg.text); // 实时打印流式输出
      }
    }
    console.log('\n\n🎉 🎉 🎉 恭喜！官方 SDK 原生流式对话 100% 成功通联！返回回答:', result);
  } catch (err: any) {
    console.error('\n❌ 连通测试失败！');
    console.error(`报错详情: ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
  }
}

testClaudeSDKDirect();
