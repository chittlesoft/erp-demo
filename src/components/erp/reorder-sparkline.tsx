"use client";
// Tiny inline sparkline for the dashboard "Below reorder level" list.
//
// Per row, the sparkline visualises the item's recent stock movement so a
// glance at the reorder list reveals *how fast* each item is being depleted
// (or refilled) — not just that it's currently below reorder.
//
// Data source: the existing `/api/txns` route (returns the most recent
// `StockTxn` rows, newest first). That route doesn't support an `itemId`
// filter, so we fetch a generous window client-side and filter to the row's
// `itemId`. The fetch is shared across every row in the list via TanStack
// Query's automatic key-dedup, so the network cost is a single GET regardless
// of how many items are below reorder.
//
// Rendering: a 64×16 SVG with up to 14 vertical bars — one per day of recent
// movement. Each bar's height encodes that day's net qty (signed sum across
// warehouses/batches). Emerald (`--chart-1`) bars rise above the baseline
// (net inflow), rose (`--chart-5`) bars drop below it (net outflow). When the
// item has no recent movement, the sparkline renders a thin muted "no
// movement" track so the row keeps its visual rhythm.
//
// The orchestrator is expected to drop `<ReorderSparkline itemId={l.id} />`
// into each row of the dashboard's reorder list — see the worklog note. This
// component is intentionally self-contained (no props beyond itemId) so it
// can be added without touching the dashboard's data plumbing.

import { useMemo } from "react";
import { useApi } from "@/lib/erp/client";

// Minimal slice of `StockTxn` — only the fields the sparkline reads. We keep
// the type local (rather than importing the Prisma type) so this component
// doesn't pull a server-side Prisma client into the client bundle.
type TxnRow = {
  id: number;
  date: string;       // YYYY-MM-DD
  itemId: number;
  qty: number;        // signed: +in / -out
};

const WIDTH = 64;
const HEIGHT = 16;
const PAD_X = 2;
const MAX_BARS = 14;
const BAR_GAP = 1;
const BAR_WIDTH = (WIDTH - PAD_X * 2 - BAR_GAP * (MAX_BARS - 1)) / MAX_BARS; // ≈ 3.07px
const BASELINE_Y = HEIGHT / 2;          // 8
const MAX_BAR_HALF = HEIGHT / 2 - 1;    // 7 — leave 1px breathing room

/** Group the item's recent txns by date and sum the signed qty per day. */
function dailyNetMovements(txns: TxnRow[] | undefined, itemId: number): number[] {
  if (!txns?.length) return [];
  // `/api/txns` returns newest-first; keep the most recent MAX_BARS days that
  // mention this item, then reverse so the sparkline reads left→right old→new.
  const mine = txns.filter((t) => t.itemId === itemId).slice(0, 64);
  if (!mine.length) return [];
  const byDate = new Map<string, number>();
  for (const t of mine) {
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.qty);
  }
  // Sort ascending by date, take the most recent MAX_BARS entries.
  const asc = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const slice = asc.slice(-MAX_BARS);
  return slice.map(([, v]) => v);
}

/** Render a single tiny bar inside the sparkline SVG. */
function Bar({
  index,
  value,
  maxAbs,
}: {
  index: number;
  value: number;
  maxAbs: number;
}) {
  const x = PAD_X + index * (BAR_WIDTH + BAR_GAP);
  // Scale: a value equal to `maxAbs` reaches MAX_BAR_HALF. A zero value
  // renders as a 1px-tick so the bar is still visible (helps the eye track
  // which days had *any* txn vs no txn at all).
  const mag = maxAbs > 0 ? Math.max(1, (Math.abs(value) / maxAbs) * MAX_BAR_HALF) : 1;
  const positive = value >= 0;
  const y = positive ? BASELINE_Y - mag : BASELINE_Y;
  const cls = value === 0 ? "sparkline-bar-muted" : positive ? "sparkline-bar" : "sparkline-bar-danger";
  return <rect x={x} y={y} width={BAR_WIDTH} height={mag} rx={1} className={cls} />;
}

/** Inline sparkline for one item's recent stock movement. */
export function ReorderSparkline({ itemId }: { itemId: number }) {
  // Single shared fetch across all rows in the list (TanStack key-dedup).
  const { data: txns } = useApi<TxnRow[]>("/api/txns?limit=500");

  const days = useMemo(() => dailyNetMovements(txns, itemId), [txns, itemId]);

  if (!days.length) {
    // No movement on record for this item — render a muted track so the row
    // keeps its visual rhythm and the absence of bars is itself meaningful.
    return (
      <svg
        className="sparkline"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        aria-hidden
      >
        <line
          x1={PAD_X}
          y1={BASELINE_Y}
          x2={WIDTH - PAD_X}
          y2={BASELINE_Y}
          className="sparkline-track"
        />
      </svg>
    );
  }

  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d)));

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`Recent stock movement: ${days.length} day${days.length === 1 ? "" : "s"}`}
    >
      <line
        x1={PAD_X}
        y1={BASELINE_Y}
        x2={WIDTH - PAD_X}
        y2={BASELINE_Y}
        className="sparkline-baseline"
      />
      {days.map((v, i) => (
        <Bar key={i} index={i} value={v} maxAbs={maxAbs} />
      ))}
    </svg>
  );
}

export default ReorderSparkline;
