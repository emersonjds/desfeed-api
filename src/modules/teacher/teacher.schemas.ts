import { z } from 'zod';

export const draftQuestion = z.object({
  id: z.string(),
  question: z.string(),
  correctAnswer: z.string(),
  approved: z.boolean(),
});

export const teacherClass = z.object({
  id: z.string(),
  school: z.string(),
  name: z.string(),
  grade: z.string(),
  studentCount: z.number().int().nonnegative(),
});

export const teacherClassesResponse = z.object({
  subjects: z.array(z.string()),
  classes: z.array(teacherClass),
});

export const generateLessonBody = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  classId: z.string().uuid().optional(),
  // 10 · 15 · 20 no painel. O que sustenta retenção é a recuperação espaçada, não o volume
  // de uma sessão: acima de 20 uma aula toma a fila do dia inteira do aluno.
  questionCount: z.number().int().min(5).max(30),
});

export const generateLessonResponse = z.object({
  lessonId: z.string(),
  topic: z.string(),
  questions: z.array(draftQuestion),
});

export const publishLessonParams = z.object({ lessonId: z.string().uuid() });

export const publishLessonBody = z.object({
  approvedQuestionIds: z.array(z.string().uuid()).min(1),
});

export const publishLessonResponse = z.object({
  lessonId: z.string(),
  published: z.number().int().nonnegative(),
  discarded: z.number().int().nonnegative(),
});

export const conceptResult = z.object({
  concept: z.string(),
  accuracyOnDay: z.number().min(0).max(100),
  retentionD7: z.number().min(0).max(100),
});

export const publishedLesson = z.object({
  id: z.string(),
  topic: z.string(),
  publishedAt: z.string().datetime(),
  className: z.string(),
  school: z.string(),
  answeredBy: z.number().int().nonnegative(),
  studentCount: z.number().int().nonnegative(),
  concepts: z.array(conceptResult),
});

export const lessonParams = z.object({ lessonId: z.string().uuid() });

// Onde a turma está em cada conceito, sem ligar desempenho a nome de aluno.
export const conceptStanding = conceptResult.extend({
  consolidated: z.number().int().nonnegative(),
  atRisk: z.number().int().nonnegative(),
  forgotten: z.number().int().nonnegative(),
});

export const lessonDetail = z.object({
  id: z.string(),
  topic: z.string(),
  subject: z.string(),
  publishedAt: z.string().datetime(),
  className: z.string(),
  school: z.string(),
  grade: z.string(),
  questionCount: z.number().int().nonnegative(),
  studentCount: z.number().int().nonnegative(),
  answeredBy: z.number().int().nonnegative(),
  concepts: z.array(conceptStanding),
  // Participação é necessidade operacional do professor; desempenho continua agregado.
  pendingStudents: z.array(z.object({ id: z.string(), displayName: z.string() })),
});

export const classReport = z.object({
  className: z.string(),
  school: z.string(),
  subject: z.string(),
  studentCount: z.number().int().positive(),
  participation: z.number().min(0).max(100),
  retentionD7: z.number().min(0).max(100),
  retentionD30: z.number().min(0).max(100),
  lessons: z.array(publishedLesson),
});

export type GenerateLessonBody = z.infer<typeof generateLessonBody>;
export type GenerateLessonResponse = z.infer<typeof generateLessonResponse>;
export type PublishLessonBody = z.infer<typeof publishLessonBody>;
export type PublishLessonResponse = z.infer<typeof publishLessonResponse>;
export const studentStanding = z.enum(['firme', 'em-risco', 'esquecido', 'sem-dados']);

// Estado, não nota: o professor age sobre quem precisa, sem ordenar adolescente por desempenho.
export const studentRow = z.object({
  id: z.string(),
  displayName: z.string(),
  standing: studentStanding,
  answeredLessons: z.number().int().nonnegative(),
  totalLessons: z.number().int().nonnegative(),
  weakestConcepts: z.array(z.string()),
});

export const classStudentsResponse = z.object({
  className: z.string(),
  school: z.string(),
  subject: z.string(),
  students: z.array(studentRow),
});

export const studentParams = z.object({ studentId: z.string().uuid() });

export const reinforcementBody = z.object({
  concepts: z.array(z.string().min(1)).min(1).max(5),
  cardCount: z.number().int().min(3).max(15),
});

export const reinforcementResponse = z.object({
  studentId: z.string(),
  displayName: z.string(),
  topic: z.string(),
  published: z.number().int().nonnegative(),
});

export type ClassReport = z.infer<typeof classReport>;
export type TeacherClassesResponse = z.infer<typeof teacherClassesResponse>;
export type ClassStudentsResponse = z.infer<typeof classStudentsResponse>;
export type ReinforcementBody = z.infer<typeof reinforcementBody>;
export type ReinforcementResponse = z.infer<typeof reinforcementResponse>;
export type LessonDetail = z.infer<typeof lessonDetail>;
