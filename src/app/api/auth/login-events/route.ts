import { api, requireAuth } from "@/lib/erp/api";
import { listLoginEvents } from "@/lib/erp/users";

// GET /api/auth/login-events?userId=1&limit=20
//   userId — optional. Filter to a single user's events. Defaults to "all"
//            for admins, "current user only" for non-admins (see below).
//   limit  — default 20, clamped to 1..100 by `listLoginEvents`.
//
// Auth: requires a valid NextAuth session (any role). Returns 401 without.
//
// Access control:
//   - admins (role === "admin") may query any user, or omit `userId` to list
//     recent events across all users.
//   - non-admins (operator / viewer) are always restricted to their OWN events
//     — a `userId` query that doesn't match their own session id is silently
//     overridden to their own id (so a misbehaving client can never read
//     another user's login history).
//
// The response shape is `{ id, userId, ts, email, ip, userAgent, success }[]`,
// newest first. The Profile page uses the first row as the "Last login" readout.
export const GET = api(async (req) => {
  const session = await requireAuth(req);

  const url = new URL(req.url, "http://localhost");
  const limitParam = url.searchParams.get("limit");
  const userIdParam = url.searchParams.get("userId");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  const isAdmin = session.user.role === "admin";
  const sessionUserId = Number(session.user.id);
  const requestedUserId = userIdParam != null ? Number(userIdParam) : NaN;
  const hasValidRequestedId =
    Number.isFinite(requestedUserId) && requestedUserId > 0;

  // Effective filter — admins may query any user (or all); non-admins always
  // see only their own events.
  let effectiveUserId: number | undefined;
  if (isAdmin) {
    effectiveUserId = hasValidRequestedId ? requestedUserId : undefined;
  } else {
    // Non-admin — always pin to their own session user id.
    effectiveUserId = Number.isFinite(sessionUserId) ? sessionUserId : undefined;
  }

  return listLoginEvents(
    effectiveUserId,
    Number.isFinite(limit) && limit > 0 ? limit : 20,
  );
});
