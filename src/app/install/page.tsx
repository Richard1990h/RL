"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Download, Check, Smartphone, Monitor, ArrowLeft } from "lucide-react";

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const promptRef = useRef<Event | null>(null);

  useEffect(() => {
    // Check if already installed as PWA
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Detect iOS
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document));

    // Capture the install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e;
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    const prompt = promptRef.current as { prompt?: () => Promise<void> } | null;
    if (prompt?.prompt) {
      await prompt.prompt();
      setDeferredPrompt(null);
      promptRef.current = null;
    }
  };

  if (isStandalone || installed) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <Check size={40} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Already Installed</h1>
          <p className="text-gray-400">Rally Live is installed on your device.</p>
          <Link
            href="/home"
            className="inline-block w-full rounded-xl bg-purple-600 px-6 py-4 text-lg font-bold text-white hover:bg-purple-500 transition-colors"
          >
            Open Rally Live
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-8">
        {/* Back link */}
        <Link href="/home" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
          Back to Rally Live
        </Link>

        {/* App icon */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-24 h-24 rounded-3xl overflow-hidden shadow-lg shadow-purple-500/20">
            <img src="/icons/icon-192x192.png" alt="Rally Live" className="w-full h-full" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Rally Live</h1>
            <p className="text-gray-400 mt-1">Stream, Battle, Create</p>
          </div>
        </div>

        {/* Install button - Chrome/Edge/Android */}
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-purple-600 to-cyan-500 px-6 py-5 text-xl font-bold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 active:scale-95 transition-all"
          >
            <Download size={28} />
            Install App
          </button>
        )}

        {/* iOS instructions */}
        {isIOS && !deferredPrompt && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#1a1a24] border border-[#2a2a3a] p-5 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Smartphone size={20} className="text-purple-400" />
                Install on iPhone
              </h2>
              <ol className="space-y-3 text-sm text-gray-300">
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">1</span>
                  <span>Tap the <strong className="text-white">Share</strong> button at the bottom of Safari (box with arrow pointing up)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">2</span>
                  <span>Scroll down and tap <strong className="text-white">Add to Home Screen</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">3</span>
                  <span>Tap <strong className="text-white">Add</strong> in the top right</span>
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Android/Desktop fallback when no prompt captured yet */}
        {!isIOS && !deferredPrompt && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#1a1a24] border border-[#2a2a3a] p-5 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Monitor size={20} className="text-purple-400" />
                Install App
              </h2>
              <ol className="space-y-3 text-sm text-gray-300">
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">1</span>
                  <span>Tap the <strong className="text-white">menu</strong> (3 dots) in your browser</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">2</span>
                  <span>Tap <strong className="text-white">Install App</strong> or <strong className="text-white">Add to Home Screen</strong></span>
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-[#1a1a24] border border-[#2a2a3a] p-3">
            <div className="text-2xl mb-1">&#9889;</div>
            <div className="text-[10px] text-gray-400 font-medium">Fast</div>
          </div>
          <div className="rounded-xl bg-[#1a1a24] border border-[#2a2a3a] p-3">
            <div className="text-2xl mb-1">&#128247;</div>
            <div className="text-[10px] text-gray-400 font-medium">Go Live</div>
          </div>
          <div className="rounded-xl bg-[#1a1a24] border border-[#2a2a3a] p-3">
            <div className="text-2xl mb-1">&#127942;</div>
            <div className="text-[10px] text-gray-400 font-medium">Battles</div>
          </div>
        </div>
      </div>
    </div>
  );
}
