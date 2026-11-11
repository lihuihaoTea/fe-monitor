/**
 * Vite 插件：将 fe-monitor IIFE 注入 index.html（路径 2 早鸟）。
 *
 * @example
 * import feMonitor from 'fe-monitor-kit/vite'
 * plugins: [
 *   feMonitor({
 *     init: {
 *       endpoint: 'https://api.example.com/api/report',
 *       appId: 'my-app',
 *       collectors: { assetGuard: true, blank: false },
 *       assetGuard: {
 *         enabled: true,
 *         assetPathRe: /\\/assets\\/.+\\.(?:js|mjs|css)$/i,
 *         autoRecover: true,
 *       },
 *     },
 *     onRecoverCode: `function () { location.reload(); }`,
 *   })
 * ]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLACEHOLDER = "<!--fe-monitor-inject-->";

/**
 * RegExp / 函数无法 JSON 序列化；RegExp 传 source 字符串，回调用 onRecoverCode。
 * @param {unknown} value
 */
function serializeInitValue(value) {
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeInitValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const parts = Object.keys(value).map((key) => {
      return `${JSON.stringify(key)}:${serializeInitValue(value[key])}`;
    });
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * @param {Record<string, unknown>} init
 * @param {{
 *   onRecoverCode?: string
 *   resolveAppIdCode?: string
 *   isAppWebViewCode?: string
 * }} [hooks]
 */
function buildInitScript(init, hooks = {}) {
  const { onRecoverCode, resolveAppIdCode, isAppWebViewCode } = hooks;
  const config = { ...init };
  const assetGuard =
    config.assetGuard && typeof config.assetGuard === "object"
      ? { ...config.assetGuard }
      : config.assetGuard;

  if (assetGuard && typeof assetGuard === "object") {
    if (onRecoverCode) assetGuard.onRecover = "__ON_RECOVER__";
    if (isAppWebViewCode) assetGuard.isAppWebView = "__IS_APP__";
    config.assetGuard = assetGuard;
  }
  if (resolveAppIdCode) {
    config.appId = "__APP_ID__";
  }

  let literal = serializeInitValue(config);
  if (onRecoverCode) {
    literal = literal.replace(`"__ON_RECOVER__"`, `(${onRecoverCode})`);
  }
  if (isAppWebViewCode) {
    literal = literal.replace(`"__IS_APP__"`, `(${isAppWebViewCode})`);
  }
  if (resolveAppIdCode) {
    literal = literal.replace(`"__APP_ID__"`, `(${resolveAppIdCode})()`);
  }

  return `(function(){if(!window.FEMonitor||typeof window.FEMonitor.init!=="function")return;window.FEMonitor.init(${literal});})();`;
}

/**
 * @param {string} html
 * @param {string} tags
 * @param {string} placeholder
 */
function injectIntoHtml(html, tags, placeholder) {
  if (html.includes(placeholder)) {
    return html.replace(placeholder, tags);
  }
  if (/<meta\s+charset=[^>]*>/i.test(html)) {
    return html.replace(/(<meta\s+charset=[^>]*>)/i, `$1\n    ${tags}`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n    ${tags}`);
  }
  return `${tags}\n${html}`;
}

/**
 * @param {{
 *   placeholder?: string
 *   init?: Record<string, unknown>
 *   onRecoverCode?: string
 *   resolveAppIdCode?: string
 *   isAppWebViewCode?: string
 *   initScript?: string
 *   iifePath?: string
 * }} [options]
 */
export function feMonitor(options = {}) {
  const placeholder = options.placeholder || DEFAULT_PLACEHOLDER;
  const iifePath =
    options.iifePath || path.join(__dirname, "dist/fe-monitor.min.js");

  return {
    name: "fe-monitor",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!fs.existsSync(iifePath)) {
          this.error(
            `[fe-monitor] missing IIFE: ${iifePath}; run fe-monitor-kit build first`
          );
        }

        const iife = fs.readFileSync(iifePath, "utf8").trim();
        const initJs =
          options.initScript ||
          buildInitScript(options.init || {}, {
            onRecoverCode: options.onRecoverCode,
            resolveAppIdCode: options.resolveAppIdCode,
            isAppWebViewCode: options.isAppWebViewCode,
          });

        const tags = `<script>${iife}</script>\n    <script>${initJs}</script>`;
        return injectIntoHtml(html, tags, placeholder);
      },
    },
  };
}

export default feMonitor;
