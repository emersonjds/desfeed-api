import { z } from 'zod';

// Pré-autenticação: SPA-343 entrega o scaffold sem login; o header cai quando o JWT entrar.
export const studentHeader = z.object({
  'x-student-id': z.string().uuid(),
});

export type StudentHeader = z.infer<typeof studentHeader>;

export const teacherHeader = z.object({
  'x-teacher-id': z.string().uuid(),
});

export type TeacherHeader = z.infer<typeof teacherHeader>;
