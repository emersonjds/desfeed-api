# Desfeed API

Backend do Desfeed. Este repositório **é a API** — código, agents, configuração e documentação
moram aqui. Abrir `desfeed-api/` no editor já carrega os agents.

Fonte da verdade do produto: `docs/briefing.md` (espelho do briefing do `desfeed-app`).
Demandas: `docs/linear-backend-issues.md` (SPA-343 … SPA-365, time Spark no Linear).
Ordem de execução: `docs/roadmap.md`.

**Documentação é por contexto**: cada demanda tem uma pasta em `docs/<contexto>/` com `spec.md`
(o porquê, as alternativas, o que fica fora) e `plan.md` (as etapas e a verificação de cada uma).
`docs/scaffold/` é o exemplo pronto. Rationale mora ali — nunca em comentário de código.

## O que a API é

Uma API que serve **duas pontas desde o primeiro endpoint**: o app do aluno (`desfeed-app`,
Expo) agora, e o painel do professor (`desfeed-web`) na fase 2. Nenhuma rota nasce modelada
só para o mobile. **O contrato OpenAPI é entregável, não subproduto.**

Domínios: ingestão (foto → cards por IA), catálogo (caderno → tema → card), agendamento
(FSRS autoritativo no servidor), gamificação (XP, streak, liga — contagem sempre no servidor),
sala ao vivo (PIN + socket), a ponte (resposta na sala agenda card no FSRS individual) e
relatórios de turma **agregados**.

## A invariante inegociável

**O professor vê a turma, nunca o aluno individual.** Isso é regra de schema e de query, não
de tela. Endpoint que devolva desempenho individual identificável para o professor é falha de
privacidade de menor de idade. Se um requisito parecer pedir isso, pare e escale para o Emerson.
Há teste guardião para isso (SPA-365) — não o desative.

## Stack (travada)

| Camada           | Escolha                                                              |
| ---------------- | -------------------------------------------------------------------- |
| Runtime          | Node 24, ESM, `pnpm`                                                 |
| HTTP             | Fastify 5                                                            |
| Schema/validação | Zod 4 + `fastify-type-provider-zod` (um schema só, gera o OpenAPI)   |
| Docs             | `@fastify/swagger` + `@fastify/swagger-ui` em `/swagger`             |
| Banco            | PostgreSQL 16 + Drizzle ORM + drizzle-kit                            |
| Testes           | Vitest + `@vitest/coverage-v8`, limiar 90% nas 4 métricas            |
| Deploy           | Docker multi-stage → Railway (`railway.json`, healthcheck `/health`) |

Precisa de algo fora dessa lista? Pare e pergunte.

## Arquitetura — vertical slices + clean architecture

```
src/
  config/env.ts             Zod na variável de ambiente; processo não sobe com config faltando
  db/schema.ts              tabelas Drizzle
  db/client.ts              pool + instância Drizzle
  db/migrate.ts             aplica drizzle/ no boot do deploy
  shared/http/              erro HTTP, identidade, primitivos reusados por qualquer slice
  modules/<slice>/
    <slice>.schemas.ts      Zod: entrada, saída e tipos derivados
    <slice>.repository.ts   único lugar que fala SQL/Drizzle
    <slice>.service.ts      regra de negócio, sem Fastify e sem SQL
    <slice>.routes.ts       Fastify + Swagger; só orquestra
    <slice>.service.test.ts
test/                       testes de aplicação (inject), contrato OpenAPI
```

A dependência aponta para dentro: `routes → service → repository`. O service recebe a
interface do repository — é assim que ele é testável sem banco. Slice não importa de slice;
o que for comum sobe para `shared/`.

`modules/catalog/` é o modelo pronto: copie o padrão em vez de inventar outro.

## Regras de código

TypeScript extremamente bem tipado: sem `any`, sem `as unknown as`, sem cast desnecessário —
anotação direta ou `satisfies` antes de `as`. Named exports. Arrow functions. Early return.
Sem abreviação em nome de variável.

**Zod na fronteira de confiança, sempre**: payload de rota, saída do LLM, evento de socket,
variável de ambiente. Nada entra sem parse.

**Swagger em dia a cada rota.** Rota sem `tags`, `summary` e `response` documentado não está
pronta. `pnpm openapi` regenera `docs/openapi.json` — é o que a fase 2 consome.

**Performance desde o dia 1**: índice no que se consulta, paginação por cursor no que cresce,
zero N+1 na fila do dia. A fila de um aluno é consultada a cada abertura do app.

**DRY com cabeça**: antes de criar helper, tipo ou rota, procure no slice vizinho e em
`shared/`. O `calledit-api` (`~/Documents/workspace/hackathons/calledit/calledit-api`) roda a
mesma combinação Fastify + Zod + Swagger e é referência de estrutura.

**Comentário**: nunca o óbvio. Quanto mais explicação o código precisa, pior ele está — melhore
o código. O comentário que sobrevive declara fato que o código não mostra: restrição externa,
quirk de biblioteca, decisão de time. Rationale mora em `docs/<contexto>/spec.md`, não no código.
Comentário passando de ~5% das linhas de um módulo é sintoma — releia o que dá para apagar.

## Segurança

- Chave da Anthropic **só no servidor**. Nunca sai no response, nunca vai para o cliente.
- Rate limit na ingestão: upload de imagem custa dinheiro em LLM (DoS financeiro).
- PIN de sala com entropia e expiração; autorização verificada **por evento** de socket, não
  só na entrada.
- Foto enviada pelo aluno é input hostil. Nenhum dado pessoal do aluno entra no prompt do LLM.

## Verificação

```bash
pnpm type-check && pnpm lint && pnpm test:coverage
```

Cobertura travada em 90% nas quatro métricas. `*.repository.ts` fica fora da métrica unitária
porque é adaptador de SQL: ele é coberto pela suíte de integração contra o Postgres do
`docker compose`. Escreveu repository? Escreva o teste de integração junto.

**Mostre a saída real.** Não afirme que passou sem ter rodado.

## Git

Conventional Commits em inglês; a mensagem é título de PR (propósito, não lista de arquivos).
Micro commits, um contexto por commit. Autor sempre Emerson — **zero rastro de LLM**: sem
`Co-Authored-By`, sem 🤖, sem menção a IA em mensagem, corpo ou PR.

```
developer ──┬─> feature/spa-NNN-descricao ──> merge em developer
            └─> (só então) próxima feature, saindo de developer atualizada
```

Uma branch por demanda, criada a partir da `developer` atualizada. Implementa, verifica,
commita, faz merge em `developer`, apaga a branch. Só então começa a próxima.

**`developer → master` é a mão do Emerson.** Nada entra em `master` por outro caminho.

Reescrita de histórico (`rebase`, `filter-branch`, `push --force`) só com pedido explícito do
Emerson, nunca por iniciativa própria.

## Agents

`.claude/agents/`: `arq` · `back` · `db` · `ia` · `realtime` · `qa` · `redteam` · `scribe`.

Em `/spp` o Superpowers orquestra esses agents: `arq` decide a spec, `back`/`db`/`ia`/`realtime`
implementam a slice, `qa` verifica, `redteam` audita privacidade e segurança antes do merge,
`scribe` atualiza a documentação.

**Economia de token é lei**: `context-mode` ativo (`ctx_batch_execute`/`ctx_execute`/`ctx_search`)
para qualquer saída grande, `codebase-memory` para navegar o código, leitura pesada delegada a
subagent barato. Nunca despeje log bruto no contexto. Todo subagent recebe `model:` explícito —
`haiku` mecânico, `sonnet` padrão, `opus` só para raciocínio difícil.
