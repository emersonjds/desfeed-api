import { sql } from 'drizzle-orm';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';
import { findIllustration } from '../src/shared/media/wikimedia.js';

const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

const rows = (
  await db.execute(sql`
    select card_versions.card_id, card_versions.key_term, themes.title as theme
    from card_versions
    join cards on cards.id = card_versions.card_id
    join themes on themes.id = cards.theme_id
    where card_versions.image_url is null and cards.status = 'approved'
  `)
).rows as { card_id: string; key_term: string; theme: string }[];

console.log(`${rows.length} cards sem figura`);
let found = 0;

for (const row of rows) {
  const url = (await findIllustration(row.key_term)) ?? (await findIllustration(row.theme));
  if (url) {
    await db.execute(sql`
      update card_versions set image_url = ${url} where card_id = ${row.card_id}
    `);
    found += 1;
    console.log(`  ok  ${row.key_term}`);
  } else {
    console.log(`  --  ${row.key_term}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`preenchidos ${found} de ${rows.length}`);
await pool.end();
