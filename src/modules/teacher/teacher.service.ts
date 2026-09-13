import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { notFound } from '../../shared/http/errors.js';
import type { CardGenerator } from '../ingestion/card-generator.js';
import type {
  ClassReport,
  GenerateLessonBody,
  GenerateLessonResponse,
  PublishLessonBody,
  PublishLessonResponse,
} from './teacher.schemas.js';

export interface TeacherService {
  generateLesson: (
    teacherId: string,
    body: GenerateLessonBody,
  ) => Promise<GenerateLessonResponse>;
  publishLesson: (
    teacherId: string,
    lessonId: string,
    body: PublishLessonBody,
  ) => Promise<PublishLessonResponse>;
  getClassReport: (teacherId: string) => Promise<ClassReport>;
}

// A aula só entra no relatório depois de publicada; o rascunho vive como card pendente.
const LESSON_STATUS_DRAFT = 'pending';

interface LessonRow {
  id: string;
  topic: string;
  published_at: string;
  answered_by: number;
}

interface ConceptRow {
  lesson_id: string;
  concept: string;
  accuracy_on_day: number;
  retention_d7: number;
}

const percent = (value: unknown): number => Math.min(Math.max(Math.round(Number(value ?? 0)), 0), 100);

export const createTeacherService = (
  db: Database,
  generator: CardGenerator | undefined,
): TeacherService => ({
  generateLesson: async (teacherId, body) => {
    if (!generator) throw notFound('Geração de cards indisponível.');

    const [teacher] = (
      await db.execute(sql`select id, display_name from teachers where id = ${teacherId} limit 1`)
    ).rows as { id: string; display_name: string }[];
    if (!teacher) throw notFound('Professor não encontrado.');

    const generated = await generator.generate({
      topic: `${body.subject} — ${body.topic}. Gere exatamente ${body.questionCount} cards.`,
    });

    const [notebook] = (
      await db.execute(sql`
        insert into notebooks (teacher_id, title, subject, source_label)
        select ${teacherId}, ${body.subject}, ${body.subject}, 'Aula publicada'
        where not exists (
          select 1 from notebooks where teacher_id = ${teacherId} and title = ${body.subject}
        )
        returning id
      `)
    ).rows as { id: string }[];

    const notebookId =
      notebook?.id ??
      (
        (
          await db.execute(sql`
            select id from notebooks where teacher_id = ${teacherId} and title = ${body.subject} limit 1
          `)
        ).rows as { id: string }[]
      )[0]?.id;
    if (!notebookId) throw new Error('notebook lookup failed');

    const [theme] = (
      await db.execute(sql`
        insert into themes (notebook_id, title) values (${notebookId}, ${body.topic}) returning id
      `)
    ).rows as { id: string }[];
    if (!theme) throw new Error('theme insert returned no row');

    const questions: GenerateLessonResponse['questions'] = [];

    for (const generatedCard of generated.cards.slice(0, body.questionCount)) {
      const [card] = (
        await db.execute(sql`
          insert into cards (theme_id, status, source, reviewed_by)
          values (${theme.id}, ${LESSON_STATUS_DRAFT}, 'ai', ${teacherId})
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

      const correct = generatedCard.options.find(
        (option) => option.id === generatedCard.correctOptionId,
      );

      questions.push({
        id: card.id,
        question: generatedCard.question,
        correctAnswer: correct?.label ?? generatedCard.keyTerm,
        approved: true,
      });
    }

    return { lessonId: theme.id, topic: body.topic, questions };
  },

  publishLesson: async (teacherId, lessonId, body) => {
    const [theme] = (
      await db.execute(sql`
        select themes.id
        from themes
        join notebooks on notebooks.id = themes.notebook_id
        where themes.id = ${lessonId} and notebooks.teacher_id = ${teacherId}
        limit 1
      `)
    ).rows as { id: string }[];
    if (!theme) throw notFound('Aula não encontrada para este professor.');

    const approvedIds = sql.join(
      body.approvedQuestionIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );

    const published = (
      await db.execute(sql`
        update cards set status = 'approved', reviewed_by = ${teacherId}, reviewed_at = now()
        where theme_id = ${lessonId} and id in (${approvedIds})
        returning id
      `)
    ).rows.length;

    const discarded = (
      await db.execute(sql`
        update cards set status = 'rejected', reviewed_by = ${teacherId}, reviewed_at = now()
        where theme_id = ${lessonId} and status = 'pending' and id not in (${approvedIds})
        returning id
      `)
    ).rows.length;

    // A aula vale a partir da publicação, não da geração: é o que a retenção D+7 mede.
    await db.execute(sql`update themes set created_at = now() where id = ${lessonId}`);

    return { lessonId, published, discarded };
  },

  getClassReport: async (teacherId) => {
    const [teacher] = (
      await db.execute(sql`select id, display_name from teachers where id = ${teacherId} limit 1`)
    ).rows as { id: string; display_name: string }[];
    if (!teacher) throw notFound('Professor não encontrado.');

    const lessons = (
      await db.execute(sql`
        select
          themes.id,
          themes.title as topic,
          themes.created_at as published_at,
          count(distinct review_logs.student_id)::int as answered_by
        from themes
        join notebooks on notebooks.id = themes.notebook_id
        join cards on cards.theme_id = themes.id and cards.status = 'approved'
        left join review_logs on review_logs.card_id = cards.id
        where notebooks.teacher_id = ${teacherId}
        group by themes.id, themes.title, themes.created_at
        order by themes.created_at desc
      `)
    ).rows as unknown as LessonRow[];

    const concepts = (
      await db.execute(sql`
        select
          themes.id as lesson_id,
          card_versions.key_term as concept,
          coalesce(
            100.0 * count(*) filter (
              where review_logs.rating <> 'again'
                and review_logs.reviewed_at < themes.created_at + interval '1 day'
            ) / nullif(count(*) filter (
              where review_logs.reviewed_at < themes.created_at + interval '1 day'
            ), 0),
            0
          ) as accuracy_on_day,
          coalesce(
            100.0 * count(*) filter (
              where review_logs.rating <> 'again'
                and review_logs.reviewed_at >= themes.created_at + interval '6 days'
            ) / nullif(count(*) filter (
              where review_logs.reviewed_at >= themes.created_at + interval '6 days'
            ), 0),
            0
          ) as retention_d7
        from themes
        join notebooks on notebooks.id = themes.notebook_id
        join cards on cards.theme_id = themes.id and cards.status = 'approved'
        join card_versions on card_versions.card_id = cards.id
         and card_versions.version = cards.current_version
        left join review_logs on review_logs.card_id = cards.id
        where notebooks.teacher_id = ${teacherId}
        group by themes.id, card_versions.key_term
      `)
    ).rows as unknown as ConceptRow[];

    const [totals] = (
      await db.execute(sql`
        select
          (select count(*)::int from students) as student_count,
          count(distinct review_logs.student_id)::int as active_students,
          coalesce(100.0 * count(*) filter (
            where review_logs.rating <> 'again'
              and review_logs.reviewed_at >= themes.created_at + interval '6 days'
          ) / nullif(count(*) filter (
            where review_logs.reviewed_at >= themes.created_at + interval '6 days'
          ), 0), 0) as retention_d7,
          coalesce(100.0 * count(*) filter (
            where review_logs.rating <> 'again'
              and review_logs.reviewed_at >= themes.created_at + interval '25 days'
          ) / nullif(count(*) filter (
            where review_logs.reviewed_at >= themes.created_at + interval '25 days'
          ), 0), 0) as retention_d30
        from themes
        join notebooks on notebooks.id = themes.notebook_id
        join cards on cards.theme_id = themes.id and cards.status = 'approved'
        left join review_logs on review_logs.card_id = cards.id
        where notebooks.teacher_id = ${teacherId}
      `)
    ).rows as {
      student_count: number;
      active_students: number;
      retention_d7: number;
      retention_d30: number;
    }[];

    const [subjectRow] = (
      await db.execute(sql`
        select coalesce(subject, title) as subject
        from notebooks where teacher_id = ${teacherId}
        order by created_at asc limit 1
      `)
    ).rows as { subject: string }[];

    const studentCount = Math.max(Number(totals?.student_count ?? 0), 1);

    return {
      className: '2º ano B',
      subject: subjectRow?.subject ?? 'Sem matéria',
      studentCount,
      participation: percent((Number(totals?.active_students ?? 0) / studentCount) * 100),
      retentionD7: percent(totals?.retention_d7),
      retentionD30: percent(totals?.retention_d30),
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        topic: lesson.topic,
        publishedAt: new Date(lesson.published_at).toISOString(),
        answeredBy: Number(lesson.answered_by),
        concepts: concepts
          .filter((concept) => concept.lesson_id === lesson.id)
          .map((concept) => ({
            concept: concept.concept,
            accuracyOnDay: percent(concept.accuracy_on_day),
            retentionD7: percent(concept.retention_d7),
          })),
      })),
    };
  },
});
