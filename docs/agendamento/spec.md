# Agendamento FSRS — spec

Demanda: SPA-359.

## Problema

O estado de memória do aluno é o ativo do produto. Ele não pode viver só no device: o aluno
entra pelo feed no celular e pela sala ao vivo no tablet da escola, e um aparelho perdido ou
formatado não pode apagar meses de revisão.

## Decisões

**O servidor é autoritativo; o app calcula localmente só para sobreviver ao 4G da escola.** O
mesmo `ts-fsrs@5.4.2` que o app usa roda aqui, e é a resposta daqui que vale na divergência. A
regra de reconciliação é SPA-360.

**Estado por par (aluno, card)** em `card_states`, chave primária composta. Card é conteúdo
compartilhado da turma; memória é individual. Índice por `(student_id, due)` porque a fila do
dia é a consulta mais quente do produto — roda a cada abertura do app, para todo aluno.

**A fila é duas consultas, não N+1.** Uma traz os cards devidos com o estado já no join
(`cards` + `card_versions` + `themes` + `notebooks` + `card_states`), outra traz os novos que
ainda não têm estado. Nenhuma delas consulta card a card.

**Teto de novos por dia contado por revisão, não por exibição.** `new_cards_per_day` no aluno
(default 10); o gasto do dia é `review_logs` com `previous_state = 0` desde o início do dia no
**fuso do aluno**. Contar por exibição faria o teto queimar quando o app recarrega a tela.

**Idempotência pela chave natural `(aluno, card, reviewedAt)`.** O app envia o instante da
revisão; reenviar o mesmo evento reenvia o mesmo instante. Índice único em `review_logs`, e o
serviço devolve o resultado já gravado em vez de reagendar. A alternativa era exigir um id de
requisição do cliente, o que mudaria o app sem ganho.

**Cada revisão guarda a versão do card** (`card_version`) e a **origem** (`feed` ou `sala`). A
origem é o que torna a ponte da sala ao vivo (SPA-362) auditável em vez de efeito colateral.

**XP paga esforço de recuperação, nunca tempo de tela**: `hard` (20) > `good` (15) > `easy`
(10) > `again` (5). Acertar o que estava difícil é o esforço que consolida; abrir o app não
vale nada. É a regra que sustenta a tese do produto — quem quiser mexer nela, leia o briefing
antes.

**`masteryPercent` é a retrievability do FSRS**, não uma contagem de acertos. Card novo vale 0
porque nunca foi lembrado, não porque foi errado.

**`bookmarkCount` e `shareCount` voltam 0**: as features não existem no backend. Zero aqui é
fato, não estimativa.

## Fora de escopo

Streak, meta diária, liga e `/api/session/today` (SPA-364). Reconciliação offline (SPA-360).
