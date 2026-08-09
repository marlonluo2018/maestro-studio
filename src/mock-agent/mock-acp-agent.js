// Mock ACP Agent responding over STDIO with JSON-RPC 2.0
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;

  try {
    const req = JSON.parse(line);
    if (!req.jsonrpc || !req.id) return;

    if (req.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '1.0.0',
          capabilities: {
            coding: true,
            fs: true
          },
          agentInfo: {
            name: 'Mock-Coding-SubAgent',
            version: '0.1.0'
          }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (req.method === 'session/prompt') {
      const prompt = req.params?.prompt || '';
      const response = {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          status: 'completed',
          text: `[Sub-Agent Execution Success] 成功处理了指令：「${prompt}」。已将修改暂存至虚拟 Diff 树中。`
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (err) {
    process.stderr.write(`Mock agent error parsing input: ${err.message}\n`);
  }
});
