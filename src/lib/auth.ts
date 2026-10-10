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
import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { ensureUsers, findUserByCredentials } from "@/lib/erp/users";

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
  pages: {
    // We don't use the NextAuth-hosted sign-in page — the Layout gate renders
    // our custom LoginPage component when unauthenticated. This stays as the
    // default so POST /api/auth/signin still works for programmatic use.
    signIn: "/api/auth/signin",
  },
};
