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
var BlankCollector = class {
  constructor(config, reporter) {
    this.checkTimer = null;
    this.config = config;
    this.reporter = reporter;
  }
  install() {
    if (document.readyState === "complete") {
      this.checkBlankScreen();
    } else {
      window.addEventListener("load", () => {
        this.checkBlankScreen();
      });
    }
  }
  checkBlankScreen() {
    setTimeout(() => {
      const root = document.body || document.documentElement;
      if (!root) {
        this.reportBlank("no-root");
        return;
      }
      const hasContent = this.hasVisibleContent(root);
      if (!hasContent) {
        this.reportBlank("no-visible-content");
      }
    }, 1e3);
  }
  hasVisibleContent(element) {
    const text = element.textContent || "";
    const hasText = text.trim().length > 0;
    if (hasText) return true;
    const images = element.getElementsByTagName("img");
    const canvases = element.getElementsByTagName("canvas");
    const videos = element.getElementsByTagName("video");
    return images.length > 0 || canvases.length > 0 || videos.length > 0;
  }
  reportBlank(reason) {
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
        html: document.documentElement.outerHTML.substring(0, 500)
      }
    };
    this.reporter.report(monitorEvent);
  }
};

// src/collectors/performance.ts
var PerformanceCollector = class {
  constructor(config, reporter) {
    this.loadReported = false;
    this.fcpReported = false;
    this.lcpValue = null;
    this.lcpReported = false;
    this.lcpObserver = null;
    this.config = config;
    this.reporter = reporter;
  }
  install() {
    this.observePaint();
    this.observeLCP();
    window.addEventListener("load", () => {
      setTimeout(() => {
        this.reportLoadTiming();
      }, 0);
    });
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
    try {
      this.lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.lcpValue = lastEntry.startTime;
        }
      });
      this.lcpObserver.observe({
        type: "largest-contentful-paint",
        buffered: true
      });
    } catch {
      try {
        this.lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) this.lcpValue = lastEntry.startTime;
        });
        this.lcpObserver.observe({ entryTypes: ["largest-contentful-paint"] });
      } catch {
        return;
      }
    }
    const finalizeLcp = () => {
      this.flushLcp();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") finalizeLcp();
    });
    window.addEventListener("pagehide", finalizeLcp);
  }
  flushLcp() {
    if (this.lcpReported || this.lcpValue == null) return;
    this.lcpReported = true;
    this.reportPerformance("lcp", this.lcpValue);
    try {
      this.lcpObserver?.disconnect();
    } catch {
    }
  }
  reportLoadTiming() {
    if (this.loadReported) return;
    const timing = performance.timing;
    const loadTime = timing.loadEventEnd - timing.fetchStart;
    const domReady = timing.domContentLoadedEventEnd - timing.fetchStart;
    this.reportPerformance("load", loadTime, {
      domReady,
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      ttfb: timing.responseStart - timing.requestStart
    });
    this.loadReported = true;
  }
  reportPerformance(metric, value, extra) {
    const monitorEvent = {
      type: "performance",
      subType: metric,
      timestamp: Date.now(),
      appId: this.config.appId,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      url: window.location.href,
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
      this.pushCollector(
        "performance",
        new PerformanceCollector(this.config, this.reporter)
      );
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
      this.pushCollector(
        "performance",
        new PerformanceCollector(this.config, this.reporter)
      );
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
