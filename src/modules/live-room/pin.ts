import { randomInt } from 'node:crypto';

const PIN_LENGTH = 6;
const PIN_MAX = 10 ** PIN_LENGTH;

// randomInt do node usa CSPRNG: PIN previsível é entrada livre na sala de uma turma.
export const generatePin = (): string => String(randomInt(0, PIN_MAX)).padStart(PIN_LENGTH, '0');
