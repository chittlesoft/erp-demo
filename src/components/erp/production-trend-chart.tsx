"use client";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { useApi } from "@/lib/erp/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, SectionCard } from "./shared";

/** Mirrors the API response from src/app/api/analytics/trend/route.ts. */
export type TrendPoint = {
  date: string;
  good: number;
  reject: number;
  fpy: number | null;
};

/** Theme-aware recharts tooltip — adapts to dark mode via CSS variables. */
const TOOLTIP_STYLE = {
  borderRadius: 8,
  fontSize: 12,
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
} as const;

const CHART_CURSOR = { fill: "var(--muted)", fillOpacity: 0.4 } as const;

/** Format an ISO date as "Oct 1" (short month + day, no leading zero). */
function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Production-output trend — good units per day (emerald area) overlaid with
 * rejected units per day (rose line). Fetches `/api/analytics/trend?days=14`.
 */
export function ProductionTrendChart({
  days = 14,
  className,
}: {
  days?: number;
  className?: string;
}) {
  const { data, isLoading } = useApi<TrendPoint[]>(`/api/analytics/trend?days=${days}`);

  const chartData = useMemo(
    () =>
      (data ?? []).map((d) => ({
        date: d.date,
        label: fmtDay(d.date),
        good: d.good,
        reject: d.reject,
      })),
    [data],
  );

  const hasData = chartData.some((d) => d.good > 0 || d.reject > 0);

  return (
    <SectionCard
      className={className}
      title={`Production output — last ${days} days`}
      subtitle="Daily EOL test results — good units (area) vs rejected units (line)"
      bodyClassName="h-64 px-2 pb-3"
    >
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : hasData ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: -16, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="trendGood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.3}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={12}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={40}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CHART_CURSOR} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="good"
              name="Good"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#trendGood)"
              cursor="pointer"
            />
            <Line
              type="monotone"
              dataKey="reject"
              name="Rejected"
              stroke="var(--chart-5)"
              strokeWidth={2}
              dot={{ r: 2, fill: "var(--chart-5)" }}
              activeDot={{ r: 4 }}
              cursor="pointer"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Empty>No EOL scans in the last {days} days</Empty>
      )}
    </SectionCard>
  );
}
