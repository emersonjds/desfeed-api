# Contrato app ↔ API após a virada de produto

13/09/2026. O `desfeed-app` foi reestruturado: a foto do caderno deixou de ser a porta de
entrada e o ranking entre alunos saiu. Este documento lista, endpoint por endpoint, o que a
API já atende e o que mudou de baixo dos pés dela.

## O que mudou no produto

A origem do conteúdo agora tem exatamente duas portas, e nenhuma delas é a câmera:

1. **O professor passou.** Ele terminou a aula, abre o painel, digita assunto e quantidade,
   a IA gera, ele revisa uma vez e publica para a turma.
2. **O aluno escolheu.** Ele diz o que quer treinar e a IA gera para ele.

As duas caem na mesma fila FSRS. Cada card carrega de onde veio, e o app mostra isso no topo.

O motivo de a foto ter saído: ela pede esforço do aluno antes de entregar valor, alimenta a
IA com página manuscrita torta, e enterra o professor sob uma curadoria por aluno — 210 alunos
geram centenas de curadorias por semana. Gerar por assunto resolve os três de uma vez: o
professor cura **uma vez por aula**, sobre conteúdo que ele mesmo acabou de ensinar.

## Endpoints que o app consome hoje

| Endpoint | API | Situação |
| --- | --- | --- |
| `GET /api/queue/today` | existe | **Conflito**: falta `origin` no card |
| `GET /api/session/today` | existe | Compatível |
| `GET /api/profile` | existe | Compatível |
| `GET /api/notebooks` | existe | Compatível |
| `POST /api/reviews` | existe | Compatível — o body já tem `origin: 'feed' \| 'sala'` |
| `GET /api/progress` | **falta** | Substitui `/api/ranking` |
| `GET /api/study/themes` | **falta** | Sugestões de tema para o aluno |
| `POST /api/study/sessions` | **falta** | Aluno pede assunto, recebe cards |
| `GET /api/teacher/class` | **falta** | Relatório agregado da turma |
| `POST /api/teacher/lessons` | **falta** | Professor gera as questões da aula |

## As duas decisões que não são minhas

### 1. `/api/ranking` morre ou convive?

A API modelou liga competitiva completa — pódio, corte de promoção, corte de rebaixamento e
duelo. O app removeu tudo isso: ranking entre colegas expõe publicamente o aluno que vai mal,
e o edital do HACKTUDO pede **promoção de saúde mental**. Um placar que ordena adolescentes
por desempenho joga contra o próprio enunciado.

O que entrou no lugar é `GET /api/progress`: o aluno contra o próprio esquecimento.

Mantivemos um único elemento coletivo, sem expor indivíduo: **meta da turma** — quantos
conceitos a turma consolidou na semana. Isso responde "colaboração" no edital sem ranquear
ninguém.

**Decisão pendente:** apagar o slice de liga, ou deixá-lo desativado atrás de flag.

### 2. De onde sai o `origin` do card?

O app precisa distinguir, no topo de cada card:

```
Prof. Marcos • Respiração celular     (kind: 'turma')
Você escolheu • Entropia              (kind: 'proprio')
```

Hoje `queueCard` não devolve isso. O dado existe no banco — o card pertence a um tema, que
pertence a um caderno — mas falta decidir se `origin` vira coluna denormalizada em `cards`
ou join na query da fila.

## Schemas que o app já valida

O app roda `zod.parse` em toda resposta, então divergência de formato quebra em
desenvolvimento e não em produção. As definições canônicas do lado do app:

- `desfeed-app/src/entities/card/schema.ts` — `cardOriginSchema`
- `desfeed-app/src/entities/progress/schema.ts` — resposta de `/api/progress`
- `desfeed-app/src/entities/study/schema.ts` — temas e geração por assunto
- `desfeed-app/src/entities/teacher/schema.ts` — relatório de turma e geração de aula

```ts
// origem do card
z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turma'), teacher: z.string(), lesson: z.string() }),
  z.object({ kind: z.literal('proprio'), theme: z.string() }),
])
```

```ts
// GET /api/progress
{
  streakDays: number
  freezesLeft: number          // folga não quebra a sequência: streak não pode virar coerção
  retentionD7: number          // 0–100
  retentionD7LastMonth: number
  consolidated: number
  totalConcepts: number
  weekMinutes: { day: string; minutes: number }[]   // 7 posições
  subjects: { subject, retention, delta, consolidated, total }[]
  atRisk: { concept, subject, daysUntilForgotten }[]
  classGoal: { className, label, done, total }
}
```

```ts
// POST /api/study/sessions
// body: { subject: string, theme: string, cardCount: 5..30 }
// 200:  { theme: string, cards: Card[] }
```

```ts
// POST /api/teacher/lessons
// body: { subject: string, topic: string, questionCount: 5..30 }
// 200:  { lessonId, topic, questions: { id, question, correctAnswer, approved }[] }
```

```ts
// GET /api/teacher/class  — agregado, nunca aluno identificável
{
  className, subject, studentCount, participation,
  retentionD7, retentionD30,
  lessons: {
    id, topic, publishedAt, answeredBy,
    concepts: { concept, accuracyOnDay, retentionD7 }[]
  }[]
}
```

`retentionD7` e `retentionD30` no relatório de turma são a métrica que nenhum concorrente
entrega: Kahoot e Quizizz medem o acerto no dia da atividade e param ali. A invariante de
privacidade vale aqui sem exceção — só agregado, nunca aluno identificável.

## Como o app aponta para a API

```bash
EXPO_PUBLIC_USE_MOCKS=false
EXPO_PUBLIC_API_URL=https://<railway>
```

Enquanto `EXPO_PUBLIC_USE_MOCKS=true`, o app resolve tudo por `src/shared/api/mocks/routes.ts`
com latência simulada. O contrato é o mesmo dos dois lados, então virar a chave não muda tela
nenhuma.
