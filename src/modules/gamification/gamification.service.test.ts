import { describe, expect, it } from 'vitest';
import type {
  DayProgress,
  GamificationRepository,
  LeagueMember,
} from './gamification.repository.js';
import { createGamificationService } from './gamification.service.js';
import type { LeagueTier } from './gamification.schemas.js';

const studentId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-16T12:00:00.000Z');

const day = (dayKey: string, reviews: number, goal = 20, metGoal = reviews >= goal): DayProgress => ({
  day: dayKey,
  reviews,
  xp: reviews * 15,
  goal,
  metGoal,
});

const makeRepository = (overrides: Partial<GamificationRepository> = {}): GamificationRepository => ({
  findStudent: async () => ({
    id: studentId,
    displayName: 'Júlia Menezes',
    timezone: 'America/Sao_Paulo',
    dailyGoal: 20,
    reminderTime: '19:30',
  }),
  findDay: async () => undefined,
  listDays: async () => [],
  totalXp: async () => 0,
  memoryTotals: async () => ({
    cardsReviewed: 0,
    stabilizedFacts: 0,
    averageRetentionPercent: null,
  }),
  findLeague: async () => ({ tier: 'bronze', settledWeek: null }),
  listLeagueMembers: async () => [],
  saveLeague: async () => undefined,
  updatePreferences: async () => undefined,
  ...overrides,
});

describe('gamification service', () => {
  it('recusa aluno inexistente', async () => {
    const service = createGamificationService(makeRepository({ findStudent: async () => undefined }));
    await expect(service.getSession(studentId, now)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('sessão do dia começa zerada com a meta do aluno', async () => {
    const service = createGamificationService(makeRepository());
    await expect(service.getSession(studentId, now)).resolves.toEqual({
      completed: 0,
      goal: 20,
      streak: 0,
      xp: 0,
    });
  });

  it('conta o streak de dias consecutivos com a meta cumprida', async () => {
    const service = createGamificationService(
      makeRepository({
        findDay: async () => day('2026-09-16', 20),
        listDays: async () => [
          day('2026-09-16', 20),
          day('2026-09-15', 22),
          day('2026-09-14', 25),
          day('2026-09-12', 30),
        ],
      }),
    );
    const session = await service.getSession(studentId, now);
    expect(session.streak).toBe(3);
    expect(session.completed).toBe(20);
  });

  it('streak sobrevive ao dia que ainda não começou', async () => {
    const service = createGamificationService(
      makeRepository({
        listDays: async () => [day('2026-09-15', 20), day('2026-09-14', 20)],
      }),
    );
    await expect(service.getSession(studentId, now)).resolves.toMatchObject({ streak: 2 });
  });

  it('reduzir a meta hoje não invalida o dia cumprido com a meta antiga', async () => {
    const service = createGamificationService(
      makeRepository({
        findStudent: async () => ({
          id: studentId,
          displayName: 'Júlia',
          timezone: 'America/Sao_Paulo',
          dailyGoal: 10,
          reminderTime: '19:30',
        }),
        listDays: async () => [day('2026-09-15', 20, 20), day('2026-09-14', 20, 20)],
      }),
    );
    await expect(service.getSession(studentId, now)).resolves.toMatchObject({ streak: 2 });
  });

  it('dia com revisões abaixo da meta não entra no streak', async () => {
    const service = createGamificationService(
      makeRepository({ listDays: async () => [day('2026-09-15', 5)] }),
    );
    await expect(service.getSession(studentId, now)).resolves.toMatchObject({ streak: 0 });
  });

  it('perfil traz retenção, fatos estabilizados e dias ativos', async () => {
    const service = createGamificationService(
      makeRepository({
        totalXp: async () => 1200,
        listDays: async () => [day('2026-09-16', 20), day('2026-09-10', 3)],
        memoryTotals: async () => ({
          cardsReviewed: 340,
          stabilizedFacts: 42,
          averageRetentionPercent: 78,
        }),
        findLeague: async () => ({ tier: 'ouro', settledWeek: '2026-09-14' }),
      }),
    );
    const profile = await service.getProfile(studentId, now);
    expect(profile).toMatchObject({
      handle: '@juliamenezes',
      levelLabel: 'Nível 3',
      leagueLabel: 'Liga Ouro',
      retentionPercent: 78,
      retentionTarget: 85,
      stabilizedFacts: 42,
      cardsReviewed: 340,
      activeDaysLast30: 2,
      badges: [],
    });
  });

  it('perfil de aluno sem histórico não inventa retenção', async () => {
    const service = createGamificationService(makeRepository());
    await expect(service.getProfile(studentId, now)).resolves.toMatchObject({
      retentionPercent: 0,
      cardsReviewed: 0,
    });
  });

  it('ranking ordena por XP da semana e marca o aluno atual', async () => {
    const members: LeagueMember[] = [
      { studentId, displayName: 'Júlia', xp: 300, previousXp: 100 },
      { studentId: 'aaaa', displayName: 'Ana', xp: 500, previousXp: 900 },
      { studentId: 'bbbb', displayName: 'Bruno', xp: 200, previousXp: 200 },
    ];
    const service = createGamificationService(
      makeRepository({
        listLeagueMembers: async () => members,
        findLeague: async () => ({ tier: 'prata', settledWeek: '2026-09-14' }),
      }),
    );
    const ranking = await service.getRanking(studentId, now);
    expect(ranking.entries.map((entry) => entry.name)).toEqual(['Ana', 'Júlia', 'Bruno']);
    expect(ranking.entries[0]?.trend).toBe('caindo');
    expect(ranking.entries[1]?.trend).toBe('subindo');
    expect(ranking.entries[2]?.trend).toBe('estavel');
    expect(ranking.entries[1]?.isCurrentUser).toBe(true);
    expect(ranking.leagueRankLabel).toBe('2º de 3');
    expect(ranking.podium).toHaveLength(3);
  });

  it('apura a liga uma vez por semana e promove quem ficou no topo', async () => {
    const saved: { tier: LeagueTier; week: string }[] = [];
    const members: LeagueMember[] = [
      { studentId, displayName: 'Júlia', xp: 900, previousXp: 100 },
      { studentId: 'aaaa', displayName: 'Ana', xp: 500, previousXp: 900 },
      { studentId: 'bbbb', displayName: 'Bruno', xp: 200, previousXp: 200 },
      { studentId: 'cccc', displayName: 'Caio', xp: 100, previousXp: 100 },
    ];
    const service = createGamificationService(
      makeRepository({
        findLeague: async () => ({ tier: 'bronze', settledWeek: '2026-09-07' }),
        listLeagueMembers: async () => members,
        saveLeague: async (_studentId, tier, week) => {
          saved.push({ tier, week });
        },
      }),
    );
    const ranking = await service.getRanking(studentId, now);
    expect(saved).toEqual([{ tier: 'prata', week: '2026-09-14' }]);
    expect(ranking.leagueName).toBe('Liga Prata');
  });

  it('não reapura a liga na mesma semana', async () => {
    let saves = 0;
    const service = createGamificationService(
      makeRepository({
        findLeague: async () => ({ tier: 'bronze', settledWeek: '2026-09-14' }),
        listLeagueMembers: async () => [
          { studentId, displayName: 'Júlia', xp: 900, previousXp: 0 },
          { studentId: 'aaaa', displayName: 'Ana', xp: 100, previousXp: 0 },
          { studentId: 'bbbb', displayName: 'Bruno', xp: 50, previousXp: 0 },
          { studentId: 'cccc', displayName: 'Caio', xp: 10, previousXp: 0 },
        ],
        saveLeague: async () => {
          saves += 1;
        },
      }),
    );
    await service.getRanking(studentId, now);
    expect(saves).toBe(0);
  });

  it('rebaixa quem ficou no fim da liga', async () => {
    const saved: LeagueTier[] = [];
    const service = createGamificationService(
      makeRepository({
        findLeague: async () => ({ tier: 'ouro', settledWeek: '2026-09-07' }),
        listLeagueMembers: async () => [
          { studentId: 'aaaa', displayName: 'Ana', xp: 900, previousXp: 0 },
          { studentId: 'bbbb', displayName: 'Bruno', xp: 800, previousXp: 0 },
          { studentId: 'cccc', displayName: 'Caio', xp: 700, previousXp: 0 },
          { studentId: 'dddd', displayName: 'Dora', xp: 600, previousXp: 0 },
          { studentId, displayName: 'Júlia', xp: 10, previousXp: 0 },
        ],
        saveLeague: async (_studentId, tier) => {
          saved.push(tier);
        },
      }),
    );
    await service.getRanking(studentId, now);
    expect(saved).toEqual(['prata']);
  });

  it('liga vazia não muda nada', async () => {
    let saves = 0;
    const service = createGamificationService(
      makeRepository({
        findLeague: async () => ({ tier: 'bronze', settledWeek: null }),
        saveLeague: async () => {
          saves += 1;
        },
      }),
    );
    const ranking = await service.getRanking(studentId, now);
    expect(saves).toBe(0);
    expect(ranking.entries).toEqual([]);
    expect(ranking.leagueRankLabel).toBe('Sem colocação nesta semana');
  });

  it('anuncia quantos dias faltam para a semana virar', async () => {
    const service = createGamificationService(makeRepository());
    const wednesday = await service.getRanking(studentId, now);
    expect(wednesday.endsInLabel).toBe('Termina em 4 dias');

    const sunday = await service.getRanking(studentId, new Date('2026-09-20T12:00:00.000Z'));
    expect(sunday.endsInLabel).toBe('Termina hoje');
  });

  it('atualizar a meta devolve o perfil com o valor novo', async () => {
    const changes: { dailyGoal?: number }[] = [];
    let goal = 20;
    const service = createGamificationService(
      makeRepository({
        findStudent: async () => ({
          id: studentId,
          displayName: 'Júlia',
          timezone: 'America/Sao_Paulo',
          dailyGoal: goal,
          reminderTime: '19:30',
        }),
        updatePreferences: async (_studentId, change) => {
          changes.push(change);
          goal = change.dailyGoal ?? goal;
        },
      }),
    );
    const profile = await service.updatePreferences(studentId, { dailyGoal: 10 });
    expect(changes).toEqual([{ dailyGoal: 10 }]);
    expect(profile.dailyGoal).toBe(10);
  });
});
