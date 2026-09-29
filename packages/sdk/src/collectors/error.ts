import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId, stringifyErrorValue } from '../utils';
import type { Reporter } from '../reporter';

/** 已由 ApiCollector 上报过的 rejection，避免再记一条 promise 错误 */
export const FE_MONITOR_API_REPORTED = '__fe_monitor_api_reported__';

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
    window.addEventListener(
      'error',
      (event) => {
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
            message: stringifyErrorValue(event.message || event.error),
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error instanceof Error ? event.error.stack : undefined,
            error: stringifyErrorValue(event.error),
          },
        };

        this.reporter.report(monitorEvent);
      },
      true
    );
  }

  private listenUnhandledRejection() {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      if (
        reason &&
        typeof reason === 'object' &&
        (reason as Record<string, unknown>)[FE_MONITOR_API_REPORTED]
      ) {
        return;
      }

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
          message: stringifyErrorValue(reason),
          reason: stringifyErrorValue(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
        },
      };

      this.reporter.report(monitorEvent);
    });
  }
}
