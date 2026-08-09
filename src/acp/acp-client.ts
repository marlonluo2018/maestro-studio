import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { JSONRPCRequest, JSONRPCResponse } from './types.js';

export class ACPClient extends EventEmitter {
  private childProcess: ChildProcess | null = null;
  private requestId = 1;
  private pendingRequests = new Map<number | string, (res: JSONRPCResponse) => void>();
  private spawnError: Error | null = null;

  constructor(private command: string, private args: string[] = []) {
    super();
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.spawnError = null;
      try {
        this.childProcess = spawn(this.command, this.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true // Required on Windows for finding npm global binaries & scripts
        });
      } catch (err: any) {
        return reject(err);
      }

      this.childProcess.on('error', (err) => {
        this.spawnError = err;
        this.emit('error', err);
        reject(new Error(`无法启动命令 「${this.command}」: ${err.message}`));
      });

      let buffer = '';
      this.childProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              this.handleIncomingMessage(JSON.parse(line));
            } catch (err) {
              // Ignore non-JSON output
            }
          }
        }
      });

      this.childProcess.stderr?.on('data', (chunk: Buffer) => {
        console.error(`[Sub-Agent STDERR]: ${chunk.toString()}`);
      });

      // Give spawn a moment to initialize or emit error
      setTimeout(() => {
        if (this.spawnError) {
          reject(this.spawnError);
        } else {
          resolve();
        }
      }, 100);
    });
  }

  public async request(method: string, params: Record<string, any> = {}): Promise<any> {
    if (this.spawnError) {
      throw this.spawnError;
    }

    const id = this.requestId++;
    const req: JSONRPCRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, (response) => {
        if (response.error) {
          reject(new Error(`[ACP Error ${response.error.code}]: ${response.error.message}`));
        } else {
          resolve(response.result);
        }
      });

      if (!this.childProcess?.stdin?.writable) {
        return reject(new Error(`进程 stdin 不可用 (命令: ${this.command})`));
      }

      this.childProcess.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  private handleIncomingMessage(msg: JSONRPCResponse & JSONRPCRequest) {
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const resolver = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      resolver(msg);
    } else if (msg.method) {
      this.emit('agent_event', msg);
    }
  }

  public stop() {
    if (this.childProcess) {
      try {
        this.childProcess.kill();
      } catch (e) {
        // Ignore kill errors
      }
      this.childProcess = null;
    }
  }
}
