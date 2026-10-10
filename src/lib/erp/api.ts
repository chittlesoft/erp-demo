// Helpers for Next.js Route Handlers.
import { NextResponse } from "next/server";
import { ErpError } from "./shared";
import { ensureSeeded } from "./seed";

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
