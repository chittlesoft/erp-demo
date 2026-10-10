// NextAuth v4 App Router route handler.
//
// v4 pattern: `NextAuth(authOptions)` returns a single handler function that
// auto-detects the App Router Route-Handler signature (req, ctx) vs the Pages
// API signature (req, res). We re-export it as GET + POST.
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
