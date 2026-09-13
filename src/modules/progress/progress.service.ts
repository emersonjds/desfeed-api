import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { notFound } from '../../shared/http/errors.js';
import type { ProgressResponse } from './progress.schemas.js';

export interface ProgressService {
  getProgress: (studentId: string, now: Date) => Promise<ProgressResponse>;
}

// Não medimos tempo de tela — só esforço de recuperação. O minuto exibido é a revisão
// convertida pelo tempo médio de card, e a semana vive de `daily_progress`.
const SECONDS_PER_REVIEW = 20;

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

const percent = (hits: number, total: number): number =>
  total === 0 ? 0 : Math.round((hits / total) * 100);

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

interface DailyRow {
  day: string;
  reviews: number;
}

interface SubjectRow {
  subject: string;
  total: number;
  consolidated: number;
  hits: number;
  answered: number;
  previous_hits: number;
  previous_answered: number;
}

interface AtRiskRow {
  concept: string;
  subject: string;
  days: number;
}

export const createProgressService = (db: Database): ProgressService => ({
  getProgress: async (studentId, now) => {
    const [student] = (
      await db.execute(sql`select id from students where id = ${studentId} limit 1`)
    ).rows as { id: string }[];
    if (!student) throw notFound('Aluno não encontrado.');

    const daily = (
      await db.execute(sql`
        select day, reviews
        from daily_progress
        where student_id = ${studentId}
        order by day desc
        limit 60
      `)
    ).rows as unknown as DailyRow[];

    const reviewsByDay = new Map(daily.map((row) => [row.day, Number(row.reviews)]));

    const weekMinutes = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (6 - offset));
      const reviews = reviewsByDay.get(dayKey(date)) ?? 0;
      return {
        day: WEEKDAY_LABELS[date.getDay()] ?? 'S',
        minutes: Math.round((reviews * SECONDS_PER_REVIEW) / 60),
      };
    });

    const FREEZES = 2;
    // O dia mais antigo com registro é onde o histórico começa, não uma folga: sem esse limite
    // a borda do histórico consome as folgas e a tela mostra "0 folgas" numa sequência intacta.
    const oldestDay = daily.at(-1)?.day ?? dayKey(now);

    let streakDays = 0;
    let freezesSpent = 0;
    for (let offset = 0; offset < 90; offset += 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const day = dayKey(date);
      if (day < oldestDay) break;

      const reviews = reviewsByDay.get(day) ?? 0;
      if (reviews > 0) {
        streakDays += 1;
        continue;
      }
      // Hoje ainda não começou não quebra a sequência de ontem.
      if (offset === 0) continue;
      if (freezesSpent < FREEZES) {
        freezesSpent += 1;
        continue;
      }
      break;
    }

    const [retention] = (
      await db.execute(sql`
        select
          count(*) filter (where reviewed_at >= now() - interval '7 days') as recent_total,
          count(*) filter (where reviewed_at >= now() - interval '7 days' and rating <> 'again') as recent_hits,
          count(*) filter (where reviewed_at >= now() - interval '37 days' and reviewed_at < now() - interval '30 days') as past_total,
          count(*) filter (where reviewed_at >= now() - interval '37 days' and reviewed_at < now() - interval '30 days' and rating <> 'again') as past_hits
        from review_logs
        where student_id = ${studentId}
      `)
    ).rows as { recent_total: number; recent_hits: number; past_total: number; past_hits: number }[];

    const subjects = (
      await db.execute(sql`
        select
          coalesce(notebooks.subject, notebooks.title) as subject,
          count(distinct cards.id)::int as total,
          count(distinct cards.id) filter (where card_states.state = 2 and card_states.stability >= 7)::int as consolidated,
          count(review_logs.id) filter (where review_logs.reviewed_at >= now() - interval '30 days')::int as answered,
          count(review_logs.id) filter (where review_logs.reviewed_at >= now() - interval '30 days' and review_logs.rating <> 'again')::int as hits,
          count(review_logs.id) filter (where review_logs.reviewed_at >= now() - interval '60 days' and review_logs.reviewed_at < now() - interval '30 days')::int as previous_answered,
          count(review_logs.id) filter (where review_logs.reviewed_at >= now() - interval '60 days' and review_logs.reviewed_at < now() - interval '30 days' and review_logs.rating <> 'again')::int as previous_hits
        from cards
        join themes on themes.id = cards.theme_id
        join notebooks on notebooks.id = themes.notebook_id
        left join card_states on card_states.card_id = cards.id and card_states.student_id = ${studentId}
        left join review_logs on review_logs.card_id = cards.id and review_logs.student_id = ${studentId}
        where cards.status = 'approved'
          and (notebooks.student_id = ${studentId} or (notebooks.teacher_id is not null and notebooks.student_id is null))
        group by 1
        order by 2 desc
      `)
    ).rows as unknown as SubjectRow[];

    const atRisk = (
      await db.execute(sql`
        select
          card_versions.key_term as concept,
          coalesce(notebooks.subject, notebooks.title) as subject,
          greatest(0, ceil(extract(epoch from (card_states.due - now())) / 86400))::int as days
        from card_states
        join cards on cards.id = card_states.card_id
        join card_versions on card_versions.card_id = cards.id
         and card_versions.version = cards.current_version
        join themes on themes.id = cards.theme_id
        join notebooks on notebooks.id = themes.notebook_id
        where card_states.student_id = ${studentId}
          and card_states.due <= now() + interval '5 days'
        order by card_states.due asc
        limit 5
      `)
    ).rows as unknown as AtRiskRow[];

    const [classGoal] = (
      await db.execute(sql`
        select
          count(distinct (review_logs.student_id, review_logs.card_id)) filter (
            where review_logs.rating in ('good', 'easy')
          )::int as done,
          (select count(*)::int from students) as student_count
        from review_logs
        where review_logs.reviewed_at >= date_trunc('week', now())
      `)
    ).rows as { done: number; student_count: number }[];

    const totalConcepts = subjects.reduce((sum, row) => sum + Number(row.total), 0);
    const consolidated = subjects.reduce((sum, row) => sum + Number(row.consolidated), 0);
    const weeklyTarget = Math.max(Number(classGoal?.student_count ?? 1) * 20, 1);

    return {
      streakDays,
      // Folga não quebra a sequência: a sequência não pode virar coerção.
      freezesLeft: FREEZES - freezesSpent,
      retentionD7: percent(Number(retention?.recent_hits ?? 0), Number(retention?.recent_total ?? 0)),
      retentionD7LastMonth: percent(Number(retention?.past_hits ?? 0), Number(retention?.past_total ?? 0)),
      consolidated,
      totalConcepts: Math.max(totalConcepts, 1),
      weekMinutes,
      subjects: subjects
        .filter((row) => Number(row.total) > 0)
        .map((row) => ({
          subject: row.subject,
          retention: percent(Number(row.hits), Number(row.answered)),
          delta:
            percent(Number(row.hits), Number(row.answered)) -
            percent(Number(row.previous_hits), Number(row.previous_answered)),
          consolidated: Number(row.consolidated),
          total: Number(row.total),
        })),
      atRisk: atRisk.map((row) => ({
        concept: row.concept,
        subject: row.subject,
        daysUntilForgotten: Number(row.days),
      })),
      classGoal: {
        className: '2º ano B',
        label: 'Conceitos consolidados pela turma nesta semana',
        done: Number(classGoal?.done ?? 0),
        total: weeklyTarget,
      },
    };
  },
});
