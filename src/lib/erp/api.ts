// Helpers for Next.js Route Handlers.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ErpError } from "./shared";
import { ensureSeeded } from "./seed";
import { authOptions } from "@/lib/auth";
import type { Role } from "@/lib/erp/auth-shared";

/** Wrap an async handler with seeding + error handling. */
export function api(handler: (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<unknown>) {
  return async (req: Request, ctx?: { params: Promise<Record<string, string>> }) => {
    try {
      await ensureSeeded();
      const data = await handler(req, ctx);
      return NextResponse.json(data);
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err instanceof ErpError ? err.status : err.status ?? 500;
      const message = err.message.replace(/^\d+:\s*/, "");
      return NextResponse.json({ message }, { status });
    }
  };
}

export async function body<T = unknown>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Server-side auth helpers (NextAuth v4 + App Router).
//
// Every mutating route handler (POST/PATCH/DELETE) should `await` one of the
// `require*` helpers at the very top of the function. They throw `ErpError`,
// which the `api()` wrapper above translates into a JSON `{message}` response
// with the matching HTTP status code (401 unauthenticated / 403 forbidden).
//
// The session shape is narrowed to exactly the fields our routes read:
// `{ user: { id, email, role } }` — email is used as the activity-log `user`.
// ──────────────────────────────────────────────────────────────────────────────

/** Narrowed session shape returned by the auth helpers. */
export type SessionUser = {
  id: string;
  email: string;
  role: string;
};
export type AuthSession = {
  user: SessionUser;
};

/**
 * Read the NextAuth session for the current request, or `null` when
 * unauthenticated. `getServerSession(authOptions)` works in App Router route
 * handlers without needing `req`/`res` — it reads the session cookie from the
 * request headers internally.
 *
 * `req` is accepted for symmetry with the route-handler signature and so
 * callers can pass it through uniformly; it is intentionally not consulted.
 */
export async function getSession(_req?: Request): Promise<AuthSession | null> {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return null;
  const { id, email, role } = session.user;
  if (!email || !role) return null;
  return {
    user: {
      id: String(id ?? ""),
      email,
      role,
    },
  };
}

/** Require any signed-in user; throws `ErpError("Sign in required", 401)` if no session. */
export async function requireAuth(req?: Request): Promise<AuthSession> {
  const session = await getSession(req);
  if (!session) throw new ErpError("Sign in required", 401);
  return session;
}

/**
 * Role ladder — admin satisfies the operator requirement too (mirrors the
 * client `canEdit(role)` helper in `auth-shared.ts`). viewer is always rejected.
 */
const ALLOWED: Record<"admin" | "operator", ReadonlyArray<string>> = {
  admin: ["admin"],
  operator: ["admin", "operator"],
};

/**
 * Require the caller to hold the given role (or higher). Throws `401` when no
 * session, `403` when the role is insufficient.
 *
 * - `"admin"`: only admin.
 * - `"operator"`: admin OR operator (viewer rejected).
 */
export async function requireRole(
  req: Request,
  role: "admin" | "operator",
): Promise<AuthSession> {
  const session = await requireAuth(req);
  if (!ALLOWED[role].includes(session.user.role)) {
    throw new ErpError(
      role === "admin" ? "Administrator access required" : "Editor access required",
      403,
    );
  }
  return session;
}

/** Require the admin role — reseed, user management, company settings. */
export function requireAdmin(req?: Request): Promise<AuthSession> {
  return requireRole(req as Request, "admin");
}

/** Require an editor (admin OR operator — viewer is rejected). */
export function requireEditor(req?: Request): Promise<AuthSession> {
  return requireRole(req as Request, "operator");
}
