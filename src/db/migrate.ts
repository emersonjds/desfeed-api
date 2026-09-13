import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../config/env.js';
import { createDatabase } from './client.js';

const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

await migrate(db, { migrationsFolder: 'drizzle' });
await pool.end();
