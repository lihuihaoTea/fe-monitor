import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';

export class BlankCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private checkTimer: any = null;

  constructor(config: MonitorConfig, reporter: Reporter) {
    this.config = config;
    this.reporter = reporter;
  }

  install() {
    if (document.readyState === 'complete') {
      this.checkBlankScreen();
    } else {
      window.addEventListener('load', () => {
        this.checkBlankScreen();
      });
    }
  }

  private checkBlankScreen() {
    setTimeout(() => {
      const root = document.body || document.documentElement;
      
      if (!root) {
        this.reportBlank('no-root');
        return;
      }

      const hasContent = this.hasVisibleContent(root);
      
      if (!hasContent) {
        this.reportBlank('no-visible-content');
      }
    }, 1000);
  }

  private hasVisibleContent(element: Element): boolean {
    const text = element.textContent || '';
    const hasText = text.trim().length > 0;
    
    if (hasText) return true;

    const images = element.getElementsByTagName('img');
    const canvases = element.getElementsByTagName('canvas');
    const videos = element.getElementsByTagName('video');
    
    return images.length > 0 || canvases.length > 0 || videos.length > 0;
  }

  private reportBlank(reason: string) {
    const monitorEvent: MonitorEvent = {
      type: 'blank',
      subType: reason,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        reason,
        html: document.documentElement.outerHTML.substring(0, 500),
      },
    };

    this.reporter.report(monitorEvent);
  }
}
