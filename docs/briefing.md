# Desfeed — Briefing do Projeto

> O feed que devolve em vez de tomar.
> A interface do TikTok, o algoritmo do Ebbinghaus.

|                            |                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| **Evento**                 | HACKTUDO 2026 · 13ª edição · 11–19 de setembro · 100% online                                  |
| **Promoção**               | Ministério da Cultura, Prefeitura do Rio, Secretaria Municipal de Cultura, Petrobras          |
| **Premiação**              | R$ 16.000 (1º: R$ 10.000 · 2º: R$ 4.000 · 3º: R$ 2.000)                                       |
| **Entrega pré-pitching**   | PDF de até 10 slides + projeto/mockup — **13/09, 12h00**                                      |
| **Critérios (peso igual)** | Adequação ao tema · Originalidade/Inovação · Solução tecnológica · Utilidade e Aplicabilidade |
| **Documento-fonte**        | `~/Desktop/HACKTUDO-2026-10-Propostas.pdf` (dossiê de 22 páginas, proposta #4)                |
| **Design-fonte**           | Google Stitch, projeto `13004427895386965321` — 20 telas, 9 canônicas em fundo branco         |

---

## 1. O desafio oficial

> "Desenvolver soluções inovadoras que permitam a utilização consciente dos smartphones nas escolas, integrando tecnologia, metodologias educacionais e estratégias de promoção da saúde mental. As propostas deverão demonstrar como o celular pode deixar de ser um elemento de distração para tornar-se uma ferramenta efetiva de aprendizagem, colaboração, criatividade e bem-estar."

O enunciado carrega um contrato explícito que a banca vai conferir item a item:

**Três pilares obrigatórios** — (1) tecnologia, (2) metodologias educacionais, (3) promoção da saúde mental.
**Quatro verbos de resultado** — aprendizagem, colaboração, criatividade, bem-estar.

O celular **fica em cena**. Qualquer solução cujo núcleo seja guardar ou bloquear o aparelho perde centralidade. O gancho jurídico é a Lei 15.100/2025, que proíbe o celular na escola _exceto para fins pedagógicos sob orientação do professor_ — e ninguém construiu a ferramenta dessa exceção.

---

## 2. A tese

O problema não é a presença da tecnologia na educação. É a **ausência de tecnologia desenhada a favor da cognição**.

Todo o stack que o aluno usa hoje — feed, notificação, resposta instantânea da IA — foi otimizado para **capturar atenção e eliminar esforço**. E atenção sustentada e esforço de recuperação são, segundo a ciência da aprendizagem, exatamente os dois ingredientes que produzem retenção.

Desfeed faz a inversão: **mesma mecânica de hábito, função-objetivo trocada**. O algoritmo não otimiza tempo de tela — otimiza retenção. A prova por demonstração é que o problema nunca foi o formato, e sim para onde o formato estava apontando.

### A evidência que sustenta cada decisão de produto

| Dado                                                                                                                         | Fonte                                                   | O que decide no produto                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Atenção média em tela caiu de 2,5 min (2004) para **47 s**                                                                   | Gloria Mark, UC Irvine                                  | Card resolvível em ~15 s                                    |
| **65%** dos alunos da OCDE se distraem com dispositivos em aula; **−15 pts** no PISA para quem se distrai em quase toda aula | PISA 2022                                               | O produto precisa do professor no circuito, não só do aluno |
| **59%** relatam distração causada pelo celular _do colega_                                                                   | PISA 2022                                               | O custo é coletivo — daí a sala ao vivo                     |
| Short-form video ↔ pior atenção sustentada (98.299 participantes, 71 estudos)                                                | Meta-análise 2025                                       | Sessão com fim proposital, sem scroll infinito              |
| **−55%** de conectividade neural escrevendo com LLM; **83%** não citam uma frase do próprio texto                            | Kosmyna et al., MIT Media Lab 2025 ("dívida cognitiva") | IA gera a _pergunta_, nunca a resposta                      |
| Reler 4× vs. auto-testar: 83%/71% após 5 min, mas **40%/61%** após 1 semana                                                  | Roediger & Karpicke 2006 (testing effect)               | O card é sempre recuperação ativa, nunca releitura          |
| Retenção cai a ~34% em 1 dia e ~21% em 1 mês sem revisão                                                                     | Ebbinghaus 1885, replicado por Murre & Dros 2015        | Agendamento por FSRS                                        |
| Prática distribuída > estudo maciço (meta-análise de 839 comparações)                                                        | Cepeda et al. 2006                                      | Espaçamento é o núcleo do algoritmo                         |
| Aprendizagem ativa: **+0,47 DP**; aula passiva **1,5×** mais reprovação                                                      | Freeman et al. 2014, PNAS                               | Sala ao vivo é peer instruction instrumentada               |
| **7 em 10** alunos do EM brasileiro usam IA generativa; só **32%** com orientação da escola                                  | TIC Educação 2025                                       | Lacuna institucional que o produto ocupa                    |
| **73%** dos alunos abaixo do básico em matemática (PISA 2022)                                                                | INEP/OCDE                                               | Tamanho do problema                                         |
| **92%** das escolas já aplicam a Lei 15.100 — de forma improvisada                                                           | MEC, jun/2026 (8.189 escolas)                           | Vácuo legal + de mercado simultâneo                         |

---

## 3. O produto

**Desfeed** é um app mobile de feed vertical infinito — swipe, streak, liga, XP — em que **cada card é uma micro-recuperação ativa** do que o aluno estudou.

O conteúdo não vem de lugar nenhum: vem **do caderno do próprio aluno**. Ele fotografa a página, a IA lê e gera os cards. Ou vem do professor, que escolhe os temas e alimenta a turma.

### As três mecânicas que definem o produto

**1. O feed que devolve.**
Formato idêntico ao que o aluno já sabe usar — rolagem vertical, um card por tela, rail lateral, gesto para o próximo. Conteúdo invertido: pergunta de 15 segundos, "complete a frase", "explique em uma linha", flashcard reverso. Depois de responder, o aluno se auto-avalia em quatro graus — **Errei / Difícil / Bom / Fácil** — e o card retorna em +10 min, +1 dia, +3 dias ou +7 dias. É FSRS rodando por baixo de uma interface que ninguém precisa aprender.

**2. A sessão que acaba de propósito.**
Não existe scroll infinito. A meta diária tem fim visível ("14/20 concluídos") e, quando acaba, a tela diz: _"acabou por hoje — seu cérebro precisa esquecer um pouco para lembrar melhor."_ Sem notificação fora da janela. Sem "mais um card". **Anti-feed por design** — e é a resposta pronta para a objeção óbvia do júri ("vocês combatem vício com mecânica de vício?"): usamos a mecânica de **hábito** e removemos a de **captura**.

**3. A sala ao vivo do professor.**
O professor escolhe os temas, a IA gera as perguntas, e ele abre uma **sala com PIN**. Os alunos entram pelo celular e respondem junto, em aula. O painel do professor mostra a turma — nunca o aluno individual. E, diferente de todo Kahoot do mundo, **o que foi respondido na sala entra no FSRS individual de cada aluno** e volta no feed dele nos dias seguintes. A aula não termina no fim da aula.

> A sala é onde o produto cobre os quatro verbos com uma história só: o mesmo celular que distraía vira o celular que **ensina** (feed), **conecta** (sala), **cria** (o aluno alimenta o conteúdo com o próprio caderno) e **cuida** (ritmo, fim de sessão, esforço em vez de tempo de tela).

### Como cobrimos os três pilares

| Pilar do desafio              | Como o Desfeed entrega                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tecnologia**                | Visão computacional lendo caderno manuscrito, geração de perguntas por LLM, FSRS, sala em tempo real                                                                                                                  |
| **Metodologias educacionais** | Retrieval practice, prática distribuída, aprendizagem ativa, peer instruction — cada uma com meta-análise por trás                                                                                                    |
| **Saúde mental**              | Não é módulo separado, está **dentro da mecânica**: sessão com fim, zero notificação fora de janela, painel de _esforço_ em vez de tempo de tela, e a tela "Perfil & Saúde Cognitiva" que mede retenção — não consumo |

---

## 4. Personas

**Júlia, 16 anos, 2º ano do ensino médio, escola pública.**
Estuda no celular porque é o único dispositivo que tem. Tira print do quadro, salva PDF que nunca abre, pede resumo pro ChatGPT na véspera da prova. Passa 3h/dia em feed. Não tem problema de disciplina — tem problema de método: ela estuda do jeito que a ciência diz que não funciona. _Desfeed dá a ela o formato que ela já domina, apontado para o lugar certo._

**Prof. Marcos, 41 anos, biologia, 6 turmas, 210 alunos.**
Com a Lei 15.100, o celular sumiu da aula dele — e a participação também. Ele não tem tempo de montar quiz, nem dado nenhum sobre quem entendeu o quê antes da prova bimestral. Não sabe (nem quer saber) programar. _Desfeed dá a ele a janela pedagógica que a lei previu: três toques para abrir uma sala, e um relatório de turma que ele não precisou montar._

**Coordenação pedagógica.**
Precisa provar que o uso do celular na escola é pedagógico e documentado. _Desfeed registra a janela: qual turma, qual tema, quanto tempo, qual resultado._

---

## 5. Superfícies

O backend nasce **atendendo as duas pontas desde o primeiro endpoint**. A web do professor é construída depois, mas o contrato de API já a contempla.

### 5.1 App mobile — aluno (Expo / React Native) · foco desta fase

Telas já desenhadas no Stitch (fundo branco, ícone branco):

| Tela                                  | Função                                                                                  | Por que existe                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Feed de Microrecuperação**          | Card de pergunta, alternativas, auto-avaliação FSRS, rail lateral, barra de meta diária | O coração do produto. Tudo converge aqui                                |
| **Sessão Concluída (Antifeed)**       | Fim explícito da sessão, resumo do que foi revisado, próxima revisão agendada           | O diferencial filosófico vira tela. É o que se mostra no pitch          |
| **Scanner IA de Caderno**             | Câmera, captura da página, estado de processamento, cards gerados para revisão          | O momento "uau" da demo                                                 |
| **Cadernos & Retenção**               | Lista de matérias/cadernos com % de retenção por tema                                   | Onde o aluno vê o próprio conhecimento como estoque, não como histórico |
| **Detalhes do Caderno**               | Cards de um caderno, curva de retenção, próximas revisões                               | Transparência do algoritmo                                              |
| **Ranking & Ligas**                   | Liga semanal, posição, XP                                                               | Duolingo: o hábito precisa de estrutura social                          |
| **Perfil & Saúde Cognitiva**          | Streak, XP, métricas de _retenção_ e _esforço_ — não de tempo de tela                   | O pilar saúde mental, medido                                            |
| **Configuração do Algoritmo & Metas** | Meta diária, janela de notificação, agressividade do FSRS                               | Devolve o controle ao aluno. Anti-dark-pattern explícito                |

Telas a projetar (não existem no Stitch ainda):

| Tela                     | Função                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| **Onboarding**           | 3 telas: o problema, a inversão, permissão de câmera                |
| **Entrar na Sala (PIN)** | Campo de PIN, entrada na sala do professor                          |
| **Sala ao Vivo — Aluno** | Pergunta sincronizada, timer, resposta, revelação coletiva          |
| **Resultado da Sala**    | Desempenho da turma (agregado) e o que entrou na revisão individual |

### 5.2 Backend (Node + Fastify) · esta fase

Serve mobile e web. Responsabilidades:

- **Ingestão**: foto/PDF → OCR + geração de cards por LLM → validação por schema
- **Catálogo**: cadernos, temas, cards, versionamento e curadoria do professor
- **Agendamento**: estado FSRS por aluno/card, resolução da fila do dia
- **Gamificação**: XP, streak, ligas, meta diária
- **Sala ao vivo**: criação com PIN, ciclo de vida, sincronização de perguntas, coleta de respostas
- **Propagação**: resposta dada na sala → agendamento FSRS individual do aluno
- **Relatórios de turma**: agregados, nunca individuais expostos ao professor
- **OpenAPI/Swagger sempre em dia** — é o contrato que a web vai consumir depois

### 5.3 Plataforma web — professor · fase posterior

Fora do escopo de construção agora, **dentro do escopo de contrato de API**:
criar sala, selecionar temas, revisar as perguntas geradas pela IA (curadoria em 1 toque), painel ao vivo da turma, histórico e relatórios.

---

## 6. Decisões técnicas travadas

| Decisão                      | Escolha                                                                 | Porquê                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plataforma mobile            | **Expo (não RN puro)**                                                  | Distribuição: QR no Expo Go, APK por link via EAS Build, TestFlight, OTA com `eas update`, e export web como plano B para o júri. RN puro não entrega nada disso |
| Estilização                  | **NativeWind 4.2.6** (GA — não a v5, ainda preview)                     | O Stitch exporta HTML + Tailwind; NativeWind é Tailwind no RN — a conversão é quase 1:1 e os tokens vêm prontos. Traz patch para Reanimated 4 desde a 4.2.0      |
| Componentes                  | **react-native-reusables** (shadcn portado, MIT)                        | Cobre form, bottom sheet, dialog, progress, badge, avatar — e roda 100% no Expo Go. NativeBase está descontinuado                                                |
| Feed vertical                | `FlatList` + `pagingEnabled` / `snapToInterval`                         | Cards são texto, não vídeo. FlashList v2 e engine manual com Reanimated só compensam com mídia pesada                                                            |
| Repetição espaçada           | **`ts-fsrs@5.4.2`** (MIT)                                               | TypeScript puro, sem API de Node, roda no Hermes sem ajuste                                                                                                      |
| Persistência local           | **`expo-sqlite` + `drizzle-orm`**                                       | Único caminho relacional que roda no Expo Go — `op-sqlite` exige build nativo                                                                                    |
| Tempo real (sala)            | **`socket.io`** sobre o Fastify                                         | Rooms por PIN já prontos, client Expo maduro                                                                                                                     |
| IA de geração de card        | **`claude-sonnet-5`** via `/v1/messages`, bloco de imagem + JSON schema | Melhor custo/benefício para OCR de manuscrito: Opus 5 é mais caro, Haiku 4.5 tem visão mais fraca em caligrafia                                                  |
| Arquitetura front            | **FSD** — `app → widgets → features → entities → shared`                | Imports só para baixo. Padrão já usado nos outros projetos                                                                                                       |
| Dados remotos                | **TanStack Query**                                                      | Cache, revalidação, estados de carregamento                                                                                                                      |
| Estado local                 | **Zustand**                                                             | Sessão do feed, fila de cards, estado da sala                                                                                                                    |
| Validação                    | **Zod**                                                                 | Fronteira de confiança: resposta do LLM, payload da API, deep link de PIN                                                                                        |
| TypeScript                   | Estrito. Sem `any`, sem `as unknown as`                                 | Regra global de engenharia                                                                                                                                       |
| Backend                      | **Node + Fastify + Zod + Swagger**                                      | Mesmo padrão do `calledit-api`, que já funciona                                                                                                                  |
| Restrição de compatibilidade | Só módulos `expo-*` e o que vem no Expo Go                              | Se quebrar o Expo Go, perde-se o teste por QR code — que é o motivo de ter escolhido Expo                                                                        |

### Design system (extraído das 17 telas do Stitch)

```
Primária        #10b981  emerald        ação, acerto, progresso
Primária escura #059669                 sombra sólida inferior (botão 3D), estado pressionado
Superfície      #ffffff                 fundo de tela e de card
Superfície sutil #faf8ff                seções e agrupamentos
Borda/neutro    #cbd5e1  #dfe2f1        divisores, sombra sólida neutra
Texto           #0f131d  #131b2e        títulos e corpo
Acento          #4f46e5  indigo         arcos do ícone, dados secundários
```

Raio: `rounded-full` para pílulas e badges (356 usos) · `rounded-xl` / `rounded-2xl` para cards.
Sombra: **estilo Duolingo, sólida e sem blur** — `shadow-[0_4px_0_0_#059669]` em botão primário, `shadow-[0_2px_0_0_#cbd5e1]` em neutro. Mais `shadow-sm` para elevação leve de card.
Ícone: laço de infinito em gradiente esmeralda que arca para cima virando uma faísca/estrela, com arcos índigo à direita. Fundo branco, cantos arredondados.

---

## 7. Diferencial competitivo

_Validado em `docs/research/analise-competitiva.md`. As quatro hipóteses iniciais foram testadas contra o mercado real — duas confirmadas, uma parcial, uma refutada._

| Hipótese                                          | Veredito       | O que o mercado mostrou                                                                                                        |
| ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Ninguém combina feed vertical + FSRS + IA de foto | **Parcial**    | **StudyTok já tem feed vertical + IA de foto/PDF**, mas sem FSRS documentado. Ninguém fecha o triângulo                        |
| Ninguém faz fim proposital de sessão              | **Confirmada** | StudyTok, Nibble, Duolingo — todos otimizam tempo de tela e streak. Nenhum encerra de propósito                                |
| Nenhum produto BR atende à Lei 15.100             | **Refutada**   | **PlayAula, Unoquizz e Educa AI já são brasileiros e já atendem à exceção pedagógica.** Kahoot já se posiciona nesse marketing |
| Sala ao vivo não alimenta revisão individual      | **Confirmada** | Nenhum player (Kahoot, Quizizz, Blooket, Gimkit, Wooclap, PlayAula) alimenta scheduler de memória individual pós-aula          |

> **Consequência direta para o pitch:** não afirmar "somos os únicos no Brasil". Essa frase morre se um jurado conhecer PlayAula. A posição defensável é a ponte **sala → memória individual** — que ninguém tem — somada ao anti-engajamento.

### Os cinco diferenciais defensáveis

1. **Fim proposital de sessão** — supera Duolingo, StudyTok e Nibble, que monetizam por DAU e por isso _não podem_ encerrar a sessão. É diferenciação estrutural, não de feature.
2. **FSRS real e auditável** — contra algoritmos proprietários e opacos (Birdbrain do Duolingo, CBR do Brainscape). O aluno vê o agendamento na tela: "+3d".
3. **Ponte sala ao vivo → revisão individual** — ausente em todo o setor. É o diferencial mais forte e o mais difícil de refutar.
4. **IA de foto dentro de um feed de recall**, não de um baralho tradicional — Quizlet e Knowt geram cards, mas devolvem um deck.
5. **Conformidade com a Lei 15.100 combinada com ciência da memória** — PlayAula e Unoquizz fazem a conformidade; nenhum faz a segunda metade.

### Risco competitivo

**StudyTok é quem copia isso mais rápido** — falta só plugar FSRS, e a `ts-fsrs` é MIT. A proteção não é técnica: é o modelo de negócio. Um produto que vive de DAU não consegue adotar o fim proposital de sessão sem contrariar a própria métrica.

---

## 8. Riscos e respostas

| Risco                                                                          | Resposta                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "É mais um app de flashcard gamificado" (espaço saturado)                      | A diferenciação é **formato feed + fim proposital + entrada por foto do caderno + ponte sala→revisão individual**. Martelar os quatro, nunca falar "flashcard" |
| "Vocês combatem vício com mecânica de vício"                                   | Usamos a mecânica de **hábito** e removemos a de **captura**: sem infinito, sem notificação fora de hora, sessão com fim. Está na tela, não no discurso        |
| Qualidade dos cards gerados por IA                                             | Curadoria do professor em 1 toque; schema Zod rejeitando saída malformada; o aluno pode reportar card ruim                                                     |
| A IA reintroduzir a dívida cognitiva                                           | A IA gera **pergunta**, nunca resposta pronta. O esforço de recuperação continua sendo do aluno — é o produto inteiro                                          |
| Privacidade de menores (UNESCO: 89% das edtechs da pandemia vigiavam crianças) | **Agregado por design**: professor vê turma, nunca aluno. Sem câmera de vigilância, sem reconhecimento facial. Ética como feature, não como disclaimer         |
| Demo falhar ao vivo                                                            | Caminho de fallback com conteúdo pré-carregado, e export web como segunda via                                                                                  |

---

## 9. Escopo por fase

**Fase 1 — app do aluno + backend mínimo** _(esta fase)_
Feed, auto-avaliação FSRS, scanner com geração por IA, sessão com fim, cadernos, gamificação, sala ao vivo (lado aluno). Backend servindo tudo isso com OpenAPI publicado.

**Fase 2 — web do professor**
Criar sala, escolher temas, curar perguntas geradas, painel ao vivo, relatórios de turma.

**Fase 3 — escola**
Coordenação, múltiplas turmas, registro da janela pedagógica da Lei 15.100.

---

## 10. Pontos em aberto

- **Confirmar**: "sala com PIN" é a leitura correta do pedido original ("pick uma vpn daquela aula"). Assumido como PIN numérico de 6 dígitos, estilo Kahoot.
- Autenticação do aluno na fase 1 — anônima com device id, ou conta desde o início?
- Ligas: escopo (turma, escola, global) e periodicidade.
