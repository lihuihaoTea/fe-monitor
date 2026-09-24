interface MonitorConfig {
    endpoint: string;
    appId: string;
    sampleRate?: number;
    debug?: boolean;
}
interface MonitorEvent {
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

declare class Monitor {
    private config;
    private reporter;
    private collectors;
    private initialized;
    init(config: MonitorConfig): void;
    private initCollectors;
    track(eventType: string, data: any): void;
    error(error: Error | string, extra?: any): void;
    destroy(): void;
}
declare const monitor: Monitor;

export { type MonitorConfig, type MonitorEvent, monitor as default, monitor };
