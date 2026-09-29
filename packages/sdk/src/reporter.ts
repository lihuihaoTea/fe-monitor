import type { MonitorConfig, MonitorEvent, UserTag } from './types';

const USER_TAG_STORAGE_KEY = 'fe_monitor_user_tag';

export class Reporter {
  private queue: MonitorEvent[] = [];
  private config: MonitorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly maxQueueSize = 10;
  private readonly flushInterval = 5000;
  private userTag: UserTag | null = null;

  constructor(config: MonitorConfig) {
    this.config = config;
    this.userTag = this.readStoredUserTag();
    this.bindUnload();
    this.startTimer();
  }

  setUser(user: UserTag) {
    const userId = user?.userId;
    const userName = String(user?.userName ?? '').trim();
    if (userId == null || userId === '' || !userName) {
      if (this.config.debug) {
        console.warn('[FE Monitor] setUser requires userId and userName');
      }
      return;
    }
    this.userTag = { userId, userName };
    try {
      sessionStorage.setItem(USER_TAG_STORAGE_KEY, JSON.stringify(this.userTag));
    } catch {
      // ignore storage failures
    }
    if (this.config.debug) {
      console.log('[FE Monitor] User tagged', this.userTag);
    }
  }

  clearUser() {
    this.userTag = null;
    try {
      sessionStorage.removeItem(USER_TAG_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (this.config.debug) {
      console.log('[FE Monitor] User tag cleared');
    }
  }

  getUser(): UserTag | null {
    return this.userTag;
  }

  report(event: MonitorEvent) {
    const enriched = this.enrichWithUser(event);
    this.queue.push(enriched);

    if (this.config.debug) {
      console.log('[FE Monitor] Event:', enriched);
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

  private enrichWithUser(event: MonitorEvent): MonitorEvent {
    if (!this.userTag) return event;
    const data =
      event.data && typeof event.data === 'object' && !Array.isArray(event.data)
        ? { ...event.data }
        : { value: event.data };
    data.user = { ...this.userTag };
    return { ...event, data };
  }

  private readStoredUserTag(): UserTag | null {
    try {
      const raw = sessionStorage.getItem(USER_TAG_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        (typeof parsed.userId === 'string' || typeof parsed.userId === 'number') &&
        typeof parsed.userName === 'string' &&
        parsed.userName
      ) {
        return { userId: parsed.userId, userName: parsed.userName };
      }
    } catch {
      // ignore
    }
    return null;
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
      }).catch((err) => {
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
