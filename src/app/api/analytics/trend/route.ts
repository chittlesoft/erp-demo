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

export const GET = api(async (req: Request) => {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "14");
  return trend(days);
});
