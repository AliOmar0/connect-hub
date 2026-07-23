import { useId } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

interface ResponseTimeChartProps {
  data?: Array<{ date: string; time: number }>;
}

const getStatus = (value: number) => {
  if (value <= 2) return "Excellent";
  if (value <= 3) return "Good";
  return "Needs improvement";
};

const getBarColor = (value: number) => {
  if (value <= 2) return "hsl(var(--chart-success))";
  if (value <= 3) return "hsl(var(--chart-warning))";
  return "hsl(var(--destructive))";
};

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;

  const value = payload[0].value;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-elevated">
      <p className="mb-1 text-sm font-semibold">{label}</p>
      <p className="text-lg font-bold">{value.toFixed(1)} min</p>
      <p className="mt-1 text-xs text-muted-foreground">{getStatus(value)}</p>
    </div>
  );
};

export default function ResponseTimeChart({
  data = [],
}: ResponseTimeChartProps) {
  const isRtl = useDirection() === "rtl";
  const reducedMotion = useReducedMotion();
  const titleId = useId();

  return (
    <Card className="shadow-card" aria-labelledby={titleId}>
      <CardHeader className="pb-2">
        <CardTitle id={titleId} className="font-display text-lg font-semibold">
          Average Response Time
        </CardTitle>
        <CardDescription>
          Daily average in minutes for the most recent 7 days.
        </CardDescription>
        <div
          className="flex flex-wrap gap-x-3 gap-y-2 pt-2 text-xs"
          aria-label="Response time thresholds"
        >
          <span className="text-muted-foreground">
            <span className="font-medium text-chart-success">≤2 min</span>{" "}
            Excellent
          </span>
          <span className="text-muted-foreground">
            <span className="font-medium text-chart-warning">2–3 min</span> Good
          </span>
          <span className="text-muted-foreground">
            <span className="font-medium text-destructive">&gt;3 min</span>{" "}
            Improve
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {data.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted-foreground">
            Response-time data is unavailable for the last 7 days.
          </p>
        ) : (
          <>
            <div
              className="h-48"
              role="img"
              aria-label="Bar chart of average response time in minutes by day for the last 7 days. A data table follows."
            >
              <div className="h-full" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data}
                    margin={{ top: 5, right: 5, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      reversed={isRtl}
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      orientation={isRtl ? "right" : "left"}
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 10,
                      }}
                      tickFormatter={(value) => `${value}m`}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                    />
                    <Bar
                      dataKey="time"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={!reducedMotion}
                    >
                      {data.map((entry) => (
                        <Cell key={entry.date} fill={getBarColor(entry.time)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="sr-only">
              <table>
                <caption>
                  Average response time by day for the last 7 days
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Average response time</th>
                    <th scope="col">Performance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.date}>
                      <th scope="row">{item.date}</th>
                      <td>{item.time.toFixed(1)} minutes</td>
                      <td>{getStatus(item.time)}</td>
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
