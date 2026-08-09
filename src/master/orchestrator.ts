import { ACPClient } from '../acp/acp-client.js';

export interface AgentTaskResult {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  subtaskResult?: string;
}

export class MasterOrchestrator {
  private acpClient: ACPClient;

  constructor(subAgentCommand: string = 'node', subAgentArgs: string[] = ['./src/mock-agent/mock-acp-agent.js']) {
    this.acpClient = new ACPClient(subAgentCommand, subAgentArgs);
  }

  public async init(): Promise<void> {
    await this.acpClient.start();
  }

  /**
   * 意图分析与 Sub-Agent 工具调度
   */
  public async handleUserPrompt(userPrompt: string): Promise<AgentTaskResult> {
    const isCodingTask = /代码|重构|写|修复|测试|fix|bug|refactor|test|code|implement/i.test(userPrompt);

    if (isCodingTask) {
      // 捕获意图后，主 Agent 隐式调用 ACP 工具派发任务给 Sub-Agent
      const subAgentResponse = await this.acpClient.request('session/prompt', {
        sessionId: 'session-001',
        prompt: userPrompt
      });

      return {
        role: 'assistant',
        content: `我已经安排并协同底层的 ACP 编码 Sub-Agent 完成了您的请求。\n\n**Sub-Agent 执行结果**:\n${subAgentResponse.text}`,
        subtaskResult: subAgentResponse.text
      };
    } else {
      // 普通对话意图
      return {
        role: 'assistant',
        content: `你好！我是 Maestro Studio 贴身助理。我可以随时帮你拆解复杂的编程任务并调用专业 ACP Sub-Agent 执行。请告诉我你想完成什么？`
      };
    }
  }

  public destroy() {
    this.acpClient.stop();
  }
}
