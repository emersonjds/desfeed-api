// A figura do card vem de acervo real, nunca de modelo de imagem: diagrama científico gerado
// por IA traz seta trocada e molécula inventada, e num app de estudo isso ensina errado.
//
// A imagem principal de um verbete é a figura canônica daquele assunto, então buscar por título
// de artigo acerta muito mais que busca livre no Commons — cujo índice é inglês e raso, e devolve
// foto de museu para "Revolução Francesa pintura".
const WIKIS = ['en.wikipedia.org', 'pt.wikipedia.org'] as const;

const USER_AGENT = 'memfeed/0.1 (https://github.com/emersonjds/memfeed-api)';

const THUMB_WIDTH = 960;

const LOOKUP_TIMEOUT_MS = 4000;

// Retrato estreito some dentro da faixa horizontal do card. Diagrama deitado é o que serve.
const MIN_ASPECT_RATIO = 0.85;

interface Thumbnail {
  source: string;
  width: number;
  height: number;
}

interface PageImagesPayload {
  query?: { pages?: Record<string, { thumbnail?: Thumbnail }> };
}

const withoutTracking = (url: string): string => url.split('?')[0] ?? url;

const leadImageFrom = async (wiki: string, title: string): Promise<string | null> => {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    redirects: '1',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: String(THUMB_WIDTH),
    titles: title,
  });

  const response = await fetch(`https://${wiki}/w/api.php?${params}`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as PageImagesPayload;
  const thumbnail = Object.values(payload.query?.pages ?? {})[0]?.thumbnail;
  if (!thumbnail) return null;
  if (thumbnail.width / thumbnail.height < MIN_ASPECT_RATIO) return null;

  return withoutTracking(thumbnail.source);
};

export const findIllustration = async (title: string): Promise<string | null> => {
  for (const wiki of WIKIS) {
    try {
      const found = await leadImageFrom(wiki, title);
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
};

// A API da Wikimedia responde 429 a rajada de requisição paralela, e a falha é silenciosa:
// o card fica sem figura sem nada explodir. Sequencial com pausa é o que ela aceita.
const BETWEEN_LOOKUPS_MS = 250;

const pause = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, BETWEEN_LOOKUPS_MS));

// Cards de um mesmo tema repetem o verbete; uma consulta por título basta.
export const resolveIllustrations = async (
  titles: readonly string[],
): Promise<Map<string, string>> => {
  const unique = [...new Set(titles.filter(Boolean))];
  const found: (string | null)[] = [];

  for (const title of unique) {
    found.push(await findIllustration(title));
    await pause();
  }

  return new Map(
    unique.flatMap((title, index) => {
      const url = found[index];
      return url ? [[title, url] as [string, string]] : [];
    }),
  );
};
