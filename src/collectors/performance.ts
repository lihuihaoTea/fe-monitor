import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';

export class PerformanceCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private reported = false;

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
          if (entry.name === 'first-contentful-paint') {
            this.reportPerformance('fcp', entry.startTime);
          }
        }
      });

      observer.observe({ entryTypes: ['paint'] });
    } catch (e) {}
  }

  private observeLCP() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        
        if (lastEntry) {
          this.reportPerformance('lcp', lastEntry.startTime);
        }
      });

      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {}
  }

  private reportLoadTiming() {
    if (this.reported) return;

    const timing = performance.timing;
    const loadTime = timing.loadEventEnd - timing.fetchStart;
    const domReady = timing.domContentLoadedEventEnd - timing.fetchStart;

    this.reportPerformance('load', loadTime, {
      domReady,
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      ttfb: timing.responseStart - timing.requestStart,
    });

    this.reported = true;
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
