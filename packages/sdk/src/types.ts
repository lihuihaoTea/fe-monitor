export interface MonitorConfig {
  endpoint: string;
  appId: string;
  sampleRate?: number;
  debug?: boolean;
}

/** 登录后标记的用户信息，会附带到后续上报事件的 data.user */
export interface UserTag {
  userId: string | number;
  userName: string;
}

export interface MonitorEvent {
  type: 'error' | 'resource' | 'api' | 'blank' | 'performance' | 'behavior';
  subType?: string;
  timestamp: number;
  appId: string;
  sessionId: string;
  visitorId: string;
  url: string;
  userAgent: string;
  data: any;
}
