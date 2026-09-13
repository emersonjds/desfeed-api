# desfeed-api

Backend do Desfeed — Node + Fastify + Zod + Drizzle + PostgreSQL. Serve o app do aluno
(`desfeed-app`) e o painel do professor (`desfeed-web`, fase 2) pelo mesmo contrato OpenAPI.

## Rodar local

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/swagger
- Contrato: http://localhost:3000/swagger/json (exportado em `docs/openapi.json` por `pnpm openapi`)

## Verificação

```bash
pnpm type-check && pnpm lint && pnpm test:coverage   # unitários, limiar de 90% nas 4 métricas
pnpm test:integration                                # precisa do Postgres do compose no ar
```

## Banco

Schema em `src/db/schema.ts`, migrations geradas em `drizzle/`.

```bash
pnpm db:generate   # gera a migration a partir do schema
pnpm db:migrate    # aplica no DATABASE_URL
```

## Deploy — Railway

`Dockerfile` multi-stage (build → runtime), `railway.json` com healthcheck em `/health`.
Railway injeta `DATABASE_URL` e `PORT`; o boot falha cedo se faltar variável (Zod em `src/config/env.ts`).

```bash
docker compose up --build              # sobe api + postgres como em produção
API_PORT=3100 docker compose up -d     # se a 3000 já estiver ocupada
```

O container roda a migration antes de subir o servidor.

## Documentação

`docs/<contexto>/spec.md` (decisões e trade-offs) e `docs/<contexto>/plan.md` (etapas e
verificação), um par por demanda. Ordem de execução em `docs/roadmap.md`.
