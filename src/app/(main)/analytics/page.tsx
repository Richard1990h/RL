"use client";

import { useState, useEffect } from "react";
import {
  Eye,
  Users,
  DollarSign,
  Gift,
  Radio,
  TrendingUp,
  Megaphone,
  BarChart3,
  Loader2,
} from "lucide-react";
import Card from "@/components/ui/Card";
import AnalyticsCard from "@/components/creator/AnalyticsCard";
import BarChart from "@/components/creator/BarChart";
import { formatViews, formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";

interface AnalyticsData {
  totalViews: number;
  totalImpressions?: number;
  totalLikes: number;
  totalDislikes: number;
  totalVideos: number;
  followers: number;
  totalEarnedCents: number;
  viewsByMonth: number[];
  monthLabels: string[];
  topStreams: Array<{
    title: string;
    date: string;
    peak: number;
    participants: number;
    chatMessages: number;
  }>;
  liveStreamCount: number;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = (await api.analytics.get()) as AnalyticsData;
        setData(res);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-text mb-4">Analytics</h1>
        <Card padding="lg">
          <p className="text-text-secondary text-center py-8">
            Failed to load analytics data. Please try again later.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-2xl font-bold text-text">Analytics</h1>

      {/* Top stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnalyticsCard
          title="Impression Views"
          value={formatViews(data.totalImpressions ?? data.totalViews)}
          trend={0}
          icon={<Eye size={24} />}
          tooltip="The total number of ad impressions served across all your videos. You earn revenue from each impression."
        />
        <AnalyticsCard
          title="Total Videos"
          value={data.totalVideos.toLocaleString()}
          trend={0}
          icon={<BarChart3 size={24} />}
        />
        <AnalyticsCard
          title="Followers"
          value={formatViews(data.followers)}
          trend={0}
          icon={<Users size={24} />}
        />
        <AnalyticsCard
          title="Revenue"
          value={formatCurrency(data.totalEarnedCents)}
          trend={0}
          icon={<DollarSign size={24} />}
        />
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card padding="lg">
          <h3 className="text-sm font-semibold text-text mb-4">Impression Views Over Time</h3>
          <BarChart
            data={data.viewsByMonth}
            labels={data.monthLabels}
            height={220}
            color="var(--color-primary)"
          />
        </Card>

        <Card padding="lg">
          <h3 className="text-sm font-semibold text-text mb-4">Engagement</h3>
          <div className="space-y-6 pt-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-secondary">Likes</span>
                <span className="text-text font-medium">{formatViews(data.totalLikes)}</span>
              </div>
              <div className="h-3 bg-bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-success rounded-full"
                  style={{
                    width: `${data.totalLikes + data.totalDislikes > 0 ? (data.totalLikes / (data.totalLikes + data.totalDislikes)) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-secondary">Dislikes</span>
                <span className="text-text font-medium">{formatViews(data.totalDislikes)}</span>
              </div>
              <div className="h-3 bg-bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-danger rounded-full"
                  style={{
                    width: `${data.totalLikes + data.totalDislikes > 0 ? (data.totalDislikes / (data.totalLikes + data.totalDislikes)) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="text-text font-semibold">Like Ratio</span>
                <span className="gradient-text font-bold text-lg">
                  {data.totalLikes + data.totalDislikes > 0
                    ? ((data.totalLikes / (data.totalLikes + data.totalDislikes)) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Live Performance */}
      <Card padding="lg">
        <h3 className="text-lg font-semibold text-text mb-6">Live Performance</h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="text-center p-4 bg-bg-surface2 rounded-xl">
            <Radio size={20} className="mx-auto text-success mb-2" />
            <p className="text-xl font-bold text-text">{data.liveStreamCount}</p>
            <p className="text-xs text-text-muted mt-1">Total Streams</p>
          </div>
          <div className="text-center p-4 bg-bg-surface2 rounded-xl">
            <TrendingUp size={20} className="mx-auto text-accent mb-2" />
            <p className="text-xl font-bold text-text">
              {data.topStreams.length > 0
                ? formatViews(Math.max(...data.topStreams.map((s) => s.peak)))
                : "0"}
            </p>
            <p className="text-xs text-text-muted mt-1">Peak Viewers</p>
          </div>
          <div className="text-center p-4 bg-bg-surface2 rounded-xl">
            <Users size={20} className="mx-auto text-primary mb-2" />
            <p className="text-xl font-bold text-text">
              {formatViews(data.topStreams.reduce((sum, s) => sum + s.participants, 0))}
            </p>
            <p className="text-xs text-text-muted mt-1">Total Participants</p>
          </div>
          <div className="text-center p-4 bg-bg-surface2 rounded-xl">
            <Gift size={20} className="mx-auto text-warning mb-2" />
            <p className="text-xl font-bold text-text">
              {formatViews(data.topStreams.reduce((sum, s) => sum + s.chatMessages, 0))}
            </p>
            <p className="text-xs text-text-muted mt-1">Chat Messages</p>
          </div>
        </div>

        {data.topStreams.length > 0 ? (
          <>
            <h4 className="text-sm font-semibold text-text mb-3">
              Top Performing Streams
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="py-2.5 px-3 font-medium">Stream</th>
                    <th className="py-2.5 px-3 font-medium hidden sm:table-cell">Date</th>
                    <th className="py-2.5 px-3 font-medium">Peak</th>
                    <th className="py-2.5 px-3 font-medium hidden md:table-cell">Participants</th>
                    <th className="py-2.5 px-3 font-medium hidden md:table-cell">Chat Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topStreams.map((stream, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-bg-surface2/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-text font-medium">
                        {stream.title}
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary hidden sm:table-cell">
                        {stream.date}
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary">
                        {formatViews(stream.peak)}
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary hidden md:table-cell">
                        {formatViews(stream.participants)}
                      </td>
                      <td className="py-2.5 px-3 text-text-muted hidden md:table-cell">
                        {formatViews(stream.chatMessages)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">
            No live stream data available yet.
          </p>
        )}
      </Card>

      {/* ── Ads & Promotions Section ── */}
      <div>
        <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
          <Megaphone size={22} className="text-accent" />
          Ads &amp; Promotions
        </h2>
        <Card padding="lg">
          <p className="text-sm text-text-muted text-center py-8">
            No ad campaign data available yet. Ad analytics will appear here once campaigns are active.
          </p>
        </Card>
      </div>

      {/* Revenue Breakdown */}
      <Card padding="lg">
        <h3 className="text-lg font-semibold text-text mb-4">Revenue Summary</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-secondary">Total Earned</span>
              <span className="text-text font-medium">{formatCurrency(data.totalEarnedCents)}</span>
            </div>
            <div className="h-3 bg-bg-surface2 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-accent rounded-full" style={{ width: "100%" }} />
            </div>
          </div>
          <div className="pt-2 border-t border-border flex justify-between text-sm">
            <span className="text-text font-semibold">Total Revenue</span>
            <span className="gradient-text font-bold text-lg">
              {formatCurrency(data.totalEarnedCents)}
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Detailed revenue breakdown by gift tier will be available soon.
          </p>
        </div>
      </Card>
    </div>
  );
}
