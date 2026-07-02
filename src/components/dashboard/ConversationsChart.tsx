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
import { useDirection } from "@/hooks/use-direction";

interface ConversationsChartProps {
  data?: Array<{ name: string; messages: number; calls: number }>;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-elevated">
        <p className="font-semibold text-sm mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground capitalize">
              {entry.name}:
            </span>
            <span className="font-semibold">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function ConversationsChart({
  data = [],
}: ConversationsChartProps) {
  const isRtl = useDirection() === "rtl";
  const chartData =
    data.length > 0
      ? data
      : [
          { name: "Mon", messages: 0, calls: 0 },
          { name: "Tue", messages: 0, calls: 0 },
          { name: "Wed", messages: 0, calls: 0 },
          { name: "Thu", messages: 0, calls: 0 },
          { name: "Fri", messages: 0, calls: 0 },
          { name: "Sat", messages: 0, calls: 0 },
          { name: "Sun", messages: 0, calls: 0 },
        ];

  return (
    <Card className="col-span-2 shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg font-semibold flex items-center justify-between">
          Weekly Activity
          <div className="flex items-center gap-4 text-sm font-normal">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-primary" />
              <span className="text-muted-foreground">Messages</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-secondary" />
              <span className="text-muted-foreground">Calls</span>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
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
                <linearGradient id="callsGradient" x1="0" y1="0" x2="0" y2="1">
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
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="messages"
                stroke="hsl(var(--chart-primary))"
                strokeWidth={2}
                fill="url(#messagesGradient)"
                animationDuration={1500}
              />
              <Area
                type="monotone"
                dataKey="calls"
                stroke="hsl(var(--chart-secondary))"
                strokeWidth={2}
                fill="url(#callsGradient)"
                animationDuration={1500}
                animationBegin={300}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
