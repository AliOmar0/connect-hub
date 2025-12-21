import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  BarChart,
  Bar,
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
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<number>(30);
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const { data: analyticsData, isLoading } = useQuery({
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

      if (error) {
        console.error("Error fetching analytics:", error);
        return null;
      }

      return data;
    },
  });

  const { data: summaryStats } = useQuery({
    queryKey: ["analytics-summary", dateRange],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = subDays(endDate, dateRange);

      // Get raw data for calculations
      const { data: sessions } = await supabase
        .from("sessions")
        .select("status, satisfaction_score, wait_time_seconds, duration_seconds")
        .gte("started_at", startDate.toISOString());

      const { data: messages } = await supabase
        .from("messages")
        .select("id")
        .gte("created_at", startDate.toISOString());

      const { data: calls } = await supabase
        .from("calls")
        .select("id, duration_seconds")
        .gte("started_at", startDate.toISOString());

      const totalSessions = sessions?.length || 0;
      const completedSessions = sessions?.filter((s) => s.status === "completed").length || 0;
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
        resolutionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
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
  const { data: channelData } = useQuery({
    queryKey: ["analytics-channels", dateRange],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = subDays(endDate, dateRange);

      const { data: sessions } = await supabase
        .from("sessions")
        .select("channel")
        .gte("started_at", startDate.toISOString());

      if (!sessions) return [];

      const channelCounts: Record<string, number> = {};
      sessions.forEach((s) => {
        channelCounts[s.channel] = (channelCounts[s.channel] || 0) + 1;
      });

      const total = sessions.length;
      const colors = {
        whatsapp: "hsl(142, 70%, 45%)",
        messenger: "hsl(220, 90%, 56%)",
        sms: "hsl(280, 70%, 50%)",
        voice: "hsl(45, 95%, 50%)",
        email: "hsl(0, 70%, 50%)",
      };

      return Object.entries(channelCounts).map(([channel, count]) => ({
        name: channel.charAt(0).toUpperCase() + channel.slice(1),
        value: total > 0 ? Math.round((count / total) * 100) : 0,
        count,
        color: colors[channel as keyof typeof colors] || "hsl(220, 20%, 70%)",
      }));
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-display font-bold tracking-tight">
              Analytics
            </h1>
            <p className="text-muted-foreground">
              In-depth analytics and reporting for your communication center.
            </p>
          </div>
          <div className="flex gap-2">
            <Select
              value={dateRange.toString()}
              onValueChange={(v) => setDateRange(parseInt(v))}
            >
              <SelectTrigger className="w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 6 months</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="messenger">Messenger</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="voice">Voice</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        {summaryStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.totalSessions}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {summaryStats.completedSessions} completed
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Resolution Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryStats.resolutionRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">Completion rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg Satisfaction
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.avgSatisfaction}</div>
                <p className="text-xs text-muted-foreground mt-1">Out of 5.0</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg Wait Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round(summaryStats.avgWaitTime / 60)}m
                </div>
                <p className="text-xs text-muted-foreground mt-1">Before response</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="sessions"
                      stackId="1"
                      stroke="hsl(220, 55%, 35%)"
                      fill="hsl(220, 55%, 35%)"
                    />
                    <Area
                      type="monotone"
                      dataKey="messages"
                      stackId="1"
                      stroke="hsl(45, 95%, 55%)"
                      fill="hsl(45, 95%, 55%)"
                    />
                    <Area
                      type="monotone"
                      dataKey="calls"
                      stackId="1"
                      stroke="hsl(142, 70%, 45%)"
                      fill="hsl(142, 70%, 45%)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Channel Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelData || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {(channelData || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Satisfaction Score Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 5]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="satisfaction"
                    stroke="hsl(45, 95%, 55%)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
