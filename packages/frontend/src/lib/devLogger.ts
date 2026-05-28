type LogEntry = {
  id: string;
  type: 'request' | 'response' | 'error';
  url: string;
  timestamp: string;
  data: any;
};

const logs: LogEntry[] = [];
let listeners: (() => void)[] = [];

/**
 * 開発用デバッグロガー。RPC通信の内容をキャプチャします。
 */
export const devLogger = {
  log: (type: LogEntry['type'], url: string, data: any) => {
    logs.unshift({
      id: Math.random().toString(36).substring(2, 9),
      type,
      url,
      timestamp: new Date().toLocaleTimeString(),
      data,
    });
    if (logs.length > 50) logs.pop();
    listeners.forEach(l => l());
  },
  getLogs: () => [...logs],
  subscribe: (listener: () => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },
};
