import { sql } from 'drizzle-orm';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';

const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

export const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
export const TEACHER_ID = '22222222-2222-4222-8222-222222222222';

const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);

interface SeedCard {
  question: string;
  keyTerm: string;
  highlightTerm: string;
  options: [string, string, string, string];
  correct: 'A' | 'B' | 'C' | 'D';
  accuracy: number;
  retention: number;
}

interface SeedLesson {
  topic: string;
  publishedDaysAgo: number;
  cards: SeedCard[];
}

const lessons: SeedLesson[] = [
  {
    topic: 'Respiração celular e mitocôndria',
    publishedDaysAgo: 9,
    cards: [
      {
        question: 'Em qual etapa da respiração celular a maior parte do ATP é produzida?',
        keyTerm: 'Fosforilação oxidativa',
        highlightTerm: 'ATP',
        options: ['Glicólise', 'Ciclo de Krebs', 'Fosforilação oxidativa', 'Fermentação'],
        correct: 'C',
        accuracy: 0.88,
        retention: 0.79,
      },
      {
        question: 'O ciclo de Krebs ocorre em qual compartimento celular?',
        keyTerm: 'Ciclo de Krebs',
        highlightTerm: 'compartimento',
        options: ['Citosol', 'Matriz mitocondrial', 'Membrana externa', 'Retículo liso'],
        correct: 'B',
        accuracy: 0.71,
        retention: 0.44,
      },
      {
        question: 'Qual é o saldo líquido de ATP da glicólise por molécula de glicose?',
        keyTerm: 'Glicólise',
        highlightTerm: 'saldo líquido',
        options: ['2 ATP', '4 ATP', '30 ATP', '36 ATP'],
        correct: 'A',
        accuracy: 0.83,
        retention: 0.68,
      },
    ],
  },
  {
    topic: 'Fotossíntese — fase clara e fase escura',
    publishedDaysAgo: 34,
    cards: [
      {
        question: 'O que a fase fotoquímica da fotossíntese produz para a fase seguinte?',
        keyTerm: 'Fase fotoquímica',
        highlightTerm: 'produz',
        options: ['Glicose e água', 'ATP e NADPH', 'CO2 e O2', 'Piruvato e NADH'],
        correct: 'B',
        accuracy: 0.76,
        retention: 0.61,
      },
      {
        question: 'Qual gás é fixado no ciclo de Calvin?',
        keyTerm: 'Ciclo de Calvin',
        highlightTerm: 'fixado',
        options: ['Oxigênio', 'Nitrogênio', 'Gás carbônico', 'Hidrogênio'],
        correct: 'C',
        accuracy: 0.64,
        retention: 0.38,
      },
    ],
  },
];

const ratingFor = (probability: number, index: number): 'again' | 'good' =>
  index / 30 < probability ? 'good' : 'again';

const seed = async (): Promise<void> => {
  await db.execute(sql`
    truncate review_logs, card_states, daily_progress, card_versions, cards, themes,
      notebooks, student_leagues, students, teachers restart identity cascade
  `);

  await db.execute(sql`
    insert into teachers (id, display_name) values (${TEACHER_ID}, 'Prof. Marcos')
  `);

  await db.execute(sql`
    insert into students (id, display_name, daily_goal, new_cards_per_day)
    values (${STUDENT_ID}, 'Ana', 20, 10)
  `);

  // A turma precisa de colegas para o relatório agregado ter denominador real.
  for (let index = 0; index < 33; index += 1) {
    await db.execute(sql`
      insert into students (display_name) values (${`Aluno ${index + 2}`})
    `);
  }

  const classmates = (
    await db.execute(sql`select id from students order by created_at asc limit 31`)
  ).rows as { id: string }[];

  const [notebook] = (
    await db.execute(sql`
      insert into notebooks (teacher_id, title, subject, source_label)
      values (${TEACHER_ID}, 'Biologia', 'Biologia', 'Aula publicada')
      returning id
    `)
  ).rows as { id: string }[];
  if (!notebook) throw new Error('notebook insert failed');

  for (const lesson of lessons) {
    const publishedAt = daysAgo(lesson.publishedDaysAgo);
    const [theme] = (
      await db.execute(sql`
        insert into themes (notebook_id, title, created_at)
        values (${notebook.id}, ${lesson.topic}, ${publishedAt.toISOString()})
        returning id
      `)
    ).rows as { id: string }[];
    if (!theme) continue;

    for (const card of lesson.cards) {
      const options = (['A', 'B', 'C', 'D'] as const).map((id, index) => ({
        id,
        label: card.options[index] as string,
      }));

      const [saved] = (
        await db.execute(sql`
          insert into cards (theme_id, status, source, reviewed_by, reviewed_at, created_at)
          values (${theme.id}, 'approved', 'ai', ${TEACHER_ID}, ${publishedAt.toISOString()}, ${publishedAt.toISOString()})
          returning id
        `)
      ).rows as { id: string }[];
      if (!saved) continue;

      await db.execute(sql`
        insert into card_versions
          (card_id, version, question, key_term, highlight_term, options, correct_option_id, created_at)
        values (${saved.id}, 1, ${card.question}, ${card.keyTerm}, ${card.highlightTerm},
          ${JSON.stringify(options)}::jsonb, ${card.correct}, ${publishedAt.toISOString()})
      `);

      for (const [index, classmate] of classmates.entries()) {
        const dayZero = new Date(publishedAt.getTime() + 3_600_000 + index * 60_000);
        const daySeven = new Date(publishedAt.getTime() + 7 * 86_400_000 + index * 60_000);
        await db.execute(sql`
          insert into review_logs
            (student_id, card_id, card_version, rating, origin, reviewed_at,
             previous_state, previous_due, next_due, elapsed_days, scheduled_days, xp_gained)
          values
            (${classmate.id}, ${saved.id}, 1, ${ratingFor(card.accuracy, index)}, 'feed',
             ${dayZero.toISOString()}, 0, ${publishedAt.toISOString()},
             ${daySeven.toISOString()}, 0, 7, 10)
          on conflict do nothing
        `);
      }
    }
  }

  // Segunda passada, sequencial: as revisões de D+7 dependem das de D+0 já gravadas.
  for (const lesson of lessons) {
    const publishedAt = daysAgo(lesson.publishedDaysAgo);
    if (lesson.publishedDaysAgo < 8) continue;

    const cardRows = (
      await db.execute(sql`
        select cards.id, card_versions.key_term
        from cards
        join card_versions on card_versions.card_id = cards.id
        join themes on themes.id = cards.theme_id
        where themes.title = ${lesson.topic}
      `)
    ).rows as { id: string; key_term: string }[];

    for (const row of cardRows) {
      const card = lesson.cards.find((item) => item.keyTerm === row.key_term);
      if (!card) continue;

      const laterOffsets = lesson.publishedDaysAgo >= 31 ? [7, 30] : [7];

      for (const [index, classmate] of classmates.entries()) {
       for (const offsetDays of laterOffsets) {
        const reviewedAt = new Date(publishedAt.getTime() + offsetDays * 86_400_000 + index * 60_000);
        if (reviewedAt.getTime() > Date.now()) continue;
        await db.execute(sql`
          insert into review_logs
            (student_id, card_id, card_version, rating, origin, reviewed_at,
             previous_state, previous_due, next_due, elapsed_days, scheduled_days, xp_gained)
          values
            (${classmate.id}, ${row.id}, 1, ${ratingFor(card.retention, index)}, 'feed',
             ${reviewedAt.toISOString()}, 2, ${reviewedAt.toISOString()},
             ${new Date(reviewedAt.getTime() + 16 * 86_400_000).toISOString()}, 7, 16, 10)
          on conflict do nothing
        `);
       }
      }
    }
  }

  // Sequência da Ana: dias seguidos com meta batida alimentam streak e gráfico da semana.
  for (let offset = 0; offset < 14; offset += 1) {
    const day = daysAgo(offset).toISOString().slice(0, 10);
    const reviews = offset === 2 ? 0 : 14 + ((offset * 7) % 18);
    if (reviews === 0) continue;
    await db.execute(sql`
      insert into daily_progress (student_id, day, reviews, xp, goal, met_goal)
      values (${STUDENT_ID}, ${day}, ${reviews}, ${reviews * 10}, 20, ${reviews >= 20})
      on conflict (student_id, day) do nothing
    `);
  }

  const dueCards = (
    await db.execute(sql`
      select cards.id from cards
      join themes on themes.id = cards.theme_id
      where cards.status = 'approved'
      order by cards.created_at asc
      limit 3
    `)
  ).rows as { id: string }[];

  for (const [index, card] of dueCards.entries()) {
    await db.execute(sql`
      insert into card_states
        (student_id, card_id, due, stability, difficulty, elapsed_days, scheduled_days,
         learning_steps, reps, lapses, state, last_review)
      values (${STUDENT_ID}, ${card.id}, ${daysAgo(-index - 1).toISOString()}, ${9 + index * 4},
        5.2, 3, 5, 0, 3, 0, 2, ${daysAgo(3).toISOString()})
      on conflict do nothing
    `);
  }

  console.log(`seed ok — student ${STUDENT_ID} · teacher ${TEACHER_ID}`);
};

await seed();
await pool.end();
