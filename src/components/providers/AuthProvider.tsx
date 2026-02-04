"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useWalletStore } from "@/stores/wallet-store";
import { useFriendsStore } from "@/stores/friends-store";
import { useNotificationStore } from "@/stores/notification-store";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { checkSession, isLoggedIn } = useAuthStore();
  const { fetchWallet } = useWalletStore();
  const { startHeartbeat, stopHeartbeat } = useFriendsStore();
  const { startPolling: startNotifPolling, stopPolling: stopNotifPolling } = useNotificationStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchWallet();
      startHeartbeat();
      startNotifPolling();
    } else {
      stopHeartbeat();
      stopNotifPolling();
    }
  }, [isLoggedIn, fetchWallet, startHeartbeat, stopHeartbeat, startNotifPolling, stopNotifPolling]);

  return <>{children}</>;
}
