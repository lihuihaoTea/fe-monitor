import type { MonitorConfig, MonitorEvent, UserTag } from './types';
import { getSessionId, getVisitorId, shouldSample, stringifyErrorValue } from './utils';
import { ErrorCollector } from './collectors/error';
import { ResourceCollector } from './collectors/resource';
import { ApiCollector } from './collectors/api';
import { BlankCollector } from './collectors/blank';
import { PerformanceCollector } from './collectors/performance';
import { BehaviorCollector } from './collectors/behavior';
import { AssetGuardCollector } from './collectors/assetGuard';
import { Reporter } from './reporter';

const GLOBAL_KEY = '__FE_MONITOR__';

type CollectorName =
  | 'error'
  | 'resource'
  | 'api'
  | 'blank'
  | 'performance'
  | 'behavior'
  | 'assetGuard';

export class Monitor {
  private config: MonitorConfig | null = null;
  private reporter: Reporter | null = null;
  private collectors: Array<{ install: () => void; uninstall?: () => void }> =
    [];
  private assetGuard: AssetGuardCollector | null = null;
  private initialized = false;
  private appReady = false;
  private installed = new Set<CollectorName>();

  init(config: MonitorConfig) {
    if (typeof window === 'undefined') {
      console.warn('[FE Monitor] Not in browser environment');
      return this;
    }

    // 路径1 npm 与路径2 IIFE 共用单例：二次 init 只合并配置
    if (this.initialized) {
      this.patchConfig(config);
      if (this.appReady) {
        this.installAfterReadyCollectors();
      }
      if (this.config?.debug) {
        console.log('[FE Monitor] Already initialized, config patched');
      }
      return this;
    }

    this.config = {
      sampleRate: 1,
      debug: false,
      ...config,
      collectors: {
        error: true,
        resource: true,
        api: true,
        blank: true,
        performance: true,
        behavior: true,
        assetGuard: false,
        ...config.collectors,
      },
      collectorsAfterReady: {
        ...config.collectorsAfterReady,
      },
      assetGuard: {
        ...config.assetGuard,
      },
    };

    if (config.assetGuard?.enabled || config.collectors?.assetGuard) {
      this.config.collectors!.assetGuard = true;
    }

    if (!shouldSample(this.config.sampleRate!)) {
      if (this.config.debug) {
        console.log('[FE Monitor] Skipped by sample rate');
      }
      return this;
    }

    this.reporter = new Reporter(this.config);
    this.initCollectors();
    this.initialized = true;
    this.bindGlobal();

    if (this.config.debug) {
      console.log('[FE Monitor] Initialized', this.config);
    }
    return this;
  }

  /**
   * 入口 bundle 已执行：取消 timeout-guard，并启动 collectorsAfterReady（PV/API/性能等）。
   */
  markAppReady() {
    this.appReady = true;
    if (this.assetGuard) {
      this.assetGuard.markAppReady();
    } else {
      window.__FE_MONITOR_APP_READY__ = 1;
    }
    this.installAfterReadyCollectors();
  }

  isInitialized() {
    return this.initialized;
  }

  isAppReady() {
    return this.appReady;
  }

  getConfig() {
    return this.config;
  }

  /** 登录后标记用户，后续上报事件的 data.user 会带上该信息 */
  setUser(user: UserTag) {
    if (!this.reporter) {
      console.warn('[FE Monitor] Not initialized');
      return;
    }
    this.reporter.setUser(user);
  }

  /** 退出登录后清除用户标记 */
  clearUser() {
    if (!this.reporter) {
      console.warn('[FE Monitor] Not initialized');
      return;
    }
    this.reporter.clearUser();
  }

  getUser(): UserTag | null {
    return this.reporter?.getUser() ?? null;
  }

  track(eventType: string, data: any) {
    if (!this.initialized || !this.reporter) {
      console.warn('[FE Monitor] Not initialized');
      return;
    }

    const event: MonitorEvent = {
      type: 'behavior',
      subType: eventType,
      timestamp: Date.now(),
      appId: this.config!.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data,
    };

    this.reporter.report(event);
  }

  error(error: Error | string | Record<string, unknown> | unknown, extra?: any) {
    if (!this.initialized || !this.reporter) {
      console.warn('[FE Monitor] Not initialized');
      return;
    }

    const message = stringifyErrorValue(error);
    const isNotFound = message === '404';

    const event: MonitorEvent = {
      type: 'error',
      subType: isNotFound ? '404' : 'manual',
      timestamp: Date.now(),
      appId: this.config!.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        message,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : message,
        extra,
      },
    };

    this.reporter.report(event);
  }

  destroy() {
    this.collectors.forEach((collector) => {
      if (collector.uninstall) collector.uninstall();
    });
    if (this.reporter) {
      this.reporter.flush();
    }
    this.initialized = false;
    this.appReady = false;
    this.assetGuard = null;
    this.collectors = [];
    this.installed.clear();
  }

  private patchConfig(config: MonitorConfig) {
    if (!this.config) {
      this.config = config;
      return;
    }
    this.config = {
      ...this.config,
      ...config,
      collectors: {
        ...this.config.collectors,
        ...config.collectors,
      },
      collectorsAfterReady: {
        ...this.config.collectorsAfterReady,
        ...config.collectorsAfterReady,
      },
      assetGuard: {
        ...this.config.assetGuard,
        ...config.assetGuard,
      },
    };
    if (this.assetGuard && config.assetGuard) {
      (this.assetGuard as any).guard = {
        ...(this.assetGuard as any).guard,
        ...config.assetGuard,
      };
    }
  }

  private initCollectors() {
    if (!this.config || !this.reporter) return;
    const c = this.config.collectors || {};
    this.collectors = [];
    this.installed.clear();

    if (c.assetGuard) {
      this.assetGuard = new AssetGuardCollector(this.config, this.reporter);
      this.pushCollector('assetGuard', this.assetGuard);
    }

    if (c.error !== false) {
      this.pushCollector('error', new ErrorCollector(this.config, this.reporter));
    }
    if (c.resource !== false) {
      this.pushCollector(
        'resource',
        new ResourceCollector(this.config, this.reporter, this.assetGuard)
      );
    }
    if (c.api !== false) {
      this.pushCollector('api', new ApiCollector(this.config, this.reporter));
    }
    if (c.blank !== false) {
      this.pushCollector('blank', new BlankCollector(this.config, this.reporter));
    }
    if (c.performance !== false) {
      this.pushCollector(
        'performance',
        new PerformanceCollector(this.config, this.reporter)
      );
    }
    if (c.behavior !== false) {
      this.pushCollector(
        'behavior',
        new BehaviorCollector(this.config, this.reporter)
      );
    }
  }

  private installAfterReadyCollectors() {
    if (!this.config || !this.reporter) return;
    const after = this.config.collectorsAfterReady || {};

    if (after.error && !this.installed.has('error')) {
      this.pushCollector('error', new ErrorCollector(this.config, this.reporter));
    }
    if (after.resource && !this.installed.has('resource')) {
      this.pushCollector(
        'resource',
        new ResourceCollector(this.config, this.reporter, this.assetGuard)
      );
    }
    if (after.api && !this.installed.has('api')) {
      this.pushCollector('api', new ApiCollector(this.config, this.reporter));
    }
    if (after.blank && !this.installed.has('blank')) {
      this.pushCollector('blank', new BlankCollector(this.config, this.reporter));
    }
    if (after.performance && !this.installed.has('performance')) {
      this.pushCollector(
        'performance',
        new PerformanceCollector(this.config, this.reporter)
      );
    }
    if (after.behavior && !this.installed.has('behavior')) {
      this.pushCollector(
        'behavior',
        new BehaviorCollector(this.config, this.reporter)
      );
    }
  }

  private pushCollector(
    name: CollectorName,
    collector: { install: () => void; uninstall?: () => void }
  ) {
    if (this.installed.has(name)) return;
    this.collectors.push(collector);
    this.installed.add(name);
    collector.install();
  }

  private bindGlobal() {
    if (typeof window === 'undefined') return;
    (window as any)[GLOBAL_KEY] = this;
    (window as any).FEMonitor = this;
  }
}

function getSharedMonitor(): Monitor {
  if (typeof window !== 'undefined') {
    const existing = (window as any)[GLOBAL_KEY] as Monitor | undefined;
    if (existing) return existing;
  }
  const monitor = new Monitor();
  if (typeof window !== 'undefined') {
    (window as any)[GLOBAL_KEY] = monitor;
    (window as any).FEMonitor = monitor;
  }
  return monitor;
}

const monitor = getSharedMonitor();

export default monitor;
export { monitor, getSharedMonitor };
