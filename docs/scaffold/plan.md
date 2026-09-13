# Scaffold da API — plano

Demanda: SPA-343. Branch: `feature/spa-343-scaffold` → `developer`. Concluído.

| Etapa | Entrega                                                                                      | Verificação                           |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1     | Toolchain: Node 24 ESM, pnpm, TypeScript estrito, ESLint, Prettier, Vitest com limiar de 90% | `pnpm type-check && pnpm lint`        |
| 2     | Ambiente validado por Zod; variável opcional em branco tratada como ausente                  | `src/config/env.test.ts`              |
| 3     | Schema Drizzle (aluno, caderno, tema, card) e migration gerada                               | `pnpm db:generate`, `pnpm db:migrate` |
| 4     | Fastify + Swagger + handler de erro único; slice `catalog` como molde                        | `test/app.test.ts`                    |
| 5     | Docker multi-stage, `docker compose`, `railway.json` com healthcheck                         | `docker compose up --build`           |
| 6     | Teste de integração contra o Postgres real                                                   | `pnpm test:integration`               |

## Resultado verificado

- 20 testes unitários + 3 de integração passando.
- Cobertura acima do limiar de 90% nas quatro métricas.
- Container respondendo: `/health` com `database: up`, `/swagger/json` publicando `/health` e
  `/notebooks`, migration aplicada no boot.

## Próxima demanda

SPA-363 (catálogo completo: tema, card e curadoria do professor), saindo da `developer`
atualizada.
