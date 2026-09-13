# Scaffold da API — spec

Demanda: SPA-343. Status: entregue.

## Problema

O `desfeed-app` consome MSW enquanto não existe backend, e o painel do professor (fase 2) não
tem contrato para consumir. Precisamos da base da API servindo as duas pontas, com banco,
documentação e deploy prontos — sem adiantar regra de negócio das demandas seguintes.

## Decisões

**Um schema Zod por rota gera o OpenAPI** (`fastify-type-provider-zod`). A alternativa era
manter schema de validação e schema de documentação separados; ela foi descartada porque os
dois divergem no primeiro dia corrido, e o contrato é entregável para a fase 2.

**Vertical slice com o service atrás da interface do repository.** A alternativa — service
falando Drizzle direto — economiza um arquivo e custa o teste: a regra de negócio só é
testável sem banco porque o repository é injetado. O repository é coberto por teste de
integração contra o Postgres do `docker compose`.

**Identidade por header `x-student-id`.** Pré-autenticação, deliberada: o scaffold não decide
login. Cai quando o JWT entrar, e a decisão precisa sair antes de SPA-364 — XP exige identidade
confiável.

**Migration gerada, nunca escrita à mão** (`pnpm db:generate`). Migration aplicada é imutável;
correção é migration nova.

**Erro do Postgres é traduzido na fronteira HTTP**: violação de FK vira 422, de unicidade vira 409. O código do Postgres vem no `cause` do erro do Drizzle — daí a caminhada na cadeia de
causa em `shared/http/errors.ts`. Sem isso, erro de cliente sai como 500 e o app não sabe
distinguir "dado errado" de "API quebrada".

**Migration no boot do container** (`migrate && server`). A alternativa é um passo de deploy
separado no Railway; foi descartada por custar um passo manual em um projeto de hackathon. O
migrator do Drizzle usa tabela de lock, então réplica concorrente não corrompe.

## Fora de escopo

Autenticação, ingestão por IA, FSRS, sala ao vivo, gamificação e relatórios — cada um tem
demanda própria em `docs/roadmap.md`.
