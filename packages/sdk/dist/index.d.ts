interface MonitorConfig {
    endpoint: string;
    appId: string;
    sampleRate?: number;
    debug?: boolean;
    /**
     * 采集开关（init 时立即安装）。
     * 默认除 assetGuard 外全开；assetGuard 默认关。
     * 若希望 PV/API/性能等等应用就绪后再采，请在此关掉，并配置 collectorsAfterReady。
     */
    collectors?: {
        error?: boolean;
        resource?: boolean;
        api?: boolean;
        blank?: boolean;
        performance?: boolean;
        behavior?: boolean;
        /** 静态资源守卫（script-link / preload / timeout-guard） */
        assetGuard?: boolean;
    };
    /**
     * markAppReady() 后再安装的采集器（用于「应用正常启动后」才报 PV/API/性能）。
     * 仅对 init 时未安装的项生效。
     */
    collectorsAfterReady?: {
        error?: boolean;
        resource?: boolean;
        api?: boolean;
        blank?: boolean;
        performance?: boolean;
        behavior?: boolean;
    };
    assetGuard?: AssetGuardConfig;
}
/** 登录后标记的用户信息，会附带到后续上报事件的 data.user */
interface UserTag {
    userId: string | number;
    userName: string;
}
type AssetFailSubType = 'script-link' | 'preload' | 'timeout-guard';
type AssetAction = 'hard-reload' | 'soft-retry' | 'defer-preload' | 'retry-exhausted' | '';
type AssetSeverity = 'hard' | 'observe';
interface AssetFailContext {
    subType: AssetFailSubType;
    action: AssetAction;
    severity: AssetSeverity;
    resourceUrl: string;
    message: string;
    failReason?: string;
    retry: number;
    data: Record<string, unknown>;
}
interface AssetGuardConfig {
    /** 是否启用；也可用 collectors.assetGuard */
    enabled?: boolean;
    /** 构建资源 pathname 白名单（RegExp 或源码字符串） */
    assetPathRe?: RegExp | string;
    /** 额外允许的资源 host；默认包含 location.hostname */
    allowedHosts?: Array<string | RegExp>;
    /** 仅这些页面 host 上报；空则都报 */
    reportHosts?: Array<string | RegExp>;
    readyTimeoutMs?: number;
    timeoutExtendMs?: number;
    timeoutMaxMs?: number;
    timeoutExtendMax?: number;
    softRetryMax?: number;
    dedupWindowMs?: number;
    reloadMax?: number;
    reloadTtlMs?: number;
    reloadStorageKey?: string;
    /** 是否在上报 hard 后执行恢复；默认 false */
    autoRecover?: boolean;
    /**
     * 是否上报 observe 级别（soft-retry / defer-preload）。
     * 默认 true；设为 false 时故障量只看 hard，减少观测噪声。
     */
    reportObserve?: boolean;
    /** 自定义恢复；返回 false 可阻止默认 reload */
    onRecover?: (ctx: AssetFailContext) => void | boolean;
    isAppWebView?: () => boolean;
    /** 入口脚本 pathname 判定（默认 /index-*.js） */
    entryPathRe?: RegExp | string;
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
declare global {
    interface Window {
        __FE_MONITOR__?: any;
        FEMonitor?: any;
        __FE_MONITOR_APP_READY__?: number;
    }
}

declare class Monitor {
    private config;
    private reporter;
    private collectors;
    private assetGuard;
    private initialized;
    private appReady;
    private installed;
    init(config: MonitorConfig): this;
    /**
     * 入口 bundle 已执行：取消 timeout-guard，并启动 collectorsAfterReady（PV/API/性能等）。
     */
    markAppReady(): void;
    isInitialized(): boolean;
    isAppReady(): boolean;
    getConfig(): MonitorConfig | null;
    /** 登录后标记用户，后续上报事件的 data.user 会带上该信息 */
    setUser(user: UserTag): void;
    /** 退出登录后清除用户标记 */
    clearUser(): void;
    getUser(): UserTag | null;
    track(eventType: string, data: any): void;
    error(error: Error | string | Record<string, unknown> | unknown, extra?: any): void;
    destroy(): void;
    private patchConfig;
    private initCollectors;
    private installAfterReadyCollectors;
    private pushCollector;
    private bindGlobal;
}
declare function getSharedMonitor(): Monitor;
declare const monitor: Monitor;

export { type AssetAction, type AssetFailContext, type AssetFailSubType, type AssetGuardConfig, type AssetSeverity, type MonitorConfig, type MonitorEvent, type UserTag, monitor as default, getSharedMonitor, monitor };
