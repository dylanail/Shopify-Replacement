import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

export type Db = PgliteDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  driver: "pglite" | "postgres";
  close: () => Promise<void>;
}

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/**
 * Open the Kiln database. With DATABASE_URL set it connects to Postgres; otherwise it boots an
 * embedded PGlite instance (on disk at `dataDir`, or in memory when `dataDir` is ":memory:").
 */
export async function openDb(opts: { url?: string; dataDir?: string; migrate?: boolean } = {}): Promise<DbHandle> {
  const url = opts.url ?? process.env.DATABASE_URL;
  const shouldMigrate = opts.migrate ?? true;
  if (url) {
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 10, prepare: false });
    const db = drizzlePostgres(client, { schema }) as unknown as Db;
    if (shouldMigrate) await migratePostgres(db as never, { migrationsFolder });
    return { db, driver: "postgres", close: () => client.end() };
  }
  const dataDir = opts.dataDir ?? process.env.KILN_DATA_DIR ?? path.resolve(process.cwd(), ".data/kiln");
  if (dataDir !== ":memory:") mkdirSync(dataDir, { recursive: true });
  const pg = dataDir === ":memory:" ? new PGlite() : new PGlite(dataDir);
  const db = drizzlePglite(pg, { schema });
  if (shouldMigrate) await migratePglite(db, { migrationsFolder });
  return { db, driver: "pglite", close: () => pg.close() };
}
