import type { MonitorConfig, MonitorEvent } from '../types';
import { getSessionId, getVisitorId } from '../utils';
import type { Reporter } from '../reporter';

/** SPA 常见挂载点；无匹配时回退 body */
const MOUNT_SELECTOR =
  '#app, #root, #__next, #__nuxt, #__umi, [data-fe-monitor-root]';

/** load 后多次抽检，覆盖异步渲染 / 启动失败 */
const CHECK_DELAYS_MS = [1500, 4000, 8000];

export class BlankCollector {
  private config: MonitorConfig;
  private reporter: Reporter;
  private reported = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(config: MonitorConfig, reporter: Reporter) {
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

    if (document.readyState === 'complete') {
      start();
    } else {
      window.addEventListener('load', start, { once: true });
    }
  }

  uninstall() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private checkBlankScreen(phase: string) {
    if (this.reported) return;

    const root = document.body || document.documentElement;
    if (!root) {
      this.reportBlank('no-root', phase);
      return;
    }

    if (this.hasVisibleContent(root)) return;

    this.reportBlank('no-visible-content', phase);
  }

  /**
   * 判定是否「看起来有内容」：
   * - 优先看 SPA 挂载点，避免 body 里残留的 script/noscript/注释文本误判
   * - 再用视口中心 elementsFromPoint，过滤纯外壳节点
   */
  private hasVisibleContent(fallbackRoot: Element): boolean {
    const mount = document.querySelector(MOUNT_SELECTOR);
    const root = (mount as HTMLElement | null) || (fallbackRoot as HTMLElement);

    if (this.elementHasMeaningfulContent(root)) return true;

    const x = Math.max(0, Math.floor(window.innerWidth / 2));
    const y = Math.max(0, Math.floor(window.innerHeight / 2));
    if (x === 0 && y === 0) return false;

    let hitEls: Element[] = [];
    try {
      hitEls = document.elementsFromPoint(x, y) || [];
    } catch {
      hitEls = [];
    }

    for (const el of hitEls) {
      if (this.isChromeElement(el)) continue;
      if (this.elementHasMeaningfulContent(el as HTMLElement)) return true;
    }

    return false;
  }

  private isChromeElement(el: Element): boolean {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return true;
    if (tag === 'html' || tag === 'body' || tag === 'head') return true;
    if (el.matches?.(MOUNT_SELECTOR)) {
      // 挂载点本身不算内容，看其子树
      return !this.elementHasMeaningfulContent(el as HTMLElement);
    }
    return false;
  }

  private elementHasMeaningfulContent(el: HTMLElement | Element): boolean {
    if (!el) return false;
    const node = el as HTMLElement;

    // 媒体即视为有内容
    if (node.querySelector?.('img, canvas, video, svg')) {
      const media = node.querySelectorAll('img, canvas, video, svg');
      for (let i = 0; i < media.length; i++) {
        const m = media[i] as HTMLElement;
        if (this.isVisiblyRendered(m)) return true;
      }
    }

    // 可见文本（排除 script/style/noscript）
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (textNode) => {
        const parent = textNode.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') {
          return NodeFilter.FILTER_REJECT;
        }
        if (!textNode.textContent || !textNode.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!this.isVisiblyRendered(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    return Boolean(walker.nextNode());
  }

  private isVisiblyRendered(el: HTMLElement): boolean {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      return true;
    } catch {
      return true;
    }
  }

  private reportBlank(reason: string, phase: string) {
    if (this.reported) return;
    this.reported = true;
    this.uninstall();

    const mount = document.querySelector(MOUNT_SELECTOR);
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
        phase,
        mount: mount ? (mount as HTMLElement).id || mount.tagName : null,
        html: document.documentElement.outerHTML.substring(0, 500),
      },
    };

    this.reporter.report(monitorEvent);
  }
}
