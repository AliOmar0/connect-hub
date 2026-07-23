import { useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDirection } from "@/hooks/use-direction";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface ConversationsChartProps {
  data?: Array<{ name: string; messages: number; calls: number }>;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-elevated">
      <p className="mb-2 text-sm font-semibold">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span className="capitalize text-muted-foreground">
            {entry.name}:
          </span>
          <span className="font-semibold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function ConversationsChart({
  data = [],
}: ConversationsChartProps) {
  const isRtl = useDirection() === "rtl";
  const reducedMotion = useReducedMotion();
  const titleId = useId();

  return (
    <Card className="col-span-2 shadow-card" aria-labelledby={titleId}>
      <CardHeader className="pb-2">
        <CardTitle id={titleId} className="font-display text-lg font-semibold">
          Weekly Activity
        </CardTitle>
        <CardDescription>
          Daily message and call totals for the most recent 7 days.
        </CardDescription>
        <div
          className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-sm"
          aria-label="Chart legend"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <span
              className="w-5 border-t-2 border-chart-primary"
              aria-hidden="true"
            />
            Messages
          </span>
          <span className="flex items-center gap-2 text-muted-foreground">
            <span
              className="w-5 border-t-2 border-dashed border-chart-secondary"
              aria-hidden="true"
            />
            Calls
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {data.length === 0 ? (
          <p className="py-24 text-center text-sm text-muted-foreground">
            Weekly activity data is unavailable.
          </p>
        ) : (
          <>
            <div
              className="h-72"
              role="img"
              aria-label="Area chart comparing daily message and call counts over the last 7 days. A data table follows."
            >
              <div className="h-full" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data}
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
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      orientation={isRtl ? "right" : "left"}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 12,
                      }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="messages"
                      stroke="hsl(var(--chart-primary))"
                      strokeWidth={2}
                      fill="url(#messagesGradient)"
                      isAnimationActive={!reducedMotion}
                    />
                    <Area
                      type="monotone"
                      dataKey="calls"
                      stroke="hsl(var(--chart-secondary))"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      fill="url(#callsGradient)"
                      isAnimationActive={!reducedMotion}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="sr-only">
              <table>
                <caption>Weekly activity totals by day</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Messages</th>
                    <th scope="col">Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.name}>
                      <th scope="row">{item.name}</th>
                      <td>{item.messages}</td>
                      <td>{item.calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
