# Ingestão por IA — plano

Demanda: SPA-358. Branch: `feature/spa-358-ingestao` → `developer`.

| Etapa | Entrega | Verificação |
|---|---|---|
| 1 | Contrato de saída em Zod, com quatro formatos e quatro alternativas | `ingestion.schemas.test.ts` |
| 2 | Gerador Anthropic com ferramenta obrigatória e bloco de imagem | `card-generator.test.ts` |
| 3 | `POST /api/notebooks/:notebookId/ingest` com card `pending` e tema agrupado | integração |
| 4 | Rate limit de 10/hora por aluno na rota | `ingestion.routes.ts` |
| 5 | 503 com motivo quando falta chave do provedor | integração |

## Aceite da SPA-358

- [x] Saída sempre por JSON schema e sempre passando por `zod.parse`
- [x] Variedade de formato — enum de quatro formatos no contrato
- [x] Rate limit na rota de upload
- [x] Chave da Anthropic só no servidor — teste falha se ela aparecer no payload
- [x] Nenhum dado pessoal do aluno no prompt
- [x] Conteúdo da foto tratado como entrada hostil, e `imageUri` restrito a https/data
- [ ] Eval com fotos reais e rubrica — pendente do conjunto de fotos

## Resultado verificado

- 116 testes passando (90 unitários + 26 de integração).
- Cobertura 100% statements/lines/functions, 95.23% branches.
