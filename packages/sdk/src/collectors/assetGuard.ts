import type {
  AssetAction,
  AssetFailContext,
  AssetFailSubType,
  AssetGuardConfig,
  AssetSeverity,
  MonitorConfig,
  MonitorEvent,
} from '../types';
import {
  errMessage,
  getSessionId,
  getVisitorId,
  hostMatches,
  stringifyErrorValue,
  toRegExp,
} from '../utils';
import type { Reporter } from '../reporter';

const DEFAULT_ASSET_PATH_RE =
  /\/(?:assets\/)?[^/]+\.(?:js|mjs|css)$/i;
const DEFAULT_ENTRY_RE = /\/index-[^/]+\.js$/i;

type ElInfo = {
  tagName: string;
  rel: string;
  as: string;
  linkKind: string;
  resourceUrl: string;
  isEntry: boolean;
};

export class AssetGuardCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private guard: Required<
    Pick<
      AssetGuardConfig,
      | 'readyTimeoutMs'
      | 'timeoutExtendMs'
      | 'timeoutMaxMs'
      | 'timeoutExtendMax'
      | 'softRetryMax'
      | 'dedupWindowMs'
      | 'reloadMax'
      | 'reloadTtlMs'
      | 'reloadStorageKey'
      | 'autoRecover'
      | 'reportObserve'
    >
  > &
    AssetGuardConfig;

  private assetPathRe: RegExp;
  private entryPathRe: RegExp;
  private reloading = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutStartedAt = Date.now();
  private timeoutExtendCount = 0;
  private softRetryMap: Record<string, number> = {};
  private recentReportMap: Record<string, { subType: string; ts: number }> = {};
  private awaitingPreloadHard: Record<string, number> = {};
  private assetFailed = false;
  /** reloadMax 用尽后只再报一次，避免卡死页刷屏 */
  private recoverExhaustedReported = false;
  private dedupeCleaner: ReturnType<typeof setInterval> | null = null;
  private onError: ((event: Event) => void) | null = null;
  private onPreload: ((event: Event) => void) | null = null;

  constructor(config: MonitorConfig, reporter: Reporter) {
    this.config = config;
    this.reporter = reporter;
    const g = config.assetGuard || {};
    this.guard = {
      readyTimeoutMs: g.readyTimeoutMs ?? 25000,
      timeoutExtendMs: g.timeoutExtendMs ?? 15000,
      timeoutMaxMs: g.timeoutMaxMs ?? 60000,
      timeoutExtendMax: g.timeoutExtendMax ?? 2,
      softRetryMax: g.softRetryMax ?? 2,
      dedupWindowMs: g.dedupWindowMs ?? 3000,
      reloadMax: g.reloadMax ?? 3,
      reloadTtlMs: g.reloadTtlMs ?? 10 * 60 * 1000,
      reloadStorageKey: g.reloadStorageKey ?? 'fe-monitor-asset-reload',
      autoRecover: g.autoRecover ?? false,
      reportObserve: g.reportObserve ?? true,
      ...g,
    };
    this.assetPathRe = toRegExp(g.assetPathRe, DEFAULT_ASSET_PATH_RE);
    this.entryPathRe = toRegExp(g.entryPathRe, DEFAULT_ENTRY_RE);
  }

  install() {
    this.onPreload = (event: Event) => {
      const e = event as Event & { payload?: unknown; preventDefault: () => void };
      e.preventDefault?.();
      const payload = e.payload;
      const rawMsg = errMessage(payload);
      const fullMsg = stringifyErrorValue(payload);
      let url =
        this.extractUrlFromMessage(rawMsg) ||
        this.extractUrlFromMessage(fullMsg) ||
        (payload &&
        typeof payload === 'object' &&
        payload !== null &&
        'url' in payload &&
        typeof (payload as { url?: unknown }).url === 'string'
          ? (payload as { url: string }).url
          : '') ||
        '';
      if (
        !url &&
        payload &&
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof (payload as { message?: unknown }).message === 'string' &&
        /^https?:\/\//i.test((payload as { message: string }).message)
      ) {
        url = (payload as { message: string }).message;
      }
      const failReason = this.classifyPreloadFail(rawMsg || fullMsg);
      const norm = this.normalizeAssetUrl(url);
      if (norm && this.awaitingPreloadHard[norm]) {
        delete this.awaitingPreloadHard[norm];
      }
      this.assetFailed = true;
      this.onAssetLoadFailure('preload', {
        message: payload,
        resourceUrl: url,
        linkKind: 'vite-preload',
        failReason,
      });
    };
    window.addEventListener('vite:preloadError', this.onPreload as EventListener);

    this.onError = (event: Event) => {
      const el = event.target as HTMLElement & {
        src?: string;
        href?: string;
        rel?: string;
        as?: string;
        type?: string;
      };
      if (!el || !el.tagName) return;
      const tag = el.tagName.toUpperCase();
      if (tag !== 'SCRIPT' && tag !== 'LINK') return;
      const info = this.describeEl(el);
      if (!this.isOurBuildAsset(info.resourceUrl)) return;
      this.assetFailed = true;

      const ready = this.isAppReady();
      const normKey = this.normalizeAssetUrl(info.resourceUrl);
      const softN = this.softRetryMap[normKey] || 0;

      if (!ready) {
        this.onAssetLoadFailure(
          'script-link',
          Object.assign({}, info, {
            message: 'script/link load error (before ready)',
            softRetry: softN,
          })
        );
        return;
      }

      if (
        info.linkKind === 'modulepreload' ||
        info.linkKind === 'module-script'
      ) {
        this.reportAssetFailure(
          'script-link',
          Object.assign({}, info, {
            message: 'module asset error, defer to preload channel',
            softRetry: softN,
            action: 'defer-preload' as AssetAction,
            retry: this.getReloadCount(),
          })
        );
        if (!this.awaitingPreloadHard[normKey]) {
          this.awaitingPreloadHard[normKey] = Date.now();
          const wait = this.guard.dedupWindowMs + 800;
          setTimeout(() => {
            if (this.reloading || !this.awaitingPreloadHard[normKey]) return;
            delete this.awaitingPreloadHard[normKey];
            this.onAssetLoadFailure(
              'script-link',
              Object.assign({}, info, {
                message: 'module asset error, preload channel timeout',
                softRetry: softN,
              })
            );
          }, wait);
        }
        return;
      }

      if (this.softRetryAsset(info)) {
        this.reportAssetFailure(
          'script-link',
          Object.assign({}, info, {
            message: 'script/link soft-retry',
            softRetry: softN + 1,
            action: 'soft-retry' as AssetAction,
            retry: this.getReloadCount(),
          })
        );
        return;
      }

      this.onAssetLoadFailure(
        'script-link',
        Object.assign({}, info, {
          message: 'script/link load error (soft-retry exhausted)',
          softRetry: softN,
        })
      );
    };
    document.addEventListener('error', this.onError, true);

    this.armTimeoutGuard();
    this.dedupeCleaner = setInterval(() => {
      const now = Date.now();
      const expire = this.guard.dedupWindowMs * 3;
      Object.keys(this.recentReportMap).forEach((key) => {
        if (now - (this.recentReportMap[key].ts || 0) > expire) {
          delete this.recentReportMap[key];
        }
      });
    }, this.guard.dedupWindowMs * 3);
  }

  uninstall() {
    if (this.onPreload) {
      window.removeEventListener(
        'vite:preloadError',
        this.onPreload as EventListener
      );
    }
    if (this.onError) {
      document.removeEventListener('error', this.onError, true);
    }
    this.clearTimeoutGuard();
    if (this.dedupeCleaner) clearInterval(this.dedupeCleaner);
  }

  markAppReady() {
    window.__FE_MONITOR_APP_READY__ = 1;
    this.clearTimeoutGuard();
    this.clearReloadCount();
    this.awaitingPreloadHard = {};
    this.softRetryMap = {};
    this.recentReportMap = {};
    this.assetFailed = false;
    this.recoverExhaustedReported = false;
    this.reloading = false;
  }

  isOurBuildAsset(url: string): boolean {
    if (!url) return false;
    try {
      const u = new URL(url, window.location.href);
      if (!this.isAllowedHost(u.hostname)) return false;
      return this.assetPathRe.test(u.pathname);
    } catch {
      return false;
    }
  }

  hasAssetError(): boolean {
    return this.assetFailed;
  }

  getReloadCount(): number {
    try {
      const raw = localStorage.getItem(this.guard.reloadStorageKey);
      if (!raw) return 0;
      const obj = JSON.parse(raw);
      if (!obj || Date.now() - (obj.ts || 0) > this.guard.reloadTtlMs) {
        localStorage.removeItem(this.guard.reloadStorageKey);
        return 0;
      }
      return Number(obj.n) || 0;
    } catch {
      return 0;
    }
  }

  reportAssetFailure(
    subType: AssetFailSubType,
    extra: Record<string, unknown> = {}
  ) {
    if (!this.shouldReport()) return;

    const resourceUrl = String(extra.resourceUrl || '');
    const norm = this.normalizeAssetUrl(resourceUrl);
    const now = Date.now();
    const prev = this.recentReportMap[norm];
    if (prev && now - prev.ts < this.guard.dedupWindowMs) return;
    this.recentReportMap[norm || `${subType}:${now}`] = { subType, ts: now };

    const action = (extra.action as AssetAction) || '';
    const severity = this.resolveSeverity(
      action,
      extra.severity as AssetSeverity | undefined
    );
    if (severity === 'observe' && this.guard.reportObserve === false) {
      return;
    }
    const data: Record<string, unknown> = {
      failType: subType,
      resourceUrl,
      tagName: extra.tagName || '',
      rel: extra.rel || '',
      as: extra.as || '',
      linkKind: extra.linkKind || '',
      isEntry: !!extra.isEntry,
      softRetry: extra.softRetry || 0,
      message: stringifyErrorValue(extra.message),
      retry: extra.retry,
      reloadCountBefore:
        extra.reloadCountBefore != null ? extra.reloadCountBefore : extra.retry,
      isApp: this.isAppWebView(),
      ready: this.isAppReady(),
      action,
      severity,
      hasAssetError: this.assetFailed,
    };
    if (extra.failReason) data.failReason = extra.failReason;
    Object.assign(data, this.readClientHints());

    const event: MonitorEvent = {
      type: 'resource',
      subType,
      timestamp: now,
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent || '',
      data,
    };
    this.reporter.report(event, { immediate: true });
  }

  private isAppReady(): boolean {
    return !!window.__FE_MONITOR_APP_READY__;
  }

  private shouldReport(): boolean {
    const host = window.location.hostname || '';
    const rules = this.guard.reportHosts;
    if (!rules || rules.length === 0) return true;
    return hostMatches(host, rules);
  }

  private isAllowedHost(hostname: string): boolean {
    if (!hostname) return false;
    if (hostname === window.location.hostname) return true;
    return hostMatches(hostname, this.guard.allowedHosts);
  }

  private isAppWebView(): boolean {
    // 默认不猜测业务 WebView；由接入方通过 assetGuard.isAppWebView 注入
    if (!this.guard.isAppWebView) return false;
    try {
      return !!this.guard.isAppWebView();
    } catch {
      return false;
    }
  }

  private resolveSeverity(
    action: AssetAction,
    explicit?: AssetSeverity
  ): AssetSeverity {
    if (explicit) return explicit;
    if (action === 'soft-retry' || action === 'defer-preload') return 'observe';
    return 'hard';
  }

  private classifyPreloadFail(msg: string): string {
    const s = String(msg || '');
    if (/Failed to fetch dynamically imported module/i.test(s)) {
      return 'dynamic-import';
    }
    if (/Unable to preload CSS/i.test(s)) return 'css-preload';
    if (/Importing a module script failed/i.test(s)) return 'module-import';
    if (/Unable to preload/i.test(s)) return 'module-preload';
    return 'vite-preload';
  }

  private extractUrlFromMessage(msg: string): string {
    const s = String(msg || '');
    const m = s.match(/https?:\/\/[^\s'"<>]+\.(?:js|mjs|css)/i);
    if (m) return m[0];
    const css = s.match(/Unable to preload CSS for\s+(\S+)/i);
    if (css) {
      try {
        return new URL(css[1], window.location.href).href;
      } catch {
        return css[1];
      }
    }
    return '';
  }

  private normalizeAssetUrl(url: string): string {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.href);
      u.hash = '';
      u.searchParams.delete('ht_retry');
      const q = u.searchParams.toString();
      return u.origin + u.pathname + (q ? `?${q}` : '');
    } catch {
      return String(url).split('#')[0];
    }
  }

  private readClientHints(): Record<string, string> {
    const href = window.location.href || '';
    const pick = (name: string) => {
      const re = new RegExp(`[?&#]${name}=([^&#]*)`, 'i');
      const m = href.match(re);
      if (!m) return '';
      try {
        return decodeURIComponent(m[1].replace(/\+/g, ' '));
      } catch {
        return m[1] || '';
      }
    };
    const hints: Record<string, string> = {};
    const map: Record<string, string> = {
      pagePlatform: pick('platform'),
      appVersion: pick('app_version'),
      manufacturer: pick('manufacturer'),
      model: pick('model'),
      sysVersion: pick('sysVersion'),
    };
    Object.keys(map).forEach((k) => {
      if (map[k]) hints[k] = map[k];
    });
    return hints;
  }

  private describeEl(el: {
    tagName?: string;
    rel?: string;
    as?: string;
    src?: string;
    href?: string;
    type?: string;
    getAttribute?: (name: string) => string | null;
  }): ElInfo {
    const tag = (el.tagName || '').toUpperCase();
    const rel = el.rel || '';
    const asAttr = (el.getAttribute && el.getAttribute('as')) || el.as || '';
    const url = el.src || el.href || '';
    let linkKind = 'unknown';
    if (tag === 'LINK') {
      if (/modulepreload/i.test(rel)) linkKind = 'modulepreload';
      else if (/stylesheet/i.test(rel)) linkKind = 'stylesheet';
      else linkKind = rel || 'link';
    } else if (tag === 'SCRIPT') {
      linkKind = el.type === 'module' ? 'module-script' : 'classic-script';
    }
    let isEntry = false;
    try {
      isEntry = this.entryPathRe.test(
        new URL(url, window.location.href).pathname
      );
    } catch {
      // ignore
    }
    return {
      tagName: tag,
      rel,
      as: asAttr,
      linkKind,
      resourceUrl: url,
      isEntry,
    };
  }

  private bumpReloadCount(): number {
    const n = this.getReloadCount() + 1;
    try {
      localStorage.setItem(
        this.guard.reloadStorageKey,
        JSON.stringify({ n, ts: Date.now() })
      );
    } catch {
      // ignore
    }
    return n;
  }

  private clearReloadCount() {
    try {
      localStorage.removeItem(this.guard.reloadStorageKey);
      sessionStorage.removeItem(this.guard.reloadStorageKey);
    } catch {
      // ignore
    }
  }

  private clearTimeoutGuard() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private softRetryAsset(info: ElInfo): boolean {
    if (
      info.linkKind !== 'stylesheet' &&
      info.linkKind !== 'classic-script'
    ) {
      return false;
    }
    const key = this.normalizeAssetUrl(info.resourceUrl);
    const n = this.softRetryMap[key] || 0;
    if (n >= this.guard.softRetryMax) return false;
    this.softRetryMap[key] = n + 1;
    let pure = '';
    try {
      const u = new URL(info.resourceUrl, window.location.href);
      u.searchParams.delete('ht_retry');
      pure = u.origin + u.pathname;
      const keep = u.searchParams.toString();
      if (keep) pure += `?${keep}`;
    } catch {
      pure = info.resourceUrl.split('?')[0];
    }
    const nextUrl = `${pure}${pure.indexOf('?') >= 0 ? '&' : '?'}ht_retry=${Date.now()}_${n}`;
    try {
      if (info.linkKind === 'stylesheet') {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = nextUrl;
        document.head.appendChild(link);
        return true;
      }
      const script = document.createElement('script');
      script.src = nextUrl;
      document.head.appendChild(script);
      return true;
    } catch {
      return false;
    }
  }

  private hasPendingBuildAssets(): boolean {
    try {
      if (!performance?.getEntriesByType) return false;
      const list = performance.getEntriesByType(
        'resource'
      ) as PerformanceResourceTiming[];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!this.isOurBuildAsset(e.name)) continue;
        if (!e.responseEnd) return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  private armTimeoutGuard() {
    this.clearTimeoutGuard();
    const tick = () => {
      this.timeoutTimer = null;
      if (this.isAppReady() || this.reloading) return;
      const lived = Date.now() - this.timeoutStartedAt;
      if (
        this.timeoutExtendCount < this.guard.timeoutExtendMax &&
        lived < this.guard.timeoutMaxMs &&
        this.hasPendingBuildAssets()
      ) {
        this.timeoutExtendCount += 1;
        this.timeoutTimer = setTimeout(tick, this.guard.timeoutExtendMs);
        return;
      }
      this.onAssetLoadFailure('timeout-guard', {
        message: `app not ready within ${lived}ms (base=${this.guard.readyTimeoutMs}, extend=${this.timeoutExtendCount}, hasAssetError=${this.assetFailed})`,
        resourceUrl: window.location.href,
        linkKind: 'timeout',
        failReason: this.assetFailed
          ? 'timeout-after-asset-error'
          : 'silent-timeout',
      });
    };
    this.timeoutTimer = setTimeout(tick, this.guard.readyTimeoutMs);
  }

  private onAssetLoadFailure(
    subType: AssetFailSubType,
    extra: Record<string, unknown>
  ): boolean {
    if (this.reloading) return false;
    return this.hardReload(subType, extra);
  }

  private hardReload(
    subType: AssetFailSubType,
    extra: Record<string, unknown>
  ): boolean {
    if (this.reloading) return false;
    const n = this.getReloadCount();

    if (n >= this.guard.reloadMax) {
      if (!this.recoverExhaustedReported) {
        this.recoverExhaustedReported = true;
        this.reportAssetFailure(
          subType,
          Object.assign(
            {
              retry: n,
              reloadCountBefore: n,
              action: 'retry-exhausted' as AssetAction,
              severity: 'hard' as AssetSeverity,
            },
            extra
          )
        );
      }
      return false;
    }

    const merged = Object.assign(
      {
        retry: n,
        reloadCountBefore: n,
        action: 'hard-reload' as AssetAction,
      },
      extra
    );
    this.reportAssetFailure(subType, merged);

    const ctx: AssetFailContext = {
      subType,
      action: 'hard-reload',
      severity: 'hard',
      resourceUrl: String(extra.resourceUrl || ''),
      message: stringifyErrorValue(extra.message),
      failReason:
        typeof extra.failReason === 'string' ? extra.failReason : undefined,
      retry: n,
      data: merged,
    };

    if (!this.guard.autoRecover && !this.guard.onRecover) return false;

    this.bumpReloadCount();
    this.reloading = true;
    this.clearTimeoutGuard();

    if (this.guard.onRecover) {
      const ret = this.guard.onRecover(ctx);
      if (ret === false) {
        this.reloading = false;
        return false;
      }
      return true;
    }

    window.location.reload();
    return true;
  }
}
