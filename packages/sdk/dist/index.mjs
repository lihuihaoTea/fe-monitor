// src/utils.ts
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function getSessionId() {
  const key = "__fe_monitor_session__";
  try {
    let sessionId = sessionStorage.getItem(key);
    if (!sessionId) {
      sessionId = generateId();
      sessionStorage.setItem(key, sessionId);
    }
    return sessionId;
  } catch {
    return generateId();
  }
}
function getVisitorId() {
  const key = "__fe_monitor_visitor__";
  try {
    let visitorId = localStorage.getItem(key);
    if (!visitorId) {
      visitorId = generateId();
      localStorage.setItem(key, visitorId);
    }
    return visitorId;
  } catch {
    return generateId();
  }
}
function shouldSample(rate) {
  return Math.random() < rate;
}
function errMessage(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value) {
    const msg = value.message;
    if (typeof msg === "string" && msg) {
      const name = value.name;
      if (typeof name === "string" && name && msg.indexOf(`${name}:`) === 0) {
        return msg;
      }
      return typeof name === "string" && name ? `${name}: ${msg}` : msg;
    }
  }
  return "";
}
function stringifyErrorValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const msg = errMessage(value);
  const stack = value instanceof Error && value.stack ? value.stack : value && typeof value === "object" && "stack" in value && typeof value.stack === "string" ? String(value.stack) : "";
  if (msg) {
    if (stack && stack.indexOf(msg) === -1) return `${msg}
${stack}`;
    return msg;
  }
  if (stack) return stack;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      try {
        return Object.prototype.toString.call(value);
      } catch {
        return "[Unserializable Object]";
      }
    }
  }
  return String(value);
}
function toRegExp(input, fallback) {
  if (!input) return fallback;
  if (input instanceof RegExp) return input;
  try {
    return new RegExp(input);
  } catch {
    return fallback;
  }
}
function hostMatches(hostname, rules) {
  if (!hostname) return false;
  if (!rules || rules.length === 0) return true;
  return rules.some((rule) => {
    if (typeof rule === "string") return rule === hostname;
    try {
      return rule.test(hostname);
    } catch {
      return false;
    }
  });
}

// src/collectors/error.ts
var FE_MONITOR_API_REPORTED = "__fe_monitor_api_reported__";
var ErrorCollector = class {
  constructor(config, reporter) {
    this.config = config;
    this.reporter = reporter;
  }
  install() {
    this.listenError();
    this.listenUnhandledRejection();
  }
  listenError() {
    window.addEventListener(
      "error",
      (event) => {
        if (event.target !== window) return;
        const monitorEvent = {
          type: "error",
          subType: "js",
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
            stack: event.error instanceof Error ? event.error.stack : void 0,
            error: stringifyErrorValue(event.error)
          }
        };
        this.reporter.report(monitorEvent);
      },
      true
    );
  }
  listenUnhandledRejection() {
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      if (reason && typeof reason === "object" && reason[FE_MONITOR_API_REPORTED]) {
        return;
      }
      const monitorEvent = {
        type: "error",
        subType: "promise",
        timestamp: Date.now(),
        appId: this.config.appId,
        sessionId: getSessionId(),
        visitorId: getVisitorId(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        data: {
          message: stringifyErrorValue(reason),
          reason: stringifyErrorValue(reason),
          stack: reason instanceof Error ? reason.stack : void 0
        }
      };
      this.reporter.report(monitorEvent);
    });
  }
};

// src/collectors/resource.ts
var ResourceCollector = class {
  constructor(config, reporter, assetGuard = null) {
    this.config = config;
    this.reporter = reporter;
    this.assetGuard = assetGuard;
  }
  install() {
    window.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        if (target === window || !(target.src || target.href)) return;
        const tag = String(target.tagName || "").toUpperCase();
        if (this.assetGuard && (tag === "SCRIPT" || tag === "LINK") && this.assetGuard.isOurBuildAsset(target.src || target.href || "")) {
          return;
        }
        const monitorEvent = {
          type: "resource",
          subType: target.tagName?.toLowerCase() || "unknown",
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
            severity: "hard"
          }
        };
        this.reporter.report(monitorEvent);
      },
      true
    );
  }
};

// src/collectors/api.ts
var ApiCollector = class {
  constructor(config, reporter) {
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
  interceptFetch() {
    const self = this;
    window.fetch = function(...args) {
      const startTime = Date.now();
      const url = args[0];
      return self.originalFetch.apply(this, args).then((response) => {
        if (response.status >= 400) {
          self.reportApiError("fetch", url, {
            status: response.status,
            statusText: response.statusText,
            duration: Date.now() - startTime
          });
        }
        return response;
      }).catch((error) => {
        self.reportApiError("fetch", url, {
          error: error?.message || stringifyErrorValue(error),
          duration: Date.now() - startTime
        });
        self.markApiReported(error);
        throw error;
      });
    };
  }
  interceptXHR() {
    const self = this;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__fe_monitor_url__ = url;
      this.__fe_monitor_start__ = Date.now();
      return self.originalXHROpen.apply(this, [method, url, ...rest]);
    };
    XMLHttpRequest.prototype.send = function(...args) {
      if (this.__fe_monitor_bound__) {
        return self.originalXHRSend.apply(this, args);
      }
      this.__fe_monitor_bound__ = true;
      this.addEventListener("loadend", function() {
        if (this.status >= 400) {
          self.reportApiError("xhr", this.__fe_monitor_url__, {
            status: this.status,
            statusText: this.statusText,
            duration: Date.now() - (this.__fe_monitor_start__ || Date.now())
          });
        }
      });
      this.addEventListener("error", function() {
        self.reportApiError("xhr", this.__fe_monitor_url__, {
          error: "Network Error",
          duration: Date.now() - (this.__fe_monitor_start__ || Date.now())
        });
      });
      return self.originalXHRSend.apply(this, args);
    };
  }
  markApiReported(error) {
    if (error && typeof error === "object") {
      try {
        Object.defineProperty(error, FE_MONITOR_API_REPORTED, {
          value: true,
          enumerable: false
        });
      } catch {
        error[FE_MONITOR_API_REPORTED] = true;
      }
    }
  }
  reportApiError(apiType, url, details) {
    const monitorEvent = {
      type: "api",
      subType: apiType,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        apiUrl: typeof url === "string" ? url : String(url?.url || url || ""),
        ...details
      }
    };
    this.reporter.report(monitorEvent);
  }
};

// src/collectors/blank.ts
var MOUNT_SELECTOR = "#app, #root, #__next, #__nuxt, #__umi, [data-fe-monitor-root]";
var CHECK_DELAYS_MS = [1500, 4e3, 8e3];
var BlankCollector = class {
  constructor(config, reporter) {
    this.reported = false;
    this.timers = [];
    this.config = config;
    this.reporter = reporter;
  }
  install() {
    const start = () => {
      for (const delay of CHECK_DELAYS_MS) {
        this.timers.push(
          setTimeout(() => {
            this.checkBlankScreen(`t${delay}`);
          }, delay)
        );
      }
    };
    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }
  }
  uninstall() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
  checkBlankScreen(phase) {
    if (this.reported) return;
    const root = document.body || document.documentElement;
    if (!root) {
      this.reportBlank("no-root", phase);
      return;
    }
    if (this.hasVisibleContent(root)) return;
    this.reportBlank("no-visible-content", phase);
  }
  /**
   * 判定是否「看起来有内容」：
   * - 优先看 SPA 挂载点，避免 body 里残留的 script/noscript/注释文本误判
   * - 再用视口中心 elementsFromPoint，过滤纯外壳节点
   */
  hasVisibleContent(fallbackRoot) {
    const mount = document.querySelector(MOUNT_SELECTOR);
    const root = mount || fallbackRoot;
    if (this.elementHasMeaningfulContent(root)) return true;
    const x = Math.max(0, Math.floor(window.innerWidth / 2));
    const y = Math.max(0, Math.floor(window.innerHeight / 2));
    if (x === 0 && y === 0) return false;
    let hitEls = [];
    try {
      hitEls = document.elementsFromPoint(x, y) || [];
    } catch {
      hitEls = [];
    }
    for (const el of hitEls) {
      if (this.isChromeElement(el)) continue;
      if (this.elementHasMeaningfulContent(el)) return true;
    }
    return false;
  }
  isChromeElement(el) {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return true;
    if (tag === "html" || tag === "body" || tag === "head") return true;
    if (el.matches?.(MOUNT_SELECTOR)) {
      return !this.elementHasMeaningfulContent(el);
    }
    return false;
  }
  elementHasMeaningfulContent(el) {
    if (!el) return false;
    const node = el;
    if (node.querySelector?.("img, canvas, video, svg")) {
      const media = node.querySelectorAll("img, canvas, video, svg");
      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        if (this.isVisiblyRendered(m)) return true;
      }
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (textNode) => {
        const parent = textNode.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript" || tag === "template") {
          return NodeFilter.FILTER_REJECT;
        }
        if (!textNode.textContent || !textNode.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!this.isVisiblyRendered(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    return Boolean(walker.nextNode());
  }
  isVisiblyRendered(el) {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      return true;
    } catch {
      return true;
    }
  }
  reportBlank(reason, phase) {
    if (this.reported) return;
    this.reported = true;
    this.uninstall();
    const mount = document.querySelector(MOUNT_SELECTOR);
    const monitorEvent = {
      type: "blank",
      subType: reason,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        reason,
        phase,
        mount: mount ? mount.id || mount.tagName : null,
        html: document.documentElement.outerHTML.substring(0, 500)
      }
    };
    this.reporter.report(monitorEvent);
  }
};

// src/collectors/performance.ts
var DEFAULT_MAX_METRIC_MS = 6e4;
var LCP_FALLBACK_MS = 8e3;
var PerformanceCollector = class {
  constructor(config, reporter) {
    this.loadReported = false;
    this.fcpReported = false;
    this.lcpValue = null;
    /** LCP 候选更新时的页面 URL（归因用，避免离开时路由已变） */
    this.lcpUrl = null;
    this.lcpReported = false;
    this.lcpObserver = null;
    this.timers = [];
    this.routeStartedAt = 0;
    this.spaLcpReportedForRoute = false;
    this.unboundRouteHooks = [];
    this.config = config;
    this.reporter = reporter;
    this.maxMetricMs = typeof config.maxPerfMetricMs === "number" && config.maxPerfMetricMs > 0 ? config.maxPerfMetricMs : DEFAULT_MAX_METRIC_MS;
    this.spaMetrics = config.spaPerfMetrics !== false;
  }
  install() {
    this.routeStartedAt = performance.now();
    this.observePaint();
    this.observeLCP();
    this.bindLoad();
    this.scheduleLcpFallbacks();
    if (this.spaMetrics) {
      this.bindRouteHooks();
    }
  }
  uninstall() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const off of this.unboundRouteHooks) off();
    this.unboundRouteHooks = [];
    try {
      this.lcpObserver?.disconnect();
    } catch {
    }
  }
  /** markAppReady 时补一次 LCP，避免用户从不切走导致无样本 */
  onAppReady() {
    this.timers.push(
      setTimeout(() => {
        this.flushLcp("app-ready");
      }, 1e3)
    );
  }
  bindLoad() {
    const reportLoad = () => {
      setTimeout(() => this.reportLoadTiming(), 0);
    };
    if (document.readyState === "complete") {
      reportLoad();
    } else {
      window.addEventListener("load", reportLoad, { once: true });
    }
  }
  scheduleLcpFallbacks() {
    this.timers.push(
      setTimeout(() => this.flushLcp("timeout"), LCP_FALLBACK_MS)
    );
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") {
      ric(() => this.flushLcp("idle"), { timeout: LCP_FALLBACK_MS });
    }
  }
  bindRouteHooks() {
    const onRoute = () => this.handleRouteChange();
    window.addEventListener("hashchange", onRoute);
    window.addEventListener("popstate", onRoute);
    this.unboundRouteHooks.push(() => {
      window.removeEventListener("hashchange", onRoute);
      window.removeEventListener("popstate", onRoute);
    });
    const historyProto = window.history;
    const unbindHooks = this.unboundRouteHooks;
    const wrap = (method) => {
      const original = historyProto[method];
      historyProto[method] = function(...args) {
        const ret = original.apply(this, args);
        onRoute();
        return ret;
      };
      unbindHooks.push(() => {
        historyProto[method] = original;
      });
    };
    wrap("pushState");
    wrap("replaceState");
  }
  handleRouteChange() {
    this.flushLcp("route-change");
    this.routeStartedAt = performance.now();
    this.spaLcpReportedForRoute = false;
  }
  observePaint() {
    if (!("PerformanceObserver" in window)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name !== "first-contentful-paint" || this.fcpReported) continue;
          this.fcpReported = true;
          this.reportPerformance("fcp", entry.startTime);
          try {
            observer.disconnect();
          } catch {
          }
        }
      });
      observer.observe({ type: "paint", buffered: true });
    } catch {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name !== "first-contentful-paint" || this.fcpReported) continue;
            this.fcpReported = true;
            this.reportPerformance("fcp", entry.startTime);
          }
        });
        observer.observe({ entryTypes: ["paint"] });
      } catch {
      }
    }
  }
  observeLCP() {
    if (!("PerformanceObserver" in window)) return;
    const onEntries = (list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (!lastEntry) return;
      this.lcpValue = lastEntry.startTime;
      this.lcpUrl = window.location.href;
      if (this.spaMetrics && !this.spaLcpReportedForRoute) {
        const spaValue = lastEntry.startTime - this.routeStartedAt;
        if (spaValue > 0 && this.isValidMetric(spaValue)) {
          this.spaLcpReportedForRoute = true;
          this.reportPerformance("spa_lcp", spaValue, {
            navigationType: "spa",
            routeStartedAt: Math.round(this.routeStartedAt)
          });
        }
      }
    };
    try {
      this.lcpObserver = new PerformanceObserver((list) => onEntries(list));
      this.lcpObserver.observe({
        type: "largest-contentful-paint",
        buffered: true
      });
    } catch {
      try {
        this.lcpObserver = new PerformanceObserver((list) => onEntries(list));
        this.lcpObserver.observe({ entryTypes: ["largest-contentful-paint"] });
      } catch {
        return;
      }
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flushLcp("hidden");
    });
    window.addEventListener("pagehide", () => this.flushLcp("pagehide"));
  }
  flushLcp(_reason) {
    if (this.lcpReported || this.lcpValue == null) return;
    this.lcpReported = true;
    this.reportPerformance("lcp", this.lcpValue, void 0, this.lcpUrl || void 0);
    try {
      this.lcpObserver?.disconnect();
    } catch {
    }
  }
  reportLoadTiming() {
    if (this.loadReported) return;
    const nav = this.getNavigationTiming();
    if (!nav) return;
    const loadTime = nav.loadEventEnd - nav.fetchStart;
    const domReady = nav.domContentLoadedEventEnd - nav.fetchStart;
    if (!this.isValidMetric(loadTime)) {
      this.reportOverBudget("load", loadTime);
      return;
    }
    const ttfb = nav.responseStart - nav.requestStart;
    this.reportPerformance("load", loadTime, {
      domReady: this.isValidMetric(domReady) ? Math.round(domReady) : void 0,
      ttfb: this.isValidMetric(ttfb) ? Math.round(ttfb) : void 0,
      dns: Math.max(0, Math.round(nav.domainLookupEnd - nav.domainLookupStart)),
      tcp: Math.max(0, Math.round(nav.connectEnd - nav.connectStart))
    });
    this.loadReported = true;
  }
  getNavigationTiming() {
    try {
      const entries = performance.getEntriesByType?.(
        "navigation"
      );
      const nav = entries?.[0];
      if (nav && nav.fetchStart >= 0) {
        return {
          fetchStart: nav.fetchStart,
          loadEventEnd: nav.loadEventEnd,
          domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
          domainLookupStart: nav.domainLookupStart,
          domainLookupEnd: nav.domainLookupEnd,
          connectStart: nav.connectStart,
          connectEnd: nav.connectEnd,
          requestStart: nav.requestStart,
          responseStart: nav.responseStart
        };
      }
    } catch {
    }
    const timing = performance.timing;
    if (!timing || !timing.fetchStart) return null;
    return {
      fetchStart: timing.fetchStart,
      loadEventEnd: timing.loadEventEnd,
      domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
      domainLookupStart: timing.domainLookupStart,
      domainLookupEnd: timing.domainLookupEnd,
      connectStart: timing.connectStart,
      connectEnd: timing.connectEnd,
      requestStart: timing.requestStart,
      responseStart: timing.responseStart
    };
  }
  isValidMetric(value) {
    return Number.isFinite(value) && value > 0 && value <= this.maxMetricMs;
  }
  reportOverBudget(metric, value) {
    if (!Number.isFinite(value) || value <= this.maxMetricMs) return;
    const event = {
      type: "performance",
      subType: "over_budget",
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        metric,
        value: Math.round(value),
        maxMetricMs: this.maxMetricMs
      }
    };
    this.reporter.report(event);
  }
  reportPerformance(metric, value, extra, urlOverride) {
    if (!this.isValidMetric(value)) {
      this.reportOverBudget(metric, value);
      if (this.config.debug) {
        console.warn("[FE Monitor] drop invalid performance sample", metric, value);
      }
      return;
    }
    const monitorEvent = {
      type: "performance",
      subType: metric,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: urlOverride || window.location.href,
      userAgent: navigator.userAgent,
      data: {
        metric,
        value: Math.round(value),
        ...extra
      }
    };
    this.reporter.report(monitorEvent);
  }
};

// src/collectors/behavior.ts
var BehaviorCollector = class {
  constructor(config, reporter) {
    this.pageEnterTime = Date.now();
    this.clickCount = 0;
    this.stayReported = false;
    this.config = config;
    this.reporter = reporter;
  }
  install() {
    this.reportPV();
    this.trackClicks();
    this.trackTimeOnPage();
  }
  reportPV() {
    const monitorEvent = {
      type: "behavior",
      subType: "pv",
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        referrer: document.referrer,
        title: document.title
      }
    };
    this.reporter.report(monitorEvent);
  }
  trackClicks() {
    document.addEventListener(
      "click",
      () => {
        this.clickCount++;
      },
      true
    );
  }
  trackTimeOnPage() {
    const reportStay = () => {
      if (this.stayReported) return;
      this.stayReported = true;
      const stayTime = Date.now() - this.pageEnterTime;
      const monitorEvent = {
        type: "behavior",
        subType: "stay",
        timestamp: Date.now(),
        appId: this.config.appId,
        sessionId: getSessionId(),
        visitorId: getVisitorId(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        data: {
          duration: stayTime,
          clickCount: this.clickCount
        }
      };
      this.reporter.report(monitorEvent);
    };
    window.addEventListener("pagehide", reportStay);
    window.addEventListener("beforeunload", reportStay);
  }
};

// src/collectors/assetGuard.ts
var DEFAULT_ASSET_PATH_RE = /\/(?:assets\/)?[^/]+\.(?:js|mjs|css)$/i;
var DEFAULT_ENTRY_RE = /\/index-[^/]+\.js$/i;
var AssetGuardCollector = class {
  constructor(config, reporter) {
    this.reloading = false;
    this.timeoutTimer = null;
    this.timeoutStartedAt = Date.now();
    this.timeoutExtendCount = 0;
    this.softRetryMap = {};
    this.recentReportMap = {};
    this.awaitingPreloadHard = {};
    this.assetFailed = false;
    /** reloadMax 用尽后只再报一次，避免卡死页刷屏 */
    this.recoverExhaustedReported = false;
    this.dedupeCleaner = null;
    this.onError = null;
    this.onPreload = null;
    this.config = config;
    this.reporter = reporter;
    const g = config.assetGuard || {};
    this.guard = {
      readyTimeoutMs: g.readyTimeoutMs ?? 25e3,
      timeoutExtendMs: g.timeoutExtendMs ?? 15e3,
      timeoutMaxMs: g.timeoutMaxMs ?? 6e4,
      timeoutExtendMax: g.timeoutExtendMax ?? 2,
      softRetryMax: g.softRetryMax ?? 2,
      dedupWindowMs: g.dedupWindowMs ?? 3e3,
      reloadMax: g.reloadMax ?? 3,
      reloadTtlMs: g.reloadTtlMs ?? 10 * 60 * 1e3,
      reloadStorageKey: g.reloadStorageKey ?? "fe-monitor-asset-reload",
      autoRecover: g.autoRecover ?? false,
      reportObserve: g.reportObserve ?? true,
      ...g
    };
    this.assetPathRe = toRegExp(g.assetPathRe, DEFAULT_ASSET_PATH_RE);
    this.entryPathRe = toRegExp(g.entryPathRe, DEFAULT_ENTRY_RE);
  }
  install() {
    this.onPreload = (event) => {
      const e = event;
      e.preventDefault?.();
      const payload = e.payload;
      const rawMsg = errMessage(payload);
      const fullMsg = stringifyErrorValue(payload);
      let url = this.extractUrlFromMessage(rawMsg) || this.extractUrlFromMessage(fullMsg) || (payload && typeof payload === "object" && payload !== null && "url" in payload && typeof payload.url === "string" ? payload.url : "") || "";
      if (!url && payload && typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string" && /^https?:\/\//i.test(payload.message)) {
        url = payload.message;
      }
      const failReason = this.classifyPreloadFail(rawMsg || fullMsg);
      const norm = this.normalizeAssetUrl(url);
      if (norm && this.awaitingPreloadHard[norm]) {
        delete this.awaitingPreloadHard[norm];
      }
      this.assetFailed = true;
      this.onAssetLoadFailure("preload", {
        message: payload,
        resourceUrl: url,
        linkKind: "vite-preload",
        failReason
      });
    };
    window.addEventListener("vite:preloadError", this.onPreload);
    this.onError = (event) => {
      const el = event.target;
      if (!el || !el.tagName) return;
      const tag = el.tagName.toUpperCase();
      if (tag !== "SCRIPT" && tag !== "LINK") return;
      const info = this.describeEl(el);
      if (!this.isOurBuildAsset(info.resourceUrl)) return;
      this.assetFailed = true;
      const ready = this.isAppReady();
      const normKey = this.normalizeAssetUrl(info.resourceUrl);
      const softN = this.softRetryMap[normKey] || 0;
      if (!ready) {
        this.onAssetLoadFailure(
          "script-link",
          Object.assign({}, info, {
            message: "script/link load error (before ready)",
            softRetry: softN
          })
        );
        return;
      }
      if (info.linkKind === "modulepreload" || info.linkKind === "module-script") {
        this.reportAssetFailure(
          "script-link",
          Object.assign({}, info, {
            message: "module asset error, defer to preload channel",
            softRetry: softN,
            action: "defer-preload",
            retry: this.getReloadCount()
          })
        );
        if (!this.awaitingPreloadHard[normKey]) {
          this.awaitingPreloadHard[normKey] = Date.now();
          const wait = this.guard.dedupWindowMs + 800;
          setTimeout(() => {
            if (this.reloading || !this.awaitingPreloadHard[normKey]) return;
            delete this.awaitingPreloadHard[normKey];
            this.onAssetLoadFailure(
              "script-link",
              Object.assign({}, info, {
                message: "module asset error, preload channel timeout",
                softRetry: softN
              })
            );
          }, wait);
        }
        return;
      }
      if (this.softRetryAsset(info)) {
        this.reportAssetFailure(
          "script-link",
          Object.assign({}, info, {
            message: "script/link soft-retry",
            softRetry: softN + 1,
            action: "soft-retry",
            retry: this.getReloadCount()
          })
        );
        return;
      }
      this.onAssetLoadFailure(
        "script-link",
        Object.assign({}, info, {
          message: "script/link load error (soft-retry exhausted)",
          softRetry: softN
        })
      );
    };
    document.addEventListener("error", this.onError, true);
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
        "vite:preloadError",
        this.onPreload
      );
    }
    if (this.onError) {
      document.removeEventListener("error", this.onError, true);
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
  isOurBuildAsset(url) {
    if (!url) return false;
    try {
      const u = new URL(url, window.location.href);
      if (!this.isAllowedHost(u.hostname)) return false;
      return this.assetPathRe.test(u.pathname);
    } catch {
      return false;
    }
  }
  hasAssetError() {
    return this.assetFailed;
  }
  getReloadCount() {
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
  reportAssetFailure(subType, extra = {}) {
    if (!this.shouldReport()) return;
    const resourceUrl = String(extra.resourceUrl || "");
    const norm = this.normalizeAssetUrl(resourceUrl);
    const now = Date.now();
    const prev = this.recentReportMap[norm];
    if (prev && now - prev.ts < this.guard.dedupWindowMs) return;
    this.recentReportMap[norm || `${subType}:${now}`] = { subType, ts: now };
    const action = extra.action || "";
    const severity = this.resolveSeverity(
      action,
      extra.severity
    );
    if (severity === "observe" && this.guard.reportObserve === false) {
      return;
    }
    const data = {
      failType: subType,
      resourceUrl,
      tagName: extra.tagName || "",
      rel: extra.rel || "",
      as: extra.as || "",
      linkKind: extra.linkKind || "",
      isEntry: !!extra.isEntry,
      softRetry: extra.softRetry || 0,
      message: stringifyErrorValue(extra.message),
      retry: extra.retry,
      reloadCountBefore: extra.reloadCountBefore != null ? extra.reloadCountBefore : extra.retry,
      isApp: this.isAppWebView(),
      ready: this.isAppReady(),
      action,
      severity,
      hasAssetError: this.assetFailed
    };
    if (extra.failReason) data.failReason = extra.failReason;
    Object.assign(data, this.readClientHints());
    const event = {
      type: "resource",
      subType,
      timestamp: now,
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent || "",
      data
    };
    this.reporter.report(event, { immediate: true });
  }
  isAppReady() {
    return !!window.__FE_MONITOR_APP_READY__;
  }
  shouldReport() {
    const host = window.location.hostname || "";
    const rules = this.guard.reportHosts;
    if (!rules || rules.length === 0) return true;
    return hostMatches(host, rules);
  }
  isAllowedHost(hostname) {
    if (!hostname) return false;
    if (hostname === window.location.hostname) return true;
    return hostMatches(hostname, this.guard.allowedHosts);
  }
  isAppWebView() {
    if (!this.guard.isAppWebView) return false;
    try {
      return !!this.guard.isAppWebView();
    } catch {
      return false;
    }
  }
  resolveSeverity(action, explicit) {
    if (explicit) return explicit;
    if (action === "soft-retry" || action === "defer-preload") return "observe";
    return "hard";
  }
  classifyPreloadFail(msg) {
    const s = String(msg || "");
    if (/Failed to fetch dynamically imported module/i.test(s)) {
      return "dynamic-import";
    }
    if (/Unable to preload CSS/i.test(s)) return "css-preload";
    if (/Importing a module script failed/i.test(s)) return "module-import";
    if (/Unable to preload/i.test(s)) return "module-preload";
    return "vite-preload";
  }
  extractUrlFromMessage(msg) {
    const s = String(msg || "");
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
    return "";
  }
  normalizeAssetUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url, window.location.href);
      u.hash = "";
      u.searchParams.delete("ht_retry");
      const q = u.searchParams.toString();
      return u.origin + u.pathname + (q ? `?${q}` : "");
    } catch {
      return String(url).split("#")[0];
    }
  }
  readClientHints() {
    const href = window.location.href || "";
    const pick = (name) => {
      const re = new RegExp(`[?&#]${name}=([^&#]*)`, "i");
      const m = href.match(re);
      if (!m) return "";
      try {
        return decodeURIComponent(m[1].replace(/\+/g, " "));
      } catch {
        return m[1] || "";
      }
    };
    const hints = {};
    const map = {
      pagePlatform: pick("platform"),
      appVersion: pick("app_version"),
      manufacturer: pick("manufacturer"),
      model: pick("model"),
      sysVersion: pick("sysVersion")
    };
    Object.keys(map).forEach((k) => {
      if (map[k]) hints[k] = map[k];
    });
    return hints;
  }
  describeEl(el) {
    const tag = (el.tagName || "").toUpperCase();
    const rel = el.rel || "";
    const asAttr = el.getAttribute && el.getAttribute("as") || el.as || "";
    const url = el.src || el.href || "";
    let linkKind = "unknown";
    if (tag === "LINK") {
      if (/modulepreload/i.test(rel)) linkKind = "modulepreload";
      else if (/stylesheet/i.test(rel)) linkKind = "stylesheet";
      else linkKind = rel || "link";
    } else if (tag === "SCRIPT") {
      linkKind = el.type === "module" ? "module-script" : "classic-script";
    }
    let isEntry = false;
    try {
      isEntry = this.entryPathRe.test(
        new URL(url, window.location.href).pathname
      );
    } catch {
    }
    return {
      tagName: tag,
      rel,
      as: asAttr,
      linkKind,
      resourceUrl: url,
      isEntry
    };
  }
  bumpReloadCount() {
    const n = this.getReloadCount() + 1;
    try {
      localStorage.setItem(
        this.guard.reloadStorageKey,
        JSON.stringify({ n, ts: Date.now() })
      );
    } catch {
    }
    return n;
  }
  clearReloadCount() {
    try {
      localStorage.removeItem(this.guard.reloadStorageKey);
      sessionStorage.removeItem(this.guard.reloadStorageKey);
    } catch {
    }
  }
  clearTimeoutGuard() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
  softRetryAsset(info) {
    if (info.linkKind !== "stylesheet" && info.linkKind !== "classic-script") {
      return false;
    }
    const key = this.normalizeAssetUrl(info.resourceUrl);
    const n = this.softRetryMap[key] || 0;
    if (n >= this.guard.softRetryMax) return false;
    this.softRetryMap[key] = n + 1;
    let pure = "";
    try {
      const u = new URL(info.resourceUrl, window.location.href);
      u.searchParams.delete("ht_retry");
      pure = u.origin + u.pathname;
      const keep = u.searchParams.toString();
      if (keep) pure += `?${keep}`;
    } catch {
      pure = info.resourceUrl.split("?")[0];
    }
    const nextUrl = `${pure}${pure.indexOf("?") >= 0 ? "&" : "?"}ht_retry=${Date.now()}_${n}`;
    try {
      if (info.linkKind === "stylesheet") {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = nextUrl;
        document.head.appendChild(link);
        return true;
      }
      const script = document.createElement("script");
      script.src = nextUrl;
      document.head.appendChild(script);
      return true;
    } catch {
      return false;
    }
  }
  hasPendingBuildAssets() {
    try {
      if (!performance?.getEntriesByType) return false;
      const list = performance.getEntriesByType(
        "resource"
      );
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!this.isOurBuildAsset(e.name)) continue;
        if (!e.responseEnd) return true;
      }
    } catch {
    }
    return false;
  }
  armTimeoutGuard() {
    this.clearTimeoutGuard();
    const tick = () => {
      this.timeoutTimer = null;
      if (this.isAppReady() || this.reloading) return;
      const lived = Date.now() - this.timeoutStartedAt;
      if (this.timeoutExtendCount < this.guard.timeoutExtendMax && lived < this.guard.timeoutMaxMs && this.hasPendingBuildAssets()) {
        this.timeoutExtendCount += 1;
        this.timeoutTimer = setTimeout(tick, this.guard.timeoutExtendMs);
        return;
      }
      this.onAssetLoadFailure("timeout-guard", {
        message: `app not ready within ${lived}ms (base=${this.guard.readyTimeoutMs}, extend=${this.timeoutExtendCount}, hasAssetError=${this.assetFailed})`,
        resourceUrl: window.location.href,
        linkKind: "timeout",
        failReason: this.assetFailed ? "timeout-after-asset-error" : "silent-timeout"
      });
    };
    this.timeoutTimer = setTimeout(tick, this.guard.readyTimeoutMs);
  }
  onAssetLoadFailure(subType, extra) {
    if (this.reloading) return false;
    return this.hardReload(subType, extra);
  }
  hardReload(subType, extra) {
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
              action: "retry-exhausted",
              severity: "hard"
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
        action: "hard-reload"
      },
      extra
    );
    this.reportAssetFailure(subType, merged);
    const ctx = {
      subType,
      action: "hard-reload",
      severity: "hard",
      resourceUrl: String(extra.resourceUrl || ""),
      message: stringifyErrorValue(extra.message),
      failReason: typeof extra.failReason === "string" ? extra.failReason : void 0,
      retry: n,
      data: merged
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
};

// src/reporter.ts
var USER_TAG_STORAGE_KEY = "fe_monitor_user_tag";
var Reporter = class {
  constructor(config) {
    this.queue = [];
    this.timer = null;
    this.maxQueueSize = 10;
    this.flushInterval = 5e3;
    this.userTag = null;
    this.config = config;
    this.userTag = this.readStoredUserTag();
    this.bindUnload();
    this.startTimer();
  }
  setUser(user) {
    const userId = user?.userId;
    const userName = String(user?.userName ?? "").trim();
    if (userId == null || userId === "" || !userName) {
      if (this.config.debug) {
        console.warn("[FE Monitor] setUser requires userId and userName");
      }
      return;
    }
    this.userTag = { userId, userName };
    try {
      sessionStorage.setItem(USER_TAG_STORAGE_KEY, JSON.stringify(this.userTag));
    } catch {
    }
    if (this.config.debug) {
      console.log("[FE Monitor] User tagged", this.userTag);
    }
  }
  clearUser() {
    this.userTag = null;
    try {
      sessionStorage.removeItem(USER_TAG_STORAGE_KEY);
    } catch {
    }
    if (this.config.debug) {
      console.log("[FE Monitor] User tag cleared");
    }
  }
  getUser() {
    return this.userTag;
  }
  report(event, options) {
    const enriched = this.enrichWithUser(event);
    this.queue.push(enriched);
    if (this.config.debug) {
      console.log("[FE Monitor] Event:", enriched);
    }
    if (options?.immediate || this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }
  flush() {
    if (this.queue.length === 0) return;
    const events = [...this.queue];
    this.queue = [];
    this.send(events);
  }
  enrichWithUser(event) {
    if (!this.userTag) return event;
    const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? { ...event.data } : { value: event.data };
    data.user = { ...this.userTag };
    return { ...event, data };
  }
  readStoredUserTag() {
    try {
      const raw = sessionStorage.getItem(USER_TAG_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && (typeof parsed.userId === "string" || typeof parsed.userId === "number") && typeof parsed.userName === "string" && parsed.userName) {
        return { userId: parsed.userId, userName: parsed.userName };
      }
    } catch {
    }
    return null;
  }
  send(events) {
    const url = this.config.endpoint;
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({ events })], {
        type: "application/json"
      });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
        keepalive: true
      }).catch((err) => {
        if (this.config.debug) {
          console.error("[FE Monitor] Send failed:", err);
        }
      });
    }
  }
  bindUnload() {
    let flushed = false;
    const handler = () => {
      if (flushed) return;
      flushed = true;
      this.flush();
    };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
  }
  startTimer() {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
};

// src/monitor.ts
var GLOBAL_KEY = "__FE_MONITOR__";
var Monitor = class {
  constructor() {
    this.config = null;
    this.reporter = null;
    this.collectors = [];
    this.assetGuard = null;
    this.performanceCollector = null;
    this.initialized = false;
    this.appReady = false;
    this.installed = /* @__PURE__ */ new Set();
  }
  init(config) {
    if (typeof window === "undefined") {
      console.warn("[FE Monitor] Not in browser environment");
      return this;
    }
    if (this.initialized) {
      this.patchConfig(config);
      if (this.appReady) {
        this.installAfterReadyCollectors();
      }
      if (this.config?.debug) {
        console.log("[FE Monitor] Already initialized, config patched");
      }
      return this;
    }
    this.config = {
      sampleRate: 1,
      debug: false,
      ...config,
      collectors: {
        error: true,
        resource: true,
        api: true,
        blank: true,
        performance: true,
        behavior: true,
        assetGuard: false,
        ...config.collectors
      },
      collectorsAfterReady: {
        ...config.collectorsAfterReady
      },
      assetGuard: {
        ...config.assetGuard
      }
    };
    if (config.assetGuard?.enabled || config.collectors?.assetGuard) {
      this.config.collectors.assetGuard = true;
    }
    if (!shouldSample(this.config.sampleRate)) {
      if (this.config.debug) {
        console.log("[FE Monitor] Skipped by sample rate");
      }
      return this;
    }
    this.reporter = new Reporter(this.config);
    this.initCollectors();
    this.initialized = true;
    this.bindGlobal();
    if (this.config.debug) {
      console.log("[FE Monitor] Initialized", this.config);
    }
    return this;
  }
  /**
   * 入口 bundle 已执行：取消 timeout-guard，并启动 collectorsAfterReady（PV/API/性能等）。
   */
  markAppReady() {
    this.appReady = true;
    if (this.assetGuard) {
      this.assetGuard.markAppReady();
    } else {
      window.__FE_MONITOR_APP_READY__ = 1;
    }
    this.installAfterReadyCollectors();
    this.performanceCollector?.onAppReady();
  }
  isInitialized() {
    return this.initialized;
  }
  isAppReady() {
    return this.appReady;
  }
  getConfig() {
    return this.config;
  }
  /** 登录后标记用户，后续上报事件的 data.user 会带上该信息 */
  setUser(user) {
    if (!this.reporter) {
      console.warn("[FE Monitor] Not initialized");
      return;
    }
    this.reporter.setUser(user);
  }
  /** 退出登录后清除用户标记 */
  clearUser() {
    if (!this.reporter) {
      console.warn("[FE Monitor] Not initialized");
      return;
    }
    this.reporter.clearUser();
  }
  getUser() {
    return this.reporter?.getUser() ?? null;
  }
  track(eventType, data) {
    if (!this.initialized || !this.reporter) {
      console.warn("[FE Monitor] Not initialized");
      return;
    }
    const event = {
      type: "behavior",
      subType: eventType,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data
    };
    this.reporter.report(event);
  }
  error(error, extra) {
    if (!this.initialized || !this.reporter) {
      console.warn("[FE Monitor] Not initialized");
      return;
    }
    const message = stringifyErrorValue(error);
    const isNotFound = message === "404";
    const event = {
      type: "error",
      subType: isNotFound ? "404" : "manual",
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: {
        message,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : message,
        extra
      }
    };
    this.reporter.report(event);
  }
  destroy() {
    this.collectors.forEach((collector) => {
      if (collector.uninstall) collector.uninstall();
    });
    if (this.reporter) {
      this.reporter.flush();
    }
    this.initialized = false;
    this.appReady = false;
    this.assetGuard = null;
    this.performanceCollector = null;
    this.collectors = [];
    this.installed.clear();
  }
  patchConfig(config) {
    if (!this.config) {
      this.config = config;
      return;
    }
    this.config = {
      ...this.config,
      ...config,
      collectors: {
        ...this.config.collectors,
        ...config.collectors
      },
      collectorsAfterReady: {
        ...this.config.collectorsAfterReady,
        ...config.collectorsAfterReady
      },
      assetGuard: {
        ...this.config.assetGuard,
        ...config.assetGuard
      }
    };
    if (this.assetGuard && config.assetGuard) {
      this.assetGuard.guard = {
        ...this.assetGuard.guard,
        ...config.assetGuard
      };
    }
  }
  initCollectors() {
    if (!this.config || !this.reporter) return;
    const c = this.config.collectors || {};
    this.collectors = [];
    this.installed.clear();
    if (c.assetGuard) {
      this.assetGuard = new AssetGuardCollector(this.config, this.reporter);
      this.pushCollector("assetGuard", this.assetGuard);
    }
    if (c.error !== false) {
      this.pushCollector("error", new ErrorCollector(this.config, this.reporter));
    }
    if (c.resource !== false) {
      this.pushCollector(
        "resource",
        new ResourceCollector(this.config, this.reporter, this.assetGuard)
      );
    }
    if (c.api !== false) {
      this.pushCollector("api", new ApiCollector(this.config, this.reporter));
    }
    if (c.blank !== false) {
      this.pushCollector("blank", new BlankCollector(this.config, this.reporter));
    }
    if (c.performance !== false) {
      this.performanceCollector = new PerformanceCollector(
        this.config,
        this.reporter
      );
      this.pushCollector("performance", this.performanceCollector);
    }
    if (c.behavior !== false) {
      this.pushCollector(
        "behavior",
        new BehaviorCollector(this.config, this.reporter)
      );
    }
  }
  installAfterReadyCollectors() {
    if (!this.config || !this.reporter) return;
    const after = this.config.collectorsAfterReady || {};
    if (after.error && !this.installed.has("error")) {
      this.pushCollector("error", new ErrorCollector(this.config, this.reporter));
    }
    if (after.resource && !this.installed.has("resource")) {
      this.pushCollector(
        "resource",
        new ResourceCollector(this.config, this.reporter, this.assetGuard)
      );
    }
    if (after.api && !this.installed.has("api")) {
      this.pushCollector("api", new ApiCollector(this.config, this.reporter));
    }
    if (after.blank && !this.installed.has("blank")) {
      this.pushCollector("blank", new BlankCollector(this.config, this.reporter));
    }
    if (after.performance && !this.installed.has("performance")) {
      this.performanceCollector = new PerformanceCollector(
        this.config,
        this.reporter
      );
      this.pushCollector("performance", this.performanceCollector);
    }
    if (after.behavior && !this.installed.has("behavior")) {
      this.pushCollector(
        "behavior",
        new BehaviorCollector(this.config, this.reporter)
      );
    }
  }
  pushCollector(name, collector) {
    if (this.installed.has(name)) return;
    this.collectors.push(collector);
    this.installed.add(name);
    collector.install();
  }
  bindGlobal() {
    if (typeof window === "undefined") return;
    window[GLOBAL_KEY] = this;
    window.FEMonitor = this;
  }
};
function getSharedMonitor() {
  if (typeof window !== "undefined") {
    const existing = window[GLOBAL_KEY];
    if (existing) return existing;
  }
  const monitor2 = new Monitor();
  if (typeof window !== "undefined") {
    window[GLOBAL_KEY] = monitor2;
    window.FEMonitor = monitor2;
  }
  return monitor2;
}
var monitor = getSharedMonitor();
var monitor_default = monitor;

// src/index.ts
var index_default = monitor_default;
export {
  index_default as default,
  getSharedMonitor,
  monitor_default as monitor
};
