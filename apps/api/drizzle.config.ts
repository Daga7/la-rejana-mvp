import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/adapters/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://rejana:rejana_local_solo_dev@127.0.0.1:5433/rejana' },
  strict: true,
  verbose: false,
})
