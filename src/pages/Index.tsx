import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard, { StatsCardSkeleton } from "@/components/dashboard/StatsCard";
import ConversationsChart from "@/components/dashboard/ConversationsChart";
import ChannelDistributionChart from "@/components/dashboard/ChannelDistributionChart";
import ActiveSessionsPanel from "@/components/dashboard/ActiveSessionsPanel";
import EmployeesTable from "@/components/dashboard/EmployeesTable";
import IntegrationStatus from "@/components/dashboard/IntegrationStatus";
import ResponseTimeChart from "@/components/dashboard/ResponseTimeChart";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/feedback";
import type { ViewStatus } from "@/types/presentation";
import {
  MessageSquare,
  Phone,
  Users,
  Headphones,
  Clock,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, subDays, startOfMonth } from "date-fns";

export default function Index() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
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
      const { count: messagesCount, error: messagesError } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString());

      // Total Messages (last month for trend)
      const { count: lastMonthMessages, error: lastMonthMessagesError } =
        await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .gte("created_at", lastMonthStart.toISOString())
          .lt("created_at", monthStart.toISOString());

      // Total Calls (this month)
      const { count: callsCount, error: callsError } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString());

      // Total Calls (last month for trend)
      const { count: lastMonthCalls, error: lastMonthCallsError } =
        await supabase
          .from("calls")
          .select("*", { count: "exact", head: true })
          .gte("created_at", lastMonthStart.toISOString())
          .lt("created_at", monthStart.toISOString());

      // Active Sessions (Live)
      const { count: activeSessions, error: activeSessionsError } =
        await supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .in("status", ["active", "waiting", "escalated"]);

      // Active Agents
      const { count: activeAgents, error: activeAgentsError } = await supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Avg Response Time (today)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayAnalyticsData, error: todayAnalyticsError } =
        await supabase
          .from("analytics_daily")
          .select("avg_response_time_seconds")
          .eq("date", format(todayStart, "yyyy-MM-dd"));

      if (todayAnalyticsError) throw todayAnalyticsError;
      const responseTimeValues =
        todayAnalyticsData
          ?.map((item) => item.avg_response_time_seconds)
          .filter((value): value is number => value != null) ?? [];
      const avgResponseTimeSeconds = responseTimeValues.length
        ? responseTimeValues.reduce((sum, value) => sum + value, 0) /
          responseTimeValues.length
        : null;

      // Resolution Rate (this week)
      const weekStart = subDays(now, 7);
      const { data: completedSessions, error: completedSessionsError } =
        await supabase
          .from("sessions")
          .select("id")
          .eq("status", "completed")
          .gte("ended_at", weekStart.toISOString());

      const { data: allWeekSessions, error: allWeekSessionsError } =
        await supabase
          .from("sessions")
          .select("id")
          .gte("started_at", weekStart.toISOString());

      const statsQueryError = [
        messagesError,
        lastMonthMessagesError,
        callsError,
        lastMonthCallsError,
        activeSessionsError,
        activeAgentsError,
        completedSessionsError,
        allWeekSessionsError,
      ].find(Boolean);

      if (statsQueryError) throw statsQueryError;

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
        activeSessions: activeSessions || 0,
        activeAgents: activeAgents || 0,
        avgResponseTime:
          avgResponseTimeSeconds == null
            ? "—"
            : `${(avgResponseTimeSeconds / 60).toFixed(1)}m`,
        resolutionRate,
      };
    },
  });

  const {
    data: weeklyData,
    isLoading: weeklyLoading,
    isError: weeklyError,
    refetch: refetchWeekly,
  } = useQuery({
    queryKey: ["dashboard-weekly"],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        days.push(format(date, "yyyy-MM-dd"));
      }

      const data = await Promise.all(
        days.map(async (date) => {
          const { data: analytics, error } = await supabase
            .from("analytics_daily")
            .select("total_messages, total_calls")
            .eq("date", date);

          if (error) throw error;

          const totalMessages =
            analytics?.reduce((sum, a) => sum + (a.total_messages || 0), 0) ||
            0;
          const totalCalls =
            analytics?.reduce((sum, a) => sum + (a.total_calls || 0), 0) || 0;

          return {
            name: format(new Date(date), "EEE"),
            messages: totalMessages,
            calls: totalCalls,
            hasRecords: Boolean(analytics?.length),
          };
        }),
      );

      return data
        .filter((item) => item.hasRecords)
        .map((item) => ({
          name: item.name,
          messages: item.messages,
          calls: item.calls,
        }));
    },
  });

  const {
    data: channelData,
    isLoading: channelLoading,
    isError: channelError,
    refetch: refetchChannels,
  } = useQuery({
    queryKey: ["dashboard-channels"],
    queryFn: async () => {
      const { data: sessions, error } = await supabase
        .from("sessions")
        .select("channel")
        .gte("started_at", startOfMonth(new Date()).toISOString());

      if (error) throw error;
      if (!sessions?.length) return [];

      const channelCounts: Record<string, number> = {};
      sessions.forEach((s) => {
        channelCounts[s.channel] = (channelCounts[s.channel] || 0) + 1;
      });

      const total = sessions.length;
      const channelTypes = ["whatsapp", "messenger", "voice", "sms", "email"];

      return channelTypes.map((channel) => {
        const count = channelCounts[channel] || 0;
        return {
          name:
            channel === "voice"
              ? "Phone Calls"
              : channel.charAt(0).toUpperCase() + channel.slice(1),
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

      if (error) throw error;
      return data ?? [];
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
      const { data, error } = await supabase
        .from("employees")
        .select("*, profile:profiles(*)")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: responseTimeData,
    isLoading: responseTimeLoading,
    isError: responseTimeError,
    refetch: refetchResponseTime,
  } = useQuery({
    queryKey: ["dashboard-response-time"],
    queryFn: async () => {
      const today = new Date();
      const firstDay = format(subDays(today, 6), "yyyy-MM-dd");
      const lastDay = format(today, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("analytics_daily")
        .select("date, avg_response_time_seconds")
        .gte("date", firstDay)
        .lte("date", lastDay)
        .order("date", { ascending: true });

      if (error) throw error;

      const dailyValues = new Map<string, { total: number; count: number }>();
      data?.forEach((record) => {
        if (record.avg_response_time_seconds == null) return;
        const current = dailyValues.get(record.date) ?? { total: 0, count: 0 };
        dailyValues.set(record.date, {
          total: current.total + record.avg_response_time_seconds,
          count: current.count + 1,
        });
      });

      return Array.from(dailyValues.entries()).map(([date, value]) => ({
        date: format(parseISO(date), "EEE"),
        time: value.total / value.count / 60,
      }));
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
      const { data, error } = await supabase
        .from("api_configurations")
        .select("*")
        .order("channel");

      if (error) throw error;
      return data ?? [];
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

  const toDataStatus = (
    loading: boolean,
    error: boolean,
    hasData: boolean,
  ): ViewStatus =>
    loading ? "loading" : error ? "error" : hasData ? "loaded" : "empty";

  const initialQueriesFailed =
    statsError ||
    weeklyError ||
    channelError ||
    activeSessionsError ||
    employeesError ||
    responseTimeError ||
    integrationsError;

  const allInitialQueriesSettled =
    !statsLoading &&
    !weeklyLoading &&
    !channelLoading &&
    !activeSessionsLoading &&
    !employeesLoading &&
    !responseTimeLoading &&
    !integrationsLoading;

  useEffect(() => {
    if (allInitialQueriesSettled && !initialQueriesFailed && !lastRefreshedAt) {
      setLastRefreshedAt(new Date());
    }
  }, [allInitialQueriesSettled, initialQueriesFailed, lastRefreshedAt]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries(
        {
          predicate: (query) => {
            const key = query.queryKey[0];
            return (
              (typeof key === "string" && key.startsWith("dashboard-")) ||
              key === "employee-stats"
            );
          },
        },
        { throwOnError: true },
      );
      setLastRefreshedAt(new Date());
      notifySuccess(t("dashboard.refresh.success"));
    } catch {
      notifyError(t("dashboard.refresh.error"), {
        description: t("dashboard.refresh.errorDescription"),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const statsStatus = toStatus(statsLoading, statsError);
  const activeSessionsStatus = toDataStatus(
    activeSessionsLoading,
    activeSessionsError,
    Boolean(activeSessions?.length),
  );
  const employeesStatus = toDataStatus(
    employeesLoading,
    employeesError,
    Boolean(employees?.length),
  );
  const integrationsStatus = toDataStatus(
    integrationsLoading,
    integrationsError,
    Boolean(integrations?.length),
  );
  const responseTimeStatus = toDataStatus(
    responseTimeLoading,
    responseTimeError,
    Boolean(responseTimeData?.length),
  );

  // Metric definitions. Each card renders through its own AsyncBoundary so a
  // load failure surfaces a per-card ErrorState with a retry action
  // (Requirements 12.2, 12.3), while sharing one set of color/spacing/
  // typography/radius/elevation tokens via StatsCard (Requirement 12.1).
  const metricCards = [
    {
      key: "messages",
      title: "Total Messages",
      value: formatNumber(stats?.messages.count || 0),
      icon: MessageSquare,
      trend: stats?.messages.trend
        ? {
            value: Math.abs(stats.messages.trend),
            isPositive: stats.messages.trend > 0,
          }
        : undefined,
      subtitle: "This month",
      variant: "navy" as const,
    },
    {
      key: "calls",
      title: "Total Calls",
      value: formatNumber(stats?.calls.count || 0),
      icon: Phone,
      trend: stats?.calls.trend
        ? {
            value: Math.abs(stats.calls.trend),
            isPositive: stats.calls.trend > 0,
          }
        : undefined,
      subtitle: "This month",
      variant: "gold" as const,
    },
    {
      key: "activeSessions",
      title: "Active Sessions",
      value: (stats?.activeSessions || 0).toString(),
      icon: Headphones,
      subtitle: "Right now",
      variant: "success" as const,
    },
    {
      key: "activeAgents",
      title: "Active Agents",
      value: (stats?.activeAgents || 0).toString(),
      icon: Users,
      subtitle: "Online",
      variant: "default" as const,
    },
    {
      key: "avgResponse",
      title: "Avg. Response",
      value: stats?.avgResponseTime ?? "—",
      icon: Clock,
      subtitle: "Today",
      variant: "warning" as const,
    },
    {
      key: "resolutionRate",
      title: "Resolution Rate",
      value: `${stats?.resolutionRate || 0}%`,
      icon: CheckCircle2,
      subtitle: "This week",
      variant: "success" as const,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <header className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-card sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                Dashboard
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-chart-success/30 bg-chart-success/10 px-2.5 py-1 text-xs font-medium text-chart-success">
                <span
                  className="h-2 w-2 rounded-full bg-chart-success motion-safe:animate-pulse"
                  aria-hidden="true"
                />
                Live session updates
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Monitor current support activity and performance trends across the
              most recent 7 days.
            </p>
            <p
              className="mt-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {lastRefreshedAt
                ? `Last refreshed at ${lastRefreshedAt.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : "Waiting for the latest dashboard data"}
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label={
              isRefreshing
                ? "Refreshing dashboard data"
                : "Refresh dashboard data"
            }
            aria-busy={isRefreshing}
          >
            <RefreshCw
              className={`me-2 h-4 w-4 ${isRefreshing ? "motion-safe:animate-spin" : ""}`}
              aria-hidden="true"
            />
            {isRefreshing ? "Refreshing…" : "Refresh data"}
          </Button>
        </header>

        {/*
          Stats Grid. Single column below 768px per Requirement 12.6 (md = 768).
          Under RTL the grid mirrors automatically because the container inherits
          the document direction, so metric-card order follows RTL reading order
          (Requirement 12.5).
        */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {metricCards.map((card) => (
            <AsyncBoundary
              key={card.key}
              status={statsStatus}
              skeleton={<StatsCardSkeleton />}
              onRetry={() => refetchStats()}
            >
              <StatsCard
                title={card.title}
                value={card.value}
                icon={card.icon}
                trend={card.trend}
                subtitle={card.subtitle}
                variant={card.variant}
              />
            </AsyncBoundary>
          ))}
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AsyncBoundary
              status={toStatus(weeklyLoading, weeklyError)}
              skeleton={<Skeleton className="h-[360px] w-full rounded-xl" />}
              onRetry={() => refetchWeekly()}
            >
              <ConversationsChart data={weeklyData || []} />
            </AsyncBoundary>
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AsyncBoundary
              status={activeSessionsStatus}
              skeleton={<Skeleton className="h-[320px] w-full rounded-xl" />}
              onRetry={() => refetchActiveSessions()}
              emptyTitle="No active sessions"
              emptyDescription="Live calls and chats will appear here as they begin."
              errorTitle="Active sessions unavailable"
              errorDescription="We couldn't load live sessions. Try again."
            >
              <ActiveSessionsPanel sessions={activeSessions || []} />
            </AsyncBoundary>
          </div>
          <AsyncBoundary
            status={responseTimeStatus}
            skeleton={<Skeleton className="h-[320px] w-full rounded-xl" />}
            onRetry={() => refetchResponseTime()}
            emptyTitle="Response-time data unavailable"
            emptyDescription="No response-time records exist for the most recent 7 days."
            errorTitle="Response-time trend unavailable"
            errorDescription="We couldn't load response-time analytics. Try again."
          >
            <ResponseTimeChart data={responseTimeData || []} />
          </AsyncBoundary>
        </div>

        {/* Team & Integrations */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AsyncBoundary
              status={employeesStatus}
              skeleton={<Skeleton className="h-[360px] w-full rounded-xl" />}
              onRetry={() => refetchEmployees()}
              emptyTitle="No active employees"
              emptyDescription="Active team members will appear here once configured."
              errorTitle="Team overview unavailable"
              errorDescription="We couldn't load the active team. Try again."
            >
              <EmployeesTable employees={employees || []} />
            </AsyncBoundary>
          </div>
          <AsyncBoundary
            status={integrationsStatus}
            skeleton={<Skeleton className="h-[360px] w-full rounded-xl" />}
            onRetry={() => refetchIntegrations()}
            emptyTitle="No integrations configured"
            emptyDescription="Configure a channel in settings to track its connection status."
            errorTitle="Integration status unavailable"
            errorDescription="We couldn't load integration health. Try again."
          >
            <IntegrationStatus integrations={integrations || []} />
          </AsyncBoundary>
        </div>
      </div>
    </DashboardLayout>
  );
}
