# 08: Plano de design da aplicação web

Situação: **Proposta** (17/10/2026). Todas as fases web estão entregues, mas a interface ainda usa
o estilo provisório de `apps/web/src/styles.scss` (cartões, tabelas e etiquetas simples). Este
documento mapeia os campos que a API entrega e recebe em cada tela e define as etapas para
desenhar a interface antes de mexer no Angular.

O design **não muda a API nem as regras**. Quando uma tela pedir um dado que a API não tem, a
etapa anota a lacuna em [Lacunas](#lacunas-encontradas) e a equipe decide se vale criar.

## Escopo: só o computador

**Decidido** (17/10/2026): o design cobre só o uso no navegador do computador. Largura de
referência 1440 px, mínimo 1280 px. O celular fica de fora por enquanto: as regras atuais de
`@media (max-width: 640px)` continuam como estão, mas nenhuma tela nova é desenhada nem testada
para celular.

## Princípios

O sistema precisa ser **intuitivo, rápido e bonito**. Cada princípio vira critérios que a
revisão (E6) confere tela a tela.

**Intuitivo**

- A tarefa mais comum de cada tela fica visível sem rolar e sem abrir menu (ex.: na página do
  lote, lançar a baixa do dia).
- O usuário sempre sabe onde está: fazenda, lote e aba aparecem no cabeçalho, e o caminho de
  volta é um clique.
- Termos do produtor, sem jargão de sistema: "Lançar baixa", não "Criar registro". Os textos
  dos enums vêm dos mapas `NOME_*`.
- Ação que o perfil não pode fazer não aparece. Campo opcional fica recolhido quando é raro
  (ex.: nota fiscal na ração).
- Erro aparece junto do campo, com a mensagem do schema, e o formulário não perde o que foi
  digitado.

**Rápido**

- Lançar uma baixa ou uma pesagem leva menos de 10 segundos: data já preenchida com hoje,
  foco no primeiro campo, `Enter` envia, e o formulário fica pronto para o próximo lançamento.
- Navegação pelo teclado em todas as telas (ordem de tabulação, atalhos nos formulários de
  lançamento).
- Depois de lançar, a tela atualiza o resumo e a tabela sem recarregar a página.
- Carregamento com esqueleto do conteúdo, nunca tela em branco; troca de aba sem piscar.
- Orçamento: primeira tela útil em até 2 s na rede local; cada tela lazy com até 150 kB.

**Bonito**

- Um só sistema visual (E1): poucas cores, uma escala de tipo, espaçamento em múltiplos de
  4 px. Nada de estilo solto por tela.
- Números alinhados à direita com algarismos tabulares; indicadores com unidade e meta ao lado.
- Hierarquia clara: o indicador que pede atenção se destaca; o resto fica calmo.
- Estado nunca só por cor: ícone e texto juntos (regra que já vale).

## Ferramentas

| Ferramenta (skill)                | Para quê                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Artifact tipo **Design System**   | Tokens (cor, tipo, espaço, raio), componentes e regras de uso do CRISTA. Ainda não existe    |
| Artifact tipo **Design** (canvas) | Telas em pranchas lado a lado, no computador (1440 px)                                       |
| `dataviz`                         | Gráficos de curva e mortalidade, cartões de indicador, painel comparativo, paleta das séries |
| `artifact-diagramming`            | Mapa de navegação e fluxos (confirmação 409, estorno, encerramento)                          |
| `artifact-design`                 | Fundamentos de layout, tipografia e tema claro/escuro usados em todas as etapas              |

Os artefatos ficam privados no claude.ai até o usuário decidir compartilhar.

## Mapa de campos da API

Todas as rotas da fazenda começam em `/api/fazendas/:idFazenda`. "Entrada" é o corpo ou a
consulta validada pelo schema zod em `@crista/domain`; "Saída" é o que o web recebe (tipos em
`apps/web/src/app/**/tipos.ts`). Campos com `?` são opcionais.

### Tipos que se repetem

- **Indicador**: `{ disponivel: true, valor }` ou `{ disponivel: false, motivo }`. Toda métrica
  calculada vem assim. O design precisa de um estado "sem valor" que mostre o motivo (hoje: `—`
  com o motivo no `title`).
- **Estorno**: `{ motivo, em }` ou `null`. Lançamento estornado continua na lista; o design
  precisa de uma linha "riscada" legível com o motivo.
- **Enums com nome**: o texto visível vem dos mapas `NOME_*` do domínio (`NOME_LINHAGEM`,
  `NOME_CATEGORIA`, `NOME_TIPO_OCORRENCIA`, `NOME_PERFIL` etc.). Nunca mostrar o valor cru.
- **Confirmação branda**: resposta 409 com `codigo` (`DENSIDADE`, `PENDENCIAS`, revisão de
  pesagem, duplicidade de despesa). O web pergunta e reenvia com `confirmar*: true`.
- **Perfil**: `gestor`, `produtor`, `veterinario`, `operador`, `consulta`. A ação some da tela
  quando `pode(perfil, acao)` é falso. Quem não tem `financeiro.ver` recebe custos `null`.

### Conta (`/api/auth`, `/api/convites`)

| Tela             | Rota da API                                                   | Entrada                                           | Saída                                         |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Criar conta      | `POST auth/cadastro`                                          | nome, email, telefone?, cpf?, senha, aceiteTermos | —                                             |
| Confirmar e-mail | `POST auth/verificar-email`, `POST auth/reenviar-verificacao` | token / email                                     | —                                             |
| Entrar           | `POST auth/login`                                             | email, senha                                      | token                                         |
| Sessão           | `GET auth/eu`                                                 | —                                                 | id, nome, email, fazendas[{id, nome, perfil}] |
| Convite          | `POST convites/consultar`, `POST convites/aceitar`            | token                                             | fazenda, perfil, email, expirado              |

### Fazenda, galpões e equipe

| Tela              | Rota da API                                      | Entrada                                                                                                  | Saída                                                          |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Minhas fazendas   | `GET fazendas`                                   | —                                                                                                        | id, nome, perfil                                               |
| Cadastrar fazenda | `POST fazendas`, `PATCH :id`                     | nome, documento (CPF/CNPJ), logradouro?, municipio, uf, latitude?, longitude?, integradora?, tipoCriacao | documento, logradouro, municipio, uf, integradora, tipoCriacao |
| Galpões           | `GET/POST galpoes`, `PATCH galpoes/:id`          | identificacao, areaUtilM2, capacidadeAves, tipo (convencional, climatizado, dark_house), situacao?       | + densidadeMaxima, situacao (disponivel, ocupado, inativo)     |
| Equipe            | `GET/POST vinculos`, `POST vinculos/:id/revogar` | email, perfil, crmv? (obrigatório para veterinário), galpoes[], validoAte?                               | nome, status (pendente, ativo, expirado, revogado)             |

### Lotes

| Tela / aba           | Rota da API (`lotes/...`)                                                                  | Entrada                                                                                                                                           | Saída                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista de lotes       | `GET lotes?situacao=`                                                                      | situacao? (em_andamento, encerrado, cancelado)                                                                                                    | id, codigo, galpao, linhagem, dataAlojamento, quantidadePrevista, situacao                                                                                                                                                                                       |
| Novo lote            | `POST lotes`                                                                               | codigo, galpaoId, linhagem, sexagem, origem?, dataAlojamento, idadeInicialDias, pesoPintoG?, custoPinto?, quantidadePrevista, confirmarDensidade? | —                                                                                                                                                                                                                                                                |
| Cabeçalho do lote    | `GET lotes/:id`                                                                            | —                                                                                                                                                 | dados do cadastro, galpao{identificacao, capacidadeAves}, alojamento, precoReferenciaKg, encerramento, **resumo**, **meta**                                                                                                                                      |
| Resumo (indicadores) | (dentro de `GET lotes/:id`)                                                                | —                                                                                                                                                 | idadeDias, avesAlojadas, baixasAcumuladas, saldoAves, mortalidade, viabilidade, mortalidadeHoje{percentual, nivel}, ultimaPesagem, pesoMedioG, uniformidade, gpdMedioG, pesoVivoEstoqueKg, racaoConsumidaKg, conversaoAlimentar, iep, densidadeKgM2, carenciaAte |
| Meta                 | (dentro de `GET lotes/:id`)                                                                | —                                                                                                                                                 | pesoPadraoG, desvioCurva, situacao (abaixo, dentro, acima), caPadrao, fonteCurva                                                                                                                                                                                 |
| Alojamento           | `POST/PUT lotes/:id/alojamento`                                                            | data, avesRecebidas, mortasTransporte, justificativaDivergencia?, confirmarDensidade?                                                             | —                                                                                                                                                                                                                                                                |
| Mortalidade          | `GET/POST lotes/:id/baixas`                                                                | data, mortes, descartes, causaProvavel?                                                                                                           | id, data, mortes, descartes, causaProvavel, registradoPor, estorno                                                                                                                                                                                               |
| Pesagens             | `GET/POST lotes/:id/pesagens`                                                              | data, pesosIndividuaisG[] **ou** avesPesadas + pesoTotalG, pontoColeta?, confirmarRevisao?                                                        | id, data, idadeDias, avesPesadas, pesoMedioG, uniformidade, pontoColeta, revisaoConfirmada, estorno                                                                                                                                                              |
| Sanidade             | `GET/POST lotes/:id/ocorrencias?de&ate&tipo`                                               | data, tipo, descricao, produto?, dose?, via?, loteProduto?, carenciaDias? (os cinco obrigatórios em vacinação e medicação)                        | + dataFimCarencia, carenciaVigente, veterinario, estorno, anexos[{id, nome, mime, tamanho}]                                                                                                                                                                      |
| Anexos               | `POST anexos`, `GET anexos/:id`                                                            | entidade, idEntidade, arquivo                                                                                                                     | arquivo (download)                                                                                                                                                                                                                                               |
| Ração                | `GET/POST lotes/:id/racao`                                                                 | data, tipo (entrada, estoque_restante), quantidadeKg, fornecedor?, notaFiscal?, valorTotal? (só entrada)                                          | id, data, tipo, quantidadeKg, fornecedor, notaFiscal, estorno                                                                                                                                                                                                    |
| Curva                | `GET lotes/:id/curva`                                                                      | —                                                                                                                                                 | fonteCurva, linhagem, pesagens[{idadeDias, pesoMedioG, pesoPadraoG, desvioPct, situacao, gpdPeriodoG}], curvaPadrao[{idadeDias, pesoG}]                                                                                                                          |
| Custos               | `GET lotes/:id/financeiro`, `PUT lotes/:id/preco`, `GET despesas?lote=`                    | precoReferenciaKg                                                                                                                                 | custoPintos, custoTotal, porCategoria[{categoria, valor, percentual}], custoPorAveAlojada, custoPorKg, receitaPrevista, margem, margemPercentual; parcelas do rateio                                                                                             |
| Encerramento         | `GET/POST lotes/:id/cargas`, `POST lotes/:id/encerrar`, `GET lotes/:id/relatorio?formato=` | carga: data, aves, pesoTotalKg, precoKg?, destino?, numeroGta?; encerrar: data, confirmarParcial?                                                 | cargas (+ pesoMedioKg); encerramento{parcial, pendencias[], resultado{zootecnico, financeiro}}; arquivo pdf ou xlsx                                                                                                                                              |
| Estorno (todas)      | `POST lotes/:id/estornos`, `POST lotes/:id/cancelar`                                       | entidade, idEvento, motivo                                                                                                                        | —                                                                                                                                                                                                                                                                |

### Custos e painel

| Tela          | Rota da API                                       | Entrada                                                                                                                   | Saída                                                                                                                                     |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Despesas      | `GET/POST despesas`, `POST despesas/:id/estornar` | data, categoria, descricao, valor, fornecedor?, numeroNota?, lotes[], criterioRateio, percentuais?, confirmarDuplicidade? | + origem (manual, racao, manutencao), estorno, rateios[{lote, percentual, valor}]                                                         |
| Painel        | `GET painel?lotes&idadeDe&idadeAte&de&ate`        | 1 a 4 lotes; período por idade **ou** por data                                                                            | lotes[{codigo, galpao, linhagem, periodo, resumo, meta, financeiro, series{peso, mortalidade, curvaPadrao}}], avisos[], financeiroVisivel |
| Visões salvas | `GET/POST visoes`, `DELETE visoes/:id`            | nome, filtros{lotes, modo (hoje, idade, data), ...}                                                                       | id, nome, filtros (até 20 por usuário)                                                                                                    |

### Alertas e equipamentos

| Tela                | Rota da API                                                            | Entrada                                                                                                          | Saída                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alertas             | `GET alertas?status&lote`, `POST alertas/:id/fechar`                   | providencia                                                                                                      | indicador, criticidade (atencao, critico), status, valor, limite, limitePadrao, mensagem, lote, equipamentoId, dataReferencia, abertoEm, fechadoEm, fechadoPor, providencia |
| Limites dos alertas | `GET/PUT regras-alerta`, `DELETE regras-alerta/:indicador`             | indicador, limiteAtencao, limiteCritico                                                                          | nome, unidade, direcao (acima, abaixo), padrao, configurado                                                                                                                 |
| Equipamentos        | `GET/POST equipamentos`, `GET/PUT equipamentos/:id`                    | nome, tipo, galpaoId?, numeroSerie?, fabricante?, modelo?, critico, periodicidadeDias?, dataAquisicao?, situacao | + galpao, paradoDesde, ultimaManutencao, proximaPreventiva, situacaoPreventiva (sem_previsao, em_dia, vence_logo, vencida), custoTotal                                      |
| Manutenções         | `GET/POST equipamentos/:id/manutencoes`, `.../retorno`, `.../estornar` | tipo, data, descricao, custoPecas, custoMaoObra, fornecedor?, ordemServico?, paradaInicio?, retornoOperacao?     | + custoTotal, horasParado, registradoPor, estorno                                                                                                                           |

### O que cada perfil vê

| Perfil      | Lança                                           | Vê financeiro | Observação para o design                      |
| ----------- | ----------------------------------------------- | ------------- | --------------------------------------------- |
| Gestor      | tudo                                            | sim           | Tela mais cheia; serve de referência          |
| Produtor    | ração, despesas, equipamentos, manutenções      | sim           | Foco em custos e equipamentos                 |
| Veterinário | baixas, pesagens, sanidade, alertas             | não           | Foco em sanidade, carência e alertas          |
| Operador    | alojamento, baixas, pesagens, ração, manutenção | não           | Lança várias vezes ao dia; formulários curtos |
| Consulta    | nada                                            | sim           | Só leitura; nenhum botão de ação              |

## Etapas

Cada etapa termina com um artefato que o usuário revisa antes da próxima.

### E1: Design System do CRISTA

Primeira versão publicada em 17/10/2026, em revisão:
<https://claude.ai/artifact/HaJo3dof1hhrNBq5Z72iZf> (privado). Já traz também os componentes
da E2 em versão estática, com as mesmas classes do `styles.scss`.

- Criar o artefato **Design System** a partir dos tokens atuais (`--fundo`, `--primaria`
  `#2f6b3a`, `--perigo`, `--raio` etc.) e da paleta validada `--serie-1..4`.
- Definir: escala tipográfica, espaçamentos, tema escuro, cores de estado (normal, atenção,
  crítico; abaixo, dentro, acima da meta; em dia, vence em breve, vencida).
- Regra que já vale e continua: **estado nunca só por cor** (ícone e texto juntos).
- Validar contraste e as séries com o validador da skill `dataviz`.

### E2: Componentes

No mesmo Design System, desenhar os componentes que aparecem em várias telas:

- Cartão de indicador (valor, unidade, meta, estado "sem valor" com motivo).
- Tabela de lançamentos com linha estornada e ação de estornar.
- Formulário de lançamento (campos curtos, data padrão hoje, envio com `Enter`).
- Diálogo de confirmação 409 e diálogo de estorno com motivo.
- Etiquetas de situação (lote, galpão, equipamento, preventiva, vínculo, criticidade).
- Navegação: troca de fazenda, menu da fazenda com contador de alertas, abas do lote.

### E3: Mapa de navegação e fluxos

Com `artifact-diagramming`: árvore de rotas (`app.routes.ts`), fluxo de confirmação 409,
fluxo de estorno e fluxo do encerramento do lote (cargas → pendências → parcial ou completo →
relatório).

### E4: Telas no canvas

No artefato **Design**, uma prancha de 1440 px por tela, nesta ordem
(do que se usa todo dia para o que se usa pouco):

1. Página do lote: cabeçalho + resumo de indicadores + abas (Mortalidade, Pesagens, Sanidade,
   Ração). É a tela principal do operador e do gestor.
2. Lista de lotes e entrada da fazenda (com alertas abertos em destaque).
3. Alertas e limites.
4. Curva e painel comparativo (gráficos, ver E5).
5. Custos do lote e despesas com rateio.
6. Encerramento e resultado do lote.
7. Equipamentos e manutenções.
8. Galpões, equipe, cadastro de fazenda.
9. Conta: entrar, criar conta, confirmar e-mail, convite.

Usar os dados da demonstração (`npm run demo`) para os valores das pranchas, e mostrar a
página do lote nos perfis Gestor, Operador e Consulta para conferir o que some.

### E5: Gráficos e painel

Com `dataviz`: curva de peso contra o padrão da linhagem (faixa de ±5% da meta), mortalidade
diária com os limites de atenção e crítico, custos por categoria, comparação de até 4 lotes.
O resultado vira a nova especificação do `nucleo/grafico-linhas.ts`.

### E6: Revisão

- Conferir cada prancha contra o mapa de campos: nenhum campo inventado, nenhum campo
  obrigatório esquecido.
- Conferir os critérios de [Princípios](#princípios), principalmente o tempo para lançar baixa
  e pesagem com o operador.
- Registrar decisões aqui e mudar a situação deste documento para **Decidido**.

### E7: Implementação no Angular

Iniciada em 17/10/2026, direto a partir do Design System da E1 (E3 a E6 ainda não foram feitas).
Já feito:

- Tokens e componentes em `styles.scss`; fontes servidas pelo próprio build
  (`@fontsource-variable`, sem chamada ao Google). Nomes antigos (`.grade-2`,
  `.etiqueta.ativo`...) seguem como apelidos; `.alerta` virou `.aviso`.
- Menu lateral da fazenda com troca de fazenda, grupos e contador de alertas
  (`fazendas/pagina-fazenda.ts`).
- `nucleo/dialogos.ts`: diálogo nativo no lugar de `confirm()`/`prompt()` (409, estorno,
  revogar vínculo, visões salvas).
- `nucleo/cartao-indicador.ts` e a página do lote com trilha, cartões e linha de detalhes.
- Aba Mortalidade como modelo: foco em Mortes, `Enter` envia, limpa e volta o foco; linha
  estornada riscada com o motivo.

Falta converter as outras telas na ordem da E4.

- Passar os tokens do Design System para `styles.scss`, sem quebrar as regras de celular que
  já existem.
- Criar os componentes comuns em `apps/web/src/app/nucleo/` e trocar o HTML das telas na ordem
  da E4, uma tela por vez.
- Rodar a lista de conferência do CLAUDE.md antes de concluir.

## Lacunas encontradas

- Não há rota de resumo da fazenda (lotes em andamento com indicadores, alertas abertos,
  equipamentos parados numa resposta só). Uma tela inicial de fazenda precisaria de várias
  chamadas; decidir na E4 se vale criar `GET fazendas/:id/resumo`.
- Não há marca (logotipo, nome visual). Definir na E1 ou seguir só com o nome em texto.

## Perguntas para a equipe

- Tema escuro entra no MVP ou fica para depois?
- A tela inicial ao entrar na fazenda continua sendo a lista de lotes?
- Existe identidade visual (logo, cores) que o design deve seguir?
