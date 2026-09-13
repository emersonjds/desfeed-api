import { describe, expect, it } from 'vitest';
import { generationResult, ingestBody } from './ingestion.schemas.js';

const validCard = {
  format: 'pergunta-direta',
  theme: 'Termodinâmica',
  question: 'Qual o rendimento máximo teórico de uma máquina de Carnot?',
  keyTerm: 'Ciclo de Carnot',
  highlightTerm: 'rendimento máximo',
  options: [
    { id: 'A', label: 'n = 1 - T2/T1' },
    { id: 'B', label: 'n = T1 + T2' },
    { id: 'C', label: 'n = Q1 / Q2' },
    { id: 'D', label: 'n = 0' },
  ],
  correctOptionId: 'A',
};

describe('contrato de saída do gerador', () => {
  it('aceita a saída bem formada', () => {
    expect(generationResult.safeParse({ confidence: 'alta', cards: [validCard] }).success).toBe(
      true,
    );
  });

  it('recusa prosa em vez de card', () => {
    expect(generationResult.safeParse('Claro! Aqui estão seus cards:').success).toBe(false);
  });

  it('recusa card com menos de quatro alternativas', () => {
    const truncated = { ...validCard, options: validCard.options.slice(0, 3) };
    expect(generationResult.safeParse({ confidence: 'alta', cards: [truncated] }).success).toBe(
      false,
    );
  });

  it('recusa formato fora da lista', () => {
    const invalid = { ...validCard, format: 'resposta-pronta' };
    expect(generationResult.safeParse({ confidence: 'alta', cards: [invalid] }).success).toBe(
      false,
    );
  });

  it('recusa leva vazia', () => {
    expect(generationResult.safeParse({ confidence: 'baixa', cards: [] }).success).toBe(false);
  });
});

describe('entrada da ingestão', () => {
  it('aceita imagem por url e por data uri', () => {
    expect(ingestBody.safeParse({ imageUri: 'https://exemplo.test/foto.jpg' }).success).toBe(true);
    expect(ingestBody.safeParse({ imageUri: 'data:image/png;base64,iVBORw0KGgo=' }).success).toBe(
      true,
    );
  });

  it('aceita tema sem imagem', () => {
    expect(ingestBody.safeParse({ topic: 'Ciclo de Carnot' }).success).toBe(true);
  });

  it('recusa requisição sem imagem e sem tema', () => {
    expect(ingestBody.safeParse({}).success).toBe(false);
  });

  it('recusa uri de arquivo local do device', () => {
    expect(ingestBody.safeParse({ imageUri: 'file:///var/mobile/foto.jpg' }).success).toBe(false);
  });
});
