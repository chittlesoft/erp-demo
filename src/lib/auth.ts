// NextAuth v4 (4.24.13) configuration — App Router compatible.
//
// Pattern (v4): export `authOptions` from a TS module, then `NextAuth(authOptions)`
// in the route handler file `src/app/api/auth/[...nextauth]/route.ts` returns a
// single handler function that we re-export as GET + POST.
//
// Credentials provider: idempotently seeds 3 demo users (ensureUsers), looks up
// the user by email + verifies the sha256 password hash. On success the role +
// id are propagated through the JWT callback to the session callback so the
// client can read `session.user.role` + `session.user.id`.
//
// `events.signIn` fires on every successful sign-in (cleaner hook than the
// `jwt` callback, which only sees `user` on the first call). We use it to
// update `users.lastLogin` and append a row to `login_events` via
// `recordLogin()` — fire-and-forget so it never breaks sign-in.
import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { ensureUsers, findUserByCredentials, recordLogin } from "@/lib/erp/users";

// Module augmentation: attach `role` + `id` to the session user + the JWT.
declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}

const DEV_SECRET =
  process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "tau-power-erp-dev-secret-change-in-production";

export const authOptions: AuthOptions = {
  secret: DEV_SECRET,
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "ERP credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@taupower.in" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;
        // Ensure demo users exist on first login (idempotent).
        try {
          await ensureUsers();
        } catch {
          // Seeding must never block login — surface as auth failure below.
        }
        const user = await findUserByCredentials(email, password);
        if (!user) return null;
        return { id: String(user.id), email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on the very first sign-in call.
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  events: {
    // Fires after a successful sign-in with the user object returned from
    // `authorize`. We use it (instead of the `jwt` callback) because it is
    // called exactly once per real sign-in and cleanly separated from token
    // refresh. The work is fire-and-forget — `recordLogin` internally catches
    // all errors and logs them so this callback can never break the sign-in.
    async signIn({ user }) {
      const id = user?.id;
      const email = user?.email;
      if (!id || !email) return;
      const userId = Number(id);
      if (!Number.isFinite(userId) || userId <= 0) return;
      // Best-effort extraction of the request IP + user agent — NextAuth v4's
      // events callback doesn't pass the raw Request, so we reach for the
      // App Router `headers()` helper. If that fails (e.g. called outside a
      // request scope), we still record the login without IP/UA.
      let req: Request | undefined;
      try {
        const hdrs = await headers();
        req = new Request("http://localhost", { headers: hdrs });
      } catch {
        // No request context — fall through with req = undefined.
      }
      await recordLogin(userId, email, req);
    },
  },
  pages: {
    // We don't use the NextAuth-hosted sign-in page — the Layout gate renders
    // our custom LoginPage component when unauthenticated. This stays as the
    // default so POST /api/auth/signin still works for programmatic use.
    signIn: "/api/auth/signin",
  },
};
