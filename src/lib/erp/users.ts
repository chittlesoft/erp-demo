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
