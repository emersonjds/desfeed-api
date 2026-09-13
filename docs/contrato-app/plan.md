# Contrato com o app — plano

Branch: `feature/spa-343-contrato-api` → `developer`. Concluído.

| Etapa | Entrega | Verificação |
|---|---|---|
| 1 | Rotas de domínio sob `/api`, `/health` na raiz | `test/app.test.ts` confere o OpenAPI |
| 2 | `GET /api/notebooks` no formato de biblioteca, campos de FSRS nulos | `catalog.service.test.ts` |
| 3 | `GET /api/notebooks/:notebookId` com temas e 404 para caderno alheio | teste de integração |
| 4 | Colunas `cover_url` e `source_label` no caderno (migration `0001`) | `pnpm db:migrate` |
| 5 | Contagem de cards aprovados por join agregado, sem N+1 | teste de integração conta só o aprovado |

## Resultado verificado

- 28 testes unitários + 5 de integração passando.
- Cobertura 99.65% statements/lines, 96.92% branches, 100% functions.
- `docs/openapi.json` publica `GET /health`, `GET|POST /api/notebooks` e
  `GET /api/notebooks/{notebookId}`.

## O que ainda separa app e API

O app precisa relaxar cinco campos para `.nullable()` (ver `spec.md`). É mudança no
`desfeed-app`, não aqui.
