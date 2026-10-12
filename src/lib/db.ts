import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Prisma reads DATABASE_URL directly — no adapter needed for SQLite or Postgres.
  // - Local dev: DATABASE_URL=file:/.../custom.db (SQLite)
  // - Vercel prod: DATABASE_URL=postgresql://... (Neon Postgres)
  return new PrismaClient({ log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'] })
}

// Lazy singleton — only create the client on first access, NOT at module
// load. This prevents `next build` from trying to connect to the DB during
// static page data collection (env vars aren't available then).
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient()
    }
    return Reflect.get(globalForPrisma.prisma, prop, receiver)
  },
})
