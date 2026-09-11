import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';

export class ResourceCollector {
  private config: MonitorConfig;
  private reporter: Reporter;

  constructor(config: MonitorConfig, reporter: Reporter) {
    this.config = config;
    this.reporter = reporter;
  }

  install() {
    window.addEventListener('error', (event) => {
      const target = event.target as any;
      
      if (target !== window && (target.src || target.href)) {
        const monitorEvent: MonitorEvent = {
          type: 'resource',
          subType: target.tagName?.toLowerCase() || 'unknown',
          timestamp: Date.now(),
          appId: this.config.appId,
          sessionId: getSessionId(),
          visitorId: getVisitorId(),
          url: window.location.href,
          userAgent: navigator.userAgent,
          data: {
            resourceUrl: target.src || target.href,
            tagName: target.tagName,
            outerHTML: target.outerHTML?.substring(0, 200),
          },
        };

        this.reporter.report(monitorEvent);
      }
    }, true);
  }
}
