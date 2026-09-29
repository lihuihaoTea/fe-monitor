interface MonitorConfig {
    endpoint: string;
    appId: string;
    sampleRate?: number;
    debug?: boolean;
}
/** 登录后标记的用户信息，会附带到后续上报事件的 data.user */
interface UserTag {
    userId: string | number;
    userName: string;
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
    /** 登录后标记用户，后续上报事件的 data.user 会带上该信息 */
    setUser(user: UserTag): void;
    /** 退出登录后清除用户标记 */
    clearUser(): void;
    getUser(): UserTag | null;
    track(eventType: string, data: any): void;
    error(error: Error | string | Record<string, unknown> | unknown, extra?: any): void;
    destroy(): void;
}
declare const monitor: Monitor;

export { type MonitorConfig, type MonitorEvent, type UserTag, monitor as default, monitor };
