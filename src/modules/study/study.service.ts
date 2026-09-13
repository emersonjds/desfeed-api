import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { notFound } from '../../shared/http/errors.js';
import type { CardGenerator } from '../ingestion/card-generator.js';
import { emptyState, toContract } from '../scheduling/fsrs.js';
import type { QueueCard } from '../scheduling/scheduling.schemas.js';
import type {
  GenerateSessionBody,
  GenerateSessionResponse,
  StudyThemesResponse,
} from './study.schemas.js';

export interface StudyService {
  listThemes: (studentId: string) => Promise<StudyThemesResponse>;
  generateSession: (
    studentId: string,
    body: GenerateSessionBody,
  ) => Promise<GenerateSessionResponse>;
}

interface ThemeRow {
  id: string;
  subject: string;
  title: string;
  card_count: number;
  misses: number;
  due_in_days: number | null;
}

const reasonFor = (row: ThemeRow): string => {
  if (Number(row.misses) > 0) {
    return `Você errou ${row.misses} card${Number(row.misses) > 1 ? 's' : ''} deste tema na última semana`;
  }
  if (row.due_in_days !== null && Number(row.due_in_days) <= 3) {
    return `Prestes a ser esquecido — revisão vence em ${Math.max(Number(row.due_in_days), 0)} dia(s)`;
  }
  return 'Tema novo na sua trilha';
};

export const createStudyService = (
  db: Database,
  generator: CardGenerator | undefined,
): StudyService => ({
  listThemes: async (studentId) => {
    const rows = (
      await db.execute(sql`
        select
          themes.id,
          coalesce(notebooks.subject, notebooks.title) as subject,
          themes.title,
          count(distinct cards.id)::int as card_count,
          count(review_logs.id) filter (
            where review_logs.rating = 'again'
              and review_logs.reviewed_at >= now() - interval '7 days'
          )::int as misses,
          min(extract(epoch from (card_states.due - now())) / 86400)::int as due_in_days
        from themes
        join notebooks on notebooks.id = themes.notebook_id
        join cards on cards.theme_id = themes.id and cards.status = 'approved'
        left join card_states on card_states.card_id = cards.id and card_states.student_id = ${studentId}
        left join review_logs on review_logs.card_id = cards.id and review_logs.student_id = ${studentId}
        where notebooks.student_id = ${studentId} or notebooks.teacher_id is not null
        group by themes.id, 2, themes.title
        order by misses desc, due_in_days asc nulls last
        limit 6
      `)
    ).rows as unknown as ThemeRow[];

    const subjects = (
      await db.execute(sql`
        select distinct coalesce(notebooks.subject, notebooks.title) as subject
        from notebooks
        where notebooks.student_id = ${studentId} or notebooks.teacher_id is not null
        order by 1
      `)
    ).rows as { subject: string }[];

    return {
      suggested: rows
        .filter((row) => Number(row.card_count) > 0)
        .map((row) => ({
          id: row.id,
          subject: row.subject,
          title: row.title,
          reason: reasonFor(row),
          cardCount: Number(row.card_count),
        })),
      subjects: subjects.map((row) => row.subject),
    };
  },

  generateSession: async (studentId, body) => {
    if (!generator) throw notFound('Geração de cards indisponível.');

    const [student] = (
      await db.execute(sql`select id from students where id = ${studentId} limit 1`)
    ).rows as { id: string }[];
    if (!student) throw notFound('Aluno não encontrado.');

    const generated = await generator.generate({
      topic: `${body.subject} — ${body.theme}. Gere exatamente ${body.cardCount} cards.`,
    });

    const [notebook] = (
      await db.execute(sql`
        insert into notebooks (student_id, title, subject, source_label)
        values (${studentId}, ${body.subject}, ${body.subject}, 'Você escolheu')
        on conflict (student_id, title) do update set updated_at = now()
        returning id
      `)
    ).rows as { id: string }[];
    if (!notebook) throw new Error('notebook upsert returned no row');

    const [theme] = (
      await db.execute(sql`
        insert into themes (notebook_id, title)
        select ${notebook.id}, ${body.theme}
        where not exists (
          select 1 from themes where notebook_id = ${notebook.id} and title = ${body.theme}
        )
        returning id
      `)
    ).rows as { id: string }[];

    const themeId =
      theme?.id ??
      (
        (
          await db.execute(sql`
            select id from themes where notebook_id = ${notebook.id} and title = ${body.theme} limit 1
          `)
        ).rows as { id: string }[]
      )[0]?.id;
    if (!themeId) throw new Error('theme lookup failed');

    const now = new Date();
    const cards: QueueCard[] = [];

    // O aluno pediu: não existe curadoria de professor no meio. Nasce aprovado e cai na fila.
    for (const generatedCard of generated.cards.slice(0, body.cardCount)) {
      const [card] = (
        await db.execute(sql`
          insert into cards (theme_id, status, source) values (${themeId}, 'approved', 'ai')
          returning id
        `)
      ).rows as { id: string }[];
      if (!card) continue;

      await db.execute(sql`
        insert into card_versions
          (card_id, version, question, key_term, highlight_term, options, correct_option_id)
        values (
          ${card.id}, 1, ${generatedCard.question}, ${generatedCard.keyTerm},
          ${generatedCard.highlightTerm}, ${JSON.stringify(generatedCard.options)}::jsonb,
          ${generatedCard.correctOptionId}
        )
      `);

      cards.push({
        id: card.id,
        origin: { kind: 'proprio', theme: body.theme },
        subject: body.subject,
        chapter: body.theme,
        imageUrl: '',
        question: generatedCard.question,
        keyTerm: generatedCard.keyTerm,
        highlightTerm: generatedCard.highlightTerm,
        options: generatedCard.options,
        correctOptionId: generatedCard.correctOptionId,
        reviewNumber: 0,
        masteryPercent: 0,
        bookmarkCount: 0,
        shareCount: 0,
        fsrs: toContract(emptyState(now)),
      });
    }

    return { theme: body.theme, cards };
  },
});
