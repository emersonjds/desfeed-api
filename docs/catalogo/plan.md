# Catálogo e curadoria — plano

Demanda: SPA-363. Branch: `feature/spa-363-catalogo` → `developer`.

| Etapa | Entrega | Verificação |
|---|---|---|
| 1 | `teachers`, `card_versions`, `card_reports`; card com status de quatro valores (migrations `0002`, `0003`) | `pnpm db:migrate` |
| 2 | Tema dentro do caderno do aluno | teste de integração |
| 3 | Card do professor, já aprovado, com quatro alternativas | teste de integração |
| 4 | Fila de curadoria e decisão em uma requisição | `cards.service.test.ts` |
| 5 | Edição versionada, versão anterior preservada | integração conta 2 versões |
| 6 | Report do aluno, suspensão por erro factual, 409 no repetido | integração |

## Aceite da SPA-363

- [x] Aprovar ou rejeitar em um toque, sem formulário — `POST /api/cards/:cardId/decision`
- [x] Card rejeitado sai da fila de todos os alunos — a fila lê só `approved`
- [x] Versionamento não corrompe o histórico — `card_versions`, `current_version`
- [x] Motivo do report é registrado — `card_reports` com motivo, versão e comentário

## Resultado verificado

- 50 testes unitários + 11 de integração passando.
- Cobertura 100% statements/lines/functions, 95.45% branches.
- OpenAPI publica 11 rotas, entre elas `/api/curation/cards` e `/api/cards/{cardId}/decision`.
