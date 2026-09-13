# Contrato com o app — spec

Alinhamento do contrato da API com o que o `desfeed-app` já consome. Complementa SPA-343.

## Problema

O app foi construído contra mocks (`src/shared/api/mocks/routes.ts`) e já tem o contrato
fixado no código: chama `/api/...` e valida a resposta com Zod. O scaffold da API nasceu
servindo `/notebooks` na raiz e devolvendo uma lista paginada. Nenhuma tela do app trocaria o
mock pela API nesse estado.

## Decisões

**Prefixo `/api` nas rotas de domínio; `/health` fica na raiz.** O app não tem configuração de
prefixo — o caminho está escrito em cada `fetchJson`. Mudar o app custaria mais que registrar o
plugin com `{ prefix: '/api' }`. `/health` fica fora porque é o healthcheck do Railway.

**`GET /api/notebooks` devolve a biblioteca, não uma lista paginada.** O app espera um objeto
com métricas agregadas (`globalRetentionPercent`, `consolidatedConcepts`, `totalConcepts`,
`stabilityDays`), a lista de cadernos e os picos de esquecimento. A paginação por cursor saiu:
a biblioteca de um aluno não é uma coleção que cresce sem limite, e paginar um payload que a
tela renderiza inteiro é complexidade sem uso. Onde cresce de verdade — cards de um tema — a
paginação entra quando o endpoint existir.

**Campo derivado do FSRS nasce `null`, não zero.** `status`, `retentionPercent`,
`nextReviewLabel`, `globalRetentionPercent` e `stabilityDays` dependem do agendamento
(SPA-359), que ainda não existe. As alternativas eram inventar número ou omitir o campo:

- inventar (`retentionPercent: 0`) faz a tela dizer "0% de retenção" para um caderno recém
  criado, o que é informação falsa, não ausente;
- omitir quebra o consumidor a cada endpoint que ganha o campo depois.

`null` diz a verdade: "ainda não sei". `peaks` volta `[]` pelo mesmo motivo.

**Consequência para o app**: `notebookSummarySchema` e `notebookLibrarySchema` precisam marcar
esses cinco campos como `.nullable()` para consumir a API real. Enquanto isso não acontece, a
tela Cadernos continua no mock — e é a única que continua.

**`GET /api/notebooks/:notebookId` devolve 404 para caderno de outro aluno**, nunca 403. O
status não pode revelar que o recurso existe: um caderno é dado de menor de idade.

## Fora de escopo

`/api/queue/today`, `/api/session/today`, `/api/reviews`, `/api/profile`, `/api/ranking` e
`/api/notebooks/:id/ingest` — cada um tem demanda própria em `docs/roadmap.md`.
