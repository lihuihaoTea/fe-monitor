import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';

export class ErrorCollector {
  private config: MonitorConfig;
  private reporter: Reporter;

  constructor(config: MonitorConfig, reporter: Reporter) {
    this.config = config;
    this.reporter = reporter;
  }

  install() {
    this.listenError();
    this.listenUnhandledRejection();
  }

  private listenError() {
    window.addEventListener('error', (event) => {
      if (event.target !== window) return;

      const monitorEvent: MonitorEvent = {
        type: 'error',
        subType: 'js',
        timestamp: Date.now(),
        appId: this.config.appId,
        sessionId: getSessionId(),
        visitorId: getVisitorId(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        data: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        },
      };

      this.reporter.report(monitorEvent);
    }, true);
  }

  private listenUnhandledRejection() {
    window.addEventListener('unhandledrejection', (event) => {
      const monitorEvent: MonitorEvent = {
        type: 'error',
        subType: 'promise',
        timestamp: Date.now(),
        appId: this.config.appId,
        sessionId: getSessionId(),
        visitorId: getVisitorId(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        data: {
          reason: event.reason instanceof Error ? {
            name: event.reason.name,
            message: event.reason.message,
            stack: event.reason.stack,
          } : { message: String(event.reason) },
        },
      };

      this.reporter.report(monitorEvent);
    });
  }
}
