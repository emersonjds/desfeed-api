import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { notFound } from '../../shared/http/errors.js';
import { resolveIllustrations } from '../../shared/media/wikimedia.js';
import type { CardGenerator } from '../ingestion/card-generator.js';
import type {
  ClassReport,
  ClassStudentsResponse,
  GenerateLessonBody,
  GenerateLessonResponse,
  LessonDetail,
  PublishLessonBody,
  PublishLessonResponse,
  ReinforcementBody,
  ReinforcementResponse,
  TeacherClassesResponse,
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
  getLessonDetail: (teacherId: string, lessonId: string) => Promise<LessonDetail>;
  listStudents: (teacherId: string) => Promise<ClassStudentsResponse>;
  listClasses: (teacherId: string) => Promise<TeacherClassesResponse>;
  createReinforcement: (
    teacherId: string,
    studentId: string,
    body: ReinforcementBody,
  ) => Promise<ReinforcementResponse>;
}

// A aula só entra no relatório depois de publicada; o rascunho vive como card pendente.
const LESSON_STATUS_DRAFT = 'pending';

interface LessonRow {
  id: string;
  topic: string;
  published_at: string;
  answered_by: number;
  class_name: string | null;
  school: string | null;
  student_count: number;
}

// O aluno está em um dos três estados para um conceito. O corte é a estabilidade do FSRS:
// abaixo de 7 dias a memória não atravessa a semana, e sem estado nenhum ele nunca respondeu.
const STANDING_SQL = sql`
  count(distinct card_states.student_id) filter (where card_states.stability >= 14) as consolidated,
  count(distinct card_states.student_id) filter (where card_states.stability >= 7 and card_states.stability < 14) as at_risk,
  count(distinct card_states.student_id) filter (where card_states.stability < 7) as forgotten
`;

interface ConceptRow {
  lesson_id: string;
  concept: string;
  accuracy_on_day: number;
  retention_d7: number;
}

// Corte pela estabilidade do FSRS: abaixo de 7 dias a memória não atravessa a semana.
const standingFor = (stability: number | null): 'firme' | 'em-risco' | 'esquecido' | 'sem-dados' => {
  if (stability === null) return 'sem-dados';
  if (stability >= 14) return 'firme';
  if (stability >= 7) return 'em-risco';
  return 'esquecido';
};

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
        insert into notebooks (teacher_id, class_id, title, subject, source_label)
        select ${teacherId}, ${body.classId ?? null}, ${body.subject}, ${body.subject}, 'Aula publicada'
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

    const illustrations = await resolveIllustrations(
      generated.cards.map((card) => card.illustration ?? ''),
    );

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
          (card_id, version, question, key_term, highlight_term, options, correct_option_id, image_url)
        values (
          ${card.id}, 1, ${generatedCard.question}, ${generatedCard.keyTerm},
          ${generatedCard.highlightTerm}, ${JSON.stringify(generatedCard.options)}::jsonb,
          ${generatedCard.correctOptionId},
          ${illustrations.get(generatedCard.illustration ?? '') ?? null}
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

  getLessonDetail: async (teacherId, lessonId) => {
    const [lesson] = (
      await db.execute(sql`
        select
          themes.id,
          themes.title as topic,
          themes.created_at as published_at,
          coalesce(notebooks.subject, notebooks.title) as subject,
          coalesce(school_classes.name, 'Turma sem nome') as class_name,
          coalesce(school_classes.school, 'Escola sem nome') as school,
          coalesce(school_classes.grade, '—') as grade,
          notebooks.class_id
        from themes
        join notebooks on notebooks.id = themes.notebook_id
        left join school_classes on school_classes.id = notebooks.class_id
        where themes.id = ${lessonId} and notebooks.teacher_id = ${teacherId}
        limit 1
      `)
    ).rows as {
      id: string;
      topic: string;
      published_at: string;
      subject: string;
      class_name: string;
      school: string;
      grade: string;
      class_id: string | null;
    }[];
    if (!lesson) throw notFound('Aula não encontrada para este professor.');

    const [counts] = (
      await db.execute(sql`
        select
          (select count(*)::int from cards where theme_id = ${lessonId} and status = 'approved') as question_count,
          (select count(*)::int from students where class_id is not distinct from ${lesson.class_id}) as student_count,
          (
            select count(distinct review_logs.student_id)::int
            from review_logs
            join cards on cards.id = review_logs.card_id
            where cards.theme_id = ${lessonId}
          ) as answered_by
      `)
    ).rows as { question_count: number; student_count: number; answered_by: number }[];

    const concepts = (
      await db.execute(sql`
        select
          card_versions.key_term as concept,
          coalesce(100.0 * count(review_logs.id) filter (
            where review_logs.rating <> 'again'
              and review_logs.reviewed_at < themes.created_at + interval '1 day'
          ) / nullif(count(review_logs.id) filter (
            where review_logs.reviewed_at < themes.created_at + interval '1 day'
          ), 0), 0) as accuracy_on_day,
          coalesce(100.0 * count(review_logs.id) filter (
            where review_logs.rating <> 'again'
              and review_logs.reviewed_at >= themes.created_at + interval '6 days'
          ) / nullif(count(review_logs.id) filter (
            where review_logs.reviewed_at >= themes.created_at + interval '6 days'
          ), 0), 0) as retention_d7,
          ${STANDING_SQL}
        from cards
        join themes on themes.id = cards.theme_id
        join card_versions on card_versions.card_id = cards.id
         and card_versions.version = cards.current_version
        left join review_logs on review_logs.card_id = cards.id
        left join card_states on card_states.card_id = cards.id
        where cards.theme_id = ${lessonId} and cards.status = 'approved'
        group by card_versions.key_term
        order by 2 - 3 desc
      `)
    ).rows as unknown as {
      concept: string;
      accuracy_on_day: number;
      retention_d7: number;
      consolidated: number;
      at_risk: number;
      forgotten: number;
    }[];

    const pending = (
      await db.execute(sql`
        select students.id, students.display_name
        from students
        where students.class_id is not distinct from ${lesson.class_id}
          and not exists (
            select 1 from review_logs
            join cards on cards.id = review_logs.card_id
            where cards.theme_id = ${lessonId} and review_logs.student_id = students.id
          )
        order by students.display_name
        limit 40
      `)
    ).rows as { id: string; display_name: string }[];

    return {
      id: lesson.id,
      topic: lesson.topic,
      subject: lesson.subject,
      publishedAt: new Date(lesson.published_at).toISOString(),
      className: lesson.class_name,
      school: lesson.school,
      grade: lesson.grade,
      questionCount: Number(counts?.question_count ?? 0),
      studentCount: Number(counts?.student_count ?? 0),
      answeredBy: Number(counts?.answered_by ?? 0),
      concepts: concepts.map((row) => ({
        concept: row.concept,
        accuracyOnDay: percent(row.accuracy_on_day),
        retentionD7: percent(row.retention_d7),
        consolidated: Number(row.consolidated),
        atRisk: Number(row.at_risk),
        forgotten: Number(row.forgotten),
      })),
      pendingStudents: pending.map((row) => ({ id: row.id, displayName: row.display_name })),
    };
  },

  listClasses: async (teacherId) => {
    const classes = (
      await db.execute(sql`
        select
          school_classes.id,
          school_classes.school,
          school_classes.name,
          school_classes.grade,
          (select count(*)::int from students where students.class_id = school_classes.id) as student_count
        from school_classes
        order by school_classes.grade, school_classes.name
      `)
    ).rows as {
      id: string;
      school: string;
      name: string;
      grade: string;
      student_count: number;
    }[];

    const subjects = (
      await db.execute(sql`
        select distinct coalesce(subject, title) as subject
        from notebooks where teacher_id = ${teacherId}
        order by 1
      `)
    ).rows as { subject: string }[];

    return {
      subjects: subjects.map((row) => row.subject),
      classes: classes.map((row) => ({
        id: row.id,
        school: row.school,
        name: row.name,
        grade: row.grade,
        studentCount: Number(row.student_count),
      })),
    };
  },

  listStudents: async (teacherId) => {
    const [context] = (
      await db.execute(sql`
        select
          coalesce(notebooks.subject, notebooks.title) as subject,
          coalesce(school_classes.name, 'Turma sem nome') as class_name,
          coalesce(school_classes.school, 'Escola sem nome') as school,
          notebooks.class_id
        from notebooks
        left join school_classes on school_classes.id = notebooks.class_id
        where notebooks.teacher_id = ${teacherId}
        order by notebooks.created_at asc
        limit 1
      `)
    ).rows as { subject: string; class_name: string; school: string; class_id: string | null }[];
    if (!context) throw notFound('Professor não encontrado.');

    const rows = (
      await db.execute(sql`
        with lessons as (
          select themes.id
          from themes
          join notebooks on notebooks.id = themes.notebook_id
          where notebooks.teacher_id = ${teacherId}
        )
        select
          students.id,
          students.display_name,
          (select count(*)::int from lessons) as total_lessons,
          count(distinct cards.theme_id)::int as answered_lessons,
          avg(card_states.stability) as stability
        from students
        left join card_states on card_states.student_id = students.id
        left join cards on cards.id = card_states.card_id
         and cards.theme_id in (select id from lessons)
        where students.class_id is not distinct from ${context.class_id}
        group by students.id, students.display_name
        order by students.display_name
      `)
    ).rows as unknown as {
      id: string;
      display_name: string;
      total_lessons: number;
      answered_lessons: number;
      stability: number | null;
    }[];

    const weakest = (
      await db.execute(sql`
        select card_states.student_id, card_versions.key_term as concept
        from card_states
        join cards on cards.id = card_states.card_id and cards.status = 'approved'
        join card_versions on card_versions.card_id = cards.id
         and card_versions.version = cards.current_version
        join themes on themes.id = cards.theme_id
        join notebooks on notebooks.id = themes.notebook_id
        where notebooks.teacher_id = ${teacherId} and card_states.stability < 7
        order by card_states.stability asc
      `)
    ).rows as { student_id: string; concept: string }[];

    const weakestByStudent = new Map<string, string[]>();
    for (const row of weakest) {
      const current = weakestByStudent.get(row.student_id) ?? [];
      if (current.length < 3 && !current.includes(row.concept)) {
        weakestByStudent.set(row.student_id, [...current, row.concept]);
      }
    }

    return {
      className: context.class_name,
      school: context.school,
      subject: context.subject,
      students: rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        standing: standingFor(row.stability),
        answeredLessons: Number(row.answered_lessons),
        totalLessons: Number(row.total_lessons),
        weakestConcepts: weakestByStudent.get(row.id) ?? [],
      })),
    };
  },

  createReinforcement: async (teacherId, studentId, body) => {
    if (!generator) throw notFound('Geração de cards indisponível.');

    const [student] = (
      await db.execute(sql`select id, display_name from students where id = ${studentId} limit 1`)
    ).rows as { id: string; display_name: string }[];
    if (!student) throw notFound('Aluno não encontrado.');

    const [context] = (
      await db.execute(sql`
        select coalesce(subject, title) as subject, class_id
        from notebooks where teacher_id = ${teacherId}
        order by created_at asc limit 1
      `)
    ).rows as { subject: string; class_id: string | null }[];
    if (!context) throw notFound('Professor não encontrado.');

    const topic = body.concepts.join(', ');
    const generated = await generator.generate({
      topic: `${context.subject} — reforço sobre ${topic}. Gere exatamente ${body.cardCount} cards.`,
    });

    const illustrations = await resolveIllustrations(
      generated.cards.map((card) => card.illustration ?? ''),
    );

    // Caderno do professor COM aluno preenchido: reforço dirigido, só ele enxerga.
    const [notebook] = (
      await db.execute(sql`
        insert into notebooks (teacher_id, student_id, class_id, title, subject, source_label)
        values (${teacherId}, ${studentId}, ${context.class_id},
                ${`Reforço · ${context.subject}`}, ${context.subject}, 'Reforço do professor')
        on conflict (student_id, title) do update set updated_at = now()
        returning id
      `)
    ).rows as { id: string }[];
    if (!notebook) throw new Error('notebook upsert returned no row');

    const [theme] = (
      await db.execute(sql`
        insert into themes (notebook_id, title) values (${notebook.id}, ${topic}) returning id
      `)
    ).rows as { id: string }[];
    if (!theme) throw new Error('theme insert returned no row');

    let published = 0;
    for (const card of generated.cards.slice(0, body.cardCount)) {
      const [saved] = (
        await db.execute(sql`
          insert into cards (theme_id, status, source, reviewed_by, reviewed_at)
          values (${theme.id}, 'approved', 'ai', ${teacherId}, now())
          returning id
        `)
      ).rows as { id: string }[];
      if (!saved) continue;

      await db.execute(sql`
        insert into card_versions
          (card_id, version, question, key_term, highlight_term, options, correct_option_id, image_url)
        values (${saved.id}, 1, ${card.question}, ${card.keyTerm}, ${card.highlightTerm},
          ${JSON.stringify(card.options)}::jsonb, ${card.correctOptionId},
          ${illustrations.get(card.illustration ?? '') ?? null})
      `);
      published += 1;
    }

    return { studentId, displayName: student.display_name, topic, published };
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
          school_classes.name as class_name,
          school_classes.school,
          (select count(*)::int from students where students.class_id = notebooks.class_id) as student_count,
          count(distinct review_logs.student_id)::int as answered_by
        from themes
        join notebooks on notebooks.id = themes.notebook_id
        left join school_classes on school_classes.id = notebooks.class_id
        join cards on cards.theme_id = themes.id and cards.status = 'approved'
        left join review_logs on review_logs.card_id = cards.id
        where notebooks.teacher_id = ${teacherId}
        group by themes.id, themes.title, themes.created_at, school_classes.name,
                 school_classes.school, notebooks.class_id
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
        select coalesce(notebooks.subject, notebooks.title) as subject,
               coalesce(school_classes.name, 'Turma sem nome') as class_name,
               coalesce(school_classes.school, 'Escola sem nome') as school
        from notebooks
        left join school_classes on school_classes.id = notebooks.class_id
        where notebooks.teacher_id = ${teacherId}
        order by notebooks.created_at asc limit 1
      `)
    ).rows as { subject: string; class_name: string; school: string }[];

    const studentCount = Math.max(Number(totals?.student_count ?? 0), 1);

    return {
      className: subjectRow?.class_name ?? 'Turma sem nome',
      school: subjectRow?.school ?? 'Escola sem nome',
      subject: subjectRow?.subject ?? 'Sem matéria',
      studentCount,
      participation: percent((Number(totals?.active_students ?? 0) / studentCount) * 100),
      retentionD7: percent(totals?.retention_d7),
      retentionD30: percent(totals?.retention_d30),
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        topic: lesson.topic,
        publishedAt: new Date(lesson.published_at).toISOString(),
        className: lesson.class_name ?? 'Turma sem nome',
        school: lesson.school ?? 'Escola sem nome',
        studentCount: Number(lesson.student_count),
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
