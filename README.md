<div align="center">

<img src="../memfeed-web/public/memfeed-mark.svg" width="72" alt="" />

# memfeed-api

**O servidor que decide quando cada pergunta volta.**

FSRS do lado do servidor, geração de card por IA com contrato validado, e o relatório de
retenção que o professor lê depois — nunca o acerto do dia da aula sozinho.

![Node](https://img.shields.io/badge/Node-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square)
![Zod](https://img.shields.io/badge/Zod-4-3E67B1?style=flat-square&logo=zod&logoColor=white)
![FSRS](https://img.shields.io/badge/ts--fsrs-5.4.2-10B981?style=flat-square)
![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-6BA539?style=flat-square&logo=openapiinitiative&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-multi--stage-2496ED?style=flat-square&logo=docker&logoColor=white)
![Gemini](https://img.shields.io/badge/IA-Google_Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)

[![API no ar](https://img.shields.io/badge/API-Railway-10B981?style=flat-square&logo=railway&logoColor=white)](https://memfeed-api-production.up.railway.app/health)
[![Swagger](https://img.shields.io/badge/Swagger-/swagger-85EA2D?style=flat-square&logo=swagger&logoColor=black)](https://memfeed-api-production.up.railway.app/swagger)

**[Swagger no ar](https://memfeed-api-production.up.railway.app/swagger)** · **[App do aluno](https://github.com/emersonjds/memfeed-app)** · **[Landing e painel](https://github.com/emersonjds/memfeed-web)**

</div>

---

## O que este serviço resolve

O aplicativo não decide nada sozinho. Quando o aluno responde um card, **o servidor** roda o
FSRS, grava a revisão e a próxima data na mesma transação, e devolve o intervalo. Isso existe
por um motivo prático: o mesmo aluno abre o app no celular e no navegador, e agendamento que
mora no dispositivo diverge no primeiro conflito.

O conteúdo entra por duas portas, e **nenhuma delas é a câmera**:

| Origem | Quem dispara | O que o aluno lê no topo do card |
| --- | --- | --- |
| Aula publicada | O professor, uma vez por aula | `Prof. Marcos • Respiração celular` |
| Estudo próprio | O aluno, quando escolhe o assunto | `Você escolheu • Entropia` |

As duas caem na **mesma fila FSRS**. O que foi respondido na aula de terça volta no dia 1, 3,
7 e 16 misturado com o que o aluno pediu — é isso que faz ser um produto só.

## Rodar local

Pré-requisitos: Node 22+, pnpm e Docker.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm tsx scripts/seed.ts   # turma de 34 alunos, 6 matérias, histórico com D+7 e D+30
pnpm dev
```

| | |
| --- | --- |
| API | http://localhost:3000 |
| Swagger UI | http://localhost:3000/swagger |
| Contrato | `pnpm openapi` exporta para `docs/openapi.json` |

### Geração de cards — Gemini integrado de verdade

Em produção, quem escreve as questões é o **Google Gemini**: o app do aluno e o painel do
professor chamam esta API, ela monta o prompt, valida a resposta do modelo contra JSON schema
e só então o conteúdo vira card. Nenhum card chega ao aluno sem passar por esse parse.

Precisa de **uma** chave, qualquer uma das duas. Sem chave, o serviço sobe e tudo funciona
menos os endpoints de geração, que respondem `503` com mensagem explícita.

```bash
ANTHROPIC_API_KEY=sk-ant-...    # preferida quando presente
GEMINI_API_KEY=AIza...          # tier gratuito do AI Studio, sem cartão
GEMINI_MODEL=gemini-flash-latest
```

A cota gratuita do Gemini é **por dia e por modelo** — esgotou, trocar `GEMINI_MODEL` por
`gemini-flash-lite-latest` devolve fôlego sem trocar de provedor.

O provedor é uma implementação da interface `CardGenerator` (`src/modules/ingestion/card-generator.ts`).
A saída do modelo passa por JSON schema antes de virar card, então trocar de LLM não toca em
nenhuma regra de negócio.

**A figura do card vem da Wikipédia, nunca de modelo de imagem.** O modelo devolve o título
de um verbete e o servidor busca a imagem principal dele. Diagrama científico gerado por IA
sai com seta trocada e molécula inventada — num app de estudo, isso ensina errado.

## Endpoints

Tudo sob `/api`. Autenticação ainda é header (`x-student-id` / `x-teacher-id`) até o JWT entrar.

**Aluno**

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/queue/today` | Fila do dia: vencidos agora + novos até o teto diário |
| `POST` | `/reviews` | Registra a revisão e avança o estado FSRS |
| `GET` | `/progress` | O aluno contra o próprio esquecimento |
| `GET` | `/study/themes` | Temas sugeridos a partir do que ele errou |
| `POST` | `/study/sessions` | Ele escolhe o assunto, a IA gera, cai na fila |
| `GET` | `/session/today` · `/profile` · `/notebooks` | Sessão, perfil e matérias |

**Professor**

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/teacher/classes` | Turmas e matérias, para os seletores do painel |
| `POST` | `/teacher/lessons` | Assunto da aula vira rascunho de questões |
| `POST` | `/teacher/lessons/:id/publish` | Publica só o aprovado; o resto é descartado |
| `GET` | `/teacher/class` | Relatório agregado da turma |
| `GET` | `/teacher/lessons/:id` | Conceitos, distribuição e quem não respondeu |
| `GET` | `/teacher/students` | Estado de cada aluno — nunca uma nota |
| `POST` | `/teacher/students/:id/reinforcement` | Sessão dirigida a quem está travando |

### A métrica que justifica o produto

`GET /teacher/lessons/:id` compara o acerto **no dia da aula** com o que sobrou **sete dias
depois**, conceito a conceito:

```
Ciclo de Krebs        96% no dia    77% em D+7    −19 pp
Fosforilação oxidativa 85% no dia   66% em D+7    −19 pp
```

O relatório é **agregado por construção**: nenhuma consulta deste módulo devolve desempenho
ligado a nome de aluno. Nome só aparece em "ainda não responderam", que é participação.

## Invariantes que o código protege

1. **A IA gera pergunta, nunca resposta pronta.** O prompt do sistema trata conteúdo de imagem
   como material de estudo, nunca como instrução.
2. **Caderno do professor sem aluno é da turma; com aluno é reforço dirigido.** A segunda
   metade dessa regra vive num predicado só, compartilhado por toda consulta de fila — sem ela
   o reforço individual vazaria para a turma inteira.
3. **Não existe ranking entre alunos.** O slice de liga foi removido do contrato.
4. **Migração é reversível** e roda antes do servidor subir.

## Verificação

```bash
pnpm type-check && pnpm lint && pnpm test
pnpm test:integration   # precisa do Postgres do compose no ar
```

## Docker

Tudo em um comando — API e banco, como em produção:

```bash
docker compose up --build
```

O que sobe:

| Serviço | Porta | Descrição |
| --- | --- | --- |
| `api` | `3000` | Build multi-stage do `Dockerfile`; roda a migration e só então inicia o servidor |
| `postgres` | `5432` | Postgres 16 Alpine com healthcheck — a API só inicia depois do banco responder |

Os dados vivem no volume `memfeed-pgdata`, então `docker compose down` não apaga nada;
para zerar o banco, `docker compose down -v`.

Variações úteis:

```bash
docker compose up -d                 # em segundo plano
API_PORT=3100 docker compose up -d   # se a 3000 estiver ocupada
docker compose logs -f api           # acompanhar o boot (migration + Fastify)
docker compose down                  # parar tudo, preservando os dados
```

Para popular o banco do container com a turma de demonstração:

```bash
DATABASE_URL=postgres://desfeed:desfeed@localhost:5432/desfeed pnpm tsx scripts/seed.ts
```

O `Dockerfile` tem dois estágios: o primeiro compila o TypeScript, o segundo carrega só as
dependências de produção e o `dist/` — a imagem final não conhece nem `tsc` nem devDependencies.
O `CMD` roda `db/migrate.js` antes do servidor, então subir um container novo já deixa o
schema em dia; a migration do Drizzle é idempotente e um redeploy não quebra nada.

## Deploy — Railway

O mesmo `Dockerfile` do compose, com `railway.json` apontando o healthcheck para `/health`.
Railway injeta `DATABASE_URL` (referência ao Postgres do projeto, pela rede privada) e `PORT`;
o boot falha cedo se faltar variável (Zod em `src/config/env.ts`).

## Repositórios

| | |
| --- | --- |
| [`memfeed-app`](https://github.com/emersonjds/memfeed-app) | Expo / React Native — o app do aluno |
| [`memfeed-web`](https://github.com/emersonjds/memfeed-web) | Next.js — landing pública e painel do professor |

O contrato entre eles é o **OpenAPI desta API**, nunca um import compartilhado.
