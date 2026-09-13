# Plano do backend — Desfeed

Ordem de execução das demandas de back do time Spark (Linear). Uma branch por demanda, saindo
da `developer` atualizada; merge em `developer` ao terminar. Detalhe integral de cada issue em
`docs/linear-backend-issues.md`.

Cada demanda ganha uma pasta própria em `docs/<contexto>/` com `spec.md` e `plan.md`.
`docs/scaffold/` é o par de referência.

## Estado

| #       | Demanda                                       | Slice                               | Documentação          | Depende de       | Status  |
| ------- | --------------------------------------------- | ----------------------------------- | --------------------- | ---------------- | ------- |
| SPA-343 | Scaffold Fastify + Zod + Swagger + Postgres   | `config`, `db`, `shared`, `catalog` | `docs/scaffold/`      | —                | feito   |
| SPA-363 | Catálogo: caderno, tema, card, curadoria      | `modules/catalog`                   | `docs/catalogo/`      | SPA-343          | próximo |
| SPA-358 | Ingestão: foto/PDF → cards por IA             | `modules/ingestion`                 | `docs/ingestao/`      | SPA-363          | a fazer |
| SPA-359 | Agendamento FSRS autoritativo e fila do dia   | `modules/scheduling`                | `docs/agendamento/`   | SPA-363          | a fazer |
| SPA-361 | Sala ao vivo: PIN, ciclo de vida, socket      | `modules/live-room`                 | `docs/sala-ao-vivo/`  | SPA-359          | a fazer |
| SPA-362 | A ponte: resposta na sala alimenta o FSRS     | `modules/live-room`                 | `docs/ponte/`         | SPA-359, SPA-361 | a fazer |
| SPA-364 | Gamificação: XP, streak, meta, ligas          | `modules/gamification`              | `docs/gamificacao/`   | SPA-359          | a fazer |
| SPA-360 | Reconciliação offline da fila e das respostas | `modules/scheduling`                | `docs/reconciliacao/` | SPA-359          | a fazer |
| SPA-365 | Relatórios de turma agregados por design      | `modules/reports`                   | `docs/relatorios/`    | SPA-363, SPA-359 | a fazer |

## O que o scaffold (SPA-343) entregou

- Fastify 5 com `fastify-type-provider-zod`: um schema Zod por rota gera o OpenAPI — contrato
  único para o app do aluno e para o painel do professor.
- Swagger UI em `/swagger`, contrato exportável com `pnpm openapi` (`docs/openapi.json`).
- PostgreSQL 16 com Drizzle ORM; migrations versionadas em `drizzle/`, geradas a partir de
  `src/db/schema.ts`.
- Ambiente validado por Zod no boot: falta variável, o processo não sobe.
- Vertical slice de referência em `src/modules/catalog/` — schemas, repository, service, routes,
  teste de service sem banco.
- Handler de erro único: erro de validação Zod vira 400 tipado; erro interno nunca vaza detalhe.
- Helmet, CORS com allowlist e rate limit global.
- Docker multi-stage + `railway.json` com healthcheck em `/health`; `docker compose` sobe api e
  Postgres juntos.
- Vitest com limiar de cobertura travado em 90% nas quatro métricas.

## O que o scaffold corrigiu depois do smoke test no container

Violação de chave estrangeira saía como 500. Agora o erro do Postgres é traduzido na fronteira
HTTP — 422 para referência inexistente, 409 para unicidade. Detalhe em `docs/scaffold/spec.md`.

## Decisões que ainda precisam de spec do `arq`

- **Autenticação.** O scaffold identifica o aluno pelo header `x-student-id`; isso cai quando o
  login entrar. Decidir antes de SPA-364 (XP depende de identidade confiável).
- **Regra de conflito da reconciliação offline** (SPA-360): pré-requisito de qualquer código.
- **Piso de anonimato dos relatórios** (SPA-365): qual N mínimo, e o que acontece abaixo dele.
