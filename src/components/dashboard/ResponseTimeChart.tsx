import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDirection } from "@/hooks/use-direction";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, format, parseISO } from "date-fns";
import {
  AlertCircle,
  RefreshCw,
  Clock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── constants ─────────────────────────────────────────────────── */
const HOUR_SLOTS = [6, 8, 10, 12, 14, 16, 18, 20];
const CHANNELS = ["all", "whatsapp", "voice", "sms", "email"] as const;
type Channel = (typeof CHANNELS)[number];

const DATE_RANGES = [
  { label: "Today", value: 0 },
  { label: "7 Days", value: 7 },
  { label: "30 Days", value: 30 },
] as const;
type DateRange = (typeof DATE_RANGES)[number]["value"];

/* ─── helpers ───────────────────────────────────────────────────── */
const formatHour = (h: number) =>
  h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`;

const secToMin = (s: number) => Math.round((s / 60) * 10) / 10;

const getBarColor = (minutes: number, isSelected: boolean) => {
  const base =
    minutes <= 2
      ? "hsl(var(--chart-success))"
      : minutes <= 3
        ? "hsl(var(--chart-warning))"
        : "hsl(var(--destructive))";

  return isSelected ? base : `${base.replace(")", " / 0.5)")}`;
};

const getStatusLabel = (minutes: number) => {
  if (minutes === 0) return "No data";
  if (minutes <= 2) return "Excellent";
  if (minutes <= 3) return "Good";
  return "Needs Improvement";
};

/* ─── custom tooltip ─────────────────────────────────────────────── */
interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: { hour: string; count: number; rawSeconds: number };
  }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const { value, payload: data } = payload[0];
  const status = getStatusLabel(value);
  const color =
    value === 0
      ? "hsl(var(--muted-foreground))"
      : value <= 2
        ? "hsl(var(--chart-success))"
        : value <= 3
          ? "hsl(var(--chart-warning))"
          : "hsl(var(--destructive))";

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-elevated min-w-[150px]">
      <p className="font-semibold text-sm mb-2 text-foreground">{label}</p>
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xl font-bold text-foreground">
          {value === 0 ? "—" : `${value}m`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{status}</p>
      {data.count > 0 && (
        <p className="text-caption text-muted-foreground mt-1 pt-1 border-t border-border">
          {data.count} conversation{data.count !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
};

/* ─── main component ─────────────────────────────────────────────── */
export default function ResponseTimeChart() {
  const isRtl = useDirection() === "rtl";
  const [dateRange, setDateRange] = useState<DateRange>(0);
  const [channel, setChannel] = useState<Channel>("all");
  const [selectedHour, setSelectedHour] = useState<string | null>(null);

  /* ── fetch real data from Supabase ── */
  const {
    data: rawMessages,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["response-time-chart", dateRange, channel],
    queryFn: async () => {
      const from =
        dateRange === 0
          ? startOfDay(new Date()).toISOString()
          : subDays(new Date(), dateRange).toISOString();

      let query = supabase
        .from("messages")
        .select("sent_at, session_id, direction, channel")
        .gte("sent_at", from)
        .order("sent_at", { ascending: true });

      if (channel !== "all") {
        query = query.eq("channel", channel);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000, // auto-refresh every minute
  });

  /* ── compute hourly average response times from message pairs ── */
  const chartData = useMemo(() => {
    if (!rawMessages || rawMessages.length === 0) {
      return HOUR_SLOTS.map((h) => ({
        hour: formatHour(h),
        time: 0,
        count: 0,
        rawSeconds: 0,
      }));
    }

    // Group messages by session, compute first-response time per session
    type MsgRecord = {
      sent_at: string;
      direction: string;
      session_id: string | null;
    };
    const sessionMessages: Record<string, MsgRecord[]> = {};
    for (const msg of rawMessages as MsgRecord[]) {
      if (!msg.session_id) continue;
      if (!sessionMessages[msg.session_id])
        sessionMessages[msg.session_id] = [];
      sessionMessages[msg.session_id].push(msg);
    }

    // For each session: find first inbound → first outbound after it
    const responseTimes: Array<{ hourSlot: number; seconds: number }> = [];
    for (const msgs of Object.values(sessionMessages)) {
      const sorted = msgs.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      const firstInbound = sorted.find((m) => m.direction === "inbound");
      if (!firstInbound) continue;
      const firstOutbound = sorted.find(
        (m) => m.direction === "outbound" && m.sent_at > firstInbound.sent_at,
      );
      if (!firstOutbound) continue;

      const inboundTime = new Date(firstInbound.sent_at);
      const outboundTime = new Date(firstOutbound.sent_at);
      const diffSeconds =
        (outboundTime.getTime() - inboundTime.getTime()) / 1000;
      if (diffSeconds < 0 || diffSeconds > 3600) continue; // sanity check: ignore if >1h

      responseTimes.push({
        hourSlot: inboundTime.getHours(),
        seconds: diffSeconds,
      });
    }

    // Bucket into 2-hour slots
    return HOUR_SLOTS.map((slotStart) => {
      const slotEnd = slotStart + 2;
      const bucket = responseTimes.filter(
        (rt) => rt.hourSlot >= slotStart && rt.hourSlot < slotEnd,
      );
      const avg = bucket.length
        ? bucket.reduce((sum, rt) => sum + rt.seconds, 0) / bucket.length
        : 0;

      return {
        hour: formatHour(slotStart),
        time: bucket.length ? secToMin(avg) : 0,
        count: bucket.length,
        rawSeconds: avg,
      };
    });
  }, [rawMessages]);

  /* ── summary stats ── */
  const nonZero = chartData.filter((d) => d.time > 0);
  const avgAll = nonZero.length
    ? nonZero.reduce((s, d) => s + d.time, 0) / nonZero.length
    : 0;
  const bestHour = nonZero.length
    ? nonZero.reduce((a, b) => (a.time < b.time ? a : b))
    : null;
  const worstHour = nonZero.length
    ? nonZero.reduce((a, b) => (a.time > b.time ? a : b))
    : null;

  const hasData = nonZero.length > 0;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="font-display text-lg font-semibold">
            Response Time by Hour
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            />
          </Button>
        </div>

        {/* Date range tabs */}
        <div className="flex items-center gap-1 mt-2">
          {DATE_RANGES.map((r) => (
            <Button
              key={r.value}
              variant={dateRange === r.value ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-6 px-2.5 text-caption font-medium rounded-full",
                dateRange === r.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setDateRange(r.value);
                setSelectedHour(null);
              }}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {/* Channel filter tabs */}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {CHANNELS.map((ch) => (
            <Button
              key={ch}
              variant="ghost"
              size="sm"
              className={cn(
                "h-5 px-2 text-overline font-medium rounded-full capitalize",
                channel === ch
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setChannel(ch);
                setSelectedHour(null);
              }}
            >
              {ch === "all" ? "All Channels" : ch}
            </Button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-chart-success" />
            <span className="text-muted-foreground">{"<2m Excellent"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-chart-warning" />
            <span className="text-muted-foreground">{"2-3m Good"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-muted-foreground">{">3m Improve"}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-3">
        {/* Summary pills */}
        {hasData && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge
              variant="outline"
              className="text-caption gap-1 font-normal py-0.5"
            >
              <Clock className="h-2.5 w-2.5" />
              Avg {avgAll.toFixed(1)}m
            </Badge>
            {bestHour && (
              <Badge
                variant="outline"
                className="text-caption gap-1 font-normal py-0.5 text-emerald-600 border-emerald-500/30"
              >
                <TrendingDown className="h-2.5 w-2.5" />
                Best: {bestHour.hour} ({bestHour.time.toFixed(1)}m)
              </Badge>
            )}
            {worstHour && (
              <Badge
                variant="outline"
                className="text-caption gap-1 font-normal py-0.5 text-rose-600 border-rose-500/30"
              >
                <TrendingUp className="h-2.5 w-2.5" />
                Peak: {worstHour.hour} ({worstHour.time.toFixed(1)}m)
              </Badge>
            )}
          </div>
        )}

        {/* Drill-down selected hour info */}
        {selectedHour &&
          (() => {
            const selected = chartData.find((d) => d.hour === selectedHour);
            return selected ? (
              <div className="mb-3 p-2.5 rounded-lg bg-secondary/50 border border-border text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-foreground">
                    {selectedHour}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    {selected.time > 0
                      ? `Avg ${selected.time.toFixed(1)}m`
                      : "No data"}
                    {selected.count > 0 && ` · ${selected.count} conversations`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 text-caption text-muted-foreground"
                  onClick={() => setSelectedHour(null)}
                >
                  Clear
                </Button>
              </div>
            ) : null;
          })()}

        <div className="h-48">
          {isLoading ? (
            <div className="h-full flex flex-col gap-2 justify-end px-2">
              {[0.6, 0.8, 0.5, 1, 0.7, 0.9, 0.6, 0.4].map((h, i) => (
                <Skeleton
                  key={i}
                  className="rounded-sm w-full"
                  style={{ height: `${h * 100}%` }}
                />
              ))}
            </div>
          ) : isError ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm">Failed to load data</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : !hasData ? (
            <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
              <Clock className="h-8 w-8 opacity-40" />
              <p className="text-sm font-medium">No response data yet</p>
              <p className="text-xs">
                Data appears once conversations are handled
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
                onClick={(e) => {
                  if (e?.activeLabel) {
                    setSelectedHour((prev) =>
                      prev === e.activeLabel ? null : e.activeLabel!,
                    );
                  }
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="hour"
                  reversed={isRtl}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <YAxis
                  orientation={isRtl ? "right" : "left"}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickFormatter={(v) => (v === 0 ? "0m" : `${v}m`)}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{
                    fill: "hsl(var(--muted))",
                    opacity: 0.4,
                    radius: 4,
                  }}
                />
                {/* Reference lines for thresholds */}
                <ReferenceLine
                  y={2}
                  stroke="hsl(var(--chart-success))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
                <ReferenceLine
                  y={3}
                  stroke="hsl(var(--chart-warning))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
                <Bar
                  dataKey="time"
                  radius={[4, 4, 0, 0]}
                  animationDuration={800}
                  cursor="pointer"
                  maxBarSize={40}
                >
                  {chartData.map((entry) => {
                    const isSelected =
                      selectedHour === null || selectedHour === entry.hour;
                    return (
                      <Cell
                        key={`cell-${entry.hour}`}
                        fill={getBarColor(entry.time, isSelected)}
                        opacity={isSelected ? 1 : 0.4}
                        strokeWidth={selectedHour === entry.hour ? 2 : 0}
                        stroke={
                          selectedHour === entry.hour
                            ? "hsl(var(--ring))"
                            : "none"
                        }
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Click hint */}
        {hasData && !selectedHour && (
          <p className="text-center text-caption text-muted-foreground mt-2">
            Click a bar to inspect that hour
          </p>
        )}
      </CardContent>
    </Card>
  );
}
