export interface MonitorConfig {
  endpoint: string;
  appId: string;
  sampleRate?: number;
  debug?: boolean;
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
