import { z } from 'zod';
import { optionId } from '../catalog/cards.schemas.js';

export const cardFormat = z.enum([
  'pergunta-direta',
  'completar-frase',
  'explicar-em-uma-linha',
  'flashcard-reverso',
]);

// Contrato de saída do modelo. Nada é aceito fora daqui — prosa vira erro, não card.
export const generatedCard = z.object({
  format: cardFormat,
  theme: z.string().trim().min(1).max(120),
  question: z.string().trim().min(1).max(400),
  keyTerm: z.string().trim().min(1).max(120),
  highlightTerm: z.string().trim().min(1).max(120),
  options: z
    .array(z.object({ id: optionId, label: z.string().trim().min(1).max(200) }))
    .length(4),
  correctOptionId: optionId,
});

export const generationResult = z.object({
  confidence: z.enum(['alta', 'media', 'baixa']),
  cards: z.array(generatedCard).min(1).max(12),
});

const dataImage = z.string().regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/);

// `file://` e outros esquemas ficam fora: a URI vem do device e o servidor é quem busca a imagem.
const remoteImage = z
  .string()
  .url()
  .refine((value) => /^https:\/\//.test(value), { message: 'Use https para a imagem.' });

export const ingestBody = z
  .object({
    imageUri: z.union([remoteImage, dataImage]).optional(),
    topic: z.string().trim().min(1).max(120).optional(),
  })
  .refine((body) => Boolean(body.imageUri ?? body.topic), {
    message: 'Informe imageUri ou topic.',
  });

export const ingestResponse = z.object({
  confidence: z.enum(['alta', 'media', 'baixa']),
  cards: z.array(
    z.object({
      id: z.string().uuid(),
      themeId: z.string().uuid(),
      status: z.literal('pending'),
      format: cardFormat,
      question: z.string(),
      keyTerm: z.string(),
      highlightTerm: z.string(),
      options: z.array(z.object({ id: optionId, label: z.string() })).length(4),
      correctOptionId: optionId,
    }),
  ),
});

export const notebookParams = z.object({ notebookId: z.string().uuid() });

export type CardFormat = z.infer<typeof cardFormat>;
export type GeneratedCard = z.infer<typeof generatedCard>;
export type GenerationResult = z.infer<typeof generationResult>;
export type IngestBody = z.infer<typeof ingestBody>;
export type IngestResponse = z.infer<typeof ingestResponse>;
