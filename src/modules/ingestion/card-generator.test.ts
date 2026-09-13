import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicGenerator } from './card-generator.js';

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

const respondWith = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gerador Anthropic', () => {
  it('devolve os cards validados quando o modelo usa a ferramenta', async () => {
    const fetchMock = respondWith({
      content: [{ type: 'tool_use', name: 'gerar_cards', input: { confidence: 'alta', cards: [validCard] } }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createAnthropicGenerator('chave-secreta').generate({
      topic: 'Termodinâmica',
    });
    expect(result.cards).toHaveLength(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('chave-secreta');
    expect(JSON.parse(init.body as string).tool_choice).toEqual({
      type: 'tool',
      name: 'gerar_cards',
    });
  });

  it('envia a imagem como bloco base64 quando recebe data uri', async () => {
    const fetchMock = respondWith({
      content: [{ type: 'tool_use', name: 'gerar_cards', input: { confidence: 'media', cards: [validCard] } }],
    });
    vi.stubGlobal('fetch', fetchMock);

    await createAnthropicGenerator('chave').generate({
      imageUri: 'data:image/png;base64,iVBORw0KGgo=',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [block] = JSON.parse(init.body as string).messages[0].content;
    expect(block.source).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0KGgo=',
    });
  });

  it('envia a imagem por url quando recebe endereço remoto', async () => {
    const fetchMock = respondWith({
      content: [{ type: 'tool_use', name: 'gerar_cards', input: { confidence: 'alta', cards: [validCard] } }],
    });
    vi.stubGlobal('fetch', fetchMock);

    await createAnthropicGenerator('chave').generate({ imageUri: 'https://exemplo.test/foto.png' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [block] = JSON.parse(init.body as string).messages[0].content;
    expect(block.source).toEqual({ type: 'url', url: 'https://exemplo.test/foto.png' });
  });

  it('falha com erro útil quando o modelo responde prosa', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({ content: [{ type: 'text', text: 'Claro! Aqui estão seus cards:' }] }),
    );
    await expect(createAnthropicGenerator('chave').generate({ topic: 'Física' })).rejects.toMatchObject(
      { statusCode: 502, error: 'generation_invalid' },
    );
  });

  it('falha quando a ferramenta devolve card fora do contrato', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({
        content: [
          {
            type: 'tool_use',
            name: 'gerar_cards',
            input: { confidence: 'alta', cards: [{ ...validCard, options: [] }] },
          },
        ],
      }),
    );
    await expect(createAnthropicGenerator('chave').generate({ topic: 'Física' })).rejects.toMatchObject(
      { statusCode: 502, error: 'generation_invalid' },
    );
  });

  it('falha quando o provedor responde erro', async () => {
    vi.stubGlobal('fetch', respondWith({}, false));
    await expect(createAnthropicGenerator('chave').generate({ topic: 'Física' })).rejects.toMatchObject(
      { statusCode: 502, error: 'generation_failed' },
    );
  });

  it('não coloca a chave no corpo da requisição', async () => {
    const fetchMock = respondWith({
      content: [{ type: 'tool_use', name: 'gerar_cards', input: { confidence: 'alta', cards: [validCard] } }],
    });
    vi.stubGlobal('fetch', fetchMock);
    await createAnthropicGenerator('chave-secreta').generate({ topic: 'Física' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body as string).not.toContain('chave-secreta');
  });
});
