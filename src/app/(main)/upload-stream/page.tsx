"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth-store";
import UploadPage from "../upload/page";
import GoLivePage from "../go-live/page";

type UploadStreamTab = "upload" | "go-live";

const UPLOAD_STREAM_TABS = [
  { id: "upload", label: "Upload" },
  { id: "go-live", label: "Go Live" },
];

function UploadStreamPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, isLoggedIn } = useAuthStore();

  const tabParam = searchParams.get("tab");
  const activeTab: UploadStreamTab = tabParam === "go-live" ? "go-live" : "upload";
  const [goLiveEligible, setGoLiveEligible] = useState(false);
  const [goLiveInfo, setGoLiveInfo] = useState<{ videos: number; views: number; likes: number } | null>(null);

  const ownerRole = currentUser as (typeof currentUser & { isOwner?: boolean; role?: string }) | null;
  const isBugTesterOrOwner = useMemo(
    () => !!ownerRole?.isOwner || ownerRole?.role === "BUG_TESTER",
    [ownerRole]
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch("/api/live/eligibility", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setGoLiveEligible(!!data.eligible);
        setGoLiveInfo({
          videos: data.videos ?? 0,
          views: data.views ?? 0,
          likes: data.likes ?? 0,
        });
      })
      .catch(() => {});
  }, [isLoggedIn]);

  const canGoLive = goLiveEligible || isBugTesterOrOwner;

  const handleTabChange = (id: string) => {
    const nextTab = id as UploadStreamTab;
    if (nextTab === "upload") {
      router.replace("/upload-stream");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "go-live");
    router.replace(`/upload-stream?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <h1 className="text-2xl font-bold text-text">Upload/Stream</h1>
        <p className="mt-1 text-sm text-text-secondary">Upload content or start a live stream from one page.</p>
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <Card padding="lg">
          <Tabs
            tabs={UPLOAD_STREAM_TABS}
            activeTab={activeTab}
            onChange={handleTabChange}
          />
        </Card>
      </div>

      {activeTab === "upload" && <UploadPage />}

      {activeTab === "go-live" && canGoLive && <GoLivePage />}

      {activeTab === "go-live" && !canGoLive && (
        <div className="mx-auto max-w-3xl px-4 pb-8">
          <Card padding="lg">
            <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/10 p-4">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <h2 className="text-base font-semibold text-text">Go Live Locked</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  You need at least 5 videos, 100 impression views, and 50 likes to unlock live streaming.
                </p>
                <p className="mt-2 text-sm text-text">
                  Current progress: {goLiveInfo?.videos ?? 0}/5 videos, {goLiveInfo?.views ?? 0}/100 views, {goLiveInfo?.likes ?? 0}/50 likes.
                </p>
                <div className="mt-4">
                  <Button variant="primary" onClick={() => handleTabChange("upload")}>
                    Go To Upload
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function UploadStreamPage() {
  return (
    <Suspense fallback={<div className="px-4 py-8 text-sm text-text-secondary">Loading Upload/Stream...</div>}>
      <UploadStreamPageContent />
    </Suspense>
  );
}
