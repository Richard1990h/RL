"use client";

import { useState, useEffect, useRef } from "react";
import {
  Briefcase,
  Plus,
  X,
  Star,
  Clock,
  Package,
  Edit,
  Trash2,
  ChevronDown,
  Check,
  Zap,
  Loader2,
  Megaphone,
  Eye,
  Coins,
  Play,
  Pause,
  RotateCcw,
  Upload,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import { useAuthStore } from "@/stores/auth-store";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { api, CustomAdResponse } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  title: string;
  description: string;
  category: string;
  priceCredits: number;
  deliveryDays: number;
  active: boolean;
  rating?: number;
  ratingCount?: number;
  maxActiveOrders?: number;
  ordersCompleted?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  "1-on-1 Coaching",
  "Video Review",
  "Custom Content",
  "Shoutout",
  "Collaboration",
  "Other",
];

const DELIVERY_TIMES = ["1 day", "3 days", "7 days", "14 days", "30 days"];

const DELIVERY_DAYS_MAP: Record<string, number> = {
  "1 day": 1,
  "3 days": 3,
  "7 days": 7,
  "14 days": 14,
  "30 days": 30,
};

function deliveryDaysToLabel(days: number): string {
  if (days === 1) return "1 day";
  return `${days} days`;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING_REVIEW: { label: "Pending Review", color: "text-warning" },
  APPROVED: { label: "Active", color: "text-success" },
  REJECTED: { label: "Rejected", color: "text-danger" },
  PAUSED: { label: "Paused", color: "text-text-muted" },
  EXPIRED: { label: "Expired", color: "text-text-muted" },
};

// ─── Star Rating Component ───────────────────────────────────────────────────

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={12}
            className={cn(
              star <= Math.round(rating)
                ? "text-warning fill-warning"
                : "text-text-muted"
            )}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-text">{rating.toFixed(1)}</span>
      <span className="text-xs text-text-muted">({count})</span>
    </div>
  );
}

// ─── Promote Section ─────────────────────────────────────────────────────────

function PromoteSection() {
  const [ads, setAds] = useState<CustomAdResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [adPrice, setAdPrice] = useState(5000);
  const [costPerImpression, setCostPerImpression] = useState(1);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [addCreditsModalOpen, setAddCreditsModalOpen] = useState(false);
  const [selectedAd, setSelectedAd] = useState<CustomAdResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for new ad
  const [adTitle, setAdTitle] = useState("");
  const [adVideoFile, setAdVideoFile] = useState<File | null>(null);
  const [adVideoUrl, setAdVideoUrl] = useState("");
  const [adDuration, setAdDuration] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Add credits form
  const [addAmount, setAddAmount] = useState(1000);

  useEffect(() => {
    fetchAds();
    fetchPrice();
  }, []);

  const fetchAds = async () => {
    try {
      const res = await api.ads.customAds();
      setAds(res.ads || []);
    } catch (err) {
      console.error("Failed to fetch custom ads:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrice = async () => {
    try {
      const res = await api.ads.customAdPrice();
      setAdPrice(res.price);
      setCostPerImpression(res.costPerImpression ?? 1);
    } catch (err) {
      console.error("Failed to fetch ad price:", err);
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const dur = Math.round(video.duration);
      if (dur < 5 || dur > 30) {
        setError("Video must be between 5 and 30 seconds long.");
        URL.revokeObjectURL(video.src);
        return;
      }
      setAdDuration(dur);
      setAdVideoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    };
    video.src = URL.createObjectURL(file);
  };

  const handleSubmitAd = async () => {
    if (!adTitle.trim() || !adVideoFile || adDuration < 5 || adDuration > 30) return;
    setSubmitting(true);
    setError(null);

    try {
      // Upload the video file first
      setUploading(true);
      const upload = api.uploadWithProgress(adVideoFile, (pct) => setUploadProgress(pct));
      const uploadResult = await upload.promise;
      setUploading(false);

      // Submit the ad
      const res = await api.ads.submitCustomAd({
        title: adTitle.trim(),
        videoUrl: uploadResult.url,
        durationSec: adDuration,
      });

      setAds((prev) => [res.ad, ...prev]);
      setSubmitModalOpen(false);
      resetAdForm();
    } catch (err: any) {
      setError(err.message || "Failed to submit ad");
      setUploading(false);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAdForm = () => {
    setAdTitle("");
    setAdVideoFile(null);
    setAdVideoUrl("");
    setAdDuration(0);
    setUploadProgress(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setError(null);
  };

  const handleAddCredits = async () => {
    if (!selectedAd || addAmount < 1) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await api.ads.updateCustomAd(selectedAd.id, { addCredits: addAmount });
      setAds((prev) => prev.map((a) => (a.id === selectedAd.id ? res.ad : a)));
      setAddCreditsModalOpen(false);
      setSelectedAd(null);
      setAddAmount(1000);
    } catch (err: any) {
      setError(err.message || "Failed to add credits");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePauseResume = async (ad: CustomAdResponse) => {
    try {
      const newStatus = ad.status === "PAUSED" ? "APPROVED" : "PAUSED";
      // User can only pause; resume goes back to APPROVED if it was approved before
      // We'll use the PATCH endpoint — for users, pause is the only toggle they need
      const res = await api.ads.updateCustomAd(ad.id, { status: newStatus });
      setAds((prev) => prev.map((a) => (a.id === ad.id ? res.ad : a)));
    } catch (err: any) {
      console.error("Failed to update ad:", err);
    }
  };

  const handleDeleteAd = async (ad: CustomAdResponse) => {
    if (!confirm(`Delete "${ad.title}"? ${ad.creditsPaid > 0 ? `${ad.creditsPaid} credits will be refunded.` : ""}`)) return;
    try {
      await api.ads.deleteCustomAd(ad.id);
      setAds((prev) => prev.filter((a) => a.id !== ad.id));
    } catch (err: any) {
      console.error("Failed to delete ad:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card padding="md">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
            <Megaphone size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-text">Promote Your Ad</h3>
            <p className="text-sm text-text-secondary mt-1">
              Upload a video ad (5-30 seconds) and it will play as a pre-roll ad for viewers across the platform.
              Your ad goes live after admin approval. Viewers can skip after 10 seconds —{" "}
              <span className="text-warning font-medium">make the first 10 seconds count!</span>
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Coins size={14} className="text-warning" />
              <span className="text-sm font-medium text-warning">{adPrice.toLocaleString()} credits</span>
              <span className="text-xs text-text-muted">per submission ({costPerImpression.toLocaleString()} credit{costPerImpression !== 1 ? "s" : ""} per impression)</span>
            </div>
          </div>
          <Button
            variant="gradient"
            icon={<Plus size={16} />}
            onClick={() => setSubmitModalOpen(true)}
          >
            Submit Ad
          </Button>
        </div>
      </Card>

      {/* My Ads List */}
      {ads.length === 0 ? (
        <Card padding="lg">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-bg-surface2 flex items-center justify-center mb-4">
              <Megaphone size={24} className="text-text-muted" />
            </div>
            <h3 className="text-base font-semibold text-text mb-1">No ads yet</h3>
            <p className="text-sm text-text-muted max-w-md">
              Submit your first video ad to start reaching viewers across the platform.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {ads.map((ad) => {
            const statusInfo = STATUS_LABELS[ad.status] || { label: ad.status, color: "text-text-muted" };
            return (
              <Card key={ad.id} padding="md">
                <div className="flex gap-4">
                  {/* Video thumbnail / preview */}
                  <div className="w-40 h-24 bg-bg-surface2 rounded-lg overflow-hidden shrink-0 relative group">
                    <video
                      src={ad.videoUrl}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                      onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play size={20} className="text-white" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-text line-clamp-1">{ad.title}</h4>
                      <span className={cn("text-xs font-medium shrink-0", statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Eye size={12} className="text-text-muted" />
                        <span className="text-xs text-text-secondary">
                          {ad.impressions.toLocaleString()} impressions
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Coins size={12} className="text-warning" />
                        <span className="text-xs text-text-secondary">
                          {ad.creditsPaid.toLocaleString()} credits remaining
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-text-muted" />
                        <span className="text-xs text-text-muted">
                          {ad.durationSec}s
                        </span>
                      </div>
                    </div>

                    {/* Rejection reason */}
                    {ad.status === "REJECTED" && ad.rejectionReason && (
                      <p className="text-xs text-danger mt-2">
                        Reason: {ad.rejectionReason}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3">
                      {/* Add credits button — visible for approved or paused ads */}
                      {(ad.status === "APPROVED" || ad.status === "PAUSED") && (
                        <button
                          onClick={() => { setSelectedAd(ad); setAddCreditsModalOpen(true); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors"
                        >
                          <Coins size={12} />
                          Add Credits
                        </button>
                      )}

                      {/* Pause/Resume button */}
                      {(ad.status === "APPROVED" || ad.status === "PAUSED") && (
                        <button
                          onClick={() => handlePauseResume(ad)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface2 text-text-secondary text-xs font-medium hover:bg-bg-surface3 transition-colors"
                        >
                          {ad.status === "PAUSED" ? <RotateCcw size={12} /> : <Pause size={12} />}
                          {ad.status === "PAUSED" ? "Resume" : "Pause"}
                        </button>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteAd(ad)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface2 text-text-secondary text-xs font-medium hover:bg-danger/10 hover:text-danger transition-colors ml-auto"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Submit Ad Modal */}
      <Modal
        isOpen={submitModalOpen}
        onClose={() => { setSubmitModalOpen(false); resetAdForm(); }}
        title="Submit a Video Ad"
        size="lg"
      >
        <div className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm">
              {error}
            </div>
          )}

          <Input
            label="Ad Title *"
            placeholder="e.g., Check out my new product!"
            value={adTitle}
            onChange={(e) => setAdTitle(e.target.value)}
          />

          {/* Video Upload */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Video (5-30 seconds, MP4/WebM) *
            </label>
            {previewUrl ? (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-h-[200px]">
                  <video
                    ref={previewVideoRef}
                    src={previewUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">
                    Duration: {adDuration}s | {adVideoFile?.name}
                  </span>
                  <button
                    onClick={() => { resetAdForm(); }}
                    className="text-xs text-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => videoInputRef.current?.click()}
                className="w-full p-8 border-2 border-dashed border-border rounded-xl text-center hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <Upload size={24} className="mx-auto text-text-muted mb-2" />
                <p className="text-sm text-text-secondary">Click to select a video file</p>
                <p className="text-xs text-text-muted mt-1">MP4 or WebM, 5-30 seconds</p>
              </button>
            )}
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm"
              onChange={handleVideoSelect}
              className="hidden"
            />
          </div>

          {/* Cost */}
          <div className="p-3 rounded-lg bg-bg-surface2 flex items-center justify-between">
            <span className="text-sm text-text-secondary">Submission cost</span>
            <span className="text-sm font-bold text-warning">{adPrice.toLocaleString()} credits</span>
          </div>
          <p className="text-[11px] text-text-muted">
            1 credit is deducted per impression. You can add more credits later. Remaining credits are refunded on deletion.
          </p>

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-text-muted">
                <span>Uploading video...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="pt-4 border-t border-border flex gap-3">
            <Button
              variant="secondary"
              onClick={() => { setSubmitModalOpen(false); resetAdForm(); }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="gradient"
              onClick={handleSubmitAd}
              disabled={!adTitle.trim() || !adVideoFile || adDuration < 5 || submitting}
              className="flex-1"
              icon={submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            >
              {submitting ? "Submitting..." : `Submit Ad (${adPrice.toLocaleString()} cr)`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Credits Modal */}
      <Modal
        isOpen={addCreditsModalOpen}
        onClose={() => { setAddCreditsModalOpen(false); setSelectedAd(null); setError(null); }}
        title={`Add Credits to "${selectedAd?.title ?? ""}"`}
        size="sm"
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm">
              {error}
            </div>
          )}
          <p className="text-sm text-text-secondary">
            Each impression costs 1 credit. Add credits to keep your ad running longer.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Credits to add</label>
            <input
              type="number"
              min={1}
              value={addAmount}
              onChange={(e) => setAddAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          {selectedAd && (
            <div className="p-3 rounded-lg bg-bg-surface2 text-xs text-text-muted space-y-1">
              <div className="flex justify-between">
                <span>Current balance:</span>
                <span className="font-medium text-text">{selectedAd.creditsPaid.toLocaleString()} credits</span>
              </div>
              <div className="flex justify-between">
                <span>Adding:</span>
                <span className="font-medium text-warning">{addAmount.toLocaleString()} credits</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 mt-1">
                <span>New balance:</span>
                <span className="font-medium text-text">{(selectedAd.creditsPaid + addAmount).toLocaleString()} credits</span>
              </div>
            </div>
          )}
          <div className="pt-4 border-t border-border flex gap-3">
            <Button
              variant="secondary"
              onClick={() => { setAddCreditsModalOpen(false); setSelectedAd(null); }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="gradient"
              onClick={handleAddCredits}
              disabled={addAmount < 1 || submitting}
              className="flex-1"
              icon={submitting ? <Loader2 size={16} className="animate-spin" /> : <Coins size={16} />}
            >
              {submitting ? "Adding..." : `Add ${addAmount.toLocaleString()} Credits`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ServicesPage() {
  const { currentUser } = useAuthStore();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("services");

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]);
  const [formPrice, setFormPrice] = useState(100);
  const [formDeliveryTime, setFormDeliveryTime] = useState(DELIVERY_TIMES[2]);
  const [formMaxOrders, setFormMaxOrders] = useState(5);
  const [formActive, setFormActive] = useState(true);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const res = (await api.services.list()) as { services: Service[] };
      setServices(res.services || []);
    } catch (err) {
      console.error("Failed to fetch services:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormCategory(CATEGORIES[0]);
    setFormPrice(100);
    setFormDeliveryTime(DELIVERY_TIMES[2]);
    setFormMaxOrders(5);
    setFormActive(true);
    setEditingServiceId(null);
  };

  const handleEditService = (service: Service) => {
    setFormTitle(service.title);
    setFormDescription(service.description);
    setFormCategory(service.category);
    setFormPrice(service.priceCredits);
    setFormDeliveryTime(deliveryDaysToLabel(service.deliveryDays));
    setFormMaxOrders(service.maxActiveOrders ?? 5);
    setFormActive(service.active);
    setEditingServiceId(service.id);
    setCreateModalOpen(true);
  };

  const handleUpdateService = async () => {
    if (!editingServiceId || !formTitle.trim() || !formDescription.trim() || formPrice < 100) return;

    try {
      const res = (await api.services.update(editingServiceId, {
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        priceCredits: formPrice,
        deliveryDays: DELIVERY_DAYS_MAP[formDeliveryTime] || 7,
        active: formActive,
      })) as { service: Service };

      setServices((prev) =>
        prev.map((s) => (s.id === editingServiceId ? res.service : s))
      );
      setCreateModalOpen(false);
      resetForm();
    } catch (err) {
      console.error("Failed to update service:", err);
    }
  };

  const handleCreateService = async () => {
    if (!formTitle.trim() || !formDescription.trim() || formPrice < 100) return;

    try {
      const res = (await api.services.create({
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        priceCredits: formPrice,
        deliveryDays: DELIVERY_DAYS_MAP[formDeliveryTime] || 7,
        active: formActive,
      })) as { service: Service };

      setServices((prev) => [res.service, ...prev]);
      setCreateModalOpen(false);
      resetForm();
    } catch (err) {
      console.error("Failed to create service:", err);
    }
  };

  const handleToggleActive = async (id: string) => {
    const service = services.find((s) => s.id === id);
    if (!service) return;

    try {
      await api.services.update(id, { active: !service.active });
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
      );
    } catch (err) {
      console.error("Failed to toggle service:", err);
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      await api.services.delete(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Failed to delete service:", err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Briefcase size={22} className="text-primary" />
            </div>
            Services
          </h1>
          <p className="text-text-secondary mt-1">
            Offer paid services and promote your brand
          </p>
        </div>
        {activeTab === "services" && currentUser?.isCreator && (
          <Button
            variant="gradient"
            icon={<Plus size={18} />}
            onClick={() => setCreateModalOpen(true)}
          >
            Create New Service
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "services", label: "My Services" },
          { id: "promote", label: "Promote" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab Content */}
      {activeTab === "promote" ? (
        <PromoteSection />
      ) : (
        <>
          {/* Services List */}
          {services.length === 0 ? (
            <Card padding="lg">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-bg-surface2 flex items-center justify-center mb-4">
                  <Briefcase size={28} className="text-text-muted" />
                </div>
                <h3 className="text-lg font-semibold text-text mb-2">
                  {currentUser?.isCreator ? "No services yet" : "Services"}
                </h3>
                <p className="text-sm text-text-muted max-w-md mb-4">
                  {currentUser?.isCreator
                    ? "Create your first service to start offering paid experiences to your audience."
                    : "You need a creator account to offer services."}
                </p>
                {currentUser?.isCreator && (
                  <Button
                    variant="gradient"
                    icon={<Plus size={18} />}
                    onClick={() => setCreateModalOpen(true)}
                  >
                    Create New Service
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {services.map((service) => (
                <Card key={service.id} padding="md" className="flex flex-col">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-text leading-snug line-clamp-2">
                        {service.title}
                      </h3>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-medium rounded-full">
                        {service.category}
                      </span>
                    </div>
                    <Badge variant={service.active ? "new" : "default"}>
                      {service.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-text-secondary leading-relaxed line-clamp-3 mb-4">
                    {service.description}
                  </p>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 flex-wrap mb-4">
                    <div className="flex items-center gap-1.5">
                      <Zap size={14} className="text-success" />
                      <span className="text-sm font-bold text-success">
                        {service.priceCredits} credits
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Clock size={12} />
                      <span className="text-xs">{deliveryDaysToLabel(service.deliveryDays)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Package size={12} />
                      <span className="text-xs">
                        {service.ordersCompleted ?? 0} completed
                      </span>
                    </div>
                  </div>

                  {/* Rating */}
                  {(service.ratingCount ?? 0) > 0 ? (
                    <div className="mb-4">
                      <StarRating
                        rating={service.rating ?? 0}
                        count={service.ratingCount ?? 0}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted mb-4">No ratings yet</p>
                  )}

                  {/* Max active orders */}
                  {service.maxActiveOrders != null && (
                    <p className="text-xs text-text-muted mb-4">
                      Max active orders: {service.maxActiveOrders}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-auto pt-3 border-t border-border">
                    <button
                      onClick={() => handleToggleActive(service.id)}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors shrink-0",
                        service.active ? "bg-primary" : "bg-bg-surface3"
                      )}
                      title={service.active ? "Deactivate" : "Activate"}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                          service.active && "translate-x-5"
                        )}
                      />
                    </button>
                    <span className="text-xs text-text-muted flex-1">
                      {service.active ? "Active" : "Inactive"}
                    </span>
                    <button
                      onClick={() => handleEditService(service)}
                      className="p-2 rounded-lg hover:bg-bg-surface2 text-text-secondary hover:text-text transition-colors"
                      title="Edit service"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteService(service.id)}
                      className="p-2 rounded-lg hover:bg-bg-surface2 text-text-secondary hover:text-danger transition-colors"
                      title="Delete service"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Service Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          resetForm();
        }}
        title={editingServiceId ? "Edit Service" : "Create New Service"}
        size="lg"
      >
        <div className="space-y-5">
          {/* Title */}
          <Input
            label="Service Title *"
            placeholder="e.g., Personal Coaching Session"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Description *
            </label>
            <textarea
              className="w-full bg-bg-surface2 text-text text-sm rounded-xl px-4 py-3 border border-border focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 min-h-[100px] resize-y"
              placeholder="Describe what you'll deliver..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Category
            </label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Price (credits) *
            </label>
            <div className="relative">
              <input
                type="number"
                min={100}
                value={formPrice}
                onChange={(e) =>
                  setFormPrice(Math.max(100, parseInt(e.target.value) || 100))
                }
                className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                credits
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              Minimum 100 credits
            </p>
          </div>

          {/* Delivery Time */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Delivery Time
            </label>
            <div className="flex gap-2 flex-wrap">
              {DELIVERY_TIMES.map((time) => (
                <button
                  key={time}
                  onClick={() => setFormDeliveryTime(time)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                    formDeliveryTime === time
                      ? "bg-primary text-white border-primary"
                      : "bg-bg-surface2 text-text-secondary border-border hover:border-primary"
                  )}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          {/* Max Active Orders */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Max Active Orders (1-10)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={formMaxOrders}
              onChange={(e) =>
                setFormMaxOrders(
                  Math.min(10, Math.max(1, parseInt(e.target.value) || 1))
                )
              }
              className="w-24 bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text">Active</p>
              <p className="text-xs text-text-muted">
                Service is visible and accepting orders
              </p>
            </div>
            <button
              onClick={() => setFormActive(!formActive)}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors shrink-0",
                formActive ? "bg-primary" : "bg-bg-surface3"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                  formActive && "translate-x-5"
                )}
              />
            </button>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-border flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setCreateModalOpen(false);
                resetForm();
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="gradient"
              onClick={editingServiceId ? handleUpdateService : handleCreateService}
              disabled={!formTitle.trim() || !formDescription.trim() || formPrice < 100}
              className="flex-1"
              icon={<Check size={16} />}
            >
              {editingServiceId ? "Save Changes" : "Create Service"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
