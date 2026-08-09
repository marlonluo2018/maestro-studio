import { OpenCodeSDKAdapter, ClaudeCodeSDKAdapter, CodexSDKAdapter, AgentSDKAdapter } from "../runner/sdk-adapters.js";

function getSDKAdapter(presetKey: string): AgentSDKAdapter {
  if (presetKey === 'claude-code') {
    return new ClaudeCodeSDKAdapter();
  }
  if (presetKey === 'codex') {
    return new CodexSDKAdapter();
  }
  return new OpenCodeSDKAdapter();
}

async function runSingleTest(presetKey: string, name: string, metaPrompt: string) {
  console.log(`\n🚀 [开始测试] 正在启动 ${name} (${presetKey}) 实时流式优化器...`);
  const adapter = getSDKAdapter(presetKey);

  try {
    const result = await adapter.streamChat(metaPrompt, '', () => {});
    if (result.success && result.output) {
      let cleanOutput = result.output.trim();

      // 1. 精准提取 ```markdown ``` 块
      const mdBlockMatch = cleanOutput.match(/```markdown\s*([\s\S]*?)\s*```/i) || cleanOutput.match(/```\s*([\s\S]*?)\s*```/i);
      if (mdBlockMatch) {
        cleanOutput = mdBlockMatch[1].trim();
      } else {
        if (cleanOutput.startsWith('```markdown')) {
          cleanOutput = cleanOutput.slice(11);
        } else if (cleanOutput.startsWith('```')) {
          cleanOutput = cleanOutput.slice(3);
        }
        if (cleanOutput.endsWith('```')) {
          cleanOutput = cleanOutput.slice(0, -3);
        }
      }
      cleanOutput = cleanOutput.trim();

      // 2. 物理清除可能的引导废话
      cleanOutput = cleanOutput.replace(/^(understood|sure|okay|alright|here is the optimized system prompt|here is the system prompt|here is the prompt|certainly)[\s\S]*?\n\n/i, '').trim();
      cleanOutput = cleanOutput.replace(/^(understood|sure|okay|alright|here is the optimized system prompt|certainly)[\s\S]*?\n/i, '').trim();

      console.log(`\n======================================================================`);
      console.log(`✨ [测试成功] ${name} 优化后的 System Prompt 输出如下:`);
      console.log(`======================================================================`);
      console.log(cleanOutput);
      console.log(`======================================================================`);

      if (cleanOutput.toLowerCase().includes('understood') || cleanOutput.toLowerCase().includes('how can i help')) {
        console.log(`❌ [${name} 校验失败] 输出包含废话/客套话！`);
      } else {
        console.log(`✅ [${name} 校验成功] 输出完全是纯净的系统提示词！`);
      }
    } else {
      console.error(`❌ [${name} 测试失败] 优化器未返回有效输出: ${result.error || '空结果'}`);
    }
  } catch (err: any) {
    console.error(`❌ [${name} 运行时异常] ${err.message}`);
  }
}

async function testAllPromptOptimizers() {
  console.log('======================================================================');
  console.log('🧪 三合一提示词元工程优化器 物理并发测试 (英文提示词 & 纯净提取)');
  console.log('======================================================================\n');

  const draft = "General Agent";

  // 完美、极致、防废话的英文元提示词设计
  const metaPrompt = `You are a world-class AI prompt engineer specializing in designing System Prompts for AI agents.
Your task is to rewrite and optimize the following rough draft or description into a professional, high-performance System Prompt.

CRITICAL GOLDEN RULES:
1. OUTPUT THE OPTIMIZED SYSTEM PROMPT ONLY.
2. NEVER say "Understood", "Sure", "Certainly", "Here is your prompt", "How can I help you?", "How can I design today?", or ask any follow-up questions.
3. Write ONLY the raw, structured System Prompt text itself. Do not include any greetings, intros, conversational filler, or preamble.
4. Structure the output clearly using Markdown headers, bullet points, and sections (such as Role, Core Capabilities, Rules, and Output Format).
5. Wrap the finalized System Prompt strictly inside a \`\`\`markdown and \`\`\` block, so that our system can parse and extract it perfectly.
6. The optimized prompt MUST be written entirely in professional English.

Rough Draft Input (Expand this immediately into the finalized prompt):
"${draft.trim()}"`;

  // 并发测试三个 CLI
  await Promise.all([
    runSingleTest('claude-code', 'Claude Code CLI', metaPrompt),
    runSingleTest('codex', 'Codex CLI', metaPrompt),
    runSingleTest('opencode', 'OpenCode CLI', metaPrompt)
  ]);

  console.log('\n======================================================================');
  console.log('🎉 所有 CLI 提示词优化器测试结束！');
  console.log('======================================================================');
}

testAllPromptOptimizers();
