// User management — admin-only list + create.
//
// Admin gating is enforced here via `getServerSession(authOptions)` from
// NextAuth v4 (NOT the `api` wrapper, which only handles errors + seeding).
// On 401/403 we throw an `ErpError` which the wrapper translates into a
// JSON `{message}` with that status code.
//
// Raw SQL (`db.$queryRaw` / `$executeRaw`) is used for the same reason as
// `src/lib/erp/users.ts`: the dev server's Prisma client singleton may be
// cached from before `bun run db:push` regenerated the client, so the
// typed `db.user` accessor may be missing — raw SQL always works against
// the SQLite table.
import { getServerSession } from "next-auth";
import { api, body } from "@/lib/erp/api";
import { ErpError } from "@/lib/erp/shared";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/erp/users";
import { logActivity } from "@/lib/erp/activity";
import type { Role } from "@/lib/erp/auth-shared";

// Public user shape returned by the list endpoint (no password hash).
export type UserRow = {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

type RawUserRow = {
  id: number;
  email: string;
  name: string;
  password: string;
  role: string;
  active: boolean | number;
};

function toUser(r: RawUserRow): UserRow {
  const role: Role =
    r.role === "admin" || r.role === "operator" || r.role === "viewer" ? r.role : "viewer";
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role,
    active: Boolean(r.active),
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin") {
    throw new ErpError("Administrator access required", 403);
  }
  return session;
}

async function listUsers(): Promise<UserRow[]> {
  const rows = await db.$queryRaw<RawUserRow[]>`
    SELECT id, email, name, password, role, active FROM users ORDER BY id ASC
  `;
  return rows.map(toUser);
}

type CreateBody = {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
  active?: boolean;
};

async function createUser(input: CreateBody): Promise<UserRow> {
  const email = (input.email ?? "").trim().toLowerCase();
  const name = (input.name ?? "").trim();
  const password = input.password ?? "";
  const role: Role =
    input.role === "admin" || input.role === "operator" || input.role === "viewer"
      ? input.role
      : "viewer";
  const active = input.active ?? true;

  if (!email) throw new ErpError("Email is required", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErpError("Invalid email", 400);
  if (!name) throw new ErpError("Name is required", 400);
  if (password.length < 6) throw new ErpError("Password must be at least 6 characters", 400);

  // Uniqueness check.
  const existing = await db.$queryRaw<{ id: number }[]>`
    SELECT id FROM users WHERE email = ${email} LIMIT 1
  `;
  if (existing.length > 0) throw new ErpError("Email already in use", 409);

  const hash = hashPassword(password);
  // SQLite stores booleans as 0/1.
  const activeInt = active ? 1 : 0;
  await db.$executeRaw`
    INSERT INTO users (email, name, password, role, active)
    VALUES (${email}, ${name}, ${hash}, ${role}, ${activeInt})
  `;
  const rows = await db.$queryRaw<RawUserRow[]>`
    SELECT id, email, name, password, role, active FROM users WHERE email = ${email} LIMIT 1
  `;
  return toUser(rows[0]);
}

export const GET = api(async () => {
  await requireAdmin();
  return await listUsers();
});

export const POST = api(async (req) => {
  await requireAdmin();
  const created = await createUser(await body<CreateBody>(req));
  void logActivity({
    module: "settings",
    action: "create",
    refType: "user",
    refId: created.email,
    title: `User ${created.email} created`,
    detail: `${created.name} · role ${created.role}${created.active ? "" : " (disabled)"}`,
  });
  return created;
});
