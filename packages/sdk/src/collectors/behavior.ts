import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';

export class BehaviorCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private pageEnterTime = Date.now();
  private clickCount = 0;

  constructor(config: MonitorConfig, reporter: Reporter) {
    this.config = config;
    this.reporter = reporter;
  }

  install() {
    this.reportPV();
    this.trackClicks();
    this.trackTimeOnPage();
  }

  private reportPV() {
    const monitorEvent: MonitorEvent = {
      type: 'behavior',
      subType: 'pv',
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        referrer: document.referrer,
        title: document.title,
      },
    };

    this.reporter.report(monitorEvent);
  }

  private trackClicks() {
    document.addEventListener('click', () => {
      this.clickCount++;
    }, true);
  }

  private trackTimeOnPage() {
    const reportStay = () => {
      const stayTime = Date.now() - this.pageEnterTime;

      const monitorEvent: MonitorEvent = {
        type: 'behavior',
        subType: 'stay',
        timestamp: Date.now(),
        appId: this.config.appId,
        sessionId: getSessionId(),
        visitorId: getVisitorId(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        data: {
          duration: stayTime,
          clickCount: this.clickCount,
        },
      };

      this.reporter.report(monitorEvent);
    };

    window.addEventListener('beforeunload', reportStay);
    window.addEventListener('pagehide', reportStay);
  }
}
