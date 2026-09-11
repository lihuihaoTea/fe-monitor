export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getSessionId(): string {
  const key = '__fe_monitor_session__';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = generateId();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

export function getVisitorId(): string {
  const key = '__fe_monitor_visitor__';
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = generateId();
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
}

export function shouldSample(rate: number): boolean {
  return Math.random() < rate;
}

export function safeStringify(obj: any, maxDepth = 3): string {
  const seen = new WeakSet();
  
  function replacer(depth: number) {
    return (key: string, value: any) => {
      if (depth > maxDepth) return '[Max Depth]';
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      return value;
    };
  }
  
  try {
    return JSON.stringify(obj, replacer(0));
  } catch {
    return '[Stringify Error]';
  }
}
