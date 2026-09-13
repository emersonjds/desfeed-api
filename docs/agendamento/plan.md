# Agendamento FSRS — plano

Demanda: SPA-359. Branch: `feature/spa-359-agendamento` → `developer`.

| Etapa | Entrega | Verificação |
|---|---|---|
| 1 | `card_states` e `review_logs`; meta, teto e fuso no aluno (migration `0004`) | `pnpm db:migrate` |
| 2 | Adaptador do `ts-fsrs`: agendar, retrievability e contrato de saída | `scheduling.service.test.ts` |
| 3 | `GET /api/queue/today` com devidos + novos até o teto | integração conta 2 de 3 cards |
| 4 | `POST /api/reviews` com estado, log, origem e XP | integração confere `card_states` e `review_logs` |
| 5 | Idempotência do reenvio | integração reenvia e conta 1 log |

## Aceite da SPA-359

- [x] Cada grau produz o intervalo esperado — testes para card novo, em revisão e esquecido
- [x] Fila do dia sem N+1 — duas consultas com join, nenhuma por card
- [x] Teto de cards novos por dia respeitado — inclusive quando já foi atingido
- [x] Revisão registrada com origem (`feed` ou `sala`)

## Resultado verificado

- 70 testes passando (54 unitários + 16 de integração).
- Cobertura 100% statements/lines/functions, 95.83% branches.
