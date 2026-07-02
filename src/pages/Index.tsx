import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import ConversationsChart from "@/components/dashboard/ConversationsChart";
import ChannelDistributionChart from "@/components/dashboard/ChannelDistributionChart";
import ActiveSessionsPanel from "@/components/dashboard/ActiveSessionsPanel";
import EmployeesTable from "@/components/dashboard/EmployeesTable";
import IntegrationStatus from "@/components/dashboard/IntegrationStatus";
import ResponseTimeChart from "@/components/dashboard/ResponseTimeChart";
import {
  MessageSquare,
  Phone,
  Users,
  Headphones,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth } from "date-fns";

export default function Index() {
  const {
    data: stats,
    isLoading: statsLoading,
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
        activeSessions: activeSessions || 0,
        activeAgents: activeAgents || 0,
        avgResponseTime: avgResponseTimeSeconds
          ? `${(avgResponseTimeSeconds / 60).toFixed(1)}m`
          : "0m",
        resolutionRate,
      };
    },
  });

  const { data: weeklyData } = useQuery({
    queryKey: ["dashboard-weekly"],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        days.push(format(date, "yyyy-MM-dd"));
      }

      const data = await Promise.all(
        days.map(async (date) => {
          const { data: analytics } = await supabase
            .from("analytics_daily")
            .select("total_messages, total_calls")
            .eq("date", date);

          const totalMessages =
            analytics?.reduce((sum, a) => sum + (a.total_messages || 0), 0) ||
            0;
          const totalCalls =
            analytics?.reduce((sum, a) => sum + (a.total_calls || 0), 0) || 0;

          return {
            name: format(new Date(date), "EEE"),
            messages: totalMessages,
            calls: totalCalls,
          };
        }),
      );

      return data;
    },
  });

  const { data: channelData } = useQuery({
    queryKey: ["dashboard-channels"],
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
          name:
            channel === "voice"
              ? "Phone Calls"
              : channel.charAt(0).toUpperCase() + channel.slice(1),
          value: total > 0 ? Math.round((count / total) * 100) : 0,
          color:
            channel === "whatsapp"
              ? "hsl(142, 70%, 45%)"
              : channel === "messenger"
                ? "hsl(220, 90%, 56%)"
                : channel === "voice"
                  ? "hsl(45, 95%, 50%)"
                  : "hsl(220, 20%, 70%)",
        };
      });
    },
  });

  const {
    data: activeSessions,
    isLoading: activeSessionsLoading,
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

  const { data: employees } = useQuery({
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

  const { data: responseTimeData } = useQuery({
    queryKey: ["dashboard-response-time"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const hours = [];
      for (let i = 6; i <= 20; i += 2) {
        hours.push(i);
      }

      // For now, return mock data structure - can be enhanced with actual hourly data
      return hours.map((hour) => ({
        hour: hour < 12 ? `${hour}AM` : hour === 12 ? "12PM" : `${hour - 12}PM`,
        time: 2 + Math.random() * 2, // Mock data - replace with actual hourly averages
      }));
    },
  });

  const { data: integrations } = useQuery({
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Dashboard
          </h1>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatsCard
            title="Total Messages"
            value={
              statsLoading ? "..." : formatNumber(stats?.messages.count || 0)
            }
            icon={MessageSquare}
            trend={
              stats?.messages.trend
                ? {
                    value: Math.abs(stats.messages.trend),
                    isPositive: stats.messages.trend > 0,
                  }
                : undefined
            }
            subtitle="This month"
            variant="navy"
          />
          <StatsCard
            title="Total Calls"
            value={statsLoading ? "..." : formatNumber(stats?.calls.count || 0)}
            icon={Phone}
            trend={
              stats?.calls.trend
                ? {
                    value: Math.abs(stats.calls.trend),
                    isPositive: stats.calls.trend > 0,
                  }
                : undefined
            }
            subtitle="This month"
            variant="gold"
          />
          <StatsCard
            title="Active Sessions"
            value={
              statsLoading ? "..." : (stats?.activeSessions || 0).toString()
            }
            icon={Headphones}
            subtitle="Right now"
            variant="success"
          />
          <StatsCard
            title="Active Agents"
            value={statsLoading ? "..." : (stats?.activeAgents || 0).toString()}
            icon={Users}
            subtitle="Online"
            variant="default"
          />
          <StatsCard
            title="Avg. Response"
            value={statsLoading ? "..." : stats?.avgResponseTime || "0m"}
            icon={Clock}
            subtitle="Today"
            variant="warning"
          />
          <StatsCard
            title="Resolution Rate"
            value={statsLoading ? "..." : `${stats?.resolutionRate || 0}%`}
            icon={CheckCircle2}
            subtitle="This week"
            variant="success"
          />
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ConversationsChart data={weeklyData || []} />
          <ChannelDistributionChart data={channelData || []} />
        </div>

        {/* Active Sessions & Response Time */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ActiveSessionsPanel sessions={activeSessions || []} />
          </div>
          <ResponseTimeChart data={responseTimeData || []} />
        </div>

        {/* Team & Integrations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <EmployeesTable employees={employees || []} />
          <IntegrationStatus integrations={integrations || []} />
        </div>
      </div>
    </DashboardLayout>
  );
}
