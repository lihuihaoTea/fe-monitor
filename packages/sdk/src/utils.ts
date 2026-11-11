export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getSessionId(): string {
  const key = '__fe_monitor_session__';
  try {
    let sessionId = sessionStorage.getItem(key);
    if (!sessionId) {
      sessionId = generateId();
      sessionStorage.setItem(key, sessionId);
    }
    return sessionId;
  } catch {
    return generateId();
  }
}

export function getVisitorId(): string {
  const key = '__fe_monitor_visitor__';
  try {
    let visitorId = localStorage.getItem(key);
    if (!visitorId) {
      visitorId = generateId();
      localStorage.setItem(key, visitorId);
    }
    return visitorId;
  } catch {
    return generateId();
  }
}

export function shouldSample(rate: number): boolean {
  return Math.random() < rate;
}

/** 取出 Error.message（带 Name 前缀），避免被 stack 盖住 */
export function errMessage(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value) {
    const msg = (value as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) {
      const name = (value as { name?: unknown }).name;
      if (typeof name === 'string' && name && msg.indexOf(`${name}:`) === 0) {
        return msg;
      }
      return typeof name === 'string' && name ? `${name}: ${msg}` : msg;
    }
  }
  return '';
}

/**
 * 将 Error / 对象 / 其他值统一转为可读字符串。
 * 优先 message，必要时附 stack（asset / preload 场景需要看真实失败文案）。
 */
export function stringifyErrorValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  const msg = errMessage(value);
  const stack =
    value instanceof Error && value.stack
      ? value.stack
      : value &&
          typeof value === 'object' &&
          'stack' in value &&
          typeof (value as { stack?: unknown }).stack === 'string'
        ? String((value as { stack: string }).stack)
        : '';
  if (msg) {
    if (stack && stack.indexOf(msg) === -1) return `${msg}\n${stack}`;
    return msg;
  }
  if (stack) return stack;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      try {
        return Object.prototype.toString.call(value);
      } catch {
        return '[Unserializable Object]';
      }
    }
  }
  return String(value);
}

export function toRegExp(input: RegExp | string | undefined, fallback: RegExp): RegExp {
  if (!input) return fallback;
  if (input instanceof RegExp) return input;
  try {
    return new RegExp(input);
  } catch {
    return fallback;
  }
}

export function hostMatches(
  hostname: string,
  rules: Array<string | RegExp> | undefined
): boolean {
  if (!hostname) return false;
  if (!rules || rules.length === 0) return true;
  return rules.some((rule) => {
    if (typeof rule === 'string') return rule === hostname;
    try {
      return rule.test(hostname);
    } catch {
      return false;
    }
  });
}

export function safeStringify(obj: any, maxDepth = 3): string {
  const seen = new WeakSet();

  function replacer(depth: number) {
    return (_key: string, value: any) => {
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
