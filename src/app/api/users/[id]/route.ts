// User management — admin-only update + delete by id.
//
// PATCH: update name / role / active / optional new password (leave blank = no
// change). DELETE: hard-delete a user (disable is the primary lifecycle action
// in the UI, but admin hard-delete is also supported — see worklog 9-a).
//
// Both gated admin-only via `getServerSession(authOptions)`.
import { getServerSession } from "next-auth";
import { api, body } from "@/lib/erp/api";
import { ErpError } from "@/lib/erp/shared";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/erp/users";
import { logActivity } from "@/lib/erp/activity";
import type { Role } from "@/lib/erp/auth-shared";

type RawUserRow = {
  id: number;
  email: string;
  name: string;
  password: string;
  role: string;
  active: boolean | number;
};

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin") {
    throw new ErpError("Administrator access required", 403);
  }
  return session;
}

async function fetchUser(id: number): Promise<RawUserRow | null> {
  const rows = await db.$queryRaw<RawUserRow[]>`
    SELECT id, email, name, password, role, active FROM users WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

type UpdateBody = {
  name?: string;
  role?: string;
  active?: boolean;
  password?: string;
};

async function updateUser(id: number, input: UpdateBody): Promise<{ id: number; email: string }> {
  const existing = await fetchUser(id);
  if (!existing) throw new ErpError("User not found", 404);

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const role: Role =
    input.role === "admin" || input.role === "operator" || input.role === "viewer"
      ? input.role
      : (existing.role as Role);
  const active = input.active !== undefined ? input.active : Boolean(existing.active);

  if (!name) throw new ErpError("Name is required", 400);

  // Optional password reset (min 6 chars when provided).
  if (input.password !== undefined && input.password !== "" && input.password.length < 6) {
    throw new ErpError("Password must be at least 6 characters", 400);
  }

  const activeInt = active ? 1 : 0;
  if (input.password && input.password.length > 0) {
    const hash = hashPassword(input.password);
    await db.$executeRaw`
      UPDATE users SET name = ${name}, role = ${role}, active = ${activeInt}, password = ${hash}
      WHERE id = ${id}
    `;
  } else {
    await db.$executeRaw`
      UPDATE users SET name = ${name}, role = ${role}, active = ${activeInt}
      WHERE id = ${id}
    `;
  }
  return { id, email: existing.email };
}

async function deleteUser(id: number): Promise<{ id: number; email: string }> {
  const existing = await fetchUser(id);
  if (!existing) throw new ErpError("User not found", 404);
  await db.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  return { id, email: existing.email };
}

export const PATCH = api(async (req, ctx) => {
  await requireAdmin();
  const id = Number((await ctx!.params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ErpError("Invalid user id", 400);
  const updated = await updateUser(id, await body<UpdateBody>(req));
  void logActivity({
    module: "settings",
    action: "update",
    refType: "user",
    refId: updated.email,
    refIdInt: id,
    title: `User ${updated.email} updated`,
    detail: `id ${id}`,
  });
  return updated;
});

export const DELETE = api(async (_req, ctx) => {
  await requireAdmin();
  const id = Number((await ctx!.params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ErpError("Invalid user id", 400);
  const removed = await deleteUser(id);
  void logActivity({
    module: "settings",
    action: "delete",
    refType: "user",
    refId: removed.email,
    refIdInt: id,
    title: `User ${removed.email} deleted`,
    detail: `id ${id}`,
  });
  return removed;
});
