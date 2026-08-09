import { CodexSDKAdapter } from "../runner/sdk-adapters.js";

async function testCodexAdapter() {
  console.log('======================================================================');
  console.log('🤖 OpenAI Codex CLI 纯净 JSONL 流式通联测试');
  console.log('======================================================================\n');
  
  const adapter = new CodexSDKAdapter();

  try {
    console.log('>>> 正在启动 Codex 实时对话流 (JSONL 结构化提取)...');
    const result = await adapter.streamChat('hi', '你是一个高效助理', (chunk) => {
      console.log('实时 Chunk 块:', JSON.stringify(chunk));
    });

    console.log('\n\n🎉 🎉 🎉 恭喜！OpenAI Codex CLI 纯净流式对话 100% 成功通联！');
    console.log('最终纯净输出:\n', result.output);
  } catch (err: any) {
    console.error('\n❌ 连通测试失败！');
    console.error(`报错详情: ${err.message}`);
  }
}

testCodexAdapter();
