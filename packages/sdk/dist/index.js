"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  monitor: () => monitor_default
});
module.exports = __toCommonJS(index_exports);

// src/utils.ts
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
function getSessionId() {
  const key = "__fe_monitor_session__";
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = generateId();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}
function getVisitorId() {
  const key = "__fe_monitor_visitor__";
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = generateId();
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
}
function shouldSample(rate) {
  return Math.random() < rate;
}
function stringifyErrorValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}` || String(value);
  }
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

// src/collectors/error.ts
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
    window.addEventListener("error", (event) => {
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
    }, true);
  }
  listenUnhandledRejection() {
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
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
  constructor(config, reporter) {
    this.config = config;
    this.reporter = reporter;
  }
  install() {
    window.addEventListener("error", (event) => {
      const target = event.target;
      if (target !== window && (target.src || target.href)) {
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
            outerHTML: target.outerHTML?.substring(0, 200)
          }
        };
        this.reporter.report(monitorEvent);
      }
    }, true);
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
    this.reported = false;
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
          if (entry.name === "first-contentful-paint") {
            this.reportPerformance("fcp", entry.startTime);
          }
        }
      });
      observer.observe({ entryTypes: ["paint"] });
    } catch (e) {
    }
  }
  observeLCP() {
    if (!("PerformanceObserver" in window)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.reportPerformance("lcp", lastEntry.startTime);
        }
      });
      observer.observe({ entryTypes: ["largest-contentful-paint"] });
    } catch (e) {
    }
  }
  reportLoadTiming() {
    if (this.reported) return;
    const timing = performance.timing;
    const loadTime = timing.loadEventEnd - timing.fetchStart;
    const domReady = timing.domContentLoadedEventEnd - timing.fetchStart;
    this.reportPerformance("load", loadTime, {
      domReady,
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      ttfb: timing.responseStart - timing.requestStart
    });
    this.reported = true;
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
    document.addEventListener("click", () => {
      this.clickCount++;
    }, true);
  }
  trackTimeOnPage() {
    const reportStay = () => {
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
    window.addEventListener("beforeunload", reportStay);
    window.addEventListener("pagehide", reportStay);
  }
};

// src/reporter.ts
var Reporter = class {
  constructor(config) {
    this.queue = [];
    this.timer = null;
    this.maxQueueSize = 10;
    this.flushInterval = 5e3;
    this.config = config;
    this.bindUnload();
    this.startTimer();
  }
  report(event) {
    this.queue.push(event);
    if (this.config.debug) {
      console.log("[FE Monitor] Event:", event);
    }
    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }
  flush() {
    if (this.queue.length === 0) return;
    const events = [...this.queue];
    this.queue = [];
    this.send(events);
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
    const handler = () => {
      this.flush();
    };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
  }
  startTimer() {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
};

// src/monitor.ts
var Monitor = class {
  constructor() {
    this.config = null;
    this.reporter = null;
    this.collectors = [];
    this.initialized = false;
  }
  init(config) {
    if (this.initialized) {
      console.warn("[FE Monitor] Already initialized");
      return;
    }
    if (typeof window === "undefined") {
      console.warn("[FE Monitor] Not in browser environment");
      return;
    }
    this.config = {
      sampleRate: 1,
      debug: false,
      ...config
    };
    if (!shouldSample(this.config.sampleRate)) {
      if (this.config.debug) {
        console.log("[FE Monitor] Skipped by sample rate");
      }
      return;
    }
    this.reporter = new Reporter(this.config);
    this.initCollectors();
    this.initialized = true;
    if (this.config.debug) {
      console.log("[FE Monitor] Initialized", this.config);
    }
  }
  initCollectors() {
    if (!this.config || !this.reporter) return;
    this.collectors = [
      new ErrorCollector(this.config, this.reporter),
      new ResourceCollector(this.config, this.reporter),
      new ApiCollector(this.config, this.reporter),
      new BlankCollector(this.config, this.reporter),
      new PerformanceCollector(this.config, this.reporter),
      new BehaviorCollector(this.config, this.reporter)
    ];
    this.collectors.forEach((collector) => collector.install());
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
  }
};
var monitor = new Monitor();
var monitor_default = monitor;

// src/index.ts
var index_default = monitor_default;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  monitor
});
