import { api } from "@/lib/erp/api";
import { summary } from "@/lib/erp/service";
import { db } from "@/lib/db";

/**
 * Dashboard summary.
 *
 * The base `Summary` type (from `@/lib/erp/shared`) is owned by a different
 * agent's file scope, so we don't extend it there. Instead this route returns
 * the base summary PLUS two extra JSON fields (`salesLastMonth`,
 * `salesMtdDeltaPct`) computed via a single raw SQL aggregate. The client
 * dashboard reads them through a locally-augmented type
 * (`SummaryWithDelta = Summary & { salesLastMonth?: number; salesMtdDeltaPct?: number | null }`),
 * which is safe because TypeScript allows the API to return a superset of the
 * declared `Summary` type without complaint, and the client side uses a wider
 * type to read the extras.
 *
 * Month boundaries are computed as ISO `YYYY-MM-DD` strings — `date` on the
 * `invoices` table is stored as `YYYY-MM-DD`, so lexicographic comparison
 * (`>=` start-of-month, `<` start-of-next-month) is exact.
 */
export const GET = api(async () => {
  const base = await summary();

  const now = new Date();
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

  // Raw SQL aggregate — one round-trip, only ACTIVE invoices in the previous
  // calendar month. `COALESCE` ensures a 0 result (not null) when no rows match.
  const rows = (await db.$queryRaw<{ v: number | bigint }[]>`
    SELECT COALESCE(SUM(taxable), 0) AS v
    FROM invoices
    WHERE status = 'ACTIVE'
      AND date >= ${lastMonthStart}
      AND date <  ${thisMonthStart}
  `) as { v: number | bigint }[];
  const salesLastMonth = Number(rows[0]?.v ?? 0);

  // Delta percentage vs last month. Null when last month had zero sales to
  // avoid a misleading ±infinity on a brand-new install (round 14-a).
  const salesMtdDeltaPct =
    salesLastMonth > 0
      ? +(((base.salesMtd - salesLastMonth) / salesLastMonth) * 100).toFixed(1)
      : null;

  return {
    ...base,
    salesLastMonth: Math.round(salesLastMonth),
    salesMtdDeltaPct,
  };
});
