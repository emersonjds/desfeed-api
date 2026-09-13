import { notFound } from '../../shared/http/errors.js';
import { dayKeyIn, daysUntilEndOfWeek, shiftDayKey, weekDayKeys } from '../../shared/time/timezone.js';
import type { GamificationRepository, LeagueMember } from './gamification.repository.js';
import type {
  LeagueTier,
  Profile,
  Ranking,
  RankingEntry,
  SessionToday,
  UpdateGoalBody,
} from './gamification.schemas.js';

export interface GamificationService {
  getSession: (studentId: string, now: Date) => Promise<SessionToday>;
  getProfile: (studentId: string, now: Date) => Promise<Profile>;
  getRanking: (studentId: string, now: Date) => Promise<Ranking>;
  updatePreferences: (studentId: string, changes: UpdateGoalBody) => Promise<Profile>;
}

const RETENTION_TARGET = 85;
const PROMOTION_CUTOFF = 3;
const RELEGATION_CUTOFF = 3;
const XP_PER_LEVEL = 500;

const tierOrder: LeagueTier[] = ['bronze', 'prata', 'ouro', 'diamante'];

const tierLabel: Record<LeagueTier, string> = {
  bronze: 'Liga Bronze',
  prata: 'Liga Prata',
  ouro: 'Liga Ouro',
  diamante: 'Liga Diamante',
};

const handleOf = (displayName: string): string =>
  `@${displayName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')}`;

const trendOf = (member: LeagueMember): RankingEntry['trend'] => {
  if (member.xp > member.previousXp) return 'subindo';
  if (member.xp < member.previousXp) return 'caindo';
  return 'estavel';
};

const endsInLabel = (remainingDays: number): string => {
  if (remainingDays === 0) return 'Termina hoje';
  if (remainingDays === 1) return 'Termina amanhã';
  return `Termina em ${remainingDays} dias`;
};

export const createGamificationService = (
  repository: GamificationRepository,
): GamificationService => {
  const requireStudent = async (studentId: string) => {
    const student = await repository.findStudent(studentId);
    if (!student) throw notFound('Aluno não encontrado.');
    return student;
  };

  // Streak conta dia em que a meta vigente naquele dia foi cumprida. Reduzir a meta hoje não
  // reescreve o passado, e aumentar também não: cada dia guarda a meta que valia nele.
  const streakFrom = (days: { day: string; metGoal: boolean }[], today: string): number => {
    const metDays = new Set(days.filter((day) => day.metGoal).map((day) => day.day));
    let cursor = metDays.has(today) ? today : shiftDayKey(today, -1);
    let streak = 0;
    while (metDays.has(cursor)) {
      streak += 1;
      cursor = shiftDayKey(cursor, -1);
    }
    return streak;
  };

  const settleLeague = async (
    studentId: string,
    tier: LeagueTier,
    settledWeek: string | null,
    currentWeek: string,
    members: LeagueMember[],
  ): Promise<LeagueTier> => {
    if (settledWeek === currentWeek || members.length === 0) return tier;

    const ordered = [...members].sort((left, right) => right.xp - left.xp);
    const position = ordered.findIndex((member) => member.studentId === studentId);
    const tierIndex = tierOrder.indexOf(tier);

    const promoted = position >= 0 && position < PROMOTION_CUTOFF && tierIndex < tierOrder.length - 1;
    const relegated =
      position >= 0 && position >= ordered.length - RELEGATION_CUTOFF && tierIndex > 0;

    const nextTier =
      promoted && ordered.length > PROMOTION_CUTOFF
        ? (tierOrder[tierIndex + 1] ?? tier)
        : relegated && ordered.length > RELEGATION_CUTOFF
          ? (tierOrder[tierIndex - 1] ?? tier)
          : tier;

    await repository.saveLeague(studentId, nextTier, currentWeek);
    return nextTier;
  };

  const buildProfile = async (studentId: string, now: Date): Promise<Profile> => {
    const student = await requireStudent(studentId);
    const today = dayKeyIn(now, student.timezone);
    const [days, totalXp, memory, league] = await Promise.all([
      repository.listDays(studentId, shiftDayKey(today, -29)),
      repository.totalXp(studentId),
      repository.memoryTotals(studentId),
      repository.findLeague(studentId),
    ]);

    return {
      name: student.displayName,
      handle: handleOf(student.displayName),
      headline: `${tierLabel[league.tier]} · ${totalXp} XP`,
      levelLabel: `Nível ${Math.floor(totalXp / XP_PER_LEVEL) + 1}`,
      leagueLabel: tierLabel[league.tier],
      retentionPercent: memory.averageRetentionPercent ?? 0,
      retentionTarget: RETENTION_TARGET,
      stabilizedFacts: memory.stabilizedFacts,
      cardsReviewed: memory.cardsReviewed,
      activeDaysLast30: days.filter((day) => day.reviews > 0).length,
      dailyGoal: student.dailyGoal,
      reminderTime: student.reminderTime,
      badges: [],
    };
  };

  return {
    getSession: async (studentId, now) => {
      const student = await requireStudent(studentId);
      const today = dayKeyIn(now, student.timezone);
      const [todayProgress, days] = await Promise.all([
        repository.findDay(studentId, today),
        repository.listDays(studentId, shiftDayKey(today, -365)),
      ]);

      return {
        completed: todayProgress?.reviews ?? 0,
        goal: todayProgress?.goal ?? student.dailyGoal,
        streak: streakFrom(days, today),
        xp: todayProgress?.xp ?? 0,
      };
    },

    getProfile: buildProfile,

    getRanking: async (studentId, now) => {
      const student = await requireStudent(studentId);
      const today = dayKeyIn(now, student.timezone);
      const week = weekDayKeys(today);
      const previousWeek = weekDayKeys(shiftDayKey(today, -7));
      const currentWeek = week[0] ?? today;

      const league = await repository.findLeague(studentId);
      const members = await repository.listLeagueMembers(league.tier, week, previousWeek);
      const tier = await settleLeague(
        studentId,
        league.tier,
        league.settledWeek,
        currentWeek,
        members,
      );

      const entries = [...members]
        .sort((left, right) => right.xp - left.xp)
        .map((member, index) => ({
          id: member.studentId,
          position: index + 1,
          name: member.displayName,
          headline: `${member.xp} XP nesta semana`,
          xp: member.xp,
          trend: trendOf(member),
          isCurrentUser: member.studentId === studentId,
        }));

      const position = entries.find((entry) => entry.isCurrentUser)?.position;

      return {
        leagueName: tierLabel[tier],
        leagueRankLabel: position ? `${position}º de ${entries.length}` : 'Sem colocação nesta semana',
        endsInLabel: endsInLabel(daysUntilEndOfWeek(today)),
        promotionCutoff: PROMOTION_CUTOFF,
        relegationCutoff: RELEGATION_CUTOFF,
        podium: entries.slice(0, 3),
        entries,
        duel: {
          title: 'Promoção da semana',
          description: `Os ${PROMOTION_CUTOFF} primeiros sobem de liga quando a semana virar.`,
          rewardLabel: tierLabel[tierOrder[Math.min(tierOrder.indexOf(tier) + 1, 3)] ?? tier],
        },
      };
    },

    updatePreferences: async (studentId, changes) => {
      await requireStudent(studentId);
      await repository.updatePreferences(studentId, changes);
      return buildProfile(studentId, new Date());
    },
  };
};
