import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? ''
  // No URL at all (build time / missing env): return a stub that will be
  // replaced on first real request. Avoids throwing during prerender.
  if (!url || url === 'undefined') {
    return new PrismaClient()
  }
  // Turso / libSQL hosted DB (production: libsql://...). Falls back to the
  // local SQLite file (file:/.../custom.db) when no Turso URL is configured.
  if (url.startsWith('libsql:') || url.startsWith('http:') || url.startsWith('https:')) {
    const client = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSql(client)
    return new PrismaClient({ adapter } as never)
  }
  // Local dev: plain PrismaClient against the SQLite file.
  return new PrismaClient({ log: ['query'] })
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
