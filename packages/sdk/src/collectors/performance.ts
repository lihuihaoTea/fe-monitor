import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';

export class PerformanceCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private loadReported = false;
  private fcpReported = false;
  private lcpValue: number | null = null;
  private lcpReported = false;
  private lcpObserver: PerformanceObserver | null = null;

  constructor(config: MonitorConfig, reporter: Reporter) {
    this.config = config;
    this.reporter = reporter;
  }

  install() {
    this.observePaint();
    this.observeLCP();

    window.addEventListener('load', () => {
      setTimeout(() => {
        this.reportLoadTiming();
      }, 0);
    });
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
      // entryTypes fallback for older browsers
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

    try {
      this.lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          // 只缓存最新值，页面隐藏/卸载时再上报一次
          this.lcpValue = lastEntry.startTime;
        }
      });

      this.lcpObserver.observe({
        type: 'largest-contentful-paint',
        buffered: true,
      });
    } catch {
      try {
        this.lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) this.lcpValue = lastEntry.startTime;
        });
        this.lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch {
        return;
      }
    }

    const finalizeLcp = () => {
      this.flushLcp();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') finalizeLcp();
    });
    window.addEventListener('pagehide', finalizeLcp);
  }

  private flushLcp() {
    if (this.lcpReported || this.lcpValue == null) return;
    this.lcpReported = true;
    this.reportPerformance('lcp', this.lcpValue);
    try {
      this.lcpObserver?.disconnect();
    } catch {
      // ignore
    }
  }

  private reportLoadTiming() {
    if (this.loadReported) return;

    const timing = performance.timing;
    const loadTime = timing.loadEventEnd - timing.fetchStart;
    const domReady = timing.domContentLoadedEventEnd - timing.fetchStart;

    this.reportPerformance('load', loadTime, {
      domReady,
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      ttfb: timing.responseStart - timing.requestStart,
    });

    this.loadReported = true;
  }

  private reportPerformance(metric: string, value: number, extra?: any) {
    const monitorEvent: MonitorEvent = {
      type: 'performance',
      subType: metric,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
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
