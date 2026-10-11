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
      subtitle="Daily EOL test results — good units (area, left axis) vs rejected units (line, right axis)"
      bodyClassName="h-64 px-2 pb-3"
    >
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : hasData ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: -16, right: 8, top: 8 }}>
            {/*
              Emerald gradient for the good-units area. Stops use the
              `--chart-1` CSS variable so the colour adapts to light/dark
              mode; opacities bumped from the prior (0.35 / 0.05) so the fill
              stays visible even on a Y axis scaled to ~120 units (the area
              otherwise reads as faint, which the VLM flagged as
              "flatlining at the bottom").
            */}
            <defs>
              <linearGradient id="trendGood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.12} />
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
            {/*
              Dual Y axes — good units (0–~120) on the left axis, rejects
              (0–~5) on the right. Without a right axis the reject line
              appears as a near-flat line pinned to the bottom of a 0–120
              chart, which VLM read as "data points flatlining at the
              bottom". Splitting the scales makes both series legible.
              `domain={[0, "auto"]}` is explicit (recharts v3 default
              behaviour) so the chart never starts above 0 and the area
              fills the full vertical range.
            */}
            <YAxis
              yAxisId="good"
              domain={[0, "auto"]}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={40}
            />
            <YAxis
              yAxisId="reject"
              orientation="right"
              domain={[0, "auto"]}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CHART_CURSOR} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              yAxisId="good"
              type="monotone"
              dataKey="good"
              name="Good"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#trendGood)"
              baseValue={0}
              cursor="pointer"
            />
            <Line
              yAxisId="reject"
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
