import { useId } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface ChannelDistributionChartProps {
  data?: Array<{ name: string; value: number; color: string }>;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-elevated">
      <p className="font-medium">{payload[0].name}</p>
      <p className="mt-1 text-2xl font-bold">{payload[0].value}%</p>
    </div>
  );
};

export default function ChannelDistributionChart({
  data = [],
}: ChannelDistributionChartProps) {
  const reducedMotion = useReducedMotion();
  const titleId = useId();

  return (
    <Card className="shadow-card" aria-labelledby={titleId}>
      <CardHeader className="pb-2">
        <CardTitle id={titleId} className="font-display text-lg font-semibold">
          Channel Distribution
        </CardTitle>
        <CardDescription>
          Share of sessions by channel for the current month.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-24 text-center text-sm text-muted-foreground">
            No channel activity is available for this month.
          </p>
        ) : (
          <>
            <div
              className="relative h-52"
              role="img"
              aria-label="Donut chart showing this month's session share by channel. A data table follows."
            >
              <div className="h-full" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      isAnimationActive={!reducedMotion}
                    >
                      {data.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          stroke="hsl(var(--card))"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="font-display text-sm font-semibold">Sessions</p>
                  <p className="text-xs text-muted-foreground">This month</p>
                </div>
              </div>
            </div>
            <div
              className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2"
              aria-label="Channel distribution legend"
            >
              {data.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-xs text-muted-foreground">
                    {item.name}
                  </span>
                  <span className="ms-auto text-xs font-semibold">
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
            <div className="sr-only">
              <table>
                <caption>Session distribution by channel this month</caption>
                <thead>
                  <tr>
                    <th scope="col">Channel</th>
                    <th scope="col">Share of sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.name}>
                      <th scope="row">{item.name}</th>
                      <td>{item.value}%</td>
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
