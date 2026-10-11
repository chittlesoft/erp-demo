// Demo user seeder + lookup for the NextAuth credentials provider.
//
// Uses raw SQL (db.$queryRaw / db.$executeRaw) instead of the typed `db.user`
// accessor because the dev server's PrismaClient singleton is cached from the
// process startup and may not include the newly-added User model after a
// `bun run db:push` (same pattern used by src/lib/erp/activity.ts).
//
// Passwords are hashed with sha256 (Node `crypto`) — sufficient for a
// prototype; bcrypt would be used in production.
import { createHash } from "crypto";
import { db } from "@/lib/db";
import type { Role } from "./auth-shared";

export type DemoUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

const DEMO_USERS: { email: string; password: string; role: Role; name: string }[] = [
  { email: "admin@taupower.in",    password: "admin123",    role: "admin",    name: "Plant Admin" },
  { email: "operator@taupower.in", password: "operator123", role: "operator", name: "Shop Operator" },
  { email: "viewer@taupower.in",   password: "viewer123",   role: "viewer",   name: "Read-only Viewer" },
];

/** sha256 hex of the password — used for both seeding and verifying. */
export function hashPassword(pw: string): string {
  return createHash("sha256").update(pw, "utf8").digest("hex");
}

type RawUserRow = {
  id: number;
  email: string;
  name: string;
  password: string;
  role: string;
  // Prisma `$queryRaw` returns Boolean columns as JS booleans (`true`/`false`);
  // raw `bun:sqlite` returns them as 0/1. Accept either.
  active: boolean | number;
};

function toUser(r: RawUserRow): DemoUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: (r.role === "admin" || r.role === "operator" || r.role === "viewer") ? r.role : "viewer",
    active: Boolean(r.active),
  };
}

/**
 * Idempotent: if the `users` table is empty, create the 3 demo users
 * (admin/operator/viewer). Safe to call on every authorize attempt.
 */
export async function ensureUsers(): Promise<void> {
  const rows = await db.$queryRaw<RawUserRow[]>`SELECT COUNT(*) as c FROM users`;
  // $queryRaw returns BigInt for COUNT in SQLite — coerce via Number().
  const count = Number((rows[0] as unknown as { c: number | bigint }).c);
  if (count > 0) return;

  for (const u of DEMO_USERS) {
    const hash = hashPassword(u.password);
    await db.$executeRaw`INSERT INTO users (email, name, password, role, active) VALUES (${u.email}, ${u.name}, ${hash}, ${u.role}, 1)`;
  }
}

/** Lookup for the NextAuth `authorize` callback. Returns null if not found / inactive / wrong password. */
export async function findUserByCredentials(
  email: string,
  password: string,
): Promise<DemoUser | null> {
  const rows = await db.$queryRaw<RawUserRow[]>`
    SELECT id, email, name, password, role, active FROM users WHERE email = ${email} LIMIT 1
  `;
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  // `active` is a boolean from Prisma `$queryRaw` (or 0/1 from raw sqlite) — accept either.
  if (!row.active) return null;
  if (row.password !== hashPassword(password)) return null;
  return toUser(row);
}

// ──────────────────────────────────────────────────────────────────────────────
// Login history — `recordLogin` writes a row on every successful sign-in (called
// from NextAuth's `events.signIn` callback in src/lib/auth.ts), and `listLoginEvents`
// reads them back for the Profile page's "Login history" section + the dashboard
// "Last login" readout.
//
// Same raw-SQL pattern as the rest of this file: the dev server's PrismaClient
// singleton is cached from process startup and won't pick up the new
// `lastLogin` column / `LoginEvent` model after `bun run db:push` until the
// process is restarted. The SQLite tables exist at the SQL level immediately,
// so raw `$executeRaw` / `$queryRaw` work in both the fresh and stale-client
// cases.
// ──────────────────────────────────────────────────────────────────────────────

export type LoginEventRow = {
  id: number;
  userId: number;
  ts: string;          // ISO timestamp
  email: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
};

type RawLoginEventDb = {
  id: bigint | number;
  userId: bigint | number;
  ts: string;
  email: string;
  ip: string | null;
  userAgent: string | null;
  // Prisma `$queryRaw` returns Boolean columns as JS booleans (`true`/`false`);
  // raw `bun:sqlite` returns them as 0/1. Accept either.
  success: boolean | number;
};

function toLoginEvent(r: RawLoginEventDb): LoginEventRow {
  return {
    id: Number(r.id),
    userId: Number(r.userId),
    ts: r.ts,
    email: r.email,
    ip: r.ip,
    userAgent: r.userAgent,
    success: Boolean(r.success),
  };
}

/**
 * Best-effort extraction of the client IP from a Request's headers — checks the
 * standard proxy headers (`x-forwarded-for`, `x-real-ip`) and trims to the first
 * hop. Returns null when nothing useful is present.
 */
function clientIpFrom(req?: Request): string | null {
  if (!req) return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

/**
 * Record a successful sign-in:
 *   1. update `users.lastLogin` to now
 *   2. append a row to `login_events` with the IP + user agent (best-effort)
 *
 * Fire-and-forget friendly — never throws. The `req` is optional because the
 * NextAuth `events.signIn` callback doesn't receive the raw request; in that
 * context we fall back to `next/headers` (handled by the caller) or just
 * record the login without IP/UA.
 */
export async function recordLogin(
  userId: number,
  email: string,
  req?: Request,
): Promise<void> {
  try {
    const ts = new Date().toISOString();
    const ip = clientIpFrom(req);
    const userAgent = req?.headers.get("user-agent") ?? null;
    // UPDATE users.lastLogin — use the ISO string; SQLite stores DateTime? as
    // TEXT (ISO-8601) under the hood via Prisma.
    await db.$executeRaw`UPDATE users SET lastLogin = ${ts} WHERE id = ${userId}`;
    await db.$executeRaw`INSERT INTO login_events (userId, ts, email, ip, userAgent, success) VALUES (${userId}, ${ts}, ${email}, ${ip}, ${userAgent}, 1)`;
  } catch (e) {
    // Login recording must never break the sign-in flow.
    console.error("[users] recordLogin failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * List recent login events, newest first. If `userId` is provided, filter by
 * it; otherwise return events for all users (callers should gate this behind
 * an admin check — see `/api/auth/login-events` route). Limit is clamped to a
 * safe max of 100.
 */
export async function listLoginEvents(
  userId?: number,
  limit = 20,
): Promise<LoginEventRow[]> {
  const take = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = userId
    ? await db.$queryRaw<RawLoginEventDb[]>`
        SELECT id, userId, ts, email, ip, userAgent, success
        FROM login_events
        WHERE userId = ${userId}
        ORDER BY id DESC
        LIMIT ${take}
      `
    : await db.$queryRaw<RawLoginEventDb[]>`
        SELECT id, userId, ts, email, ip, userAgent, success
        FROM login_events
        ORDER BY id DESC
        LIMIT ${take}
      `;
  return rows.map(toLoginEvent);
}
