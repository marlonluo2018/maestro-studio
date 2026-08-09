import { ClaudeCodeSDKAdapter } from "../runner/sdk-adapters.js";

async function testClaudeAdapter() {
  console.log('======================================================================');
  console.log('🔮 Claude Code CLI 适配器原生流式通联测试');
  console.log('======================================================================\n');
  
  const adapter = new ClaudeCodeSDKAdapter();

  try {
    console.log('>>> 正在启动 Claude Code 实时对话流...');
    const result = await adapter.streamChat('say hi in 3 words', '你是一个高效助理', (chunk) => {
      process.stdout.write(chunk);
    });

    console.log('\n\n🎉 🎉 🎉 恭喜！Claude Code CLI 原生流式对话 100% 成功通联！');
    console.log('最终输出:', result.output);
  } catch (err: any) {
    console.error('\n❌ 连通测试失败！');
    console.error(`报错详情: ${err.message}`);
  }
}

testClaudeAdapter();
