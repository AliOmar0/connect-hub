import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { useDirection } from "@/hooks/use-direction";
import type { ViewStatus } from "@/types/presentation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Calendar } from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays } from "date-fns";
import type { ChannelType } from "@/types/database";
import { notifySuccess } from "@/lib/feedback";

// Chart series colors reference design tokens only (Requirements 17.1, 17.2)
// so every visualization shares the documented palette and inherits the
// contrast-tuned token values in both light and dark themes.
const CHANNEL_COLOR_TOKENS: Record<string, string> = {
  whatsapp: "hsl(var(--chart-success))",
  messenger: "hsl(var(--chart-info))",
  voice: "hsl(var(--chart-warning))",
  sms: "hsl(var(--chart-primary))",
  email: "hsl(var(--status-neutral))",
};

const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 12 };

interface ChartTooltipEntry {
  name: string;
  value: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<ChartTooltipEntry & { payload?: { color?: string } }>;
  label?: string;
}

// Token-styled tooltip so the overlay honors the active theme's surface and
// border tokens instead of Recharts' hard-coded white default.
function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-elevated">
      {label ? (
        <p className="mb-2 text-sm font-semibold text-foreground">{label}</p>
      ) : null}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: entry.color ?? entry.payload?.color,
            }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-80 w-full rounded-lg" aria-hidden="true" />;
}

/** "all" plus every real channel -- what the channel Select can hold. */
type ChannelFilter = "all" | ChannelType;

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const isRtl = useDirection() === "rtl";
  const [dateRange, setDateRange] = useState<number>(30);
  // Typed as the channel union rather than `string` so the value can be
  // handed straight to a `.eq("channel", ...)` filter.
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    isError: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ["analytics", dateRange, channelFilter],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = subDays(endDate, dateRange);

      let query = supabase
        .from("analytics_daily")
        .select("*")
        .gte("date", format(startDate, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"))
        .order("date", { ascending: true });

      if (channelFilter !== "all") {
        query = query.eq("channel", channelFilter);
      }

      const { data, error } = await query;

      // Surface the failure so react-query flips to `isError` and the affected
      // visualizations render an Error_State with a retry (Requirement 17.5).
      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
  });

  const {
    data: summaryStats,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    // The channel is part of the key, not just the date range. The filter
    // used to govern the activity chart alone, so picking "Voice" left the
    // summary cards and the distribution showing every channel -- three
    // panels on one screen disagreeing about what was being measured.
    queryKey: ["analytics-summary", dateRange, channelFilter],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = subDays(endDate, dateRange);

      let sessionsQuery = supabase
        .from("sessions")
        .select(
          "status, satisfaction_score, wait_time_seconds, duration_seconds",
        )
        .gte("started_at", startDate.toISOString());
      if (channelFilter !== "all") {
        sessionsQuery = sessionsQuery.eq("channel", channelFilter);
      }
      const { data: sessions } = await sessionsQuery;

      let messagesQuery = supabase
        .from("messages")
        .select("id")
        .gte("created_at", startDate.toISOString());
      if (channelFilter !== "all") {
        messagesQuery = messagesQuery.eq("channel", channelFilter);
      }
      const { data: messages } = await messagesQuery;

      // Calls are voice by construction, so any non-voice channel filter
      // means "no calls in scope" rather than "all calls".
      const callsInScope = channelFilter === "all" || channelFilter === "voice";
      const { data: calls } = callsInScope
        ? await supabase
            .from("calls")
            .select("id, duration_seconds")
            .gte("started_at", startDate.toISOString())
        : { data: [] as Array<{ id: string; duration_seconds: number }> };

      const totalSessions = sessions?.length || 0;
      const completedSessions =
        sessions?.filter((s) => s.status === "completed").length || 0;
      const avgSatisfaction =
        sessions?.reduce((sum, s) => sum + (s.satisfaction_score || 0), 0) /
        (sessions?.filter((s) => s.satisfaction_score).length || 1);
      const avgWaitTime =
        sessions?.reduce((sum, s) => sum + (s.wait_time_seconds || 0), 0) /
        (sessions?.filter((s) => s.wait_time_seconds).length || 1);
      const avgCallDuration =
        calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) /
        (calls?.filter((c) => c.duration_seconds).length || 1);

      return {
        totalSessions,
        completedSessions,
        resolutionRate:
          totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
        totalMessages: messages?.length || 0,
        totalCalls: calls?.length || 0,
        avgSatisfaction: avgSatisfaction.toFixed(1),
        avgWaitTime: Math.round(avgWaitTime),
        avgCallDuration: Math.round(avgCallDuration),
      };
    },
  });

  // Prepare chart data
  const chartData = analyticsData
    ? analyticsData.map((item) => ({
        date: format(new Date(item.date), "MMM d"),
        sessions: item.total_sessions || 0,
        messages: item.total_messages || 0,
        calls: item.total_calls || 0,
        satisfaction: item.avg_satisfaction_score
          ? parseFloat(item.avg_satisfaction_score.toString())
          : 0,
      }))
    : [];

  // Channel distribution
  const {
    data: channelData,
    isLoading: channelLoading,
    isError: channelError,
    refetch: refetchChannels,
  } = useQuery({
    queryKey: ["analytics-channels", dateRange, channelFilter],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = subDays(endDate, dateRange);

      let query = supabase
        .from("sessions")
        .select("channel")
        .gte("started_at", startDate.toISOString());
      if (channelFilter !== "all") {
        query = query.eq("channel", channelFilter);
      }
      const { data: sessions, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      if (!sessions) return [];

      const channelCounts: Record<string, number> = {};
      sessions.forEach((s) => {
        channelCounts[s.channel] = (channelCounts[s.channel] || 0) + 1;
      });

      const total = sessions.length;

      return Object.entries(channelCounts).map(([channel, count]) => ({
        channel,
        value: total > 0 ? Math.round((count / total) * 100) : 0,
        count,
        color: CHANNEL_COLOR_TOKENS[channel] ?? "hsl(var(--status-neutral))",
      }));
    },
  });

  // Resolve a localized display name for a channel, falling back to the raw
  // key so an unknown channel is never rendered blank.
  const channelName = (channel: string) =>
    t(`analytics.channels.${channel}`, {
      defaultValue: channel.charAt(0).toUpperCase() + channel.slice(1),
    });

  const pieData = (channelData || []).map((entry) => ({
    ...entry,
    name: channelName(entry.channel),
  }));

  /**
   * Export the activity series currently on screen as CSV. The control was
   * previously a bare Download glyph with no `onClick` at all -- it looked
   * like an export and did nothing. Exporting `chartData` keeps the file and
   * the chart in agreement about the date range and channel in view.
   */
  const handleExport = () => {
    const header = [
      t("analytics.series.date"),
      t("analytics.series.sessions"),
      t("analytics.series.messages"),
      t("analytics.series.calls"),
      t("analytics.series.satisfaction"),
    ];
    const escape = (value: string | number) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = chartData.map((row) =>
      [row.date, row.sessions, row.messages, row.calls, row.satisfaction]
        .map(escape)
        .join(","),
    );
    // BOM so Excel opens the Arabic column headers as UTF-8.
    const csv = `\uFEFF${[header.map(escape).join(","), ...rows].join("\r\n")}`;

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-${channelFilter}-${dateRange}d-${format(
      new Date(),
      "yyyy-MM-dd",
    )}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    notifySuccess(t("analytics.exportSuccess", { count: chartData.length }));
  };

  // Derive one ViewStatus per visualization so each renders the shared
  // Skeleton / Empty / Error / loaded presentation independently
  // (Requirements 17.3, 17.4, 17.5, 10.8).
  const toStatus = (
    loading: boolean,
    error: boolean,
    isEmpty: boolean,
  ): ViewStatus =>
    loading ? "loading" : error ? "error" : isEmpty ? "empty" : "loaded";

  const summaryStatus = toStatus(summaryLoading, summaryError, false);
  const activityStatus = toStatus(
    analyticsLoading,
    analyticsError,
    chartData.length === 0,
  );
  const satisfactionStatus = toStatus(
    analyticsLoading,
    analyticsError,
    chartData.length === 0,
  );
  const channelStatus = toStatus(
    channelLoading,
    channelError,
    pieData.length === 0,
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title={t("analytics.title")}
            description={t("analytics.subtitle")}
          />
          <div className="flex flex-wrap gap-2">
            <Select
              value={dateRange.toString()}
              onValueChange={(v) => setDateRange(parseInt(v))}
            >
              <SelectTrigger
                className="w-[180px]"
                aria-label={t("analytics.dateRange.label")}
              >
                <Calendar className="me-2 h-4 w-4" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">
                  {t("analytics.dateRange.last7")}
                </SelectItem>
                <SelectItem value="30">
                  {t("analytics.dateRange.last30")}
                </SelectItem>
                <SelectItem value="90">
                  {t("analytics.dateRange.last90")}
                </SelectItem>
                <SelectItem value="180">
                  {t("analytics.dateRange.last6months")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={channelFilter}
              onValueChange={(v) => setChannelFilter(v as ChannelFilter)}
            >
              <SelectTrigger
                className="w-[180px]"
                aria-label={t("analytics.channelFilter.label")}
              >
                <SelectValue placeholder={t("analytics.channelFilter.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("analytics.channelFilter.all")}
                </SelectItem>
                <SelectItem value="whatsapp">
                  {t("analytics.channels.whatsapp")}
                </SelectItem>
                <SelectItem value="messenger">
                  {t("analytics.channels.messenger")}
                </SelectItem>
                <SelectItem value="sms">
                  {t("analytics.channels.sms")}
                </SelectItem>
                <SelectItem value="voice">
                  {t("analytics.channels.voice")}
                </SelectItem>
                <SelectItem value="email">
                  {t("analytics.channels.email")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={handleExport}
              disabled={chartData.length === 0}
            >
              <Download className="h-4 w-4 me-2" aria-hidden="true" />
              {t("analytics.export")}
            </Button>
          </div>
        </div>

        {/*
          Summary metric cards. Single column below 768px per Requirement 17.7
          (md = 768). All cards share the same color / spacing / typography /
          radius / elevation tokens via the Card primitive (Requirement 17.1).
        */}
        <AsyncBoundary
          status={summaryStatus}
          skeleton={
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-28 w-full rounded-lg"
                  aria-hidden="true"
                />
              ))}
            </div>
          }
          onRetry={() => refetchSummary()}
          errorTitle={t("analytics.loadErrorTitle")}
          errorDescription={t("analytics.loadErrorDescription")}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("analytics.summary.totalSessions")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryStats?.totalSessions ?? 0}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("analytics.summary.completed", {
                    count: summaryStats?.completedSessions ?? 0,
                  })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("analytics.summary.resolutionRate")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(summaryStats?.resolutionRate ?? 0).toFixed(1)}%
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("analytics.summary.completionRate")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("analytics.summary.avgSatisfaction")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryStats?.avgSatisfaction ?? "0.0"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("analytics.summary.outOf5")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("analytics.summary.avgWaitTime")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round((summaryStats?.avgWaitTime ?? 0) / 60)}m
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("analytics.summary.beforeResponse")}
                </p>
              </CardContent>
            </Card>
          </div>
        </AsyncBoundary>

        {/*
          Charts. `lg:grid-cols-2` keeps the layout single-column below 1024px,
          which satisfies the single-column-below-768px requirement (17.7).
        */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("analytics.charts.activityTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AsyncBoundary
                status={activityStatus}
                skeleton={<ChartSkeleton />}
                onRetry={() => refetchAnalytics()}
                emptyTitle={t("analytics.empty")}
                emptyDescription={t("analytics.emptyDescription")}
                errorTitle={t("analytics.loadErrorTitle")}
                errorDescription={t("analytics.loadErrorDescription")}
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="date"
                        reversed={isRtl}
                        tick={AXIS_TICK}
                        stroke="hsl(var(--border))"
                      />
                      <YAxis
                        orientation={isRtl ? "right" : "left"}
                        tick={AXIS_TICK}
                        stroke="hsl(var(--border))"
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="sessions"
                        name={t("analytics.series.sessions")}
                        stackId="1"
                        stroke="hsl(var(--chart-primary))"
                        fill="hsl(var(--chart-primary))"
                      />
                      <Area
                        type="monotone"
                        dataKey="messages"
                        name={t("analytics.series.messages")}
                        stackId="1"
                        stroke="hsl(var(--chart-secondary))"
                        fill="hsl(var(--chart-secondary))"
                      />
                      <Area
                        type="monotone"
                        dataKey="calls"
                        name={t("analytics.series.calls")}
                        stackId="1"
                        stroke="hsl(var(--chart-success))"
                        fill="hsl(var(--chart-success))"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </AsyncBoundary>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("analytics.charts.channelTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AsyncBoundary
                status={channelStatus}
                skeleton={<ChartSkeleton />}
                onRetry={() => refetchChannels()}
                emptyTitle={t("analytics.empty")}
                emptyDescription={t("analytics.emptyDescription")}
                errorTitle={t("analytics.loadErrorTitle")}
                errorDescription={t("analytics.loadErrorDescription")}
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        dataKey="value"
                        nameKey="name"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/*
                  Text + swatch legend so channel meaning is carried by a label,
                  not color alone (Requirements 3.5, 17.2), with token-driven
                  contrast-compliant text.
                */}
                <ul className="mt-4 grid grid-cols-2 gap-2">
                  {pieData.map((item) => (
                    <li
                      key={item.channel}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="ms-auto font-semibold text-foreground">
                        {item.value}%
                      </span>
                    </li>
                  ))}
                </ul>
              </AsyncBoundary>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.charts.satisfactionTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              status={satisfactionStatus}
              skeleton={<ChartSkeleton />}
              onRetry={() => refetchAnalytics()}
              emptyTitle={t("analytics.empty")}
              emptyDescription={t("analytics.emptyDescription")}
              errorTitle={t("analytics.loadErrorTitle")}
              errorDescription={t("analytics.loadErrorDescription")}
            >
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      reversed={isRtl}
                      tick={AXIS_TICK}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      domain={[0, 5]}
                      orientation={isRtl ? "right" : "left"}
                      tick={AXIS_TICK}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="satisfaction"
                      name={t("analytics.series.satisfaction")}
                      stroke="hsl(var(--chart-info))"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </AsyncBoundary>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
