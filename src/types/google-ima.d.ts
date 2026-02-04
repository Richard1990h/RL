/* eslint-disable @typescript-eslint/no-namespace */
declare namespace google.ima {
  class AdDisplayContainer {
    constructor(container: HTMLElement, video?: HTMLVideoElement);
    initialize(): void;
    destroy(): void;
  }

  class AdsLoader {
    constructor(container: AdDisplayContainer);
    addEventListener(
      event: AdsManagerLoadedEvent.Type | AdErrorEvent.Type,
      handler: (e: AdsManagerLoadedEvent | AdErrorEvent) => void,
    ): void;
    requestAds(request: AdsRequest): void;
    destroy(): void;
  }

  class AdsRequest {
    adTagUrl: string;
    linearAdSlotWidth: number;
    linearAdSlotHeight: number;
  }

  class AdsRenderingSettings {
    restoreCustomPlaybackStateOnAdBreakComplete: boolean;
  }

  interface AdsManager {
    init(width: number, height: number, viewMode: ViewMode): void;
    start(): void;
    resize(width: number, height: number, viewMode: ViewMode): void;
    destroy(): void;
    addEventListener(event: string, handler: (e: AdEvent | AdErrorEvent) => void): void;
  }

  class AdsManagerLoadedEvent {
    getAdsManager(content: unknown, settings?: AdsRenderingSettings): AdsManager;
  }

  namespace AdsManagerLoadedEvent {
    enum Type {
      ADS_MANAGER_LOADED = "adsManagerLoaded",
    }
  }

  class AdErrorEvent {
    getError(): { getMessage(): string };
  }

  namespace AdErrorEvent {
    enum Type {
      AD_ERROR = "adError",
    }
  }

  class AdEvent {}

  namespace AdEvent {
    enum Type {
      CONTENT_PAUSE_REQUESTED = "contentPauseRequested",
      CONTENT_RESUME_REQUESTED = "contentResumeRequested",
      ALL_ADS_COMPLETED = "allAdsCompleted",
      STARTED = "started",
      COMPLETE = "complete",
      SKIPPED = "skipped",
      AD_ERROR = "adError",
    }
  }

  enum ViewMode {
    NORMAL = "normal",
    FULLSCREEN = "fullscreen",
  }
}
