import { describe, expect, it } from 'vitest';
import { dayKeyIn, startOfDayIn } from './timezone.js';

describe('timezone', () => {
  it('resolve o início do dia no fuso do aluno', () => {
    const moment = new Date('2026-09-13T12:30:00.000Z');
    expect(startOfDayIn(moment, 'America/Sao_Paulo').toISOString()).toBe(
      '2026-09-13T03:00:00.000Z',
    );
  });

  it('reconhece a virada do dia antes da virada em UTC', () => {
    const moment = new Date('2026-09-14T02:00:00.000Z');
    expect(dayKeyIn(moment, 'America/Sao_Paulo')).toBe('2026-09-13');
    expect(dayKeyIn(moment, 'UTC')).toBe('2026-09-14');
  });
});
