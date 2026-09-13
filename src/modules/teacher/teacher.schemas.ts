import { z } from 'zod';

export const draftQuestion = z.object({
  id: z.string(),
  question: z.string(),
  correctAnswer: z.string(),
  approved: z.boolean(),
});

export const generateLessonBody = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
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
  answeredBy: z.number().int().nonnegative(),
  concepts: z.array(conceptResult),
});

export const classReport = z.object({
  className: z.string(),
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
export type ClassReport = z.infer<typeof classReport>;
