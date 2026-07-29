import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDirection } from "@/hooks/use-direction";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { AlertCircle, MessageSquare, Phone, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const DATE_RANGES = [
  { label: "7 Days", value: 7 },
  { label: "14 Days", value: 14 },
  { label: "30 Days", value: 30 },
] as const;

type DateRange = (typeof DATE_RANGES)[number]["value"];
type SeriesKey = "messages" | "calls";

interface ChartPoint {
  name: string;
  fullDate: string;
  messages: number;
  calls: number;
}

interface ConversationsChartProps {
  data?: ChartPoint[];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}

const SERIES_META: Record<
  SeriesKey,
  { label: string; color: string; dotClass: string }
> = {
  messages: {
    label: "Messages",
    color: "hsl(var(--chart-primary))",
    dotClass: "bg-chart-primary",
  },
  calls: {
    label: "Calls",
    color: "hsl(var(--chart-secondary))",
    dotClass: "bg-chart-secondary",
  },
};

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-elevated min-w-[150px]">
      <p className="font-semibold text-sm mb-2 text-foreground">{label}</p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="flex items-center gap-2 text-sm mb-1"
        >
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground capitalize">
            {entry.name}:
          </span>
          <span className="font-semibold ml-auto">
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
      {payload.length > 1 && (
        <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">
          Total: {total.toLocaleString()}
        </p>
      )}
    </div>
  );
};

async function fetchWeeklyActivity(days: number): Promise<ChartPoint[]> {
  const points: ChartPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const dayStart = startOfDay(date).toISOString();
    const dayEnd = endOfDay(date).toISOString();

    const [{ count: messagesCount }, { count: callsCount }] = await Promise.all(
      [
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .gte("created_at", dayStart)
          .lte("created_at", dayEnd),
        supabase
          .from("calls")
          .select("*", { count: "exact", head: true })
          .gte("created_at", dayStart)
          .lte("created_at", dayEnd),
      ],
    );

    points.push({
      name: format(date, "EEE"),
      fullDate: format(date, "MMM d"),
      messages: messagesCount || 0,
      calls: callsCount || 0,
    });
  }

  return points;
}

export default function ConversationsChart({ data }: ConversationsChartProps) {
  const isRtl = useDirection() === "rtl";
  const [dateRange, setDateRange] = useState<DateRange>(7);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesKey>>(new Set());

  const {
    data: fetchedData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-weekly-activity", dateRange],
    queryFn: () => fetchWeeklyActivity(dateRange),
    enabled: data === undefined,
    refetchInterval: 60_000,
  });

  const chartData = data ?? fetchedData ?? [];

  const totals = useMemo(
    () =>
      chartData.reduce(
        (acc, point) => ({
          messages: acc.messages + point.messages,
          calls: acc.calls + point.calls,
        }),
        { messages: 0, calls: 0 },
      ),
    [chartData],
  );

  const peakDay = useMemo(() => {
    if (!chartData.length) return null;
    return chartData.reduce((best, point) => {
      const total = point.messages + point.calls;
      const bestTotal = best.messages + best.calls;
      return total > bestTotal ? point : best;
    });
  }, [chartData]);

  const hasData = totals.messages > 0 || totals.calls > 0;

  const toggleSeries = (key: SeriesKey) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }

      const allKeys: SeriesKey[] = ["messages", "calls"];
      const visibleCount = allKeys.filter(
        (seriesKey) => !next.has(seriesKey),
      ).length;
      if (visibleCount <= 1) return prev;

      next.add(key);
      return next;
    });
  };

  const selectedPoint = chartData.find((point) => point.name === selectedDay);

  return (
    <Card className="col-span-2 shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="font-display text-lg font-semibold">
            Weekly Activity
          </CardTitle>
          {data === undefined && (
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
          )}
        </div>

        {data === undefined && (
          <div className="flex items-center gap-1 mt-2">
            {DATE_RANGES.map((range) => (
              <Button
                key={range.value}
                variant={dateRange === range.value ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-[11px] font-medium rounded-full",
                  dateRange === range.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setDateRange(range.value);
                  setSelectedDay(null);
                }}
              >
                {range.label}
              </Button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 text-sm font-normal mt-2">
          {(Object.keys(SERIES_META) as SeriesKey[]).map((key) => {
            const meta = SERIES_META[key];
            const isHidden = hiddenSeries.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSeries(key)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-2 py-1 transition-colors",
                  isHidden
                    ? "opacity-40 hover:opacity-60"
                    : "hover:bg-secondary/60",
                )}
                aria-pressed={!isHidden}
              >
                <div className={cn("w-3 h-3 rounded-full", meta.dotClass)} />
                <span className="text-muted-foreground">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {hasData && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge
              variant="outline"
              className="text-[10px] gap-1 font-normal py-0.5"
            >
              <MessageSquare className="h-2.5 w-2.5" />
              {totals.messages.toLocaleString()} messages
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] gap-1 font-normal py-0.5"
            >
              <Phone className="h-2.5 w-2.5" />
              {totals.calls.toLocaleString()} calls
            </Badge>
            {peakDay && peakDay.messages + peakDay.calls > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 font-normal py-0.5"
              >
                Peak: {peakDay.name} ({peakDay.fullDate})
              </Badge>
            )}
          </div>
        )}

        {selectedPoint && (
          <div className="mb-3 p-2.5 rounded-lg bg-secondary/50 border border-border text-xs flex items-center justify-between">
            <div>
              <span className="font-semibold text-foreground">
                {selectedPoint.name} · {selectedPoint.fullDate}
              </span>
              <span className="text-muted-foreground ml-2">
                {selectedPoint.messages.toLocaleString()} messages ·{" "}
                {selectedPoint.calls.toLocaleString()} calls
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-[10px] text-muted-foreground"
              onClick={() => setSelectedDay(null)}
            >
              Clear
            </Button>
          </div>
        )}

        <div className="h-72">
          {data === undefined && isLoading ? (
            <div className="h-full flex items-end gap-2 px-2 pb-6">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="flex-1 rounded-sm"
                  style={{ height: `${35 + ((index * 17) % 45)}%` }}
                />
              ))}
            </div>
          ) : data === undefined && isError ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm">Failed to load activity data</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                onClick={(event) => {
                  if (event?.activeLabel) {
                    setSelectedDay((prev) =>
                      prev === event.activeLabel
                        ? null
                        : String(event.activeLabel),
                    );
                  }
                }}
              >
                <defs>
                  <linearGradient
                    id="messagesGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--chart-primary))"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--chart-primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="callsGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--chart-secondary))"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--chart-secondary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="name"
                  reversed={isRtl}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <YAxis
                  orientation={isRtl ? "right" : "left"}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{
                    stroke: "hsl(var(--border))",
                    strokeWidth: 1,
                    strokeDasharray: "4 4",
                  }}
                />
                {!hiddenSeries.has("messages") && (
                  <Area
                    type="monotone"
                    dataKey="messages"
                    name="Messages"
                    stroke="hsl(var(--chart-primary))"
                    strokeWidth={selectedDay ? 2.5 : 2}
                    fill="url(#messagesGradient)"
                    animationDuration={900}
                    activeDot={{
                      r: 6,
                      strokeWidth: 2,
                      stroke: "hsl(var(--background))",
                    }}
                    dot={
                      selectedDay
                        ? ({ cx, cy, payload }) =>
                            payload.name === selectedDay ? (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={5}
                                fill="hsl(var(--chart-primary))"
                                stroke="hsl(var(--background))"
                                strokeWidth={2}
                              />
                            ) : null
                        : false
                    }
                  />
                )}
                {!hiddenSeries.has("calls") && (
                  <Area
                    type="monotone"
                    dataKey="calls"
                    name="Calls"
                    stroke="hsl(var(--chart-secondary))"
                    strokeWidth={selectedDay ? 2.5 : 2}
                    fill="url(#callsGradient)"
                    animationDuration={900}
                    animationBegin={150}
                    activeDot={{
                      r: 6,
                      strokeWidth: 2,
                      stroke: "hsl(var(--background))",
                    }}
                    dot={
                      selectedDay
                        ? ({ cx, cy, payload }) =>
                            payload.name === selectedDay ? (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={5}
                                fill="hsl(var(--chart-secondary))"
                                stroke="hsl(var(--background))"
                                strokeWidth={2}
                              />
                            ) : null
                        : false
                    }
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {!hasData && !isLoading && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            No activity recorded for this period yet
          </p>
        )}

        {hasData && !selectedDay && (
          <p className="text-center text-[10px] text-muted-foreground mt-2">
            Hover for details · Click a day to inspect · Toggle legend to
            show/hide series
          </p>
        )}
      </CardContent>
    </Card>
  );
}
