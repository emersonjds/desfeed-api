import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>['db'];

export const createDatabase = (connectionString: string) => {
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  return { db: drizzle(pool, { schema }), pool };
};
