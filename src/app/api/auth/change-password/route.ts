// Change password — for the signed-in user (any role).
//
// Mirrors the raw-SQL pattern used by `src/lib/erp/users.ts` + the
// `/api/users/[id]` route: dev-server Prisma client may be cached from before
// the User model was added, so raw SQL via `db.$executeRaw` always works
// against the SQLite `users` table.
//
// Auth: requires a valid NextAuth session. The current password is verified
// against the stored sha256 hash via `findUserByCredentials` — that helper
// also enforces `active = 1` so a disabled user cannot reset their password.
// The new password is hashed with `hashPassword` (sha256) before update.
//
// Logs an activity-log entry (module=settings) so the audit trail records
// the change. The `user` field of the activity entry is the acting user's
// email (per round-10 spec) so it surfaces in the activity widget/feed.
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, findUserByCredentials } from "@/lib/erp/users";
import { logActivity } from "@/lib/erp/activity";

type ChangeBody = {
  currentPassword?: string;
  newPassword?: string;
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session?.user?.id) {
      return NextResponse.json({ message: "Sign-in required" }, { status: 401 });
    }

    let payload: ChangeBody = {};
    try {
      payload = (await req.json()) as ChangeBody;
    } catch {
      return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const currentPassword = payload.currentPassword ?? "";
    const newPassword = payload.newPassword ?? "";

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { message: "New password must be at least 6 characters" },
        { status: 400 },
      );
    }

    // Verify the current password against the stored hash (also enforces
    // `active = 1` via findUserByCredentials).
    const user = await findUserByCredentials(session.user.email, currentPassword);
    if (!user) {
      return NextResponse.json({ message: "Current password is incorrect" }, { status: 400 });
    }

    const userId = Number(session.user.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ message: "Invalid session user id" }, { status: 400 });
    }

    const hash = hashPassword(newPassword);
    await db.$executeRaw`UPDATE users SET password = ${hash} WHERE id = ${userId}`;

    void logActivity({
      module: "settings",
      action: "update",
      refType: "user",
      refId: session.user.email,
      refIdInt: userId,
      title: "Password changed",
      detail: `User ${session.user.email} changed their password`,
      user: session.user.email,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Change-password failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
