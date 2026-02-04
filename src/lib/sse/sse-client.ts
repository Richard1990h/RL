// Generic SSE client with auto-reconnect and exponential backoff

export type SSEMessageHandler = (event: string, data: unknown) => void;

export interface SSEClientOptions {
  url: string;
  onMessage: SSEMessageHandler;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  maxRetries?: number;
  initialRetryMs?: number;
  maxRetryMs?: number;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventId: string | null = null;
  private closed = false;

  private url: string;
  private onMessage: SSEMessageHandler;
  private onOpen?: () => void;
  private onClose?: () => void;
  private onError?: (error: Event) => void;
  private maxRetries: number;
  private initialRetryMs: number;
  private maxRetryMs: number;

  constructor(options: SSEClientOptions) {
    this.url = options.url;
    this.onMessage = options.onMessage;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onError = options.onError;
    this.maxRetries = options.maxRetries ?? 20;
    this.initialRetryMs = options.initialRetryMs ?? 1000;
    this.maxRetryMs = options.maxRetryMs ?? 30000;
  }

  connect() {
    if (this.closed) return;
    this.cleanup();

    const url = this.lastEventId
      ? `${this.url}${this.url.includes("?") ? "&" : "?"}lastEventId=${this.lastEventId}`
      : this.url;

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.retryCount = 0;
      this.onOpen?.();
    };

    this.eventSource.onmessage = (ev) => {
      if (ev.lastEventId) {
        this.lastEventId = ev.lastEventId;
      }
      try {
        const data = JSON.parse(ev.data);
        this.onMessage("message", data);
      } catch {
        this.onMessage("message", ev.data);
      }
    };

    // Listen for named events
    const knownEvents = ["signal", "ice", "join", "leave", "game-state", "game-event", "chat", "donation", "viewer-count"];
    for (const eventName of knownEvents) {
      this.eventSource.addEventListener(eventName, (ev: Event) => {
        const msgEv = ev as MessageEvent;
        if (msgEv.lastEventId) {
          this.lastEventId = msgEv.lastEventId;
        }
        try {
          const data = JSON.parse(msgEv.data);
          this.onMessage(eventName, data);
        } catch {
          this.onMessage(eventName, msgEv.data);
        }
      });
    }

    this.eventSource.onerror = (ev) => {
      this.onError?.(ev);
      if (this.closed) return;

      this.cleanup();

      if (this.retryCount < this.maxRetries) {
        const delay = Math.min(
          this.initialRetryMs * Math.pow(2, this.retryCount),
          this.maxRetryMs
        );
        this.retryCount++;
        this.retryTimer = setTimeout(() => this.connect(), delay);
      } else {
        this.onClose?.();
      }
    };
  }

  disconnect() {
    this.closed = true;
    this.cleanup();
    this.onClose?.();
  }

  private cleanup() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  get currentRetryCount(): number {
    return this.retryCount;
  }
}
