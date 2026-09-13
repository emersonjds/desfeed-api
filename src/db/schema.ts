import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const cardStatus = pgEnum('card_status', [
  'pending',
  'approved',
  'rejected',
  'under_review',
]);
export const cardSource = pgEnum('card_source', ['ai', 'teacher']);
export const reportReason = pgEnum('report_reason', [
  'factualmente-errado',
  'fora-do-tema',
  'confuso',
  'duplicado',
]);

export const teachers = pgTable('teachers', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export interface CardOption {
  id: 'A' | 'B' | 'C' | 'D';
  label: string;
}

export const students = pgTable('students', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notebooks = pgTable(
  'notebooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    subject: text('subject'),
    coverUrl: text('cover_url'),
    sourceLabel: text('source_label').notNull().default('Caderno fotografado'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notebooks_student_created_idx').on(table.studentId, table.createdAt),
    uniqueIndex('notebooks_student_title_idx').on(table.studentId, table.title),
  ],
);

export const themes = pgTable(
  'themes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('themes_notebook_idx').on(table.notebookId)],
);

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    themeId: uuid('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    status: cardStatus('status').notNull().default('pending'),
    source: cardSource('source').notNull().default('ai'),
    currentVersion: integer('current_version').notNull().default(1),
    reviewedBy: uuid('reviewed_by').references(() => teachers.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cards_theme_status_idx').on(table.themeId, table.status),
    index('cards_status_created_idx').on(table.status, table.createdAt),
  ],
);

export const cardVersions = pgTable(
  'card_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    question: text('question').notNull(),
    keyTerm: text('key_term').notNull(),
    highlightTerm: text('highlight_term').notNull(),
    options: jsonb('options').$type<CardOption[]>().notNull(),
    correctOptionId: text('correct_option_id').notNull(),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('card_versions_card_version_idx').on(table.cardId, table.version)],
);

export const cardReports = pgTable(
  'card_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    reason: reportReason('reason').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('card_reports_card_student_idx').on(table.cardId, table.studentId),
    index('card_reports_reason_idx').on(table.reason, table.createdAt),
  ],
);
