"use client";

import { useRef, useCallback, useState, useEffect } from "react";

// Google's sample pre-roll tag (guaranteed to return a test ad).
const GOOGLE_TEST_TAG =
  "https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=";

// AdSense for Video (AFV) pre-roll tag using our AdSense publisher ID.
function buildAdTagUrl(): string {
  const pageUrl = typeof window !== "undefined" ? encodeURIComponent(window.location.href) : "";
  return (
    "https://pagead2.googlesyndication.com/pagead/ads" +
    "?ad_type=video_image" +
    "&client=ca-pub-9621220928003263" +
    "&videoad_start_delay=0" +
    `&description_url=${pageUrl}` +
    "&max_ad_duration=30000" +
    "&vad_type=linear" +
    "&vpos=preroll" +
    "&output=vast" +
    "&unviewed_position_start=1" +
    "&env=vp" +
    "&impl=s" +
    `&correlator=${Date.now()}`
  );
}

// Toggle: set to true to use the Google test ad, false for real AdSense/GAM ads.
const USE_TEST_TAG = process.env.NODE_ENV !== "production";

interface UseImaAdsOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  adContainerRef: React.RefObject<HTMLDivElement | null>;
  onAdsComplete: () => void;
  onAdError: () => void;
  videoId?: string;
}

function trackImpression(videoId?: string) {
  if (!videoId) return;
  fetch(`/api/videos/${videoId}/impression`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
}

export function useImaAds({
  videoRef,
  adContainerRef,
  onAdsComplete,
  onAdError,
  videoId,
}: UseImaAdsOptions) {
  const [isAdPlaying, setIsAdPlaying] = useState(false);

  const adsLoaderRef = useRef<google.ima.AdsLoader | null>(null);
  const adsManagerRef = useRef<google.ima.AdsManager | null>(null);
  const adDisplayContainerRef = useRef<google.ima.AdDisplayContainer | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const skipTriggeredRef = useRef(false);

  // Stable callback refs to avoid stale closures
  const onAdsCompleteRef = useRef(onAdsComplete);
  const onAdErrorRef = useRef(onAdError);
  useEffect(() => {
    onAdsCompleteRef.current = onAdsComplete;
    onAdErrorRef.current = onAdError;
  }, [onAdsComplete, onAdError]);

  const handleAdComplete = useCallback(() => {
    if (skipTriggeredRef.current) return;
    skipTriggeredRef.current = true;
    setIsAdPlaying(false);
    adsManagerRef.current?.destroy();
    adsManagerRef.current = null;
    onAdsCompleteRef.current();
  }, []);

  const handleAdError = useCallback(() => {
    if (skipTriggeredRef.current) return;
    skipTriggeredRef.current = true;
    setIsAdPlaying(false);
    adsManagerRef.current?.destroy();
    adsManagerRef.current = null;
    onAdErrorRef.current();
  }, []);

  const requestAds = useCallback(async () => {
    skipTriggeredRef.current = false;

    // If IMA SDK has not loaded yet, retry briefly then fail open.
    let retries = 0;
    while (!window.google?.ima && retries < 10) {
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!window.google?.ima) {
      onAdErrorRef.current();
      return;
    }

    const video = videoRef.current;
    const adContainer = adContainerRef.current;
    if (!video || !adContainer) {
      onAdErrorRef.current();
      return;
    }

    try {
      // Initialize ad display container (requires user gesture context)
      const adDisplayContainer = new google.ima.AdDisplayContainer(adContainer, video);
      adDisplayContainer.initialize();
      adDisplayContainerRef.current = adDisplayContainer;

      const adsLoader = new google.ima.AdsLoader(adDisplayContainer);
      adsLoaderRef.current = adsLoader;

      adsLoader.addEventListener(
        google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        ((e: google.ima.AdsManagerLoadedEvent) => {
          const settings = new google.ima.AdsRenderingSettings();
          settings.restoreCustomPlaybackStateOnAdBreakComplete = true;

          const adsManager = e.getAdsManager(video, settings);
          adsManagerRef.current = adsManager;

          adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
            setIsAdPlaying(true);
            trackImpression(videoId);
          });
          adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, handleAdComplete);
          adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, handleAdComplete);
          adsManager.addEventListener(google.ima.AdEvent.Type.COMPLETE, handleAdComplete);
          adsManager.addEventListener(google.ima.AdEvent.Type.SKIPPED, handleAdComplete);
          adsManager.addEventListener(google.ima.AdEvent.Type.AD_ERROR, () => {
            handleAdError();
          });

          // Size the ad to match the container
          const { clientWidth: w, clientHeight: h } = adContainer;
          adsManager.init(w, h, google.ima.ViewMode.NORMAL);
          adsManager.start();

          // Resize observer for fullscreen changes
          resizeObserverRef.current = new ResizeObserver(() => {
            if (adsManagerRef.current && adContainerRef.current) {
              const { clientWidth, clientHeight } = adContainerRef.current;
              const viewMode = document.fullscreenElement
                ? google.ima.ViewMode.FULLSCREEN
                : google.ima.ViewMode.NORMAL;
              adsManagerRef.current.resize(clientWidth, clientHeight, viewMode);
            }
          });
          resizeObserverRef.current.observe(adContainer);
        }) as (e: google.ima.AdsManagerLoadedEvent | google.ima.AdErrorEvent) => void,
      );

      adsLoader.addEventListener(
        google.ima.AdErrorEvent.Type.AD_ERROR,
        (() => {
          handleAdError();
        }) as (e: google.ima.AdsManagerLoadedEvent | google.ima.AdErrorEvent) => void,
      );

      // Fetch custom ad mix percent from settings, then request the ad
      const adsRequest = new google.ima.AdsRequest();
      adsRequest.linearAdSlotWidth = adContainer.clientWidth;
      adsRequest.linearAdSlotHeight = adContainer.clientHeight;

      // Default to 50% if fetch fails
      let mixPercent = 50;
      try {
        const priceRes = await fetch("/api/ads/custom/price");
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          if (typeof priceData.mixPercent === "number") {
            mixPercent = priceData.mixPercent;
          }
        }
      } catch {
        // Use default
      }

      const useCustom = Math.random() * 100 < mixPercent;
      const customServeUrl = videoId
        ? `/api/ads/custom/serve?videoId=${encodeURIComponent(videoId)}`
        : "/api/ads/custom/serve";
      adsRequest.adTagUrl = useCustom
        ? customServeUrl
        : USE_TEST_TAG
          ? GOOGLE_TEST_TAG
          : buildAdTagUrl();

      setIsAdPlaying(true);
      adsLoader.requestAds(adsRequest);
    } catch {
      handleAdError();
    }
  }, [videoRef, adContainerRef, handleAdComplete, handleAdError, videoId]);

  const destroyAds = useCallback(() => {
    skipTriggeredRef.current = true;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    adsManagerRef.current?.destroy();
    adsManagerRef.current = null;
    adsLoaderRef.current?.destroy();
    adsLoaderRef.current = null;
    adDisplayContainerRef.current?.destroy();
    adDisplayContainerRef.current = null;
    setIsAdPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyAds();
    };
  }, [destroyAds]);

  return { requestAds, isAdPlaying, destroyAds };
}
