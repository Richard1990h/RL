import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import AuthProvider from "@/components/providers/AuthProvider";
import ErrorOverlayGuard from "@/components/providers/ErrorOverlayGuard";
import ToastContainer from "@/components/ui/Toast";
import UploadWidget from "@/components/ui/UploadWidget";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
  themeColor: "#7C3AED",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Google tag (gtag.js) */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=AW-17928528857"
          strategy="afterInteractive"
        />
        <Script id="google-gtag" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-17928528857');
        `}</Script>
        {/* Google Ads Purchase conversion tracking */}
        <Script id="google-ads-conversion" strategy="afterInteractive">{`
          function gtag_report_conversion(url) {
            var callback = function () {
              if (typeof(url) != 'undefined') {
                window.location = url;
              }
            };
            gtag('event', 'conversion', {
              'send_to': 'AW-17928528857/NDyWCPLw-vEbENnH_uRC',
              'value': 1.0,
              'currency': 'CAD',
              'transaction_id': '',
              'event_callback': callback
            });
            return false;
          }
        `}</Script>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-bg text-text`}>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9621220928003263"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
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
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
          }
        `}</Script>

      </body>
    </html>
  );
}
