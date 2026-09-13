import { writeFileSync } from 'node:fs';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';

const { db, pool } = createDatabase('postgres://unused:unused@localhost:5432/unused');
const app = await buildApp({ db, logLevel: 'silent' });
await app.ready();
writeFileSync('docs/openapi.json', JSON.stringify(app.swagger(), null, 2));
await app.close();
await pool.end();
