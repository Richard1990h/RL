"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Moon,
  Sun,
  Globe,
  Lock,
  Volume2,
  Video as VideoIcon,
  Trash2,
  Shield,
  Crown,
  Check,
  Ban,
  Zap,
  Upload,
  Headphones,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Tabs from "@/components/ui/Tabs";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import CreatorStudioPage from "../creator-studio/page";
import AnalyticsPage from "../analytics/page";
import MessagesPage from "../messages/page";

// ── Default preferences shape ──
interface Preferences {
  theme: "dark" | "light";
  language: string;
  autoplay: boolean;
  emailNotifs: boolean;
  pushNotifs: boolean;
  inAppNotifs: boolean;
  profileVisibility: string;
  showOnlineStatus: boolean;
  allowDMs: string;
  streamQuality: string;
  lowLatency: boolean;
  saveVODs: boolean;
}

const DEFAULT_PREFS: Preferences = {
  theme: "dark",
  language: "en",
  autoplay: true,
  emailNotifs: true,
  pushNotifs: true,
  inAppNotifs: true,
  profileVisibility: "public",
  showOnlineStatus: true,
  allowDMs: "everyone",
  streamQuality: "1080p",
  lowLatency: true,
  saveVODs: true,
};

type SettingsMainTab = "settings" | "messages" | "creator-studio" | "analytics";

const SETTINGS_MAIN_TABS = [
  { id: "settings", label: "Settings" },
  { id: "messages", label: "Messages" },
  { id: "creator-studio", label: "Creator Studio" },
  { id: "analytics", label: "Analytics" },
];

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((s) => s.currentUser);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const tabParam = searchParams.get("tab");
  const initialTab: SettingsMainTab =
    tabParam === "messages" || tabParam === "creator-studio" || tabParam === "analytics"
      ? tabParam
      : "settings";
  const [activeMainTab, setActiveMainTab] = useState<SettingsMainTab>(initialTab);

  // Account form state
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? "");
  const [username, setUsername] = useState(currentUser?.username ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [bio, setBio] = useState(currentUser?.bio ?? "");
  const [currentPassword, setCurrentPassword] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Profile picture
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Determine if sensitive fields changed
  const isEmailChanged = email.toLowerCase() !== (currentUser?.email ?? "").toLowerCase();
  const isUsernameChanged = username.toLowerCase() !== (currentUser?.username ?? "").toLowerCase();
  const needsPassword = isEmailChanged || isUsernameChanged;

  const handleSave = useCallback(async () => {
    if (!currentUser) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const body: Record<string, string> = {};

      if (displayName !== currentUser.displayName) body.displayName = displayName;
      if (bio !== (currentUser.bio ?? "")) body.bio = bio;
      if (isEmailChanged) body.email = email;
      if (isUsernameChanged) body.username = username;
      if (needsPassword) body.currentPassword = currentPassword;

      // Nothing to save
      if (Object.keys(body).length === 0) {
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveError(data.error || "Failed to save changes");
        setSaving(false);
        return;
      }

      // Update the auth store with the new user data
      setUser({
        ...currentUser,
        displayName: data.user.displayName,
        username: data.user.username,
        email: data.user.email,
        bio: data.user.bio,
        avatarUrl: data.user.avatarUrl,
      });

      setCurrentPassword("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }, [currentUser, displayName, username, email, bio, currentPassword, isEmailChanged, isUsernameChanged, needsPassword, setUser]);

  // ── Profile picture upload ──
  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      useUIStore.getState().addToast("Please select an image file.", "error");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      useUIStore.getState().addToast("Image must be under 5MB.", "error");
      return;
    }

    setUploadingAvatar(true);
    try {
      const uploadRes = await api.upload(file);
      const res = await api.users.update(currentUser.id, { avatarUrl: uploadRes.url }) as { user: { avatarUrl: string } };
      setUser({ ...currentUser, avatarUrl: res.user.avatarUrl });
      useUIStore.getState().addToast("Profile picture updated!", "success");
    } catch (err: any) {
      useUIStore.getState().addToast(err.message || "Failed to upload image.", "error");
    } finally {
      setUploadingAvatar(false);
      // Reset file input so selecting the same file again works
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [currentUser, setUser]);

  // ── Preferences: load from server, persist with debounce ──
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const prefsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsInitializedRef = useRef(false);

  // Load preferences from currentUser on mount
  useEffect(() => {
    if (currentUser && !prefsInitializedRef.current) {
      const saved = (currentUser as any).preferences as Partial<Preferences> | null | undefined;
      if (saved && typeof saved === "object") {
        setPrefs({ ...DEFAULT_PREFS, ...saved });
      }
      prefsInitializedRef.current = true;
    }
  }, [currentUser]);

  // Save preferences to server with 1s debounce
  const savePrefs = useCallback((updated: Preferences) => {
    if (!currentUser) return;
    if (prefsTimerRef.current) clearTimeout(prefsTimerRef.current);
    prefsTimerRef.current = setTimeout(async () => {
      try {
        await api.users.update(currentUser.id, { preferences: updated });
      } catch {
        // Silent fail -- preferences are non-critical
      }
    }, 1000);
  }, [currentUser]);

  // Helper: update a single pref key and trigger save
  const updatePref = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  }, [savePrefs]);

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; username: string; displayName: string; avatarUrl: string | null; blockedAt: string }[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  useEffect(() => {
    setLoadingBlocked(true);
    fetch("/api/users/blocked", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.blockedUsers) setBlockedUsers(data.blockedUsers);
      })
      .catch(() => {})
      .finally(() => setLoadingBlocked(false));
  }, []);

  const handleUnblock = async (userId: string) => {
    setUnblocking(userId);
    try {
      await api.users.unblock(userId);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      useUIStore.getState().addToast("Failed to unblock user. Try again.", "error");
    } finally {
      setUnblocking(null);
    }
  };

  // Subscription -- loaded from API
  const [isPremium, setIsPremium] = useState(currentUser?.isPremium ?? false);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionAction, setSubscriptionAction] = useState<"idle" | "subscribing" | "cancelling">("idle");
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [showPayPalButton, setShowPayPalButton] = useState(false);
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const paypalRenderedRef = useRef(false);

  // Load subscription status from DB
  useEffect(() => {
    api.subscription.get()
      .then((res: any) => {
        setIsPremium(res.isPremium ?? false);
        setPremiumUntil(res.premiumUntil ?? null);
      })
      .catch(() => {})
      .finally(() => setSubscriptionLoading(false));
  }, []);

  // Render PayPal button when shown
  useEffect(() => {
    if (!showPayPalButton || paypalRenderedRef.current) return;
    if (!paypalContainerRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        // Get PayPal config
        const configRes = await fetch("/api/paypal/config", { credentials: "include" });
        if (!configRes.ok || cancelled) return;
        const { clientId, mode } = await configRes.json();
        if (!clientId || cancelled) return;

        // Load PayPal JS SDK dynamically
        if (!(window as any).paypal) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            const sdkBase = mode === "sandbox" ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
            script.src = `${sdkBase}/sdk/js?client-id=${clientId}&currency=USD`;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !paypalContainerRef.current) return;

        const paypal = (window as any).paypal;
        paypalRenderedRef.current = true;

        paypal.Buttons({
          style: {
            layout: "vertical",
            color: "gold",
            shape: "rect",
            label: "subscribe",
            height: 45,
          },
          createOrder: async () => {
            setSubscriptionError(null);
            setSubscriptionAction("subscribing");
            const res = await fetch("/api/subscription/paypal/create-order", {
              method: "POST",
              credentials: "include",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create order");
            return data.orderID;
          },
          onApprove: async (data: { orderID: string }) => {
            try {
              const res = await fetch("/api/subscription/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ orderID: data.orderID }),
              });
              const result = await res.json();
              if (!res.ok) throw new Error(result.error || "Payment failed");

              // Update local state
              setIsPremium(true);
              setPremiumUntil(result.premiumUntil);
              setShowPayPalButton(false);
              paypalRenderedRef.current = false;
              setSubscriptionAction("idle");

              // Update auth store so isPremium reflects everywhere
              if (currentUser) {
                setUser({ ...currentUser, isPremium: true });
              }

              useUIStore.getState().addToast("Welcome to Rally Live Premium!", "success");
            } catch (err: any) {
              setSubscriptionError(err.message || "Payment failed");
              setSubscriptionAction("idle");
            }
          },
          onCancel: () => {
            setSubscriptionAction("idle");
          },
          onError: (err: any) => {
            console.error("PayPal error:", err);
            setSubscriptionError("PayPal encountered an error. Please try again.");
            setSubscriptionAction("idle");
          },
        }).render(paypalContainerRef.current);
      } catch (err: any) {
        if (!cancelled) {
          setSubscriptionError(err.message || "Failed to load PayPal");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [showPayPalButton, currentUser, setUser]);

  const handleCancelSubscription = async () => {
    setSubscriptionAction("cancelling");
    setSubscriptionError(null);
    try {
      const res = await api.subscription.cancel() as any;
      // Premium stays active until the billing period ends
      setPremiumUntil(res.premiumUntil || premiumUntil);
      useUIStore.getState().addToast(
        "Subscription cancelled. Premium remains active until the end of the billing period.",
        "success"
      );
    } catch (err: any) {
      setSubscriptionError(err.message || "Failed to cancel subscription");
    } finally {
      setSubscriptionAction("idle");
    }
  };

  // ── Delete / Deactivate account ──
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountActionError, setAccountActionError] = useState("");

  const handleDeleteAccount = useCallback(async () => {
    if (!currentUser || deleteConfirmText !== "DELETE") return;
    setAccountActionLoading(true);
    setAccountActionError("");
    try {
      await api.users.delete(currentUser.id);
      await logout();
      router.push("/");
    } catch (err: any) {
      setAccountActionError(err.message || "Failed to delete account");
      setAccountActionLoading(false);
    }
  }, [currentUser, deleteConfirmText, logout, router]);

  const handleDeactivateAccount = useCallback(async () => {
    if (!currentUser) return;
    setAccountActionLoading(true);
    setAccountActionError("");
    try {
      await api.users.update(currentUser.id, { isDeactivated: true });
      await logout();
      router.push("/");
    } catch (err: any) {
      setAccountActionError(err.message || "Failed to deactivate account");
      setAccountActionLoading(false);
    }
  }, [currentUser, logout, router]);

  useEffect(() => {
    const nextTab: SettingsMainTab =
      tabParam === "messages" || tabParam === "creator-studio" || tabParam === "analytics"
        ? tabParam
        : "settings";
    setActiveMainTab(nextTab);
  }, [tabParam]);

  const handleMainTabChange = useCallback((id: string) => {
    const next = id as SettingsMainTab;
    setActiveMainTab(next);
    if (next === "settings") {
      router.replace("/settings");
    } else {
      router.replace(`/settings?tab=${next}`);
    }
  }, [router]);

  return (
    <div className={cn(
      "mx-auto px-4 py-6 space-y-8",
      activeMainTab === "settings" ? "max-w-3xl" : "max-w-6xl"
    )}>
      <h1 className="text-2xl font-bold text-text">Settings</h1>
      <Tabs
        tabs={SETTINGS_MAIN_TABS}
        activeTab={activeMainTab}
        onChange={handleMainTabChange}
      />

      {activeMainTab === "creator-studio" && (
        <CreatorStudioPage />
      )}

      {activeMainTab === "analytics" && (
        <AnalyticsPage />
      )}

      {activeMainTab === "messages" && (
        <MessagesPage />
      )}

      {activeMainTab === "settings" && (
        <>
      {/* Account */}
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-text mb-6">Account</h2>

        <div className="space-y-5">
          {/* Profile picture */}
          <div className="flex items-center gap-4">
            <Avatar
              src={currentUser?.avatarUrl}
              name={currentUser?.displayName ?? "User"}
              size="lg"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Uploading...
                </span>
              ) : (
                "Change"
              )}
            </Button>
          </div>

          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          <div>
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
              maxLength={30}
            />
            <p className="text-xs text-text-muted mt-1">3-30 characters. Letters, numbers, and underscores only.</p>
          </div>

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {needsPassword && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-warning shrink-0" />
                <p className="text-xs text-text-secondary">
                  Changing your email or username requires your current password.
                </p>
              </div>
              <Input
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full bg-bg-surface2 text-text placeholder:text-text-muted border border-border rounded-lg px-3 py-2.5 text-sm transition-colors hover:border-border-light focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>

          {saveError && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg">
              <AlertCircle size={14} className="text-danger shrink-0" />
              <p className="text-sm text-danger">{saveError}</p>
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
              <Check size={14} className="text-success shrink-0" />
              <p className="text-sm text-success">Changes saved successfully!</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || (needsPassword && !currentPassword)}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Preferences */}
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-text mb-6">Preferences</h2>

        <div className="space-y-5">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {prefs.theme === "dark" ? (
                <Moon size={20} className="text-primary" />
              ) : (
                <Sun size={20} className="text-warning" />
              )}
              <div>
                <p className="text-sm font-medium text-text">Theme</p>
                <p className="text-xs text-text-muted">
                  {prefs.theme === "dark" ? "Dark mode" : "Light mode"}
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={prefs.theme === "dark"}
              onChange={(v) => updatePref("theme", v ? "dark" : "light")}
            />
          </div>

          {/* Language */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe size={20} className="text-accent" />
              <div>
                <p className="text-sm font-medium text-text">Language</p>
              </div>
            </div>
            <select
              value={prefs.language}
              onChange={(e) => updatePref("language", e.target.value)}
              className="bg-bg-surface2 text-text text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
            </select>
          </div>

          {/* Autoplay */}
          <SettingsToggle
            label="Autoplay"
            description="Automatically play next video"
            checked={prefs.autoplay}
            onChange={(v) => updatePref("autoplay", v)}
          />

          <div className="border-t border-border pt-4">
            <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-3">
              Notifications
            </p>
            <div className="space-y-4">
              <SettingsToggle
                label="Email Notifications"
                description="Receive updates via email"
                checked={prefs.emailNotifs}
                onChange={(v) => updatePref("emailNotifs", v)}
              />
              <SettingsToggle
                label="Push Notifications"
                description="Browser and mobile push alerts"
                checked={prefs.pushNotifs}
                onChange={(v) => updatePref("pushNotifs", v)}
              />
              <SettingsToggle
                label="In-App Notifications"
                description="Show notifications inside Rally Live"
                checked={prefs.inAppNotifs}
                onChange={(v) => updatePref("inAppNotifs", v)}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Privacy */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-6">
          <Lock size={20} className="text-primary" />
          <h2 className="text-lg font-semibold text-text">Privacy</h2>
        </div>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Profile Visibility
            </label>
            <SegmentedControl
              options={[
                { id: "public", label: "Public" },
                { id: "private", label: "Private" },
              ]}
              value={prefs.profileVisibility}
              onChange={(v) => updatePref("profileVisibility", v)}
            />
          </div>

          <SettingsToggle
            label="Show Online Status"
            description="Let others see when you are online"
            checked={prefs.showOnlineStatus}
            onChange={(v) => updatePref("showOnlineStatus", v)}
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Allow Direct Messages
            </label>
            <SegmentedControl
              options={[
                { id: "everyone", label: "Everyone" },
                { id: "followers", label: "Followers" },
                { id: "nobody", label: "Nobody" },
              ]}
              value={prefs.allowDMs}
              onChange={(v) => updatePref("allowDMs", v)}
            />
          </div>

          {/* Blocked Users */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Ban size={16} className="text-danger" />
              <p className="text-xs text-text-muted uppercase tracking-wider font-medium">
                Blocked Users
              </p>
              <span className="ml-1 px-1.5 py-0.5 bg-danger/20 text-danger text-[10px] font-bold rounded-full">
                {blockedUsers.length}
              </span>
            </div>

            {loadingBlocked ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-text-muted" />
              </div>
            ) : blockedUsers.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                You haven&apos;t blocked anyone.
              </p>
            ) : (
              <div className="space-y-2">
                {blockedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 rounded-xl bg-bg-surface2 px-3 py-2.5"
                  >
                    <Avatar
                      src={user.avatarUrl}
                      name={user.displayName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate">
                        {user.displayName}
                      </p>
                      <p className="text-xs text-text-muted">@{user.username}</p>
                    </div>
                    <button
                      onClick={() => handleUnblock(user.id)}
                      disabled={unblocking === user.id}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg bg-danger/10 border border-danger/20 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
                    >
                      {unblocking === user.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <X size={12} />
                      )}
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Streaming */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-6">
          <VideoIcon size={20} className="text-accent" />
          <h2 className="text-lg font-semibold text-text">Streaming</h2>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text">
                Default Stream Quality
              </p>
            </div>
            <select
              value={prefs.streamQuality}
              onChange={(e) => updatePref("streamQuality", e.target.value)}
              className="bg-bg-surface2 text-text text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
            >
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
            </select>
          </div>

          <SettingsToggle
            label="Low Latency Mode"
            description="Reduce stream delay for real-time interaction"
            checked={prefs.lowLatency}
            onChange={(v) => updatePref("lowLatency", v)}
          />

          <SettingsToggle
            label="Save VODs"
            description="Automatically save stream recordings"
            checked={prefs.saveVODs}
            onChange={(v) => updatePref("saveVODs", v)}
          />
        </div>
      </Card>

      {/* Rally Live Premium */}
      <Card padding="lg" className={isPremium ? "border-primary/30" : ""}>
        <div className="flex items-center gap-2 mb-6">
          <Crown size={20} className={isPremium ? "text-primary" : "text-warning"} />
          <h2 className="text-lg font-semibold text-text">Rally Live Premium</h2>
          {isPremium && (
            <span className="ml-2 px-2.5 py-0.5 bg-primary/20 text-primary text-xs font-bold rounded-full">
              Active
            </span>
          )}
        </div>

        {subscriptionLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Status */}
            <div className="p-4 bg-bg-surface2 rounded-xl">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-text">Current Status</p>
                <span className={cn(
                  "text-sm font-bold",
                  isPremium ? "text-primary" : "text-text-muted"
                )}>
                  {isPremium ? "Premium" : "Free"}
                </span>
              </div>
              {isPremium && premiumUntil && (
                <p className="text-xs text-text-muted">
                  Premium active until {new Date(premiumUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}
              {!isPremium && (
                <p className="text-xs text-text-muted">
                  Upgrade to Premium for $20.00/month
                </p>
              )}
            </div>

            {/* Price */}
            {!isPremium && (
              <div className="text-center py-2">
                <p className="text-3xl font-bold text-text">
                  $20<span className="text-lg text-text-muted font-normal">.00/mo</span>
                </p>
              </div>
            )}

            {/* Benefits */}
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-3">
                Premium Benefits
              </p>
              <div className="space-y-3">
                {[
                  { icon: <Ban size={16} />, label: "Skip all video ads", color: "text-success" },
                  { icon: <Crown size={16} />, label: "Premium badge", color: "text-warning" },
                  { icon: <Headphones size={16} />, label: "Priority support", color: "text-accent" },
                  { icon: <Upload size={16} />, label: "Extended upload limits", color: "text-primary" },
                ].map((benefit) => (
                  <div
                    key={benefit.label}
                    className="flex items-center gap-3"
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isPremium ? "bg-primary/10" : "bg-bg-surface2"
                    )}>
                      <span className={benefit.color}>{benefit.icon}</span>
                    </div>
                    <span className="text-sm text-text">{benefit.label}</span>
                    {isPremium && (
                      <Check size={14} className="text-success ml-auto shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Note about live streams */}
            <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <Zap size={14} className="text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary">
                <span className="font-medium text-warning">Note:</span> Premium does{" "}
                <span className="font-semibold text-text">NOT</span> bypass live stream ads. Creators control live stream ad settings.
              </p>
            </div>

            {/* Error message */}
            {subscriptionError && (
              <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg">
                <AlertCircle size={14} className="text-danger shrink-0" />
                <p className="text-sm text-danger">{subscriptionError}</p>
              </div>
            )}

            {/* Subscribe flow */}
            {!isPremium && !showPayPalButton && (
              <Button
                variant="gradient"
                size="lg"
                fullWidth
                icon={<Crown size={18} />}
                onClick={() => {
                  setShowPayPalButton(true);
                  paypalRenderedRef.current = false;
                }}
              >
                Subscribe to Premium — $20/mo
              </Button>
            )}

            {/* PayPal button container */}
            {!isPremium && showPayPalButton && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary text-center">
                  Complete your payment with PayPal:
                </p>
                <div ref={paypalContainerRef} className="min-h-[50px]">
                  {subscriptionAction === "subscribing" && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={20} className="animate-spin text-primary mr-2" />
                      <span className="text-sm text-text-muted">Processing payment...</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowPayPalButton(false);
                    paypalRenderedRef.current = false;
                    setSubscriptionAction("idle");
                  }}
                  className="w-full text-center text-sm text-text-muted hover:text-text transition-colors py-2"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Active subscription -- cancel option */}
            {isPremium && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <Check size={14} className="text-success shrink-0" />
                  <p className="text-sm text-success">Your Premium subscription is active.</p>
                </div>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={subscriptionAction === "cancelling"}
                  onClick={handleCancelSubscription}
                >
                  {subscriptionAction === "cancelling" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Cancelling...
                    </span>
                  ) : (
                    "Cancel Subscription"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Danger Zone */}
      <Card padding="lg" className="border-danger/30">
        <div className="flex items-center gap-2 mb-6">
          <Shield size={20} className="text-danger" />
          <h2 className="text-lg font-semibold text-danger">Danger Zone</h2>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-text-secondary mb-4">
            These actions are permanent and cannot be undone.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="danger"
              icon={<Trash2 size={16} />}
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteConfirmText("");
                setAccountActionError("");
              }}
            >
              Delete Account
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeactivateModal(true);
                setAccountActionError("");
              }}
            >
              Deactivate Account
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Delete Account Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-bg-surface rounded-2xl border border-border shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Trash2 size={20} className="text-danger" />
              <h3 className="text-lg font-semibold text-text">Delete Account</h3>
            </div>
            <p className="text-sm text-text-secondary">
              This will permanently delete your account, all your videos, messages, and data. This action cannot be undone.
            </p>
            <p className="text-sm text-text-secondary">
              Type <span className="font-bold text-danger">DELETE</span> to confirm:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
            />
            {accountActionError && (
              <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg">
                <AlertCircle size={14} className="text-danger shrink-0" />
                <p className="text-sm text-danger">{accountActionError}</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteModal(false)}
                disabled={accountActionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={deleteConfirmText !== "DELETE" || accountActionLoading}
                onClick={handleDeleteAccount}
              >
                {accountActionLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  "Delete My Account"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate Account Modal ── */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-bg-surface rounded-2xl border border-border shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Ban size={20} className="text-warning" />
              <h3 className="text-lg font-semibold text-text">Deactivate Account</h3>
            </div>
            <p className="text-sm text-text-secondary">
              Your account will be deactivated and hidden from other users. You can reactivate it by logging in again. Are you sure you want to continue?
            </p>
            {accountActionError && (
              <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg">
                <AlertCircle size={14} className="text-danger shrink-0" />
                <p className="text-sm text-danger">{accountActionError}</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowDeactivateModal(false)}
                disabled={accountActionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={accountActionLoading}
                onClick={handleDeactivateAccount}
              >
                {accountActionLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Deactivating...
                  </span>
                ) : (
                  "Deactivate My Account"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="px-4 py-8 text-sm text-text-secondary">Loading settings...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}

/* --------- Settings Toggle Row --------- */
function SettingsToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

/* --------- Toggle Switch --------- */
function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors shrink-0",
        checked ? "bg-primary" : "bg-bg-surface3"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
          checked && "translate-x-5"
        )}
      />
    </button>
  );
}
