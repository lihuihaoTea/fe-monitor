import type { MonitorConfig, MonitorEvent } from './types';

export class Reporter {
  private queue: MonitorEvent[] = [];
  private config: MonitorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly maxQueueSize = 10;
  private readonly flushInterval = 5000;

  constructor(config: MonitorConfig) {
    this.config = config;
    this.bindUnload();
    this.startTimer();
  }

  report(event: MonitorEvent) {
    this.queue.push(event);

    if (this.config.debug) {
      console.log('[FE Monitor] Event:', event);
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

  private send(events: MonitorEvent[]) {
    const url = this.config.endpoint;

    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({ events })], {
        type: 'application/json',
      });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        keepalive: true,
      }).catch(err => {
        if (this.config.debug) {
          console.error('[FE Monitor] Send failed:', err);
        }
      });
    }
  }

  private bindUnload() {
    const handler = () => {
      this.flush();
    };

    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', handler);
  }

  private startTimer() {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
}
