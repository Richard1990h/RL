"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Wallet,
  CreditCard,
  ArrowDownToLine,
  ArrowUpFromLine,
  DollarSign,
  Gift,
  Clock,
  Check,
  AlertCircle,
  Sparkles,
  Star,
  Zap,
  Crown,
  Diamond,
  X,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Tabs from "@/components/ui/Tabs";
import { useWalletStore } from "@/stores/wallet-store";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type MainTab = "buy-credits" | "catalog" | "withdraw" | "history";

// ─── Constants ───────────────────────────────────────────────────────────────

const CREDIT_PACKAGES = [
  { credits: 100, priceCents: 99, popular: false, icon: Star },
  { credits: 500, priceCents: 499, popular: false, icon: Zap },
  { credits: 1000, priceCents: 999, popular: true, icon: Crown },
  { credits: 5000, priceCents: 3999, popular: false, icon: Diamond },
];

const MAIN_TABS = [
  { id: "buy-credits", label: "Buy Credits" },
  { id: "catalog", label: "Catalog" },
  { id: "withdraw", label: "Withdraw" },
  { id: "history", label: "History" },
];

const HISTORY_TABS = [
  { id: "all", label: "All" },
  { id: "CREDIT_PURCHASE", label: "Purchases" },
  { id: "WITHDRAWAL", label: "Withdrawals" },
  { id: "DONATION", label: "Donations" },
  { id: "CREDIT_EARNED", label: "Earned" },
];

const CATALOG_CATEGORIES = ["All", "Funny", "Luxury", "Cosmic", "Rare"] as const;

const CATALOG_ITEMS = [
  { id: "duck", name: "Rubber Duck", credits: 1, category: "Funny", emoji: "🦆" },
  { id: "pizza", name: "Pizza Slice", credits: 10, category: "Funny", emoji: "🍕" },
  { id: "party", name: "Party Popper", credits: 25, category: "Funny", emoji: "🎉" },
  { id: "ring", name: "Gold Ring", credits: 200, category: "Luxury", emoji: "💍" },
  { id: "crown", name: "Platinum Crown", credits: 10000, category: "Luxury", emoji: "👑" },
  { id: "moon", name: "Crescent Moon", credits: 10, category: "Cosmic", emoji: "🌙" },
  { id: "comet", name: "Comet", credits: 50, category: "Cosmic", emoji: "☄️" },
  { id: "nebula", name: "Nebula", credits: 500, category: "Cosmic", emoji: "🌌" },
  { id: "clover", name: "Four Leaf Clover", credits: 3, category: "Rare", emoji: "🍀" },
  { id: "gem", name: "Infinity Gem", credits: 5000, category: "Rare", emoji: "💎" },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// Derive USD from credits at render time only (1 credit = $0.01)
function creditsToUsd(credits: number): string {
  return `$${(credits / 100).toFixed(2)}`;
}

// ─── Fee calculation helpers ─────────────────────────────────────────────────

interface FeeBreakdown {
  processingFee: number;
  platformFee: number;
  totalFees: number;
  netAmount: number;
  credits: number;
  processingLabel: string;
}

function calculatePurchaseFees(dollarAmount: number, purchaseFeePct = 5): FeeBreakdown {
  if (dollarAmount <= 0) {
    return { processingFee: 0, platformFee: 0, totalFees: 0, netAmount: 0, credits: 0, processingLabel: "" };
  }
  const processingFee = Math.round((dollarAmount * 0.0349 + 0.49) * 100) / 100;
  const processingLabel = "3.49% + $0.49 (PayPal)";
  const platformFee = Math.round(dollarAmount * (purchaseFeePct / 100) * 100) / 100;
  const totalFees = Math.round((processingFee + platformFee) * 100) / 100;
  const netAmount = Math.round((dollarAmount - totalFees) * 100) / 100;
  const credits = Math.max(0, Math.floor(netAmount * 100));
  return { processingFee, platformFee, totalFees, netAmount, credits, processingLabel };
}

function calculateWithdrawalFees(creditAmount: number, withdrawalFeePct = 2, withdrawalFeeMinCents = 25): { feeCents: number; netCents: number; feeUsd: string; netUsd: string } {
  if (creditAmount <= 0) return { feeCents: 0, netCents: 0, feeUsd: "$0.00", netUsd: "$0.00" };
  const grossCents = creditAmount;
  const feePercent = Math.ceil(grossCents * (withdrawalFeePct / 100));
  const feeCents = Math.max(feePercent, withdrawalFeeMinCents);
  const netCents = grossCents - feeCents;
  return {
    feeCents,
    netCents,
    feeUsd: `$${(feeCents / 100).toFixed(2)}`,
    netUsd: `$${(netCents / 100).toFixed(2)}`,
  };
}

// ─── Icon SVGs ───────────────────────────────────────────────────────────────

function PayPalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("w-5 h-5", className)} fill="currentColor">
      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.603c-.564 0-1.04.408-1.127.964L7.076 21.337zM19.94 6.738c-.01.067-.024.133-.035.2-1.175 6.038-5.173 8.124-10.287 8.124H7.63l-1.26 7.988h3.313a.564.564 0 0 0 .556-.479l.023-.12.44-2.793.029-.155a.563.563 0 0 1 .556-.479h.35c2.264 0 4.037-.46 5.107-1.796.896-1.12 1.313-2.723 1.113-4.699a4.124 4.124 0 0 0-.917-1.791z" />
    </svg>
  );
}

// ─── PayPal Checkout Component ──────────────────────────────────────────────

function PayPalCheckout({
  amountCents,
  packageCredits,
  onSuccess,
  onError,
}: {
  amountCents: number;
  packageCredits?: number;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  return (
    <PayPalButtons
      style={{
        layout: "vertical",
        color: "blue",
        shape: "rect",
        label: "paypal",
        height: 45,
      }}
      createOrder={async () => {
        try {
          const res = await fetch("/api/paypal/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ amountCents, type: "credits", ...(packageCredits ? { packageCredits } : {}) }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to create order");
          return data.orderID;
        } catch (err: any) {
          onError(err.message || "Failed to create PayPal order");
          throw err;
        }
      }}
      onApprove={async (data) => {
        try {
          const res = await fetch("/api/paypal/capture-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              orderID: data.orderID,
              amountCents,
              type: "credits",
              ...(packageCredits ? { packageCredits } : {}),
            }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Payment capture failed");
          onSuccess();
        } catch (err: any) {
          onError(err.message || "Payment failed");
        }
      }}
      onError={(err) => {
        onError("PayPal encountered an error. Please try again.");
        console.error("PayPal error:", err);
      }}
      onCancel={() => {
        onError("Payment cancelled");
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function WalletPage() {
  const { credits, fetchWallet } = useWalletStore();
  const storeTransactions = useWalletStore((s) => s.transactions);
  const walletLoading = useWalletStore((s) => s.isLoading);
  const { currentUser } = useAuthStore();
  const { addToast } = useUIStore();
  const accountEmail = currentUser?.email || "";

  const [activeTab, setActiveTab] = useState<MainTab>("buy-credits");

  // ─── PayPal config ─────────────────────────────────────────────────────
  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [paypalMode, setPaypalMode] = useState<string>("sandbox");
  const [paypalError, setPaypalError] = useState<string | null>(null);

  // ─── Fee config (loaded from server) ──────────────────────────────────
  const [feeConfig, setFeeConfig] = useState({ withdrawalFeePct: 2, withdrawalFeeMinCents: 25, purchaseFeePct: 5 });

  // ─── Buy Credits state ───────────────────────────────────────────────────
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [creditDollarAmount, setCreditDollarAmount] = useState("");
  const [showCreditCheckout, setShowCreditCheckout] = useState(false);

  // ─── Withdraw state ──────────────────────────────────────────────────────
  const [withdrawCredits, setWithdrawCredits] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  // ─── History state ───────────────────────────────────────────────────────
  const [historyFilter, setHistoryFilter] = useState("all");
  const [catalogCategory, setCatalogCategory] = useState<(typeof CATALOG_CATEGORIES)[number]>("All");

  // ─── Load wallet + PayPal config + fee config on mount ─────────────────
  useEffect(() => {
    fetchWallet();
    fetch("/api/paypal/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.clientId) {
          setPaypalClientId(data.clientId);
          if (data.mode) setPaypalMode(data.mode);
        } else {
          setPaypalError(data.error || "PayPal not configured");
        }
      })
      .catch(() => setPaypalError("Failed to load PayPal config"));
    fetch("/api/wallet/fees")
      .then((r) => r.json())
      .then((data) => setFeeConfig(data))
      .catch(() => {}); // Fall back to defaults
  }, [fetchWallet]);

  // ─── Derived Data ────────────────────────────────────────────────────────

  const filteredTransactions = useMemo(() => {
    if (historyFilter === "all") return storeTransactions;
    return storeTransactions.filter((t) => t.type === historyFilter);
  }, [storeTransactions, historyFilter]);

  const filteredCatalogItems = useMemo(() => {
    if (catalogCategory === "All") return CATALOG_ITEMS;
    return CATALOG_ITEMS.filter((item) => item.category === catalogCategory);
  }, [catalogCategory]);

  // When a preset package is selected, use its fixed price and credit count.
  // When a custom dollar amount is entered, calculate credits from fees.
  const isPresetPackage = selectedPackage !== null && selectedPackage >= 0;
  const effectiveCreditDollarVal = isPresetPackage
    ? CREDIT_PACKAGES[selectedPackage].priceCents / 100
    : parseFloat(creditDollarAmount) || 0;
  const creditAmountCents = Math.round(effectiveCreditDollarVal * 100);
  // For custom amounts, calculate fees normally. For presets, the advertised
  // credit count is what the user gets — fees are baked into the package price.
  const creditFees = calculatePurchaseFees(effectiveCreditDollarVal, feeConfig.purchaseFeePct);
  const displayCredits = isPresetPackage
    ? CREDIT_PACKAGES[selectedPackage].credits
    : creditFees.credits;

  const withdrawCreditCount = Math.floor(parseFloat(withdrawCredits) || 0);
  const withdrawFees = calculateWithdrawalFees(withdrawCreditCount, feeConfig.withdrawalFeePct, feeConfig.withdrawalFeeMinCents);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleWithdraw = useCallback(async () => {
    setWithdrawError("");
    const creditCount = Math.floor(parseFloat(withdrawCredits) || 0);
    if (creditCount < 500) {
      setWithdrawError("Minimum withdrawal is 500 credits ($5.00)");
      return;
    }
    if (creditCount > credits) {
      setWithdrawError("Insufficient credits");
      return;
    }
    setIsWithdrawing(true);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credits: creditCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");
      addToast(`Withdrawal of ${creditCount.toLocaleString()} credits initiated!`, "success");
      setWithdrawCredits("");
      await fetchWallet();
    } catch (err: any) {
      setWithdrawError(err.message || "Withdrawal failed");
    } finally {
      setIsWithdrawing(false);
    }
  }, [withdrawCredits, credits, addToast, fetchWallet]);

  const handlePaymentSuccess = useCallback(async () => {
    await fetchWallet();
    addToast("Credits purchased successfully!", "success");
    setShowCreditCheckout(false);
    setSelectedPackage(null);
    setCreditDollarAmount("");
  }, [fetchWallet, addToast]);

  const handlePaymentError = useCallback((msg: string) => {
    addToast(msg, "error");
  }, [addToast]);

  const handleMaxWithdraw = useCallback(() => {
    setWithdrawCredits(String(credits));
    setWithdrawError("");
  }, [credits]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const paypalReady = !!paypalClientId;

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Wallet size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-text">Wallet</h1>
              <p className="text-text-secondary text-sm">
                Manage credits, withdrawals, and transactions
              </p>
            </div>
          </div>
        </div>

        {/* ── Balance Banner ──────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent p-6 md:p-8 mb-6">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute top-4 right-4 w-20 h-20 rounded-full bg-white/5" />

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 relative z-10">
            <div>
              <p className="text-white/70 text-sm font-medium mb-1">Your Credits</p>
              <div className="flex items-baseline gap-3 mb-1">
                <p className="text-white text-4xl md:text-5xl font-bold">
                  {walletLoading ? "..." : credits.toLocaleString()}
                </p>
                <span className="text-white/60 text-lg font-medium">credits</span>
              </div>
              <p className="text-white/50 text-sm">
                {walletLoading ? "" : creditsToUsd(credits)} USD value
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-white/80 text-sm">1 credit = $0.01</span>
            </div>
          </div>
        </div>

        {/* ── PayPal not configured warning ────────────────────────────── */}
        {paypalError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20 mb-6">
            <AlertCircle size={18} className="text-warning mt-0.5 shrink-0" />
            <div className="text-sm text-text-secondary">
              <p className="text-text font-medium">PayPal Not Configured</p>
              <p className="mt-1">{paypalError}. Add your PayPal Client ID and Secret to the .env file to enable payments.</p>
            </div>
          </div>
        )}

        {/* ── Main Tabs ──────────────────────────────────────────────── */}
        <Card padding="lg" className="!p-0 overflow-hidden">
          <div className="px-6 pt-6">
            <Tabs
              tabs={MAIN_TABS}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as MainTab)}
            />
          </div>

          <div className="p-6">

            {/* ════════════════════════════════════════════════════════════
                TAB 1: BUY CREDITS
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "buy-credits" && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <Gift size={18} className="text-accent" />
                  <h2 className="text-lg font-semibold text-text">Buy Credits</h2>
                </div>
                <p className="text-text-secondary text-sm">
                  Purchase credits to send gifts during live streams, donate to creators, and more. 1 credit = $0.01 USD.
                </p>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/5 border border-warning/15">
                  <AlertCircle size={16} className="text-warning mt-0.5 shrink-0" />
                  <div className="text-[11px] text-text-muted leading-relaxed">
                    <p className="text-text-secondary text-xs font-medium mb-1">Non-Refundable Purchase</p>
                    <p>
                      All credit purchases are final and non-refundable. By completing a purchase, you acknowledge and agree that credits are virtual currency with no cash value outside the Rally Live platform, cannot be exchanged for cash or refunded under any circumstances, and are provided &ldquo;as-is&rdquo; for use within the platform. Rally Live reserves the right to modify or discontinue credits or related features at any time. You waive any right to a refund, chargeback, or reversal of any credit purchase. Unauthorized chargebacks may result in account suspension.
                    </p>
                  </div>
                </div>

                {/* Dollar amount input */}
                <div>
                  <p className="text-text-secondary text-sm font-medium mb-3">Enter dollar amount to spend</p>
                  <div className="max-w-xs">
                    <Input
                      label="Amount ($)"
                      icon={<DollarSign size={16} />}
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="e.g. 10.00"
                      value={creditDollarAmount}
                      onChange={(e) => {
                        setCreditDollarAmount(e.target.value);
                        setSelectedPackage(-1);
                        setShowCreditCheckout(false);
                      }}
                    />
                  </div>
                </div>

                {/* Preset packages */}
                <div>
                  <p className="text-text-secondary text-sm font-medium mb-3">Or choose a preset package</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {CREDIT_PACKAGES.map((pkg, idx) => {
                      const IconComp = pkg.icon;
                      const isSelected = selectedPackage === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedPackage(isSelected ? null : idx);
                            setCreditDollarAmount("");
                            setShowCreditCheckout(false);
                          }}
                          className={cn(
                            "relative flex flex-col items-center p-5 rounded-xl border transition-all duration-200 text-center",
                            isSelected
                              ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20"
                              : "bg-bg-surface2 border-border hover:border-primary/30 hover:bg-bg-surface3"
                          )}
                        >
                          {pkg.popular && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-primary to-accent text-white px-3 py-0.5 rounded-full">
                              Popular
                            </span>
                          )}
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center mb-3",
                            isSelected ? "bg-primary/20" : "bg-bg-surface3"
                          )}>
                            <IconComp size={22} className={cn(
                              isSelected ? "text-primary" : "text-text-secondary"
                            )} />
                          </div>
                          <p className="text-text font-bold text-lg">{pkg.credits.toLocaleString()}</p>
                          <p className="text-text-muted text-xs mb-2">credits</p>
                          <p className={cn("text-sm font-bold", isSelected ? "text-primary" : "text-text")}>
                            ${(pkg.priceCents / 100).toFixed(2)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fee breakdown + PayPal checkout */}
                {(isPresetPackage || creditAmountCents >= 100) && (
                  <>
                    <div className="rounded-xl bg-bg-surface2 border border-border p-5 space-y-3">
                      <p className="text-text font-semibold text-sm mb-2">Order Summary</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-text-secondary">Amount you pay</span>
                          <span className="text-text font-semibold">${effectiveCreditDollarVal.toFixed(2)}</span>
                        </div>
                        {!isPresetPackage && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-text-muted">Processing fee ({creditFees.processingLabel})</span>
                              <span className="text-danger">-${creditFees.processingFee.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-text-muted">Platform fee (5%)</span>
                              <span className="text-danger">-${creditFees.platformFee.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        {isPresetPackage && (
                          <div className="flex items-center justify-between">
                            <span className="text-text-muted">All fees included</span>
                            <span className="text-success">Included</span>
                          </div>
                        )}
                        <div className="border-t border-border my-1" />
                        <div className="flex items-center justify-between">
                          <span className="text-text font-semibold">Credits you receive</span>
                          <span className="text-text font-bold text-lg">{displayCredits.toLocaleString()} credits</span>
                        </div>
                      </div>
                    </div>

                    {/* Payment method */}
                    <div>
                      <p className="text-text-secondary text-sm font-medium mb-3">Pay with</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-bg-surface2 opacity-50 cursor-not-allowed relative">
                          <CreditCard size={20} className="text-text-muted" />
                          <div className="text-left">
                            <span className="text-text-muted text-sm font-medium block">Credit / Debit Card</span>
                            <span className="text-text-muted text-[10px]">Processing fee: 2.9% + $0.30</span>
                          </div>
                          <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">Soon</span>
                        </div>
                        <button
                          onClick={() => setShowCreditCheckout(!showCreditCheckout)}
                          disabled={!paypalReady || displayCredits <= 0}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-xl border transition-all duration-200",
                            showCreditCheckout
                              ? "bg-[#0070ba]/10 border-[#0070ba]/40 ring-1 ring-[#0070ba]/20"
                              : "bg-bg-surface2 border-border hover:border-[#0070ba]/30",
                            (!paypalReady || displayCredits <= 0) && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <PayPalIcon className={cn(
                            showCreditCheckout ? "text-[#0070ba]" : "text-text-secondary"
                          )} />
                          <div className="text-left">
                            <span className="text-text text-sm font-medium block">PayPal</span>
                            <span className="text-text-muted text-[10px]">Processing fee: 3.49% + $0.49</span>
                          </div>
                          {showCreditCheckout && <Check size={16} className="text-[#0070ba] ml-auto" />}
                        </button>
                      </div>

                      {showCreditCheckout && paypalReady && displayCredits > 0 && (
                        <PayPalScriptProvider options={{ clientId: paypalClientId!, currency: "USD", intent: "capture" }} key={paypalClientId}>
                          <div className="bg-bg-surface2 rounded-xl border border-border p-5">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <PayPalIcon className="text-[#0070ba]" />
                                <p className="text-text font-semibold text-sm">PayPal Checkout</p>
                              </div>
                              <button onClick={() => setShowCreditCheckout(false)}>
                                <X size={16} className="text-text-muted hover:text-text" />
                              </button>
                            </div>
                            <p className="text-text-secondary text-sm mb-3">
                              Purchasing <span className="text-text font-semibold">{displayCredits.toLocaleString()} credits</span> for{" "}
                              <span className="text-text font-semibold">${effectiveCreditDollarVal.toFixed(2)}</span>
                            </p>
                            <p className="text-[10px] text-text-muted mb-4">
                              By completing this purchase you agree that all credit sales are final and non-refundable.
                            </p>
                            <PayPalCheckout
                              amountCents={creditAmountCents}
                              packageCredits={isPresetPackage ? CREDIT_PACKAGES[selectedPackage].credits : undefined}
                              onSuccess={handlePaymentSuccess}
                              onError={handlePaymentError}
                            />
                          </div>
                        </PayPalScriptProvider>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 2: CATALOG */}
            {activeTab === "catalog" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Gift size={18} className="text-accent" />
                    <h2 className="text-lg font-semibold text-text">Credits Catalog</h2>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => setActiveTab("buy-credits")}>
                    Buy Credits
                  </Button>
                </div>
                <p className="text-sm text-text-secondary">
                  Send gifts during streams and messages. Prices are shown in credits.
                </p>

                <div className="flex flex-wrap gap-2">
                  {CATALOG_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      onClick={() => setCatalogCategory(category)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                        catalogCategory === category
                          ? "bg-primary text-white"
                          : "bg-bg-surface2 text-text-secondary hover:text-text"
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {filteredCatalogItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border bg-bg-surface2 p-3">
                      <div className="mb-2 flex h-14 items-center justify-center rounded-lg bg-bg-surface3 text-3xl">
                        <span>{item.emoji}</span>
                      </div>
                      <p className="truncate text-sm font-semibold text-text">{item.name}</p>
                      <p className="text-xs text-text-muted">{item.category}</p>
                      <p className="mt-1 text-sm font-bold text-primary">{item.credits.toLocaleString()} credits</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB 2: WITHDRAW
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "withdraw" && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <ArrowUpFromLine size={18} className="text-danger" />
                  <h2 className="text-lg font-semibold text-text">Withdraw Credits</h2>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/15">
                  <AlertCircle size={18} className="text-primary mt-0.5 shrink-0" />
                  <div className="text-sm text-text-secondary">
                    <p>Withdrawals are processed via <span className="text-text font-medium">PayPal only</span>.</p>
                    <p className="mt-1">Minimum withdrawal: <span className="text-text font-medium">500 credits ($5.00)</span>. Processing takes 1-3 business days.</p>
                    <p className="mt-1">Withdrawal fee: <span className="text-text font-medium">2% (minimum $0.25)</span></p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-xl bg-bg-surface2 border border-border">
                  <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center">
                    <Sparkles size={18} className="text-success" />
                  </div>
                  <div>
                    <p className="text-text-muted text-xs font-medium">Available to Withdraw</p>
                    <p className="text-text text-2xl font-bold">{credits.toLocaleString()} <span className="text-base font-medium text-text-secondary">credits</span></p>
                    <p className="text-text-muted text-xs">{creditsToUsd(credits)} USD value</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-text-secondary">Credits to withdraw</label>
                      <button
                        type="button"
                        onClick={handleMaxWithdraw}
                        className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                      >
                        Max ({credits.toLocaleString()})
                      </button>
                    </div>
                    <Input
                      icon={<Sparkles size={16} />}
                      type="number"
                      min="500"
                      step="1"
                      placeholder="Minimum 500 credits"
                      value={withdrawCredits}
                      onChange={(e) => { setWithdrawCredits(e.target.value); setWithdrawError(""); }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text-secondary">PayPal Email</label>
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-surface2 border border-border rounded-xl text-sm text-text">
                      <PayPalIcon className="text-text-muted w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {showEmail ? accountEmail : accountEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowEmail(!showEmail)}
                        className="ml-auto shrink-0 p-1 rounded-md text-text-muted hover:text-text hover:bg-bg-surface3 transition-colors"
                      >
                        {showEmail ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p className="text-[11px] text-text-muted">Withdrawals can only be sent to your account email</p>
                  </div>
                </div>

                {withdrawCreditCount >= 500 && (
                  <div className="rounded-xl bg-bg-surface2 border border-border p-4 space-y-2 text-sm">
                    <p className="text-text font-semibold text-xs uppercase tracking-wider text-text-muted mb-1">Fee Breakdown</p>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Credits to withdraw</span>
                      <span className="text-text font-semibold">{withdrawCreditCount.toLocaleString()} credits ({creditsToUsd(withdrawCreditCount)})</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Withdrawal fee (2%, min $0.25)</span>
                      <span className="text-danger">-{withdrawFees.feeUsd}</span>
                    </div>
                    <div className="border-t border-border my-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-text font-semibold">You receive</span>
                      <span className="text-success font-bold">{withdrawFees.netUsd}</span>
                    </div>
                  </div>
                )}

                {withdrawError && (
                  <div className="flex items-center gap-2 text-danger text-sm">
                    <AlertCircle size={14} />
                    <span>{withdrawError}</span>
                  </div>
                )}

                <Button
                  variant="primary"
                  onClick={handleWithdraw}
                  disabled={isWithdrawing}
                  icon={isWithdrawing ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpFromLine size={16} />}
                >
                  {isWithdrawing ? "Processing..." : "Withdraw to PayPal"}
                </Button>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB 3: TRANSACTION HISTORY
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "history" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={18} className="text-text-secondary" />
                  <h2 className="text-lg font-semibold text-text">Transaction History</h2>
                </div>

                <Tabs
                  tabs={HISTORY_TABS}
                  activeTab={historyFilter}
                  onChange={setHistoryFilter}
                />

                <div className="mt-2">
                  {filteredTransactions.length === 0 ? (
                    <div className="py-16 text-center">
                      <CreditCard size={36} className="text-text-muted mx-auto mb-3" />
                      <p className="text-text-secondary text-sm font-medium">No transactions found</p>
                      <p className="text-text-muted text-xs mt-1">Transactions will appear here once you start using your wallet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredTransactions.map((tx) => {
                        const isEarned = tx.type === "CREDIT_EARNED" || tx.type === "AD_REVENUE" || tx.type === "STREAK_BONUS";
                        const isPurchase = tx.type === "CREDIT_PURCHASE";
                        const isWithdrawal = tx.type === "WITHDRAWAL";
                        const isDonation = tx.type === "DONATION";

                        // Credits as primary display value
                        const creditDelta = tx.credits;
                        const isPositive = isEarned || isPurchase;

                        let iconBg = "bg-success/15";
                        let iconColor = "text-success";
                        let Icon = ArrowDownToLine;
                        if (isPurchase) {
                          iconBg = "bg-primary/15";
                          iconColor = "text-primary";
                          Icon = Gift;
                        } else if (isWithdrawal) {
                          iconBg = "bg-danger/15";
                          iconColor = "text-danger";
                          Icon = ArrowUpFromLine;
                        } else if (isDonation) {
                          iconBg = "bg-accent/15";
                          iconColor = "text-accent";
                          Icon = Gift;
                        }

                        return (
                          <div key={tx.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
                              <Icon size={16} className={iconColor} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-text text-sm font-medium truncate">{tx.description}</p>
                              <p className="text-text-muted text-xs">
                                {formatRelativeTime(new Date(tx.createdAt).getTime())}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {creditDelta !== 0 ? (
                                <>
                                  <p className={cn("text-sm font-bold", isPositive ? "text-success" : "text-danger")}>
                                    {creditDelta > 0 ? "+" : ""}{creditDelta.toLocaleString()} credits
                                  </p>
                                  <p className="text-text-muted text-[10px]">
                                    {creditsToUsd(Math.abs(creditDelta))}
                                  </p>
                                </>
                              ) : (
                                <p className={cn("text-sm font-bold", isPositive ? "text-success" : "text-danger")}>
                                  {creditsToUsd(tx.amountCents)}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </Card>
      </div>
    </div>
  );
}
