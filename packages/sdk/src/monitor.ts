import type { MonitorConfig, MonitorEvent } from './types';
import { getSessionId, getVisitorId, shouldSample } from './utils';
import { ErrorCollector } from './collectors/error';
import { ResourceCollector } from './collectors/resource';
import { ApiCollector } from './collectors/api';
import { BlankCollector } from './collectors/blank';
import { PerformanceCollector } from './collectors/performance';
import { BehaviorCollector } from './collectors/behavior';
import { Reporter } from './reporter';

class Monitor {
  private config: MonitorConfig | null = null;
  private reporter: Reporter | null = null;
  private collectors: any[] = [];
  private initialized = false;

  init(config: MonitorConfig) {
    if (this.initialized) {
      console.warn('[FE Monitor] Already initialized');
      return;
    }

    if (typeof window === 'undefined') {
      console.warn('[FE Monitor] Not in browser environment');
      return;
    }

    this.config = {
      sampleRate: 1,
      debug: false,
      ...config,
    };

    if (!shouldSample(this.config.sampleRate!)) {
      if (this.config.debug) {
        console.log('[FE Monitor] Skipped by sample rate');
      }
      return;
    }

    this.reporter = new Reporter(this.config);
    this.initCollectors();
    this.initialized = true;

    if (this.config.debug) {
      console.log('[FE Monitor] Initialized', this.config);
    }
  }

  private initCollectors() {
    if (!this.config || !this.reporter) return;

    this.collectors = [
      new ErrorCollector(this.config, this.reporter),
      new ResourceCollector(this.config, this.reporter),
      new ApiCollector(this.config, this.reporter),
      new BlankCollector(this.config, this.reporter),
      new PerformanceCollector(this.config, this.reporter),
      new BehaviorCollector(this.config, this.reporter),
    ];

    this.collectors.forEach(collector => collector.install());
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

  error(error: Error | string, extra?: any) {
    if (!this.initialized || !this.reporter) {
      console.warn('[FE Monitor] Not initialized');
      return;
    }

    const event: MonitorEvent = {
      type: 'error',
      subType: 'manual',
      timestamp: Date.now(),
      appId: this.config!.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : { message: String(error) },
        extra,
      },
    };

    this.reporter.report(event);
  }

  destroy() {
    this.collectors.forEach(collector => {
      if (collector.uninstall) collector.uninstall();
    });
    if (this.reporter) {
      this.reporter.flush();
    }
    this.initialized = false;
  }
}

const monitor = new Monitor();

export default monitor;
export { monitor };
export type { MonitorConfig, MonitorEvent };
