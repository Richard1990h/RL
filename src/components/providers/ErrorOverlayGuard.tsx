"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Hides the Next.js dev error overlay for non-admin users.
 * Admin users (isOwner) can still see the full error details.
 * Non-admin users see a clean "maintenance" message instead.
 */
export default function ErrorOverlayGuard() {
  const { currentUser } = useAuthStore();
  const isAdmin = currentUser?.isOwner === true;

  useEffect(() => {
    if (isAdmin) return; // Admins see everything

    // Hide the Next.js dev error overlay for non-admins
    const style = document.createElement("style");
    style.id = "error-overlay-guard";
    style.textContent = `
      nextjs-portal { display: none !important; }
      [data-nextjs-dialog-overlay] { display: none !important; }
      [data-nextjs-dialog] { display: none !important; }
      #__next-build-indicator { display: none !important; }
      body > nextjs-portal,
      body > [data-nextjs-toast] { display: none !important; }
    `;
    document.head.appendChild(style);

    // Also intercept the error overlay mount via MutationObserver
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            const tag = node.tagName?.toLowerCase();
            if (
              tag === "nextjs-portal" ||
              node.getAttribute("data-nextjs-dialog-overlay") !== null ||
              node.getAttribute("data-nextjs-dialog") !== null ||
              node.getAttribute("data-nextjs-toast") !== null
            ) {
              node.style.display = "none";
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const existingStyle = document.getElementById("error-overlay-guard");
      if (existingStyle) existingStyle.remove();
    };
  }, [isAdmin]);

  return null;
}
