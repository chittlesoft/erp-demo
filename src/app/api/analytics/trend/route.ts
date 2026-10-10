import { api } from "@/lib/erp/api";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

/** A single day in the production-output trend series. */
export type TrendPoint = {
  /** ISO date, "YYYY-MM-DD" */
  date: string;
  /** Good (EOL PASS) units produced that day */
  good: number;
  /** Rejected (EOL FAIL) units produced that day */
  reject: number;
  /** First-pass yield for the day (0-100), or null when no units were produced */
  fpy: number | null;
};

/** Compute the inclusive "YYYY-MM-DD" start date for the last `days` days. */
function startDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

/** Build a contiguous list of "YYYY-MM-DD" strings from start..today (inclusive). */
function dateRange(days: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Daily production output for the last N days, computed from EOL serial scans
 * (PASS = good, FAIL = reject). Missing days are filled with zeros so the chart
 * always shows a contiguous time axis. Open GET — matches the other analytics
 * routes (the app shell is auth-gated; reads remain open for the prototype).
 */
async function trend(days: number): Promise<TrendPoint[]> {
  const safeDays = Math.min(Math.max(1, Math.trunc(days) || 14), 90);
  const from = startDate(safeDays);

  // Group EOL serial scans by date — SQLite returns BIGINT for SUM(...).
  const rows = await db.$queryRaw<{ date: string; good: bigint; reject: bigint }[]>(
    Prisma.sql`
      SELECT date,
             SUM(CASE WHEN eolResult = 'PASS' THEN 1 ELSE 0 END) AS good,
             SUM(CASE WHEN eolResult = 'FAIL' THEN 1 ELSE 0 END) AS reject
      FROM serials
      WHERE date >= ${from}
      GROUP BY date
      ORDER BY date ASC
    `,
  );

  const byDate = new Map<string, { good: number; reject: number }>();
  for (const r of rows) {
    byDate.set(r.date, {
      good: Number(r.good),
      reject: Number(r.reject),
    });
  }

  return dateRange(safeDays).map((date) => {
    const v = byDate.get(date);
    const good = v?.good ?? 0;
    const reject = v?.reject ?? 0;
    const total = good + reject;
    return {
      date,
      good,
      reject,
      fpy: total ? +((100 * good) / total).toFixed(1) : null,
    };
  });
}

/** A single day's production summary used for KPI delta indicators. */
export type TrendDaySummary = {
  /** ISO date, "YYYY-MM-DD" */
  date: string;
  /** Good (EOL PASS) units produced that day */
  good: number;
  /** Rejected (EOL FAIL) units produced that day */
  reject: number;
  /** First-pass yield for the day (0-100), or null when no units were produced */
  fpy: number | null;
};

/** `?summary=true` response — today vs yesterday deltas for dashboard KPIs. */
export type TrendSummary = {
  points: TrendPoint[];
  today: TrendDaySummary;
  yesterday: TrendDaySummary;
  /** today.good - yesterday.good (positive = more output) */
  deltaGood: number;
  /** today.reject - yesterday.reject (positive = more rejects — worse) */
  deltaReject: number;
  /** today.fpy - yesterday.fpy in percentage points; null when either day had no units */
  deltaFpy: number | null;
};

/** Today's and yesterday's "YYYY-MM-DD" UTC dates. */
function todayYesterday(): { today: string; yesterday: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const y = new Date(now);
  y.setUTCDate(y.getUTCDate() - 1);
  return { today, yesterday: y.toISOString().slice(0, 10) };
}

/**
 * Today vs yesterday production summary for KPI delta indicators. Reuses the
 * contiguous `trend()` series so the per-day good/reject/fpy numbers match
 * exactly what the chart shows. Returns `deltaFpy = null` when either day had
 * no production (so the dashboard can omit the indicator gracefully).
 */
async function summary(days: number): Promise<TrendSummary> {
  const points = await trend(days);
  const { today: todayStr, yesterday: yesterdayStr } = todayYesterday();
  const find = (date: string): TrendDaySummary => {
    const p = points.find((x) => x.date === date);
    return p ?? { date, good: 0, reject: 0, fpy: null };
  };
  const today = find(todayStr);
  const yesterday = find(yesterdayStr);
  return {
    points,
    today,
    yesterday,
    deltaGood: today.good - yesterday.good,
    deltaReject: today.reject - yesterday.reject,
    deltaFpy: today.fpy !== null && yesterday.fpy !== null
      ? +(today.fpy - yesterday.fpy).toFixed(1)
      : null,
  };
}

export const GET = api(async (req: Request) => {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "14");
  // `?summary=true` returns the trend array PLUS today/yesterday deltas for
  // dashboard KPI indicators. The default (no param) keeps returning the bare
  // `TrendPoint[]` array so the existing `ProductionTrendChart` is unaffected.
  if (url.searchParams.get("summary") === "true") {
    return summary(days);
  }
  return trend(days);
});
