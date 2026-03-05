import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";
import {
  getRolloutPolicy,
  sanitizeRestreamTargets,
  type RestreamTargetStored,
} from "@/lib/media/restream-rollout";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

// GET: Load live settings from user preferences
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const liveSettings = (prefs.liveSettings as Record<string, unknown>) || {};
    const rawTargets = Array.isArray(liveSettings.restreamTargets) ? liveSettings.restreamTargets : [];
    const restreamTargets = (rawTargets as Array<Record<string, unknown>>).map((target) => ({
      platform: String(target.platform || ""),
      enabled: Boolean(target.enabled),
      ingestUrl: String(target.ingestUrl || ""),
      oauthConnected: Boolean(target.oauthConnected),
      streamKeyMasked: target.streamKeyMasked ? String(target.streamKeyMasked) : null,
    }));

    return NextResponse.json({
      liveSettings: { ...liveSettings, restreamTargets },
      restreamRollout: getRolloutPolicy(),
    });
  } catch (error) {
    console.error("GET /api/creator/live-settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Save all live settings to user preferences
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      streamTitle, tags, mode, guestLimit, roundLength, teamSize,
      blockLinks, slowMode, followersOnly, subscriberOnly, bannedWords,
      minCreditsToChat, minCreditsToJoin, adFrequency, donationSkipEnabled,
      donationSkipAmount, cameraOffImage, muteImage, queueCreditCost,
      bgColor, bgImageUrl,
      restreamTargets,
    } = body;

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const liveSettings: Record<string, unknown> = {};

    // Basic stream settings
    if (streamTitle !== undefined) liveSettings.streamTitle = String(streamTitle).slice(0, 200);
    if (tags !== undefined) liveSettings.tags = Array.isArray(tags) ? tags.slice(0, 10) : [];
    if (mode !== undefined) liveSettings.mode = String(mode);
    if (guestLimit !== undefined) liveSettings.guestLimit = Math.min(10, Math.max(2, Number(guestLimit) || 2));
    if (roundLength !== undefined) liveSettings.roundLength = Math.min(300, Math.max(15, Number(roundLength) || 60));
    if (teamSize !== undefined) liveSettings.teamSize = String(teamSize);

    // Moderation settings
    if (blockLinks !== undefined) liveSettings.blockLinks = Boolean(blockLinks);
    if (slowMode !== undefined) liveSettings.slowMode = String(slowMode);
    if (followersOnly !== undefined) liveSettings.followersOnly = Boolean(followersOnly);
    if (subscriberOnly !== undefined) liveSettings.subscriberOnly = Boolean(subscriberOnly);
    if (bannedWords !== undefined) liveSettings.bannedWords = Array.isArray(bannedWords) ? bannedWords.map(String) : [];
    if (minCreditsToChat !== undefined) liveSettings.minCreditsToChat = String(minCreditsToChat);
    if (minCreditsToJoin !== undefined) liveSettings.minCreditsToJoin = String(minCreditsToJoin);

    // Ad settings
    if (adFrequency !== undefined) liveSettings.adFrequency = String(adFrequency);
    if (donationSkipEnabled !== undefined) liveSettings.donationSkipEnabled = Boolean(donationSkipEnabled);
    if (donationSkipAmount !== undefined) liveSettings.donationSkipAmount = String(donationSkipAmount);

    // Overlay images
    if (cameraOffImage !== undefined) liveSettings.cameraOffImage = String(cameraOffImage);
    if (muteImage !== undefined) liveSettings.muteImage = String(muteImage);

    // Battle / queue settings
    if (queueCreditCost !== undefined) liveSettings.queueCreditCost = Math.max(0, Number(queueCreditCost) || 0);

    // Background
    if (bgColor !== undefined) liveSettings.bgColor = String(bgColor);
    if (bgImageUrl !== undefined) liveSettings.bgImageUrl = String(bgImageUrl);

    // Progressive rollout restream settings.
    if (restreamTargets !== undefined) {
      const existingTargets = Array.isArray((prefs.liveSettings as Record<string, unknown> | undefined)?.restreamTargets)
        ? ((prefs.liveSettings as Record<string, unknown>).restreamTargets as RestreamTargetStored[])
        : [];
      const byPlatform = new Map<string, RestreamTargetStored>(
        existingTargets.map((target) => [target.platform, target])
      );

      const sanitized = sanitizeRestreamTargets(restreamTargets).map((target) => {
        const previous = byPlatform.get(target.platform);
        return {
          ...target,
          streamKeyCiphertext: target.streamKeyCiphertext || previous?.streamKeyCiphertext || null,
          streamKeyMasked: target.streamKeyMasked || previous?.streamKeyMasked || null,
        };
      });
      liveSettings.restreamTargets = sanitized;
    }

    // Disconnect timeout (seconds) — how long stream stays alive after streamer navigates away
    if (body.disconnectTimeout !== undefined) liveSettings.disconnectTimeout = Math.min(300, Math.max(15, Number(body.disconnectTimeout) || 60));

    const updatedPrefs = { ...prefs, liveSettings: { ...(prefs.liveSettings as Record<string, unknown> || {}), ...liveSettings } };

    await prisma.user.update({
      where: { id: user.id },
      data: { preferences: updatedPrefs as Record<string, unknown> as import("@/generated/prisma").Prisma.InputJsonValue },
    });

    // Part 8: Write banned words to TXT file alongside MySQL save
    if (bannedWords !== undefined && Array.isArray(bannedWords)) {
      try {
        const uploadsDir = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
        const streamDir = path.join(uploadsDir, user.id, "stream");
        await fs.mkdir(streamDir, { recursive: true });
        const txtPath = path.join(streamDir, "banned-words.txt");
        await fs.writeFile(txtPath, bannedWords.join("\n"), "utf-8");
      } catch (err) {
        console.error("Failed to write banned-words.txt:", err);
        // Non-fatal: MySQL save already succeeded
      }
    }

    const saved = (updatedPrefs.liveSettings as Record<string, unknown>) || {};
    const savedTargets = Array.isArray(saved.restreamTargets)
      ? (saved.restreamTargets as Array<Record<string, unknown>>).map((target) => ({
          platform: String(target.platform || ""),
          enabled: Boolean(target.enabled),
          ingestUrl: String(target.ingestUrl || ""),
          oauthConnected: Boolean(target.oauthConnected),
          streamKeyMasked: target.streamKeyMasked ? String(target.streamKeyMasked) : null,
        }))
      : [];

    return NextResponse.json({
      liveSettings: { ...saved, restreamTargets: savedTargets },
      restreamRollout: getRolloutPolicy(),
    });
  } catch (error) {
    console.error("PUT /api/creator/live-settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
