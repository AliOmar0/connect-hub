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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const data = [
  { hour: "6AM", time: 1.2 },
  { hour: "8AM", time: 2.8 },
  { hour: "10AM", time: 3.5 },
  { hour: "12PM", time: 2.1 },
  { hour: "2PM", time: 4.2 },
  { hour: "4PM", time: 3.8 },
  { hour: "6PM", time: 2.5 },
  { hour: "8PM", time: 1.8 },
];

const getBarColor = (value: number) => {
  if (value <= 2) return "hsl(150, 60%, 45%)"; // Green - excellent
  if (value <= 3) return "hsl(45, 95%, 50%)"; // Gold - good
  return "hsl(0, 84%, 60%)"; // Red - needs improvement
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    let status = "Excellent";
    if (value > 2 && value <= 3) status = "Good";
    if (value > 3) status = "Needs Improvement";

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-elevated">
        <p className="font-semibold text-sm mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: getBarColor(value) }}
          />
          <span className="text-lg font-bold">{value}m</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{status}</p>
      </div>
    );
  }
  return null;
};

export default function ResponseTimeChart() {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg font-semibold">
          Response Time by Hour
        </CardTitle>
        <div className="flex items-center gap-4 text-xs mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-chart-success" />
            <span className="text-muted-foreground">{"<2m Excellent"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gold" />
            <span className="text-muted-foreground">{"2-3m Good"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-muted-foreground">{">3m Improve"}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopOpacity={1} />
                  <stop offset="100%" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="hour"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={(value) => `${value}m`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
              <Bar dataKey="time" radius={[4, 4, 0, 0]} animationDuration={1000}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.time)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
