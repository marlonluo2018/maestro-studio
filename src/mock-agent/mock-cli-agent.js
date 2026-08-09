// Mock CLI Agent taking prompt from process.argv[2]
const prompt = process.argv[2] || 'Default Prompt';

console.log(`[Mock CLI Agent] 接收到指令: "${prompt}"`);
console.log(`[Mock CLI Agent] 正在分析当前项目目录结构...`);

setTimeout(() => {
  console.log(`[Mock CLI Agent] 执行完成: 成功处理指令 「${prompt}」。修改已同步！`);
}, 800);
