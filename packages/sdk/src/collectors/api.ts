import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId, stringifyErrorValue } from '../utils';
import type { Reporter } from '../reporter';

export class ApiCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private originalFetch: typeof fetch;
  private originalXHROpen: any;
  private originalXHRSend: any;

  constructor(config: MonitorConfig, reporter: Reporter) {
    this.config = config;
    this.reporter = reporter;
    this.originalFetch = window.fetch;
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
  }

  install() {
    this.interceptFetch();
    this.interceptXHR();
  }

  private interceptFetch() {
    const self = this;
    window.fetch = function (...args: any[]) {
      const startTime = Date.now();
      const url = args[0];

      return self.originalFetch.apply(this, args as any)
        .then((response) => {
          if (response.status >= 400) {
            self.reportApiError('fetch', url, {
              status: response.status,
              statusText: response.statusText,
              duration: Date.now() - startTime,
            });
          }
          return response;
        })
        .catch((error) => {
          self.reportApiError('fetch', url, {
            error: error?.message || stringifyErrorValue(error),
            duration: Date.now() - startTime,
          });
          throw error;
        });
    };
  }

  private interceptXHR() {
    const self = this;

    XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
      (this as any).__fe_monitor_url__ = url;
      (this as any).__fe_monitor_start__ = Date.now();
      return self.originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args: any[]) {
      this.addEventListener('loadend', function () {
        if (this.status >= 400) {
          self.reportApiError('xhr', (this as any).__fe_monitor_url__, {
            status: this.status,
            statusText: this.statusText,
            duration: Date.now() - ((this as any).__fe_monitor_start__ || Date.now()),
          });
        }
      });

      this.addEventListener('error', function () {
        self.reportApiError('xhr', (this as any).__fe_monitor_url__, {
          error: 'Network Error',
          duration: Date.now() - ((this as any).__fe_monitor_start__ || Date.now()),
        });
      });

      return self.originalXHRSend.apply(this, args);
    };
  }

  private reportApiError(apiType: string, url: string, details: any) {
    const monitorEvent: MonitorEvent = {
      type: 'api',
      subType: apiType,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        apiUrl: typeof url === 'string' ? url : String((url as any)?.url || url || ''),
        ...details,
      },
    };

    this.reporter.report(monitorEvent);
  }
}
