import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError, errorResponse } from '../../shared/http/errors.js';
import { teacherHeader } from '../../shared/http/identity.js';
import type { CardGenerator } from '../ingestion/card-generator.js';
import {
  classReport,
  classStudentsResponse,
  generateLessonBody,
  generateLessonResponse,
  lessonDetail,
  lessonParams,
  publishLessonBody,
  publishLessonParams,
  publishLessonResponse,
  reinforcementBody,
  reinforcementResponse,
  studentParams,
  teacherClassesResponse,
} from './teacher.schemas.js';
import { createTeacherService } from './teacher.service.js';

export interface TeacherRoutesOptions {
  cardGenerator?: CardGenerator | undefined;
}

// Geração custa dinheiro em LLM: limite próprio, bem abaixo do limite global da API.
const GENERATION_RATE_LIMIT = { max: 20, timeWindow: '1 hour' };

export const teacherRoutes: FastifyPluginAsyncZod<TeacherRoutesOptions> = async (app, options) => {
  const service = createTeacherService(app.db, options.cardGenerator);

  app.post(
    '/teacher/lessons',
    {
      config: {
        rateLimit: {
          ...GENERATION_RATE_LIMIT,
          keyGenerator: (request) => request.headers['x-teacher-id'] as string,
        },
      },
      schema: {
        tags: ['teacher'],
        summary: 'O professor digita o assunto da aula e recebe o rascunho das questões.',
        headers: teacherHeader,
        body: generateLessonBody,
        response: { 200: generateLessonResponse, 404: errorResponse, 503: errorResponse },
      },
    },
    async (request) => {
      if (!options.cardGenerator) {
        throw new HttpError(
          503,
          'generation_unavailable',
          'Geração de cards indisponível: falta configurar a chave do provedor.',
        );
      }
      return service.generateLesson(request.headers['x-teacher-id'], request.body);
    },
  );

  app.post(
    '/teacher/lessons/:lessonId/publish',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Publica para a turma só as questões aprovadas; o resto é descartado.',
        headers: teacherHeader,
        params: publishLessonParams,
        body: publishLessonBody,
        response: { 200: publishLessonResponse, 404: errorResponse },
      },
    },
    async (request) =>
      service.publishLesson(
        request.headers['x-teacher-id'],
        request.params.lessonId,
        request.body,
      ),
  );

  app.get(
    '/teacher/class',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Relatório agregado da turma. Nunca expõe aluno identificável.',
        headers: teacherHeader,
        response: { 200: classReport, 404: errorResponse },
      },
    },
    async (request) => service.getClassReport(request.headers['x-teacher-id']),
  );

  app.get(
    '/teacher/lessons/:lessonId',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Detalhe de uma aula: conceitos, onde a turma está e quem ainda não respondeu.',
        headers: teacherHeader,
        params: lessonParams,
        response: { 200: lessonDetail, 404: errorResponse },
      },
    },
    async (request) =>
      service.getLessonDetail(request.headers['x-teacher-id'], request.params.lessonId),
  );

  app.get(
    '/teacher/students',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Estado de cada aluno na turma — firme, em risco ou esquecido. Nunca uma nota.',
        headers: teacherHeader,
        response: { 200: classStudentsResponse, 404: errorResponse },
      },
    },
    async (request) => service.listStudents(request.headers['x-teacher-id']),
  );

  app.post(
    '/teacher/students/:studentId/reinforcement',
    {
      config: {
        rateLimit: {
          ...GENERATION_RATE_LIMIT,
          keyGenerator: (request) => request.headers['x-teacher-id'] as string,
        },
      },
      schema: {
        tags: ['teacher'],
        summary: 'Gera uma sessão de reforço dirigida a um aluno, nos conceitos em que ele trava.',
        headers: teacherHeader,
        params: studentParams,
        body: reinforcementBody,
        response: { 200: reinforcementResponse, 404: errorResponse, 503: errorResponse },
      },
    },
    async (request) => {
      if (!options.cardGenerator) {
        throw new HttpError(
          503,
          'generation_unavailable',
          'Geração de cards indisponível: falta configurar a chave do provedor.',
        );
      }
      return service.createReinforcement(
        request.headers['x-teacher-id'],
        request.params.studentId,
        request.body,
      );
    },
  );

  app.get(
    '/teacher/classes',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Turmas e matérias do professor, para o painel montar os seletores.',
        headers: teacherHeader,
        response: { 200: teacherClassesResponse, 404: errorResponse },
      },
    },
    async (request) => service.listClasses(request.headers['x-teacher-id']),
  );
};
