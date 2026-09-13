# Gamificação — plano

Demanda: SPA-364. Branch: `feature/spa-364-gamificacao` → `developer`.

| Etapa | Entrega | Verificação |
|---|---|---|
| 1 | `daily_progress` e `student_leagues` (migration `0005`) | `pnpm db:migrate` |
| 2 | Progresso do dia gravado na transação da revisão | integração: reenvio não duplica XP |
| 3 | `GET /api/session/today` com meta, streak e XP | `gamification.service.test.ts` |
| 4 | `GET /api/profile` e `PATCH /api/profile` | integração: reduzir meta mantém streak |
| 5 | `GET /api/ranking` com apuração semanal na leitura | testes de promoção e rebaixamento |

## Aceite da SPA-364

- [x] Nenhuma métrica derivada de tempo de tela ou de sessões abertas — XP só de revisão
- [x] Idempotência: resposta reenviada não duplica XP nem streak
- [x] Fuso do aluno respeitado na virada do dia e da semana
- [x] Reduzir a meta não quebra o streak — cada dia guarda a meta que valia nele

## Resultado verificado

- 91 testes passando (69 unitários + 22 de integração).
- Cobertura 100% statements/lines/functions, 94.41% branches.
