# Issues de backend — Linear (Desfeed)

## SPA-343 — [infra] Scaffold da API Fastify com Zod, Swagger e Postgres

- status: Backlog | prioridade: Urgent | labels: (nenhuma)

## Funcionalidade

`desfeed-api` em Node + Fastify com `fastify-type-provider-zod`, `@fastify/swagger`, PostgreSQL e migrations versionadas. Estrutura em vertical slices.

## Casos de uso

- O app mobile consome a API com tipos derivados do mesmo schema Zod.
- O painel web do professor (fase 2) consome o **mesmo** contrato OpenAPI, sem rota nova.

## Por quê

A API serve **duas pontas desde o primeiro endpoint**. Se as rotas nascerem modeladas só para o mobile, a fase 2 vira reescrita. O contrato OpenAPI é entregável, não subproduto.

Referência de estrutura: `~/Documents/workspace/hackathons/calledit/calledit-api` roda a mesma combinação e funciona — copiar o padrão, não inventar outro.

## Aceite

- [ ] `npm run dev` sobe e `/docs` serve o Swagger UI
- [ ] Um schema Zod por rota, gerando o OpenAPI automaticamente (schema único, não dois)
- [ ] Migrations rodam do zero em base limpa
- [ ] Variáveis de ambiente validadas por Zod no boot — processo não sobe com config faltando
- [ ] `npm run type-check && npm run lint && npm test` passam

---

## SPA-358 — [back] Pipeline de ingestão — foto para cards por IA

- status: Backlog | prioridade: Urgent | labels: (nenhuma)

## Funcionalidade

Upload da imagem, chamada ao `claude-sonnet-5` (`/v1/messages`, bloco de imagem + JSON schema de saída), validação por Zod, persistência dos cards e fila de curadoria.

## Casos de uso

- Foto de caderno manuscrito vira 6–12 cards de formatos variados.
- O professor escolhe um tema e a IA gera perguntas sem foto nenhuma.
- O modelo devolve prosa em vez de JSON: a requisição falha com erro útil, sem derrubar nada.

## Por quê

É o que alimenta o produto inteiro — sem ingestão, o feed está vazio.

**A invariante que este código existe para proteger: a IA gera pergunta, nunca resposta pronta.** O estudo do MIT Media Lab (Kosmyna et al. 2025) mediu −55% de conectividade neural em quem escreve com LLM e 83% incapazes de citar uma frase do próprio texto. Se o Desfeed entregar resposta pronta, ele vira o problema que diz combater — e o júri vai perguntar exatamente isso.

**Card factualmente errado é o pior resultado possível.** Ensinar errado é pior que não ensinar: prefira 6 cards bons a 12 duvidosos.

## Aceite

- [ ] Saída sempre por JSON schema e sempre passando por `zod.parse`
- [ ] Variedade de formato: pergunta direta, completar frase, explicar em uma linha, flashcard reverso
- [ ] Rate limit — upload sem limite é DoS financeiro
- [ ] Chave da Anthropic API nunca sai do servidor; nunca em `EXPO_PUBLIC_*`, bundle ou log
- [ ] Nenhum dado pessoal do aluno vai no prompt
- [ ] Conteúdo da foto é tratado como entrada hostil (o aluno pode escrever instrução no caderno de propósito)
- [ ] Eval rodável: fotos reais, rubrica (obriga recuperação? é correto? cabe em 15s? formato varia?)

---

## SPA-359 — [back] Agendamento FSRS autoritativo e fila do dia

- status: Backlog | prioridade: Urgent | labels: (nenhuma)

## Funcionalidade

Estado FSRS por aluno/card (`ts-fsrs@5.4.2`), resolução da fila do dia, teto de cards novos, e registro de cada revisão.

## Casos de uso

- O app pede a fila de hoje e recebe os cards devidos, ordenados.
- O aluno responde e o estado do card avança conforme o grau escolhido.
- O mesmo aluno usa o app no celular e entra numa sala pelo tablet da escola — o agendamento é o mesmo.

## Por quê

**Autoritativo no servidor** porque o aluno tem mais de um caminho de entrada (feed e sala ao vivo) e porque o estado de memória é o ativo do produto — não pode viver só num device que pode ser perdido ou formatado.

O algoritmo é a razão de o produto funcionar: retenção cai para ~21% em um mês sem revisão (Ebbinghaus/Murre & Dros 2015) e a prática distribuída vence o estudo maciço em 839 comparações (Cepeda et al. 2006).

## Aceite

- [ ] Cada grau produz o intervalo esperado — teste para card novo, em revisão e esquecido
- [ ] Fila do dia sem N+1: é a consulta feita a cada abertura do app
- [ ] Teto de cards novos por dia respeitado
- [ ] Revisão registrada com origem (feed ou sala)

---

## SPA-360 — [back][mobile] Reconciliação offline da fila e das respostas

- status: Backlog | prioridade: Urgent | labels: (nenhuma)

## Funcionalidade

O app resolve a fila do dia localmente (`expo-sqlite` + `drizzle-orm`) e sincroniza as respostas quando houver rede. Regra determinística para quando o estado local e o do servidor divergirem.

## Casos de uso

- Júlia estuda no ônibus sem rede e a sessão conta normalmente.
- Ela responde offline no celular e, antes de sincronizar, participa de uma sala ao vivo pela escola — os dois estados precisam convergir sem perder revisão.
- O envio falha, o app reenvia, e a resposta conta **uma vez**.

## Por quê

Cerca de **metade das escolas brasileiras tem internet ruim**. Offline não é cortesia — é a diferença entre o produto servir escola pública ou só escola particular, e a equidade de acesso é um dos ângulos que o dossiê identifica como diferencial.

É também **onde o bug vai morar**. Dois estados de agendamento para o mesmo card é o problema mais difícil do produto, e o que ninguém lembra de testar.

## Aceite

- [ ] Regra de conflito definida em `docs/specs/` **antes** da implementação, decidida pelo `arq`
- [ ] Idempotência: resposta reenviada conta uma vez; XP e streak sobem uma vez
- [ ] Teste de divergência local × servidor, incluindo o caso feed-offline + sala-online
- [ ] Sessão retoma corretamente após o app ser morto no meio

---

## SPA-361 — [back] Sala ao vivo — PIN, ciclo de vida e sincronização por socket

- status: Backlog | prioridade: Urgent | labels: (nenhuma)

## Funcionalidade

Criação de sala com PIN, ciclo de vida (aberta → em andamento → encerrada), sincronização da pergunta e coleta de respostas via `socket.io` (rooms por PIN).

## Casos de uso

- O professor cria a sala escolhendo temas; a IA gera as perguntas; ele revisa e abre.
- 40 alunos entram pelo PIN e respondem em tempo real.
- O professor avança a pergunta, encerra, e a sala vira relatório.

## Por quê

É a materialização da **janela pedagógica** que a Lei 15.100/2025 previu e que ninguém construiu: 92% das escolas aplicam a restrição de forma improvisada. O produto que organiza essa janela ocupa um vácuo legal e de mercado ao mesmo tempo.

`socket.io` foi escolhido por já trazer rooms por PIN prontos e client Expo maduro — latência de segundos é aceitável aqui, e o time tem 24h.

## Aceite

- [ ] PIN com entropia e expiração; rate limit na tentativa de entrada
- [ ] Autorização verificada **por evento**, não só na entrada — aluno não emite evento de professor
- [ ] 40 conexões simultâneas sem degradação perceptível
- [ ] Reconexão preserva a participação sem duplicar resposta
- [ ] Sala encerrada rejeita entrada e resposta tardia

---

## SPA-362 — [back] A ponte — resposta na sala alimenta o FSRS individual

- status: Backlog | prioridade: Urgent | labels: (nenhuma)

## Funcionalidade

Toda resposta dada numa sala ao vivo vira um evento que agenda aquele card no estado FSRS individual do aluno. Caminho explícito e testado — **nunca efeito colateral escondido num handler**.

## Casos de uso

- O aluno erra uma pergunta na aula de terça e ela aparece no feed dele na quinta.
- O aluno acerta com facilidade e o card é agendado longe, sem ocupar a fila dele.
- Um aluno entrou na sala sem conta: a participação é registrada e vincula quando ele criar conta.

## Por quê

**É o diferencial competitivo número um do produto, e o mais difícil de refutar num pitch.**

A pesquisa validou: nenhum player — Kahoot, Quizizz, Blooket, Gimkit, Wooclap, PlayAula — alimenta um scheduler de memória individual depois da aula. A aula termina, o professor baixa um relatório, e o conhecimento evapora exatamente na curva que Ebbinghaus mediu em 1885.

É também o que separa o Desfeed de "mais um Kahoot brasileiro" — e a pesquisa mostrou que essa categoria já tem ocupantes nacionais (PlayAula, Unoquizz, Educa AI).

## Aceite

- [ ] Caminho explícito e nomeado, com teste próprio
- [ ] Teste que falha se a ponte regredir em silêncio
- [ ] Idempotente: reprocessar o evento não duplica agendamento
- [ ] Card agendado carrega a origem "sala" para ser exibida ao aluno

---

## SPA-363 — [back] Catálogo de cadernos, temas e cards com curadoria do professor

- status: Backlog | prioridade: High | labels: (nenhuma)

## Funcionalidade

Modelo e rotas de caderno, tema, card e versão. Fila de curadoria: o professor aprova ou rejeita um card gerado pela IA em **um toque**.

## Casos de uso

- Júlia organiza os cards por matéria e capítulo.
- O professor Marcos revisa 20 perguntas geradas e aprova 17 em menos de um minuto.
- Um card é reportado como factualmente errado e sai da fila de todo mundo que o tem.

## Por quê

Curadoria é a resposta ao risco mais concreto do produto: **card gerado por IA que está errado**. Ensinar errado é pior que não ensinar, e "a IA pode alucinar" é a pergunta que o júri faz.

Um toque é requisito, não meta: 54% das escolas não treinam professores em tecnologia. Curadoria que exige formulário não acontece.

## Aceite

- [ ] Aprovar ou rejeitar em um toque, sem formulário
- [ ] Card rejeitado sai da fila de todos os alunos que já o receberam
- [ ] Versionamento: editar um card não corrompe o histórico de revisão de quem já o respondeu
- [ ] Motivo do report é registrado e alimenta o eval de qualidade da geração

---

## SPA-364 — [back] Gamificação — XP, streak, meta diária e ligas

- status: Backlog | prioridade: High | labels: (nenhuma)

## Funcionalidade

Cálculo de XP por revisão, streak diário, progresso da meta e apuração semanal de liga. **Tudo no servidor** — o cliente não decide XP.

## Casos de uso

- Júlia completa a meta e o streak avança uma vez, mesmo se o app reenviar a última resposta.
- A semana vira à meia-noite do fuso dela e a liga é apurada.
- Ela reduz a meta diária de 20 para 10 e o streak continua válido.

## Por quê

O hábito é o que o produto realmente vende: retenção exige voltar amanhã, e depois de amanhã.

**A regra que não pode ser quebrada: XP vem de esforço de recuperação, nunca de tempo de tela nem de sessões abertas.** Se a gamificação premiar permanência, ela contradiz a tese do produto — e a tela "Perfil & Saúde Cognitiva", que mede retenção em vez de consumo, vira mentira.

Reduzir a meta não pode punir. É coerência com o anti-dark-pattern da tela de configuração.

## Aceite

- [ ] Nenhuma métrica derivada de tempo de tela ou de sessões abertas
- [ ] Idempotência: resposta reenviada não duplica XP nem streak
- [ ] Fuso horário do aluno respeitado na virada do dia e da semana
- [ ] Reduzir a meta não quebra o streak

---

## SPA-365 — [back] Relatórios de turma agregados por design

- status: Backlog | prioridade: Urgent | labels: (nenhuma)

## Funcionalidade

Endpoints de relatório para o professor: desempenho da turma por tema, evolução ao longo do tempo, e onde a turma está fraca. **Agregado sempre. Nunca individual.**

## Casos de uso

- O professor Marcos descobre que a turma não entendeu respiração celular — antes da prova bimestral, não depois.
- Ele exporta o registro da janela pedagógica (turma, tema, duração, resultado) para a coordenação.

## Por quê

**É invariante de arquitetura, não regra de tela.** A UNESCO documentou que 89% das edtechs usadas na pandemia vigiavam crianças, e o júri de um festival de cultura digital conhece esse número. Privacidade agregada por design é argumento de diferenciação — por isso uma falha aqui não custa multa, custa a tese.

Os titulares são adolescentes. Um endpoint que devolva desempenho individual identificável ao professor é falha de privacidade de menor de idade, não bug de UI.

## Aceite

- [ ] Nenhum endpoint de professor devolve desempenho individual identificável
- [ ] **Existe teste que falha se alguém introduzir esse endpoint** — a invariante precisa de guardião automatizado
- [ ] Piso de anonimato: turma pequena não torna o agregado identificável
- [ ] Ordenação e timestamp não reidentificam quem respondeu o quê
- [ ] Revisado pelo agent `redteam` antes de merge
