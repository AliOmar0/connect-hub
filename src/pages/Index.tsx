import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  MetricCard,
  MetricCardSkeleton,
} from "@/components/dashboard/MetricCard";
import ConversationsChart from "@/components/dashboard/ConversationsChart";
import ChannelDistributionChart from "@/components/dashboard/ChannelDistributionChart";
import ActiveSessionsPanel from "@/components/dashboard/ActiveSessionsPanel";
import EmployeesTable from "@/components/dashboard/EmployeesTable";
import IntegrationStatus from "@/components/dashboard/IntegrationStatus";
import ResponseTimeChart from "@/components/dashboard/ResponseTimeChart";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import type { ViewStatus } from "@/types/presentation";
import {
  Users,
  Headphones,
  Clock,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth } from "date-fns";

export default function Index() {
  const { t, i18n } = useTranslation();
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const lastMonthStart = startOfMonth(subDays(now, 30));

      // Total Messages (this month)
      const { count: messagesCount } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString());

      // Total Messages (last month for trend)
      const { count: lastMonthMessages } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", lastMonthStart.toISOString())
        .lt("created_at", monthStart.toISOString());

      // Total Calls (this month)
      const { count: callsCount } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString());

      // Total Calls (last month for trend)
      const { count: lastMonthCalls } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .gte("created_at", lastMonthStart.toISOString())
        .lt("created_at", monthStart.toISOString());

      // Active Sessions (Live)
      const { count: activeSessions } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .in("status", ["active", "waiting", "escalated"]);

      // Active Agents
      const { count: activeAgents } = await supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Distinct customers seen this month. Counted from `customers` by
      // creation date rather than from sessions: a session row per contact
      // would count the same person once per conversation.
      const { count: uniqueCustomers } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString());

      // Avg Response Time (today)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayAnalyticsData } = await supabase
        .from("analytics_daily")
        .select("avg_response_time_seconds")
        .eq("date", format(todayStart, "yyyy-MM-dd"));

      const avgResponseTimeSeconds =
        todayAnalyticsData && todayAnalyticsData.length > 0
          ? todayAnalyticsData.reduce(
              (sum, a) => sum + (a.avg_response_time_seconds || 0),
              0,
            ) / todayAnalyticsData.length
          : 0;

      // Resolution Rate (this week)
      const weekStart = subDays(now, 7);
      const { data: completedSessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("status", "completed")
        .gte("ended_at", weekStart.toISOString());

      const { data: allWeekSessions } = await supabase
        .from("sessions")
        .select("id")
        .gte("started_at", weekStart.toISOString());

      const resolutionRate =
        allWeekSessions && allWeekSessions.length > 0
          ? Math.round(
              ((completedSessions?.length || 0) / allWeekSessions.length) * 100,
            )
          : 0;

      // Calculate trends
      const messagesTrend =
        lastMonthMessages && lastMonthMessages > 0
          ? ((messagesCount || 0) / lastMonthMessages - 1) * 100
          : 0;

      const callsTrend =
        lastMonthCalls && lastMonthCalls > 0
          ? ((callsCount || 0) / lastMonthCalls - 1) * 100
          : 0;

      return {
        messages: {
          count: messagesCount || 0,
          trend: messagesTrend,
        },
        calls: {
          count: callsCount || 0,
          trend: callsTrend,
        },
        uniqueCustomers: uniqueCustomers || 0,
        activeSessions: activeSessions || 0,
        activeAgents: activeAgents || 0,
        avgResponseTime: avgResponseTimeSeconds
          ? `${(avgResponseTimeSeconds / 60).toFixed(1)}m`
          : "0m",
        resolutionRate,
      };
    },
  });

  const {
    data: channelData,
    isLoading: channelLoading,
    isError: channelError,
    refetch: refetchChannels,
  } = useQuery({
    // The language is part of the key: the slice labels are translated inside
    // the query, so a cached result from another locale would show stale names.
    queryKey: ["dashboard-channels", i18n.language],
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from("sessions")
        .select("channel")
        .gte("started_at", startOfMonth(new Date()).toISOString());

      if (!sessions) return [];

      const channelCounts: Record<string, number> = {};
      sessions.forEach((s) => {
        channelCounts[s.channel] = (channelCounts[s.channel] || 0) + 1;
      });

      const total = sessions.length;
      const channelTypes = ["whatsapp", "messenger", "voice", "sms", "email"];

      return channelTypes.map((channel) => {
        const count = channelCounts[channel] || 0;
        return {
          // The shared channel catalogue rather than capitalising the raw key,
          // which rendered "Whatsapp", and rather than a hard-coded English
          // "Phone Calls" in an Arabic-first product.
          name: t(`sessions.channels.${channel}`, { defaultValue: channel }),
          value: total > 0 ? Math.round((count / total) * 100) : 0,
          color:
            channel === "whatsapp"
              ? "hsl(var(--chart-success))"
              : channel === "messenger"
                ? "hsl(var(--chart-info))"
                : channel === "voice"
                  ? "hsl(var(--chart-warning))"
                  : "hsl(var(--status-neutral))",
        };
      });
    },
  });

  const {
    data: activeSessions,
    isLoading: activeSessionsLoading,
    isError: activeSessionsError,
    refetch: refetchActiveSessions,
  } = useQuery({
    queryKey: ["dashboard-active-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          // `sessions` has TWO foreign keys to `employees` (employee_id and
          // escalated_to). The employee embed MUST name the FK or PostgREST
          // can't disambiguate and returns an error (data => null), which is why
          // the Active Sessions panel was always empty.
          // `messages` is embedded so the panel can show a live last-message
          // preview (voice calls persist their transcript here too).
          "*, customer:customers(*), employee:employees!sessions_employee_id_fkey(*, profile:profiles(*)), messages(content, sent_at, direction)",
        )
        .in("status", ["active", "waiting", "escalated"])
        .order("started_at", { ascending: false })
        .limit(5);

      if (error) {
        console.error("Failed to load active sessions:", error.message);
      }
      return data || [];
    },
  });

  useEffect(() => {
    // Real-time subscription to the sessions table
    const sessionChannel = supabase
      .channel("dashboard-sessions-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
        },
        () => {
          refetchStats();
          refetchActiveSessions();
        },
      )
      .subscribe();

    // Also update when messages arrive (if you want real-time stat updates for message counts)
    const messageChannel = supabase
      .channel("dashboard-messages-sync")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          refetchStats();
          refetchActiveSessions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [refetchStats, refetchActiveSessions]);

  const {
    data: employees,
    isLoading: employeesLoading,
    isError: employeesError,
    refetch: refetchEmployees,
  } = useQuery({
    queryKey: ["dashboard-employees"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("*, profile:profiles(*)")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5);

      return data || [];
    },
  });

  const {
    data: integrations,
    isLoading: integrationsLoading,
    isError: integrationsError,
    refetch: refetchIntegrations,
  } = useQuery({
    queryKey: ["dashboard-integrations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("api_configurations")
        .select("*")
        .order("channel");

      return data || [];
    },
  });

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  const toStatus = (loading: boolean, error: boolean): ViewStatus =>
    loading ? "loading" : error ? "error" : "loaded";

  const statsStatus = toStatus(statsLoading, statsError);

  // Metric definitions. Each card renders through its own AsyncBoundary so a
  // load failure surfaces a per-card ErrorState with a retry action
  // (Requirements 12.2, 12.3), while sharing one set of color/spacing/
  // Metric hierarchy (Requirement 12.1). Six coequal cards meant nothing was
  // primary, and two of them were month-to-date accounting figures sitting
  // beside a live count. The one number a supervisor acts on is promoted; the
  // accounting totals move to a subordinate strip below.
  const primaryMetric = {
    key: "activeSessions",
    label: t("dashboard.metrics.activeSessions"),
    value: (stats?.activeSessions || 0).toString(),
    hint: t("dashboard.metrics.activeSessionsHint"),
    icon: Headphones,
    tone: "success" as const,
  };

  const supportingMetrics = [
    {
      key: "activeAgents",
      label: t("dashboard.metrics.activeAgents"),
      value: (stats?.activeAgents || 0).toString(),
      hint: t("dashboard.metrics.activeAgentsHint"),
      icon: Users,
      tone: "info" as const,
    },
    {
      key: "avgResponse",
      label: t("dashboard.metrics.avgResponse"),
      value: stats?.avgResponseTime || "0m",
      hint: t("dashboard.metrics.avgResponseHint"),
      icon: Clock,
      tone: "warning" as const,
    },
    {
      key: "resolutionRate",
      label: t("dashboard.metrics.resolutionRate"),
      value: `${stats?.resolutionRate || 0}%`,
      hint: t("dashboard.metrics.resolutionRateHint"),
      icon: CheckCircle2,
      tone: "success" as const,
    },
  ];

  const monthToDate = [
    {
      key: "messages",
      label: t("dashboard.metrics.messages"),
      value: formatNumber(stats?.messages.count || 0),
    },
    {
      key: "calls",
      label: t("dashboard.metrics.calls"),
      value: formatNumber(stats?.calls.count || 0),
    },
    {
      key: "uniqueCustomers",
      label: t("dashboard.metrics.uniqueCustomers"),
      value: formatNumber(stats?.uniqueCustomers || 0),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title={t("dashboard.title")}
          description={t("dashboard.subtitle")}
        />

        {/*
          Stats Grid. Single column below 768px per Requirement 12.6 (md = 768).
          Under RTL the grid mirrors automatically because the container inherits
          the document direction, so metric-card order follows RTL reading order
          (Requirement 12.5).
        */}
        {/* One hero figure and three supporting ones, not four coequal cards:
            the hero is the number a supervisor acts on, and it is sized and
            coloured to win. It holds a fixed 356px on a wide screen and drops
            to full width below `lg`, where a row of four does not fit. */}
        <div className="flex flex-col gap-4 lg:flex-row">
          <AsyncBoundary
            status={statsStatus}
            skeleton={<MetricCardSkeleton variant="hero" />}
            onRetry={() => refetchStats()}
          >
            <MetricCard
              variant="hero"
              overline={t("dashboard.metrics.liveNow")}
              badge={t("dashboard.metrics.liveBadge")}
              label={primaryMetric.label}
              value={primaryMetric.value}
              hint={primaryMetric.hint}
              className="lg:w-[356px] lg:shrink-0"
            />
          </AsyncBoundary>

          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
            {supportingMetrics.map((card) => (
              <AsyncBoundary
                key={card.key}
                status={statsStatus}
                skeleton={<MetricCardSkeleton />}
                onRetry={() => refetchStats()}
              >
                <MetricCard
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  icon={card.icon}
                  tone={card.tone}
                />
              </AsyncBoundary>
            ))}
          </div>
        </div>

        {/* Month-to-date accounting totals, deliberately subordinate: they are
            not something anyone acts on during a shift. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-secondary/40 px-5 py-3">
          <span className="text-overline uppercase text-muted-foreground">
            {t("dashboard.metrics.monthToDate")}
          </span>
          {monthToDate.map((item) => (
            <span key={item.key} className="flex items-baseline gap-2">
              <span className="text-body-sm text-muted-foreground">
                {item.label}
              </span>
              <span className="font-display text-body font-bold tabular-nums text-foreground">
                {item.value}
              </span>
            </span>
          ))}
          {/* Where these totals can actually be interrogated. Without it the
              strip is a dead end. */}
          <Link
            to="/analytics"
            className="ms-auto inline-flex min-h-[44px] items-center gap-1 text-body-sm font-medium text-primary hover:underline"
          >
            {t("dashboard.metrics.viewAnalytics")}
            <ArrowRight
              className="h-4 w-4 rtl:-scale-x-100"
              aria-hidden="true"
            />
          </Link>
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ConversationsChart />
          </div>
          <AsyncBoundary
            status={toStatus(channelLoading, channelError)}
            skeleton={<Skeleton className="h-[360px] w-full rounded-xl" />}
            onRetry={() => refetchChannels()}
          >
            <ChannelDistributionChart data={channelData || []} />
          </AsyncBoundary>
        </div>

        {/* Active Sessions & Response Time */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AsyncBoundary
              status={toStatus(activeSessionsLoading, activeSessionsError)}
              skeleton={<Skeleton className="h-[360px] w-full rounded-lg" />}
              onRetry={() => refetchActiveSessions()}
            >
              <ActiveSessionsPanel sessions={activeSessions || []} />
            </AsyncBoundary>
          </div>
          <ResponseTimeChart />
        </div>

        {/* Team & Integrations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AsyncBoundary
            status={toStatus(employeesLoading, employeesError)}
            skeleton={<Skeleton className="h-[360px] w-full rounded-lg" />}
            onRetry={() => refetchEmployees()}
          >
            <EmployeesTable employees={employees || []} />
          </AsyncBoundary>
          <AsyncBoundary
            status={toStatus(integrationsLoading, integrationsError)}
            skeleton={<Skeleton className="h-[360px] w-full rounded-lg" />}
            onRetry={() => refetchIntegrations()}
          >
            <IntegrationStatus integrations={integrations || []} />
          </AsyncBoundary>
        </div>
      </div>
    </DashboardLayout>
  );
}
