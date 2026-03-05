import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import Script from "next/script";
import AuthProvider from "@/components/providers/AuthProvider";
import ErrorOverlayGuard from "@/components/providers/ErrorOverlayGuard";
import ToastContainer from "@/components/ui/Toast";
import UploadWidget from "@/components/ui/UploadWidget";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const SW_VERSION = process.env.NEXT_PUBLIC_WEB_VERSION ?? `build-${Date.now()}`;

export const metadata: Metadata = {
  title: "Rally Live - Stream, Battle, Create",
  description: "The ultimate live streaming and battle platform. Watch videos, go live, and compete in epic battle rooms.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rally Live",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1D4ED8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const gtagId = process.env.NEXT_PUBLIC_GTAG_ID || "";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Google tag (gtag.js) — only rendered when NEXT_PUBLIC_GTAG_ID is set */}
        {gtagId && (
          <Script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`}
            strategy="afterInteractive"
          />
        )}
        {gtagId && (
          <Script id="google-gtag" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gtagId}');
          `}</Script>
        )}
        {/* Google Ads Purchase conversion tracking */}
        {gtagId && (
          <Script id="google-ads-conversion" strategy="afterInteractive">{`
            function gtag_report_conversion(url) {
              var callback = function () {
                if (typeof(url) != 'undefined') {
                  window.location = url;
                }
              };
              gtag('event', 'conversion', {
                'send_to': '${gtagId}/NDyWCPLw-vEbENnH_uRC',
                'value': 1.0,
                'currency': 'CAD',
                'transaction_id': '',
                'event_callback': callback
              });
              return false;
            }
          `}</Script>
        )}
      </head>
      <body className={`${manrope.variable} ${geistMono.variable} antialiased bg-bg text-text`}>
        <Script
          src="https://imasdk.googleapis.com/js/sdkloader/ima3.js"
          strategy="afterInteractive"
        />
        <AuthProvider>
          <ErrorOverlayGuard />
          {children}
          <UploadWidget />
          <ToastContainer />
        </AuthProvider>
        <Script id="register-sw" strategy="afterInteractive">{`
          (function() {
            try {
              if (!('serviceWorker' in navigator)) return;
              var swVersion = ${JSON.stringify(SW_VERSION)};
              var appliedKey = 'rally_sw_client_version';
              var reloadKey = 'rally_sw_force_reloaded_' + swVersion;
              var applied = null;
              var alreadyReloaded = '0';
              try {
                applied = localStorage.getItem(appliedKey);
                alreadyReloaded = sessionStorage.getItem(reloadKey) || '0';
              } catch (e) {}

              if (applied !== swVersion) {
                var reset = Promise.resolve();
                if (navigator.serviceWorker.getRegistrations) {
                  reset = reset.then(function() {
                    return navigator.serviceWorker.getRegistrations().then(function(regs) {
                      return Promise.all(regs.map(function(r) { return r.unregister(); }));
                    });
                  });
                }
                if (typeof caches !== 'undefined' && caches.keys) {
                  reset = reset.then(function() {
                    return caches.keys().then(function(keys) {
                      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                    });
                  });
                }

                reset.then(function() {
                  try { localStorage.setItem(appliedKey, swVersion); } catch (e) {}
                  if (alreadyReloaded !== '1') {
                    try { sessionStorage.setItem(reloadKey, '1'); } catch (e) {}
                    window.location.reload();
                  }
                }).catch(function() {});
                return;
              }

              navigator.serviceWorker.register('/sw.js?v=' + encodeURIComponent(swVersion)).then(function(reg) {
                reg.update();
                reg.addEventListener('updatefound', function() {
                  var worker = reg.installing;
                  if (!worker) return;
                  worker.addEventListener('statechange', function() {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                      try { localStorage.setItem('rally_sw_pending_activate', '1'); } catch (e) {}
                    }
                  });
                });
                navigator.serviceWorker.addEventListener('message', function(e) {
                  if (e.data === 'CACHE_CLEARED') {
                    window.location.reload();
                  }
                });
                var pending = null;
                try { pending = localStorage.getItem('rally_sw_pending_activate'); } catch (e) {}
                if (pending === '1' && navigator.serviceWorker.controller) {
                  navigator.serviceWorker.controller.postMessage('ACTIVATE_PENDING');
                  try { localStorage.removeItem('rally_sw_pending_activate'); } catch (e) {}
                }
                if (reg.waiting) {
                  reg.waiting.postMessage('ACTIVATE_PENDING');
                }
              }).catch(function() {});
            } catch (e) {}
          })();
        `}</Script>

      </body>
    </html>
  );
}
