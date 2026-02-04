"use client";

import Modal from "@/components/ui/Modal";
import { Clock } from "lucide-react";

interface FriendTimeoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  friendName: string;
  onSelect: (minutes: number) => void;
}

const PRESETS = [
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "8 hours", minutes: 480 },
  { label: "24 hours", minutes: 1440 },
  { label: "1 week", minutes: 10080 },
];

export default function FriendTimeoutModal({
  isOpen,
  onClose,
  friendName,
  onSelect,
}: FriendTimeoutModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mute Notifications" size="sm">
      <p className="mb-4 text-sm text-text-secondary">
        Mute notifications from <span className="font-medium text-text">{friendName}</span> for:
      </p>
      <div className="flex flex-col gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.minutes}
            onClick={() => {
              onSelect(preset.minutes);
              onClose();
            }}
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-surface2"
          >
            <Clock size={16} className="text-text-muted" />
            {preset.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
