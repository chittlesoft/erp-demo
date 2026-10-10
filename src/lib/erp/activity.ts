// Activity log / timeline — server-side logging + query helpers.
//
// Append-only event log of key business actions across ERP modules. Stored in
// the `activity_logs` SQLite table (see Prisma `ActivityLog` model).
//
// NOTE: we use `db.$executeRaw` / `db.$queryRaw` instead of the typed
// `db.activityLog` accessor so the helper keeps working even if the running
// dev server's cached Prisma client has not yet been regenerated against the
// latest schema (the `activity_logs` table still exists at the SQLite level
// after `bun run db:push`). When the dev server eventually restarts, the
// typed accessor would also work — raw SQL works in both cases.
//
// On first read (table empty), `seedActivity()` lazily inserts ~18
// representative historical entries spanning every module — gives the timeline
// real content without editing every existing API route.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { AuthSession } from "@/lib/erp/api";

// Clean row shape returned by listActivity and consumed by the client feed.
export type ActivityLogRow = {
  id: number;
  ts: string;          // ISO timestamp
  module: string;      // items | bom | inventory | production | purchase | sales | quality | pdi | shopfloor | settings | seed
  action: string;      // create | update | delete | complete | dispatch | scan | inspect | reseed ...
  refType: string | null;
  refId: string | null;
  refIdInt: number | null;
  title: string;
  detail: string | null;
  user: string;
};

// Input shape for logActivity — caller-supplied fields. `ts` is set server-side.
export type ActivityLogInput = {
  module: string;
  action: string;
  refType?: string;
  refId?: string;
  refIdInt?: number;
  title: string;
  detail?: string;
  user?: string;
};

// Raw row shape returned by SQLite via $queryRaw (Prisma returns bigint for
// integer columns + nullables as null).
type ActivityLogDb = {
  id: bigint | number;
  ts: string;
  module: string;
  action: string;
  refType: string | null;
  refId: string | null;
  refIdInt: bigint | number | null;
  title: string;
  detail: string | null;
  user: string;
};

function toRow(r: ActivityLogDb): ActivityLogRow {
  return {
    id: Number(r.id),
    ts: r.ts,
    module: r.module,
    action: r.action,
    refType: r.refType,
    refId: r.refId,
    refIdInt: r.refIdInt == null ? null : Number(r.refIdInt),
    title: r.title,
    detail: r.detail,
    user: r.user,
  };
}

/**
 * Append a single activity-log entry. Fire-and-forget friendly — wraps the
 * Prisma insert in try/catch and logs to console.error on failure so it can
 * never break the calling API route. Returns void (no awaitable result).
 *
 * Usage from any server route:
 *   void logActivity({ module: "sales", action: "create", refType: "invoice",
 *                       refId: invNo, title: `Invoice ${invNo} created`, detail: "..." });
 */
export async function logActivity(entry: ActivityLogInput): Promise<void> {
  try {
    const ts = new Date().toISOString();
    const refType = entry.refType ?? null;
    const refId = entry.refId ?? null;
    const refIdInt = entry.refIdInt ?? null;
    const detail = entry.detail ?? null;
    const user = entry.user ?? "system";
    await db.$executeRaw`INSERT INTO activity_logs (ts, module, action, refType, refId, refIdInt, title, detail, user) VALUES (${ts}, ${entry.module}, ${entry.action}, ${refType}, ${refId}, ${refIdInt}, ${entry.title}, ${detail}, ${user})`;
  } catch (e) {
    // Activity logging must never break the calling flow.
    console.error("[activity] logActivity failed:", e instanceof Error ? e.message : e);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Session-aware variants — let mutating API routes attribute their actions to
// the signed-in user without sprinkling `?? "system"` everywhere. Both are thin
// wrappers around `logActivity` and stay fully backward-compatible: existing
// callers that still pass `user: "system"` (or omit `user`) keep working.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the activity-log `user` string for a session — the signed-in user's
 * email, falling back to `"system"` when there is no session (defensive:
 * mutating routes gate on `requireEditor`/`requireAdmin` first, so this is only
 * ever reached by a logged-in caller).
 */
export function activityUser(session: AuthSession | null | undefined): string {
  return session?.user?.email ?? "system";
}

/**
 * Log an activity entry attributed to the given session. Equivalent to
 * `logActivity({ ...entry, user: activityUser(session) })`.
 */
export async function logActivityBy(
  session: AuthSession | null | undefined,
  entry: ActivityLogInput,
): Promise<void> {
  await logActivity({ ...entry, user: activityUser(session) });
}

/**
 * List recent activity, newest first. Optional filters:
 *   - `module` — restrict to a single module ("all"/undefined = no filter)
 *   - `from`    — ISO date or date-time string; rows with `ts >= from` are kept.
 *                 A bare date (YYYY-MM-DD) is normalised to start-of-day UTC.
 *   - `to`      — ISO date or date-time string; rows with `ts <= to` are kept.
 *                 A bare date (YYYY-MM-DD) is normalised to end-of-day UTC.
 *   - `user`    — email (or "system") to filter by the `user` column exactly.
 *
 * Limit is clamped to a safe max of 200. Triggers `seedActivity()` if the table
 * is empty so the timeline is never blank on a fresh database.
 */
export async function listActivity(
  limit = 50,
  module?: string,
  from?: string,
  to?: string,
  user?: string,
): Promise<ActivityLogRow[]> {
  // Lazy seed on first read so the feed has content out of the box.
  const countRows = await db.$queryRaw<{ c: bigint | number }[]>`SELECT COUNT(*) as c FROM activity_logs`;
  const count = Number(countRows[0]?.c ?? 0);
  if (count === 0) await seedActivity();

  const take = Math.max(1, Math.min(200, Math.floor(limit)));

  // Compose the optional WHERE clauses with parameterised raw SQL so every
  // user-supplied value is bound (no string concatenation → no SQL injection).
  // Date-only inputs (YYYY-MM-DD) are normalised to full UTC timestamps so a
  // single-day "to" picks up the entire day, not just midnight.
  const conds: Prisma.Sql[] = [];
  if (module && module !== "all") conds.push(Prisma.sql`module = ${module}`);
  if (user) conds.push(Prisma.sql`user = ${user}`);
  if (from) conds.push(Prisma.sql`ts >= ${normaliseFrom(from)}`);
  if (to) conds.push(Prisma.sql`ts <= ${normaliseTo(to)}`);
  const where = conds.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`
    : Prisma.empty;

  const rows = await db.$queryRaw<ActivityLogDb[]>`
    SELECT id, ts, module, action, refType, refId, refIdInt, title, detail, user
    FROM activity_logs
    ${where}
    ORDER BY id DESC
    LIMIT ${take}
  `;
  return rows.map(toRow);
}

/** Date normaliser — bare YYYY-MM-DD inputs become start-of-day UTC. */
function normaliseFrom(s: string): string {
  const trimmed = s.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed;
}

/** Date normaliser — bare YYYY-MM-DD inputs become end-of-day UTC. */
function normaliseTo(s: string): string {
  const trimmed = s.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T23:59:59.999Z` : trimmed;
}

// ──────────────────────────────────────────────────────────────────────────────
// Seeding — ~18 representative historical entries spanning every module.
// Idempotent: only runs when the table is empty (caller checks count first).
// Timestamps are computed relative to "now" so the relative-time chips in the
// UI ("2h ago") always read sensibly regardless of when the prototype is run.
// ──────────────────────────────────────────────────────────────────────────────

type SeedEntry = {
  ageMin: number;      // minutes ago
  module: string;
  action: string;
  refType?: string;
  refId?: string;
  refIdInt?: number;
  title: string;
  detail?: string;
  user?: string;
};

const SEED_ENTRIES: SeedEntry[] = [
  // Oldest first (highest ageMin) — they get inserted in array order so the
  // auto-increment id grows with recency, matching the timeline's "newest
  // last" mental model. listActivity returns newest-first via ORDER BY id DESC.
  {
    ageMin: 60 * 26, module: "seed", action: "reseed", refType: "seed",
    title: "Demo database initialised",
    detail: "Company profile, 34 items, BOM, opening stock, parties, SO/PO + one GST invoice seeded.",
    user: "system",
  },
  {
    ageMin: 60 * 25, module: "settings", action: "update", refType: "settings",
    refId: "1", refIdInt: 1,
    title: "Company profile saved",
    detail: "Legal name, GSTIN 27AAKCT4244J1Z0, plant address at Hinjawadi confirmed.",
    user: "operator",
  },
  {
    ageMin: 60 * 24, module: "items", action: "create", refType: "item",
    refId: "TTT000002", refIdInt: 33,
    title: "Item TTT000002 created",
    detail: "EGTS (Analogue) - 108 finished good added for Tata Motors customer part 570615249301.",
    user: "operator",
  },
  {
    ageMin: 60 * 23, module: "bom", action: "create", refType: "bom",
    refId: "TTT000002",
    title: "BOM saved for TTT000002",
    detail: "5 components: RM-TC-K, RM-HSG-M14, RM-CBL-HT, RM-CON-4P, RM-GRM-SIL (rev A).",
    user: "operator",
  },
  {
    ageMin: 60 * 22, module: "purchase", action: "create", refType: "po",
    refId: "PO/26-27/0001", refIdInt: 1,
    title: "Purchase order PO/26-27/0001 raised",
    detail: "Vendor Thermo Sensors India (Bengaluru) — 500 RM-TC-K thermocouples @ ₹420.",
    user: "operator",
  },
  {
    ageMin: 60 * 21, module: "purchase", action: "receive", refType: "grn",
    refId: "GRN/26-27/0004", refIdInt: 1,
    title: "GRN GRN/26-27/0004 received",
    detail: "60 of 500 RM-TC-K received against PO/26-27/0001 — batch TC-2610-118, ₹29,736.",
    user: "operator",
  },
  {
    ageMin: 60 * 20, module: "inventory", action: "transfer", refType: "stock",
    refId: "TC-2610-118",
    title: "60 RM-TC-K moved to QC quarantine",
    detail: "Lot TC-2610-118 staged for incoming inspection before put-away to RM stores.",
    user: "operator",
  },
  {
    ageMin: 60 * 19, module: "quality", action: "inspect", refType: "inspection",
    refId: "GRN/26-27/0004",
    title: "Incoming inspection completed",
    detail: "Lot 60 RM-TC-K — sample 8 — ACCEPT, 60 units accepted into RM stores.",
    user: "operator",
  },
  {
    ageMin: 60 * 18, module: "production", action: "create", refType: "order",
    refId: "PO-26-0100", refIdInt: 12,
    title: "Production order PO-26-0100 released",
    detail: "150 FG-EGTS-TC thermocouple sensors — due 2026-10-12, FG warehouse.",
    user: "operator",
  },
  {
    ageMin: 60 * 12, module: "shopfloor", action: "scan", refType: "wip",
    refId: "EGT-2610-00001",
    title: "WIP unit EGT-2610-00001 PASS at ASM-1",
    detail: "Assembly op complete — heater resistance 3.2 Ω, cold-junction OK.",
    user: "operator",
  },
  {
    ageMin: 60 * 10, module: "shopfloor", action: "scan", refType: "wip",
    refId: "EGT-2610-00007",
    title: "WIP unit EGT-2610-00007 FAIL at EOL-1",
    detail: "Accuracy @600°C out of spec (4.6 °C vs ±4.0). Routed to HOLD for disposition.",
    user: "operator",
  },
  {
    ageMin: 60 * 9, module: "quality", action: "create", refType: "ncr",
    refId: "NCR-2610-0001",
    title: "NCR raised — failed EOL",
    detail: "1 unit of FG-EGTS-TC (serial EGT-2610-00007). Disposition: REWORK.",
    user: "operator",
  },
  {
    ageMin: 60 * 8, module: "production", action: "complete", refType: "order",
    refId: "PO-26-0099", refIdInt: 11,
    title: "Production order PO-26-0099 completed",
    detail: "30 TTT000002 — 29 good, 1 rejected — first-pass yield 96.7%.",
    user: "operator",
  },
  {
    ageMin: 60 * 7, module: "pdi", action: "create", refType: "pdi-plan",
    refId: "TTT000002",
    title: "PDI plan defined for TTT000002",
    detail: "3 characteristics: probe length 70±1 mm, harness 400±10 mm, mounting thread M14x1.5-6g.",
    user: "operator",
  },
  {
    ageMin: 60 * 6, module: "sales", action: "create", refType: "so",
    refId: "SO/26-27/0004", refIdInt: 1,
    title: "Sales order SO/26-27/0004 booked",
    detail: "Customer Orient Engineering Solutions (Wagholi, Pune). 11× TTT000002 + 7× TTT000004.",
    user: "operator",
  },
  {
    ageMin: 60 * 5, module: "pdi", action: "inspect", refType: "pdi",
    refId: "PDI/2610/0001", refIdInt: 1,
    title: "PDI report PDI/2610/0001 — ACCEPT",
    detail: "Sample 1 of 11 TTT000002 inspected — all characteristics in spec. Ready to invoice.",
    user: "operator",
  },
  {
    ageMin: 60 * 4, module: "sales", action: "create", refType: "invoice",
    refId: "INV/26-27/0001", refIdInt: 1,
    title: "Invoice INV/26-27/0001 created",
    detail: "₹19,950 + CGST+SGST @ 18% = ₹23,541 — Orient Engineering Solutions. 18 serials dispatched.",
    user: "operator",
  },
  {
    ageMin: 60 * 2, module: "sales", action: "dispatch", refType: "invoice",
    refId: "INV/26-27/0001", refIdInt: 1,
    title: "Vehicle MH12 GG 4521 loaded",
    detail: "Invoice INV/26-27/0001 dispatched via VRL Logistics — 18 km to customer.",
    user: "operator",
  },
  {
    ageMin: 45, module: "sales", action: "update", refType: "invoice",
    refId: "INV/26-27/0001", refIdInt: 1,
    title: "IRN + e-way bill simulated",
    detail: "IRN pending (GSP sandbox offline). EWB required (>₹50,000 intra-state).",
    user: "system",
  },
];

/**
 * Insert the seed activity entries. Idempotent — caller (listActivity) only
 * invokes this when `db.activityLog.count() === 0`.
 */
export async function seedActivity(): Promise<void> {
  const now = Date.now();
  // Insert oldest-first so auto-increment ids grow with recency. We use a
  // sequential loop (not Promise.all) to preserve insertion order in SQLite.
  for (const e of SEED_ENTRIES) {
    try {
      const ts = new Date(now - e.ageMin * 60_000).toISOString();
      const refType = e.refType ?? null;
      const refId = e.refId ?? null;
      const refIdInt = e.refIdInt ?? null;
      const detail = e.detail ?? null;
      const user = e.user ?? "system";
      await db.$executeRaw`INSERT INTO activity_logs (ts, module, action, refType, refId, refIdInt, title, detail, user) VALUES (${ts}, ${e.module}, ${e.action}, ${refType}, ${refId}, ${refIdInt}, ${e.title}, ${detail}, ${user})`;
    } catch (err) {
      // Defensive — never throw from seed.
      console.error("[activity] seedActivity insert failed:", err instanceof Error ? err.message : err);
    }
  }
}
