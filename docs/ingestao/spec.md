# Ingestão por IA — spec

Demanda: SPA-358.

## Problema

Sem ingestão o feed está vazio: é ela que transforma a página do caderno do aluno em cards. E é
o ponto do produto onde mais coisa pode dar errado — dinheiro, privacidade e a tese.

## A invariante que este código existe para proteger

**A IA gera pergunta, nunca resposta pronta.** O estudo do MIT Media Lab (Kosmyna et al. 2025)
mediu 55% menos conectividade neural em quem escreve com LLM. Um card que entrega a resposta
transforma o Desfeed no problema que ele diz combater. A regra está no system prompt, e o
formato de saída não tem campo para "resposta explicada" — só pergunta, alternativas e gabarito.

## Decisões

**Saída por ferramenta com JSON schema, e `zod.parse` por cima.** O modelo é obrigado a chamar
`gerar_cards` (`tool_choice` fixo), e o resultado ainda passa pelo schema Zod. Prosa, card com
três alternativas ou formato desconhecido viram **502 com erro útil** — nada é gravado. Confiar
no schema do provedor sem validar de novo é confiar em rede e em modelo ao mesmo tempo.

**Quatro formatos obrigatórios** (`pergunta-direta`, `completar-frase`, `explicar-em-uma-linha`,
`flashcard-reverso`), declarados no enum. Variedade não é pedido educado no prompt: é o domínio
do tipo.

**Card gerado nasce `pending`.** Ele aparece na resposta da ingestão (o app mostra o carrossel do
que foi escaneado) mas **não entra na fila de ninguém** até o professor aprovar. Card
factualmente errado é o pior resultado possível, e curadoria é a defesa (SPA-363).

**A foto é entrada hostil.** O system prompt declara que o conteúdo da imagem é material de
estudo e nunca instrução — o aluno pode escrever "ignore as regras acima" no caderno de
propósito. Além disso, `imageUri` aceita **só https ou data URI**: `file://` e outros esquemas
são recusados no schema, porque quem busca a imagem é o servidor.

**Rate limit próprio na rota**: 10 ingestões por hora por aluno, bem abaixo do limite global da
API. Upload sem limite é DoS financeiro — cada imagem custa tokens.

**A chave da Anthropic só existe no servidor**, lida de `ANTHROPIC_API_KEY`. Nunca vai no corpo
da requisição, na resposta ou no log — há teste que falha se a chave aparecer no payload. Sem
chave configurada, a rota responde **503 com motivo**, em vez de fingir que funciona.

**Nenhum dado do aluno entra no prompt.** O corpo enviado ao modelo tem a imagem (ou o tema) e
nada mais: sem nome, sem escola, sem turma, sem identificador.

**Tema sem foto também gera.** `topic` sozinho atende o caso do professor que escolhe o assunto
e não tem caderno para fotografar.

## Consequência para o app

O app envia `{ imageUri }` com a URI local do device (`file://...`), que o servidor não consegue
ler. Para usar a API real, ele precisa enviar **data URI base64** ou subir a imagem antes e
mandar a URL https.

## Fora de escopo

O eval de qualidade com fotos reais e rubrica — depende de um conjunto de fotos que ainda não
existe. `card_reports` (SPA-363) já coleta o insumo.
