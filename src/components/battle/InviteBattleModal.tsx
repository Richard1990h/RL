"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Swords,
  Send,
  X,
  Loader2,
  Check,
  Clock,
  Radio,
  Eye,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface LiveCreator {
  id: string;
  displayName: string;
  avatarUrl?: string;
  verifiedBadge?: boolean;
  streamId: string;
  streamTitle: string;
  viewerCount: number;
}

interface PendingInvitation {
  id: string;
  receiverId: string;
  receiver: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface InviteBattleModalProps {
  isOpen: boolean;
  onClose: () => void;
  streamId: string;
  onInviteSent?: () => void;
}

export default function InviteBattleModal({
  isOpen,
  onClose,
  streamId,
  onInviteSent,
}: InviteBattleModalProps) {
  const [activeTab, setActiveTab] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [liveCreators, setLiveCreators] = useState<LiveCreator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch live creators
  const fetchLiveCreators = useCallback(async () => {
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/live?status=LIVE&limit=20${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.streams) {
        const creators: LiveCreator[] = data.streams.map(
          (s: { id: string; title: string; viewerCount: number; host: User }) => ({
            id: s.host.id,
            displayName: s.host.displayName,
            avatarUrl: s.host.avatarUrl,
            verifiedBadge: s.host.verifiedBadge,
            streamId: s.id,
            streamTitle: s.title,
            viewerCount: s.viewerCount,
          })
        );
        setLiveCreators(creators);
      }
    } catch (err) {
      console.error("Failed to fetch live creators:", err);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  // Fetch pending invitations
  const fetchPendingInvites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/battle/invite?type=sent", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.invitations) {
        setPendingInvites(data.invitations);
      }
    } catch (err) {
      console.error("Failed to fetch pending invitations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchLiveCreators();
      fetchPendingInvites();
    }
  }, [isOpen, fetchLiveCreators, fetchPendingInvites]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) fetchLiveCreators();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, fetchLiveCreators]);

  // Send invitation
  const handleSendInvite = async (receiverId: string) => {
    setError(null);
    setSuccess(null);
    setSendingTo(receiverId);

    try {
      const res = await fetch("/api/battle/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          streamId,
          receiverId,
          message: message || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send invitation");
        return;
      }

      setSuccess(`Invitation sent!`);
      setMessage("");
      fetchPendingInvites();
      onInviteSent?.();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError("Failed to send invitation");
    } finally {
      setSendingTo(null);
    }
  };

  // Cancel invitation
  const handleCancelInvite = async (invitationId: string) => {
    try {
      const res = await fetch(`/api/battle/invite/${invitationId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        fetchPendingInvites();
      }
    } catch (err) {
      console.error("Failed to cancel invitation:", err);
    }
  };

  // Check if already invited
  const isAlreadyInvited = (userId: string) => {
    return pendingInvites.some((inv) => inv.receiverId === userId);
  };

  // Format time remaining
  const formatTimeRemaining = (expiresAt: string) => {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return "Expired";
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite to Battle">
      <div className="space-y-4">
        {/* Tabs */}
        <Tabs
          tabs={[
            { id: "search", label: "Find Creators" },
            { id: "pending", label: `Pending (${pendingInvites.length})` },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {/* Error/Success messages */}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-danger/10 text-danger text-sm flex items-center gap-2">
            <X size={14} />
            {error}
          </div>
        )}
        {success && (
          <div className="px-3 py-2 rounded-lg bg-success/10 text-success text-sm flex items-center gap-2">
            <Check size={14} />
            {success}
          </div>
        )}

        {activeTab === "search" && (
          <>
            {/* Search input */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search live creators..."
                className="w-full pl-9 pr-4 py-2.5 bg-bg-surface2 border border-border rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>

            {/* Optional message */}
            <div>
              <label className="text-xs text-text-muted block mb-1">
                Message (optional)
              </label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Let's battle! 🔥"
                maxLength={100}
                className="w-full px-3 py-2 bg-bg-surface2 border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>

            {/* Live creators list */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {searchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-text-muted" size={24} />
                </div>
              ) : liveCreators.length === 0 ? (
                <div className="text-center py-8">
                  <Radio size={32} className="text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-muted">
                    No live creators found
                  </p>
                </div>
              ) : (
                liveCreators.map((creator) => {
                  const invited = isAlreadyInvited(creator.id);
                  const isSending = sendingTo === creator.id;

                  return (
                    <div
                      key={creator.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                        invited
                          ? "bg-primary/5 border-primary/30"
                          : "bg-bg-surface border-border hover:border-border-light"
                      )}
                    >
                      <Avatar
                        src={creator.avatarUrl}
                        name={creator.displayName}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text truncate">
                            {creator.displayName}
                          </span>
                          {creator.verifiedBadge && (
                            <Badge variant="premium">
                              ✓
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <span className="truncate">{creator.streamTitle}</span>
                          <span className="flex items-center gap-1">
                            <Eye size={10} />
                            {creator.viewerCount}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant={invited ? "secondary" : "primary"}
                        size="sm"
                        icon={
                          isSending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : invited ? (
                            <Check size={14} />
                          ) : (
                            <Send size={14} />
                          )
                        }
                        onClick={() => !invited && handleSendInvite(creator.id)}
                        disabled={invited || isSending}
                      >
                        {invited ? "Invited" : "Invite"}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {activeTab === "pending" && (
          <div className="max-h-80 overflow-y-auto space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-text-muted" size={24} />
              </div>
            ) : pendingInvites.length === 0 ? (
              <div className="text-center py-8">
                <Swords size={32} className="text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-muted">
                  No pending invitations
                </p>
              </div>
            ) : (
              pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-bg-surface border border-border"
                >
                  <Avatar
                    src={invite.receiver.avatarUrl}
                    name={invite.receiver.displayName}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-text block truncate">
                      {invite.receiver.displayName}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-text-muted">
                      <Clock size={10} />
                      Expires in {formatTimeRemaining(invite.expiresAt)}
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<X size={14} />}
                    onClick={() => handleCancelInvite(invite.id)}
                  >
                    Cancel
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Info text */}
        <p className="text-xs text-text-muted text-center">
          Invitations expire after 5 minutes. The creator must be live to
          receive invitations.
        </p>
      </div>
    </Modal>
  );
}
