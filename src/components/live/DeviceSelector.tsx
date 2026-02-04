"use client";

import { useState, useEffect } from "react";
import { Camera, Mic, Volume2, ChevronDown } from "lucide-react";
import { enumerateDevices, type DeviceInfo } from "@/lib/media/device-manager";
import { cn } from "@/lib/utils";

interface DeviceSelectorProps {
  selectedCameraId: string | null;
  selectedMicId: string | null;
  onCameraChange: (deviceId: string) => void;
  onMicChange: (deviceId: string) => void;
  className?: string;
}

export default function DeviceSelector({
  selectedCameraId,
  selectedMicId,
  onCameraChange,
  onMicChange,
  className,
}: DeviceSelectorProps) {
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await enumerateDevices();
        setCameras(devices.cameras);
        setMicrophones(devices.microphones);
      } catch (err) {
        console.error("Failed to enumerate devices:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDevices();

    // Re-enumerate when devices change
    const handler = () => loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, []);

  if (loading) {
    return (
      <div className={cn("space-y-3 animate-pulse", className)}>
        <div className="h-10 bg-bg-surface2 rounded-xl" />
        <div className="h-10 bg-bg-surface2 rounded-xl" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Camera selector */}
      <div>
        <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5 mb-1">
          <Camera size={12} /> Camera
        </label>
        <div className="relative">
          <select
            value={selectedCameraId || ""}
            onChange={(e) => onCameraChange(e.target.value)}
            className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary appearance-none pr-8"
          >
            {cameras.length === 0 && <option value="">No cameras found</option>}
            {cameras.map((cam) => (
              <option key={cam.deviceId} value={cam.deviceId}>
                {cam.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      </div>

      {/* Microphone selector */}
      <div>
        <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5 mb-1">
          <Mic size={12} /> Microphone
        </label>
        <div className="relative">
          <select
            value={selectedMicId || ""}
            onChange={(e) => onMicChange(e.target.value)}
            className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary appearance-none pr-8"
          >
            {microphones.length === 0 && <option value="">No microphones found</option>}
            {microphones.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
