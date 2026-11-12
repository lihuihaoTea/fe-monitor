import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';

const DEFAULT_MAX_METRIC_MS = 60_000;
/** Document LCP：离开页 / 超时 / 空闲 / 应用就绪 / 路由切换前 flush */
const LCP_FALLBACK_MS = 8_000;

export class PerformanceCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private maxMetricMs: number;
  private spaMetrics: boolean;

  private loadReported = false;
  private fcpReported = false;
  private lcpValue: number | null = null;
  /** LCP 候选更新时的页面 URL（归因用，避免离开时路由已变） */
  private lcpUrl: string | null = null;
  private lcpReported = false;
  private lcpObserver: PerformanceObserver | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private routeStartedAt = 0;
  private spaLcpReportedForRoute = false;
  private unboundRouteHooks: Array<() => void> = [];

  constructor(config: MonitorConfig, reporter: Reporter) {
    this.config = config;
    this.reporter = reporter;
    this.maxMetricMs =
      typeof config.maxPerfMetricMs === 'number' && config.maxPerfMetricMs > 0
        ? config.maxPerfMetricMs
        : DEFAULT_MAX_METRIC_MS;
    this.spaMetrics = config.spaPerfMetrics !== false;
  }

  install() {
    this.routeStartedAt = performance.now();
    this.observePaint();
    this.observeLCP();
    this.bindLoad();
    this.scheduleLcpFallbacks();
    if (this.spaMetrics) {
      this.bindRouteHooks();
    }
  }

  uninstall() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const off of this.unboundRouteHooks) off();
    this.unboundRouteHooks = [];
    try {
      this.lcpObserver?.disconnect();
    } catch {
      // ignore
    }
  }

  /** markAppReady 时补一次 LCP，避免用户从不切走导致无样本 */
  onAppReady() {
    this.timers.push(
      setTimeout(() => {
        this.flushLcp('app-ready');
      }, 1000)
    );
  }

  private bindLoad() {
    const reportLoad = () => {
      setTimeout(() => this.reportLoadTiming(), 0);
    };
    if (document.readyState === 'complete') {
      reportLoad();
    } else {
      window.addEventListener('load', reportLoad, { once: true });
    }
  }

  private scheduleLcpFallbacks() {
    this.timers.push(
      setTimeout(() => this.flushLcp('timeout'), LCP_FALLBACK_MS)
    );

    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (typeof ric === 'function') {
      ric(() => this.flushLcp('idle'), { timeout: LCP_FALLBACK_MS });
    }
  }

  private bindRouteHooks() {
    const onRoute = () => this.handleRouteChange();

    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);
    this.unboundRouteHooks.push(() => {
      window.removeEventListener('hashchange', onRoute);
      window.removeEventListener('popstate', onRoute);
    });

    const historyProto = window.history;
    const unbindHooks = this.unboundRouteHooks;
    const wrap = (method: 'pushState' | 'replaceState') => {
      const original = historyProto[method];
      historyProto[method] = function (
        this: History,
        ...args: Parameters<History['pushState']>
      ) {
        const ret = original.apply(this, args);
        onRoute();
        return ret;
      };
      unbindHooks.push(() => {
        historyProto[method] = original;
      });
    };
    wrap('pushState');
    wrap('replaceState');
  }

  private handleRouteChange() {
    // 离开当前「文档级」路由前尽量落盘 LCP；SPA 级指标重新起算
    this.flushLcp('route-change');
    this.routeStartedAt = performance.now();
    this.spaLcpReportedForRoute = false;
  }

  private observePaint() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name !== 'first-contentful-paint' || this.fcpReported) continue;
          this.fcpReported = true;
          this.reportPerformance('fcp', entry.startTime);
          try {
            observer.disconnect();
          } catch {
            // ignore
          }
        }
      });
      observer.observe({ type: 'paint', buffered: true });
    } catch {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name !== 'first-contentful-paint' || this.fcpReported) continue;
            this.fcpReported = true;
            this.reportPerformance('fcp', entry.startTime);
          }
        });
        observer.observe({ entryTypes: ['paint'] });
      } catch {
        // ignore
      }
    }
  }

  private observeLCP() {
    if (!('PerformanceObserver' in window)) return;

    const onEntries = (list: PerformanceObserverEntryList) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (!lastEntry) return;

      this.lcpValue = lastEntry.startTime;
      this.lcpUrl = window.location.href;

      if (this.spaMetrics && !this.spaLcpReportedForRoute) {
        const spaValue = lastEntry.startTime - this.routeStartedAt;
        // 仅统计「本路由开始之后」新出现的 LCP 候选
        if (spaValue > 0 && this.isValidMetric(spaValue)) {
          this.spaLcpReportedForRoute = true;
          this.reportPerformance('spa_lcp', spaValue, {
            navigationType: 'spa',
            routeStartedAt: Math.round(this.routeStartedAt),
          });
        }
      }
    };

    try {
      this.lcpObserver = new PerformanceObserver((list) => onEntries(list));
      this.lcpObserver.observe({
        type: 'largest-contentful-paint',
        buffered: true,
      });
    } catch {
      try {
        this.lcpObserver = new PerformanceObserver((list) => onEntries(list));
        this.lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch {
        return;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushLcp('hidden');
    });
    window.addEventListener('pagehide', () => this.flushLcp('pagehide'));
  }

  private flushLcp(_reason: string) {
    if (this.lcpReported || this.lcpValue == null) return;
    this.lcpReported = true;
    this.reportPerformance('lcp', this.lcpValue, undefined, this.lcpUrl || undefined);
    try {
      this.lcpObserver?.disconnect();
    } catch {
      // ignore
    }
  }

  private reportLoadTiming() {
    if (this.loadReported) return;

    const nav = this.getNavigationTiming();
    if (!nav) return;

    const loadTime = nav.loadEventEnd - nav.fetchStart;
    const domReady = nav.domContentLoadedEventEnd - nav.fetchStart;
    if (!this.isValidMetric(loadTime)) {
      this.reportOverBudget('load', loadTime);
      return;
    }

    const ttfb = nav.responseStart - nav.requestStart;
    this.reportPerformance('load', loadTime, {
      domReady: this.isValidMetric(domReady) ? Math.round(domReady) : undefined,
      ttfb: this.isValidMetric(ttfb) ? Math.round(ttfb) : undefined,
      dns: Math.max(0, Math.round(nav.domainLookupEnd - nav.domainLookupStart)),
      tcp: Math.max(0, Math.round(nav.connectEnd - nav.connectStart)),
    });

    this.loadReported = true;
  }

  private getNavigationTiming(): {
    fetchStart: number;
    loadEventEnd: number;
    domContentLoadedEventEnd: number;
    domainLookupStart: number;
    domainLookupEnd: number;
    connectStart: number;
    connectEnd: number;
    requestStart: number;
    responseStart: number;
  } | null {
    try {
      const entries = performance.getEntriesByType?.(
        'navigation'
      ) as PerformanceNavigationTiming[] | undefined;
      const nav = entries?.[0];
      if (nav && nav.fetchStart >= 0) {
        return {
          fetchStart: nav.fetchStart,
          loadEventEnd: nav.loadEventEnd,
          domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
          domainLookupStart: nav.domainLookupStart,
          domainLookupEnd: nav.domainLookupEnd,
          connectStart: nav.connectStart,
          connectEnd: nav.connectEnd,
          requestStart: nav.requestStart,
          responseStart: nav.responseStart,
        };
      }
    } catch {
      // ignore
    }

    const timing = performance.timing;
    if (!timing || !timing.fetchStart) return null;
    return {
      fetchStart: timing.fetchStart,
      loadEventEnd: timing.loadEventEnd,
      domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
      domainLookupStart: timing.domainLookupStart,
      domainLookupEnd: timing.domainLookupEnd,
      connectStart: timing.connectStart,
      connectEnd: timing.connectEnd,
      requestStart: timing.requestStart,
      responseStart: timing.responseStart,
    };
  }

  private isValidMetric(value: number): boolean {
    return Number.isFinite(value) && value > 0 && value <= this.maxMetricMs;
  }

  private reportOverBudget(metric: string, value: number) {
    if (!Number.isFinite(value) || value <= this.maxMetricMs) return;
    const event: MonitorEvent = {
      type: 'performance',
      subType: 'over_budget',
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        metric,
        value: Math.round(value),
        maxMetricMs: this.maxMetricMs,
      },
    };
    this.reporter.report(event);
  }

  private reportPerformance(
    metric: string,
    value: number,
    extra?: Record<string, unknown>,
    urlOverride?: string
  ) {
    if (!this.isValidMetric(value)) {
      this.reportOverBudget(metric, value);
      if (this.config.debug) {
        console.warn('[FE Monitor] drop invalid performance sample', metric, value);
      }
      return;
    }

    const monitorEvent: MonitorEvent = {
      type: 'performance',
      subType: metric,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: urlOverride || window.location.href,
      userAgent: navigator.userAgent,
      data: {
        metric,
        value: Math.round(value),
        ...extra,
      },
    };

    this.reporter.report(monitorEvent);
  }
}
