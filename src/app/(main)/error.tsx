"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { currentUser } = useAuthStore();
  const isAdmin = currentUser?.isOwner === true;
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  if (isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-6">
            <h1 className="text-xl font-bold text-danger mb-2">Application Error (Admin View)</h1>
            <p className="text-sm text-text-secondary mb-4">{error.message}</p>
            {error.digest && (
              <p className="text-xs text-text-muted mb-2">Digest: {error.digest}</p>
            )}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-primary hover:underline mb-3 block"
            >
              {showDetails ? "Hide stack trace" : "Show stack trace"}
            </button>
            {showDetails && error.stack && (
              <pre className="text-xs text-text-muted bg-bg-surface2 rounded-lg p-4 overflow-x-auto max-h-64 overflow-y-auto mb-4 whitespace-pre-wrap break-words">
                {error.stack}
              </pre>
            )}
            <button
              onClick={reset}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-bg-surface2 flex items-center justify-center">
          <svg className="w-10 h-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.11-5.11m0 0L11.42 4.95m-5.11 5.11h13.24M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text mb-3">Temporarily Down for Maintenance</h1>
        <p className="text-text-secondary text-sm leading-relaxed mb-6">
          Our servers are temporarily down for maintenance. We&apos;re working to get everything back up and running. Please try again shortly.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
