import { sql } from 'drizzle-orm';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';

const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

// Entidade HTML que já entrou no banco antes do saneamento existir.
const rows = (
  await db.execute(sql`
    select id, question, key_term, highlight_term, options
    from card_versions
    where question like '%&%;%' or key_term like '%&%;%' or highlight_term like '%&%;%'
       or options::text like '%&%;%'
  `)
).rows as {
  id: string;
  question: string;
  key_term: string;
  highlight_term: string;
  options: { id: string; label: string }[];
}[];

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', Agrave: 'À',
};

const decode = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => ENTITIES[name] ?? match);

for (const row of rows) {
  const options = row.options.map((option) => ({ ...option, label: decode(option.label) }));
  await db.execute(sql`
    update card_versions set
      question = ${decode(row.question)},
      key_term = ${decode(row.key_term)},
      highlight_term = ${decode(row.highlight_term)},
      options = ${JSON.stringify(options)}::jsonb
    where id = ${row.id}
  `);
  console.log(`  ${decode(row.key_term)}`);
}

console.log(`${rows.length} versões saneadas`);
await pool.end();
