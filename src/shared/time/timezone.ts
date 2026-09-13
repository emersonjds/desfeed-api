const offsetFormatter = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timezone: string): Intl.DateTimeFormat => {
  const cached = offsetFormatter.get(timezone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  offsetFormatter.set(timezone, created);
  return created;
};

const partsIn = (moment: Date, timezone: string): Record<string, number> => {
  const parts = formatterFor(timezone).formatToParts(moment);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
};

export const startOfDayIn = (moment: Date, timezone: string): Date => {
  const { hour = 0, minute = 0, second = 0 } = partsIn(moment, timezone);
  const elapsedMs = ((hour * 60 + minute) * 60 + second) * 1000 + moment.getMilliseconds();
  return new Date(moment.getTime() - elapsedMs);
};

export const dayKeyIn = (moment: Date, timezone: string): string => {
  const { year, month, day } = partsIn(moment, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const shiftDayKey = (dayKey: string, days: number): string => {
  const shifted = new Date(`${dayKey}T00:00:00.000Z`).getTime() + days * DAY_MS;
  return new Date(shifted).toISOString().slice(0, 10);
};

// Semana começa na segunda-feira: é a virada que o aluno enxerga na liga.
export const weekDayKeys = (dayKey: string): string[] => {
  const weekday = (new Date(`${dayKey}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const monday = shiftDayKey(dayKey, -weekday);
  return Array.from({ length: 7 }, (_, index) => shiftDayKey(monday, index));
};

export const daysUntilEndOfWeek = (dayKey: string): number => {
  const weekday = (new Date(`${dayKey}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  return 6 - weekday;
};
