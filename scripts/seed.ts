import { sql } from 'drizzle-orm';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';
import {
  createAnthropicGenerator,
  createGeminiGenerator,
  type CardGenerator,
} from '../src/modules/ingestion/card-generator.js';
import { resolveIllustrations } from '../src/shared/media/wikimedia.js';

const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

export const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
export const CLASS_ID = '55555555-5555-4555-8555-555555555555';

const SCHOOL = 'Colégio Estadual Paulo Freire';

// Três turmas para o seletor do painel não ser uma lista de um item só.
const CLASSES = [
  { id: CLASS_ID, name: '2º ano B', grade: '2º ano do Ensino Médio' },
  { id: '55555555-5555-4555-8555-555555555556', name: '1º ano A', grade: '1º ano do Ensino Médio' },
  { id: '55555555-5555-4555-8555-555555555557', name: '3º ano C', grade: '3º ano do Ensino Médio' },
];

const generator: CardGenerator | undefined = env.ANTHROPIC_API_KEY
  ? createAnthropicGenerator(env.ANTHROPIC_API_KEY)
  : env.GEMINI_API_KEY
    ? createGeminiGenerator(env.GEMINI_API_KEY)
    : undefined;

if (!generator) throw new Error('Defina GEMINI_API_KEY ou ANTHROPIC_API_KEY para semear.');

const BETWEEN_GENERATIONS_MS = 8_000;

const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);

interface Lesson {
  subject: string;
  topic: string;
  cardCount: number;
  publishedDaysAgo: number;
  /** Acerto no dia da aula e o que sobra em D+7 — é o contraste que o relatório mostra. */
  accuracyOnDay: number;
  retentionD7: number;
}

interface TeacherSeed {
  id: string;
  displayName: string;
  lessons: Lesson[];
}

const teachers: TeacherSeed[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Prof. Marcos',
    lessons: [
      { subject: 'Biologia', topic: 'Respiração celular e mitocôndria', cardCount: 5, publishedDaysAgo: 9, accuracyOnDay: 0.84, retentionD7: 0.63 },
      { subject: 'Biologia', topic: 'Fotossíntese: fase clara e ciclo de Calvin', cardCount: 5, publishedDaysAgo: 34, accuracyOnDay: 0.7, retentionD7: 0.46 },
    ],
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    displayName: 'Profa. Helena',
    lessons: [
      { subject: 'Física', topic: 'Termodinâmica: entropia e segunda lei', cardCount: 5, publishedDaysAgo: 11, accuracyOnDay: 0.76, retentionD7: 0.52 },
      { subject: 'Física', topic: 'Leis de Newton e força resultante', cardCount: 5, publishedDaysAgo: 30, accuracyOnDay: 0.88, retentionD7: 0.71 },
    ],
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    displayName: 'Prof. Rui',
    lessons: [
      { subject: 'História', topic: 'Revolução Francesa: causas e fases', cardCount: 5, publishedDaysAgo: 8, accuracyOnDay: 0.79, retentionD7: 0.58 },
    ],
  },
];

/** O que a Ana pediu por conta própria — origem "Você escolheu" no topo do card. */
const ownStudy: { subject: string; theme: string; cardCount: number }[] = [
  { subject: 'Química', theme: 'Estequiometria e cálculo de mol', cardCount: 5 },
  { subject: 'Matemática', theme: 'Derivadas e regra da cadeia', cardCount: 5 },
  { subject: 'Literatura', theme: 'Realismo brasileiro e Machado de Assis', cardCount: 4 },
];

const ratingFor = (probability: number, index: number, total: number): 'again' | 'good' =>
  index / total < probability ? 'good' : 'again';

// Conceito não é uniforme dentro de uma aula: "Ciclo de Krebs" despenca e "Glicólise" segura.
// Sem esse espalhamento o relatório mostra cinco linhas com o mesmo número e denuncia dado
// fabricado. O desvio é determinístico para o seed ser reprodutível.
const spreadForCard = (cardIndex: number): number => ((cardIndex * 37) % 25) / 100 - 0.12;

const clamp = (value: number): number => Math.min(Math.max(value, 0.2), 0.98);

interface StoredCard {
  id: string;
  keyTerm: string;
}


const findOrCreateTheme = async (
  notebookId: string,
  title: string,
  createdAt: Date,
): Promise<string> => {
  const [created] = (
    await db.execute(sql`
      insert into themes (notebook_id, title, created_at)
      select ${notebookId}, ${title}, ${createdAt.toISOString()}
      where not exists (
        select 1 from themes where notebook_id = ${notebookId} and title = ${title}
      )
      returning id
    `)
  ).rows as { id: string }[];
  if (created) return created.id;

  const [found] = (
    await db.execute(sql`
      select id from themes where notebook_id = ${notebookId} and title = ${title} limit 1
    `)
  ).rows as { id: string }[];
  if (!found) throw new Error(`tema não encontrado: ${title}`);
  return found.id;
};

const approvedCardsOf = async (themeId: string): Promise<StoredCard[]> =>
  (
    await db.execute(sql`
      select cards.id, card_versions.key_term
      from cards
      join card_versions on card_versions.card_id = cards.id
       and card_versions.version = cards.current_version
      where cards.theme_id = ${themeId} and cards.status = 'approved'
    `)
  ).rows.map((row) => ({
    id: (row as { id: string }).id,
    keyTerm: (row as { key_term: string }).key_term,
  }));

const storeCards = async (
  themeId: string,
  subject: string,
  topic: string,
  cardCount: number,
  createdAt: Date,
  teacherId: string | null,
): Promise<StoredCard[]> => {
  const generated = await generator.generate({
    topic: `${subject} — ${topic}. Gere exatamente ${cardCount} cards para um pré-vestibulando brasileiro.`,
  });

  const illustrations = await resolveIllustrations(
    generated.cards.map((card) => card.illustration ?? ''),
  );

  const stored: StoredCard[] = [];

  for (const card of generated.cards.slice(0, cardCount)) {
    const [row] = (
      await db.execute(sql`
        insert into cards (theme_id, status, source, reviewed_by, reviewed_at, created_at)
        values (${themeId}, 'approved', 'ai', ${teacherId}, ${createdAt.toISOString()}, ${createdAt.toISOString()})
        returning id
      `)
    ).rows as { id: string }[];
    if (!row) continue;

    await db.execute(sql`
      insert into card_versions
        (card_id, version, question, key_term, highlight_term, options, correct_option_id, image_url, created_at)
      values (${row.id}, 1, ${card.question}, ${card.keyTerm}, ${card.highlightTerm},
        ${JSON.stringify(card.options)}::jsonb, ${card.correctOptionId},
        ${illustrations.get(card.illustration ?? '') ?? null}, ${createdAt.toISOString()})
    `);

    stored.push({ id: row.id, keyTerm: card.keyTerm });
  }

  console.log(
    `  ${subject} · ${topic}: ${stored.length} cards, ${illustrations.size} figuras`,
  );

  // O tier gratuito conta requisição por minuto: oito gerações em rajada estouram a janela.
  await new Promise((resolve) => setTimeout(resolve, BETWEEN_GENERATIONS_MS));
  return stored;
};

const recordClassAnswers = async (
  cards: StoredCard[],
  classmates: { id: string }[],
  publishedAt: Date,
  lesson: Lesson,
): Promise<void> => {
  const offsets = [0, 7, 30].filter(
    (days) => publishedAt.getTime() + days * 86_400_000 <= Date.now(),
  );

  for (const [cardIndex, card] of cards.entries()) {
    const spread = spreadForCard(cardIndex);

    for (const [index, classmate] of classmates.entries()) {
      for (const offsetDays of offsets) {
        const base = offsetDays === 0 ? lesson.accuracyOnDay : lesson.retentionD7;
        const probability = clamp(base + spread);
        const reviewedAt = new Date(
          publishedAt.getTime() + offsetDays * 86_400_000 + 3_600_000 + index * 60_000,
        );
        await db.execute(sql`
          insert into review_logs
            (student_id, card_id, card_version, rating, origin, reviewed_at,
             previous_state, previous_due, next_due, elapsed_days, scheduled_days, xp_gained)
          values
            (${classmate.id}, ${card.id}, 1, ${ratingFor(probability, index, classmates.length)},
             'feed', ${reviewedAt.toISOString()}, ${offsetDays === 0 ? 0 : 2},
             ${reviewedAt.toISOString()},
             ${new Date(reviewedAt.getTime() + 16 * 86_400_000).toISOString()}, ${offsetDays}, 16, 10)
          on conflict do nothing
        `);
      }
    }
  }
};


/** Sem histórico da aluna em todas as matérias, a Evolução mostra "Química 0%" para matéria
 *  que ela nunca abriu, e a fila do dia devolve só card do professor. */
const seedStudentHistory = async (): Promise<void> => {
  await db.execute(sql`delete from review_logs where student_id = ${STUDENT_ID}`);
  await db.execute(sql`delete from card_states where student_id = ${STUDENT_ID}`);
  await db.execute(sql`delete from daily_progress where student_id = ${STUDENT_ID}`);

  const rows = (
    await db.execute(sql`
      select coalesce(notebooks.subject, notebooks.title) as subject, cards.id
      from cards
      join themes on themes.id = cards.theme_id
      join notebooks on notebooks.id = themes.notebook_id
      where cards.status = 'approved'
        and (notebooks.student_id = ${STUDENT_ID} or notebooks.teacher_id is not null)
      order by 1, cards.created_at
    `)
  ).rows as { subject: string; id: string }[];

  const bySubject = new Map<string, { id: string }[]>();
  for (const row of rows) {
    bySubject.set(row.subject, [...(bySubject.get(row.subject) ?? []), { id: row.id }]);
  }

  // Matéria firme, matéria caindo e matéria no meio: é o contraste que faz a Evolução dizer algo.
  const accuracyBySubject: Record<string, number> = {
    Biologia: 0.86,
    Física: 0.72,
    História: 0.8,
    Química: 0.58,
    Matemática: 0.64,
    Literatura: 0.9,
  };

  let answered = 0;

  for (const [subject, cards] of bySubject) {
    const accuracy = accuracyBySubject[subject] ?? 0.75;

    for (const [index, card] of cards.entries()) {
      const reviewedAt = daysAgo(2 + ((index * 3) % 18));
      const rating = (index * 37) % 100 < accuracy * 100 ? 'good' : 'again';
      // Dois cards por matéria vencem hoje: a fila do dia abre misturando as seis matérias
      // e as duas origens, em vez de só o que o professor publicou.
      const dueDaysAgo = index < 2 ? 0 : -(3 + (index % 9));

      await db.execute(sql`
        insert into review_logs
          (student_id, card_id, card_version, rating, origin, reviewed_at,
           previous_state, previous_due, next_due, elapsed_days, scheduled_days, xp_gained)
        values (${STUDENT_ID}, ${card.id}, 1, ${rating}, 'feed', ${reviewedAt.toISOString()},
          1, ${reviewedAt.toISOString()}, ${daysAgo(dueDaysAgo).toISOString()}, 3, 7, 10)
        on conflict do nothing
      `);

      await db.execute(sql`
        insert into card_states
          (student_id, card_id, due, stability, difficulty, elapsed_days, scheduled_days,
           learning_steps, reps, lapses, state, last_review)
        values (${STUDENT_ID}, ${card.id}, ${daysAgo(dueDaysAgo).toISOString()},
          ${rating === 'good' ? 9 + (index % 6) * 2 : 3}, 5.2, 3, 7, 0,
          ${2 + (index % 3)}, ${rating === 'good' ? 0 : 1}, 2, ${reviewedAt.toISOString()})
        on conflict do nothing
      `);

      answered += 1;
    }
  }

  for (let offset = 0; offset < 16; offset += 1) {
    const day = daysAgo(offset).toISOString().slice(0, 10);
    const reviews = offset === 4 ? 0 : 14 + ((offset * 7) % 18);
    if (reviews === 0) continue;
    await db.execute(sql`
      insert into daily_progress (student_id, day, reviews, xp, goal, met_goal)
      values (${STUDENT_ID}, ${day}, ${reviews}, ${reviews * 10}, 20, ${reviews >= 20})
      on conflict (student_id, day) do nothing
    `);
  }

  console.log(`  histórico da aluna: ${answered} revisões em ${bySubject.size} matérias`);
};


/** A revisão registrada não gera estado FSRS sozinha, e é o estado que diz se o aluno está
 *  firme, em risco ou esquecendo. Sem isto o painel conta um aluno só. */
const materializeClassStates = async (): Promise<void> => {
  const inserted = (
    await db.execute(sql`
      insert into card_states
        (student_id, card_id, due, stability, difficulty, elapsed_days, scheduled_days,
         learning_steps, reps, lapses, state, last_review)
      select
        ultimo.student_id,
        ultimo.card_id,
        ultimo.reviewed_at + (ultimo.estabilidade || ' days')::interval,
        ultimo.estabilidade,
        5.2,
        3,
        ultimo.estabilidade,
        0,
        ultimo.revisoes,
        ultimo.erros,
        2,
        ultimo.reviewed_at
      from (
        select distinct on (review_logs.student_id, review_logs.card_id)
          review_logs.student_id,
          review_logs.card_id,
          review_logs.reviewed_at,
          count(*) over (partition by review_logs.student_id, review_logs.card_id)::int as revisoes,
          count(*) filter (where review_logs.rating = 'again')
            over (partition by review_logs.student_id, review_logs.card_id)::int as erros,
          case when review_logs.rating = 'again' then 4 else 11 + (abs(hashtext(review_logs.card_id::text)) % 12) end as estabilidade
        from review_logs
        order by review_logs.student_id, review_logs.card_id, review_logs.reviewed_at desc
      ) as ultimo
      on conflict do nothing
      returning student_id
    `)
  ).rows.length;

  console.log(`  estado FSRS materializado para ${inserted} pares aluno/card`);
};

const seed = async (): Promise<void> => {
  // Geração custa quota do tier gratuito. Reexecutar o seed reaproveita o que já existe e
  // só gera o que falta, então uma falha no meio não joga fora as aulas já geradas.
  const [existing] = (
    await db.execute(sql`select count(*)::int as cards from cards where status = 'approved'`)
  ).rows as { cards: number }[];
  const reusing = Number(existing?.cards ?? 0) > 0;

  if (!reusing) {
    await db.execute(sql`
      truncate review_logs, card_states, daily_progress, card_versions, cards, themes,
        notebooks, student_leagues, students, teachers, school_classes restart identity cascade
    `);
  } else {
    console.log(`  reaproveitando ${existing?.cards} cards já gerados`);
  }

  for (const schoolClass of CLASSES) {
    await db.execute(sql`
      insert into school_classes (id, school, name, grade)
      values (${schoolClass.id}, ${SCHOOL}, ${schoolClass.name}, ${schoolClass.grade})
      on conflict (id) do nothing
    `);
  }

  await db.execute(sql`
    insert into students (id, class_id, display_name, daily_goal, new_cards_per_day)
    values (${STUDENT_ID}, ${CLASS_ID}, 'Ana Paula Ribeiro', 20, 12)
    on conflict (id) do nothing
  `);

  // Nome de verdade em vez de "Aluno 7": a lista de quem não respondeu precisa ser legível.
  const classmateNames = [
    'Beatriz Almeida', 'Bruno Melo', 'Caio Fernandes', 'Camila Rocha', 'Carla Souza',
    'Daniel Vieira', 'Diego Reis', 'Eduarda Lima', 'Felipe Cardoso', 'Gabriela Nunes',
    'Gustavo Pinto', 'Helena Barros', 'Igor Moreira', 'Isabela Castro', 'João Pedro Alves',
    'Júlia Mendes', 'Larissa Gomes', 'Leonardo Dias', 'Letícia Farias', 'Lucas Teixeira',
    'Mariana Duarte', 'Matheus Ramos', 'Nicolas Correia', 'Rafaela Pires', 'Rodrigo Lima',
    'Sofia Machado', 'Thiago Batista', 'Vinícius Campos', 'Vitória Freitas', 'Yasmin Andrade',
    'Arthur Siqueira', 'Clara Monteiro', 'Enzo Tavares',
  ];
  for (const name of classmateNames) {
    await db.execute(sql`
      insert into students (class_id, display_name)
      select ${CLASS_ID}, ${name}
      where not exists (select 1 from students where display_name = ${name})
    `);
  }

  // 27 dos 34 respondem: os 7 restantes são quem o professor vê em "ainda não responderam".
  const classmates = (
    await db.execute(sql`select id from students order by display_name asc limit 27`)
  ).rows as { id: string }[];

  for (const teacher of teachers) {
    await db.execute(sql`
      insert into teachers (id, display_name) values (${teacher.id}, ${teacher.displayName})
      on conflict (id) do nothing
    `);

    const [notebook] = (
      await db.execute(sql`
        insert into notebooks (teacher_id, class_id, title, subject, source_label)
        select ${teacher.id}, ${CLASS_ID}, ${teacher.lessons[0]?.subject ?? 'Geral'},
               ${teacher.lessons[0]?.subject ?? 'Geral'}, 'Aula publicada'
        where not exists (
          select 1 from notebooks
          where teacher_id = ${teacher.id} and title = ${teacher.lessons[0]?.subject ?? 'Geral'}
        )
        returning id
      `)
    ).rows as { id: string }[];

    const notebookId =
      notebook?.id ??
      (
        (
          await db.execute(sql`
            select id from notebooks
            where teacher_id = ${teacher.id} and title = ${teacher.lessons[0]?.subject ?? 'Geral'}
            limit 1
          `)
        ).rows as { id: string }[]
      )[0]?.id;
    if (!notebookId) continue;

    for (const lesson of teacher.lessons) {
      const publishedAt = daysAgo(lesson.publishedDaysAgo);
      const themeId = await findOrCreateTheme(notebookId, lesson.topic, publishedAt);
      const existingCards = await approvedCardsOf(themeId);

      const cards = existingCards.length
        ? existingCards
        : await storeCards(
        themeId,
        lesson.subject,
        lesson.topic,
        lesson.cardCount,
        publishedAt,
        teacher.id,
      );
      await recordClassAnswers(cards, classmates, publishedAt, lesson);
    }
  }

  for (const [index, study] of ownStudy.entries()) {
    const createdAt = daysAgo(index * 3 + 2);
    const [notebook] = (
      await db.execute(sql`
        insert into notebooks (student_id, class_id, title, subject, source_label, created_at)
        values (${STUDENT_ID}, ${CLASS_ID}, ${study.subject}, ${study.subject},
                'Você escolheu', ${createdAt.toISOString()})
        on conflict (student_id, title) do update set updated_at = now()
        returning id
      `)
    ).rows as { id: string }[];
    if (!notebook) continue;

    const themeId = await findOrCreateTheme(notebook.id, study.theme, createdAt);
    if ((await approvedCardsOf(themeId)).length > 0) continue;

    await storeCards(themeId, study.subject, study.theme, study.cardCount, createdAt, null);
  }

  await seedStudentHistory();
  await materializeClassStates();

  const [totals] = (
    await db.execute(sql`select count(*)::int as cards from cards where status = 'approved'`)
  ).rows as { cards: number }[];

  console.log(`seed ok — ${totals?.cards ?? 0} cards aprovados · aluna ${STUDENT_ID}`);
};

await seed();
await pool.end();
