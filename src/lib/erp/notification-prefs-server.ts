// Server-side persistence for per-user notification preferences.
//
// Prefs are stored as a single JSON-string column on the `notification_prefs`
// SQLite table (one row per user — `userId` is unique). We use raw SQL via
// `db.$queryRaw` / `db.$executeRaw` so this helper keeps working even if the
// running dev server's cached Prisma client has not yet been regenerated
// against the latest schema (the table itself exists at the SQLite level
// immediately after `bun run db:push`). Same pattern as `activity.ts` /
// `users.ts`.
//
// All reads defensively merge the stored JSON with `DEFAULT_PREFS` so a
// newly-added toggle always has a value, and a corrupt row falls back to
// the defaults rather than crashing the bell popover.

import { db } from "@/lib/db";
import { DEFAULT_PREFS, type NotificationPrefs } from "@/lib/notification-prefs";

// Re-export so callers can import the type alongside the helpers.
export type { NotificationPrefs } from "@/lib/notification-prefs";

type PrefRow = { prefs: string };

/** Merge stored prefs with defaults so newly-added toggles always have a value. */
function normalize(raw: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  return { ...DEFAULT_PREFS, ...raw };
}

/**
 * Read a user's prefs. Returns `DEFAULT_PREFS` when no row exists yet (first
 * visit) or the row fails to parse. Never throws — the bell popover and the
 * preferences dialog both rely on this always returning a usable value.
 */
export async function getPrefs(userId: number): Promise<NotificationPrefs> {
  try {
    const rows = await db.$queryRaw<PrefRow[]>`
      SELECT prefs FROM notification_prefs WHERE userId = ${userId}
    `;
    if (!rows.length) return { ...DEFAULT_PREFS };
    const raw = rows[0].prefs;
    if (!raw) return { ...DEFAULT_PREFS };
    let parsed: Partial<NotificationPrefs> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    } catch {
      parsed = null;
    }
    return normalize(parsed);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Upsert a user's prefs. Uses SQLite's `INSERT … ON CONFLICT … DO UPDATE`
 * (UPSERT, supported since SQLite 3.24) keyed on the unique `userId` column.
 * If the upsert fails for any reason the caller's PATCH route surfaces the
 * error via the `api()` wrapper.
 */
export async function savePrefs(userId: number, prefs: NotificationPrefs): Promise<void> {
  const json = JSON.stringify(prefs);
  const ts = new Date().toISOString();
  await db.$executeRaw`
    INSERT INTO notification_prefs (userId, prefs, updatedAt)
    VALUES (${userId}, ${json}, ${ts})
    ON CONFLICT(userId) DO UPDATE SET prefs = excluded.prefs, updatedAt = excluded.updatedAt
  `;
}
