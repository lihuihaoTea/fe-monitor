import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';
import type { AssetGuardCollector } from './assetGuard';

export class ResourceCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private assetGuard: AssetGuardCollector | null;

  constructor(
    config: MonitorConfig,
    reporter: Reporter,
    assetGuard: AssetGuardCollector | null = null
  ) {
    this.config = config;
    this.reporter = reporter;
    this.assetGuard = assetGuard;
  }

  install() {
    window.addEventListener(
      'error',
      (event) => {
        const target = event.target as any;

        if (target === window || !(target.src || target.href)) return;

        const tag = String(target.tagName || '').toUpperCase();
        // 构建资源 script/link 交给 AssetGuard，避免双报
        if (
          this.assetGuard &&
          (tag === 'SCRIPT' || tag === 'LINK') &&
          this.assetGuard.isOurBuildAsset(target.src || target.href || '')
        ) {
          return;
        }

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
            severity: 'hard',
          },
        };

        this.reporter.report(monitorEvent);
      },
      true
    );
  }
}
