import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? ''
  // Turso / libSQL hosted DB (production: libsql://...). Falls back to the
  // local SQLite file (file:/.../custom.db) when no Turso URL is configured.
  if (url.startsWith('libsql:') || url.startsWith('http:') || url.startsWith('https:')) {
    const client = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSQL(client)
    return new PrismaClient({ adapter } as never)
  }
  // Local dev: plain PrismaClient against the SQLite file.
  return new PrismaClient({ log: ['query'] })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
