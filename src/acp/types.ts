export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, any>;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ACPInitializeParams {
  protocolVersion: string;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface ACPSessionPromptParams {
  sessionId: string;
  prompt: string;
}

export interface ACPTaskProgressNotification {
  sessionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
}
