# Corte do MVP

## Premissas decididas

- Público do MVP: **produtor independente de frango de corte**. Ele compra pintinho, ração e
  medicamento e vende as aves. O produtor integrado fica para depois.
- `tipo_criacao` aceita só `corte` no MVP. O módulo de postura e a venda de cama de frango
  saem do escopo até ganharem caso de uso próprio.
- Primeiro marco: núcleo web (Fases 0 a 2). App offline e IoT vêm depois.
- **Foco no web (decidido em 17/10/2026):** depois da Fase 5, o desenvolvimento segue só na
  aplicação web. O app de campo offline (Fase 3) e o IoT (Fase 7) ficam adiados, sem data.

## Fases

| Fase | Entrega                                                                                               | UCs              | Marco |
| ---- | ----------------------------------------------------------------------------------------------------- | ---------------- | ----- |
| 0    | Documentos desta pasta e esqueleto do repositório                                                     | —                | 1     |
| 1    | Conta, fazenda, galpão, vínculo e convite, permissões, auditoria (**entregue**)                       | UC01–UC04        | 1     |
| 2    | Lote, alojamento, baixas, pesagem, sanidade e carência, entrada de ração, anexos (**entregue**)       | UC05–UC10        | 1     |
| 4    | Curva de peso, indicadores, despesas com rateio, painel e filtros (**entregue**)                      | UC11–UC15        | 2     |
| 5    | Alertas com fila e notificação; encerramento com cargas e carência (**entregue**)                     | UC16, UC17       | 2     |
| 6    | Equipamentos e manutenção (**entregue**)                                                              | UC18, UC19       | 3     |
| 8    | Acabamento do web: visões salvas, uso no celular pelo navegador, preparo para produção (**entregue**) | UC15             | 3     |
| 3    | App de campo offline (**adiada**)                                                                     | UC06, UC07, UC10 | —     |
| 7    | IoT: energia e temperatura, alerta por falta de sinal, SMS (**adiada**)                               | UC16 estendido   | —     |

Com o foco no web, as Fases 6 e 8 vieram depois da 5, ambas só web. A Fase 8 (**Proposta**) junta o que
ainda falta para o web ser usado de verdade: as visões salvas do UC15, telas de lançamento
(baixa, pesagem, ração) confortáveis no celular pelo navegador, para o operador no galpão
enquanto o app offline não existe, e o preparo para produção (anexos em S3, envio de e-mail
real, backup do banco). As Fases 3 e 7 mantêm o número para não quebrar as referências nos
outros documentos. O modelo continua pronto para recebê-las: a regra de sincronização (doc 05)
não muda, e os indicadores de sensor já existem nos alertas.

Os anexos passaram da Fase 1 para a Fase 2, porque o primeiro caso de uso que os usa é a
ocorrência sanitária (UC08). Eles são gravados em disco (`ARMAZENAMENTO_DIR`); a troca por S3
fica para quando houver ambiente de produção.

### Regras da Fase 2 que a equipe precisa confirmar (**Proposta**)

- Lote cadastrado por engano pode ser **cancelado** pelo Gestor enquanto não tiver lançamentos.
- O alojamento é registrado uma vez e só o Gestor corrige. A data real da chegada passa a ser
  a data de alojamento do lote.
- Alojar acima da capacidade: só o Gestor confirma; o Operador recebe a recusa.
- UC10, "pede revisão se o peso fugir muito": a pesagem pede confirmação quando o peso médio
  cai em relação à anterior ou quando o ganho diário passa de 120 g/dia.
- Aviso de mortalidade do dia ao lançar a baixa, com os limites provisórios do doc 06.

### Regras da Fase 4 que a equipe precisa confirmar (**Proposta**)

- "Dentro da meta" (UC11 e UC13) = peso até 5% acima ou abaixo da curva na mesma idade.
- O custo dos pintos (custo por pinto × aves recebidas) entra no custo total automaticamente,
  sem lançar despesa.
- Uma entrega de ração com valor gera a despesa de ração do lote; estornar a entrega estorna
  a despesa junto. Essa despesa não pode ser estornada sozinha.
- Despesa sem lote fica como despesa geral da fazenda e não entra no custo de nenhum lote.
- Nota repetida (mesmo número e fornecedor) pede confirmação em vez de bloquear.
- A receita prevista usa um preço de referência por lote (R$/kg vivo), informado pelo
  Gestor ou Produtor.
- No painel (UC15), a curva padrão só aparece no gráfico quando todos os lotes são da
  mesma linhagem.
- As visões salvas do UC15 ficaram para depois.

### Regras da Fase 5 que a equipe precisa confirmar (**Proposta**)

- Alertas avaliados hoje: mortalidade do dia, peso × curva e uniformidade. Limites padrão
  provisórios: mortalidade de 0,3% (atenção) e 0,5% (crítico), em dobro na 1ª semana; peso 5%
  e 10% abaixo da curva; uniformidade abaixo de 80% e de 70%. A fazenda pode alterar cada um.
- Um alerta aberto por lote e indicador: um novo desvio atualiza o aberto em vez de criar
  outro. Um alerta crítico não volta a ser de atenção enquanto não for fechado.
- Só o alerta **crítico** gera notificação, enviada uma vez, por e-mail, ao Gestor e ao
  Veterinário (respeitando os galpões de cada vínculo). Push e SMS ficam para a Fase 7.
- Fechar um alerta exige a providência adotada (Gestor ou Veterinário).
- Carência vigente **bloqueia** a carga de saída (inconsistência #5).
- O encerramento lista pendências: aves sem saída, nenhuma carga, carência vigente com aves
  no lote, alertas abertos, lançamentos em revisão e falta de ração. Com pendências, só
  encerra se confirmado, e o relatório sai marcado como **parcial**.
- O encerramento não pode ser desfeito. O resultado fica congelado e o galpão é liberado.
- Quem não vê o financeiro (Operador, Veterinário) recebe o relatório sem as seções de custo
  e receita.

### Regras da Fase 6 que a equipe precisa confirmar (**Proposta**)

- O equipamento tem nome e tipo (comedouro, bebedouro, ventilação, aquecimento, nebulização,
  iluminação, gerador, outro). Número de série, fabricante, modelo, periodicidade da
  preventiva e data de aquisição são opcionais. O número de série, quando informado, é único
  na fazenda.
- Equipamento sem galpão é da fazenda inteira. Quem só tem acesso a alguns galpões vê os
  equipamentos desses galpões e os da fazenda.
- Equipamento inativo não recebe manutenção; para isso, o cadastro é reativado.
- A manutenção não pode ter data anterior à aquisição do equipamento, quando a data de
  aquisição existe (inconsistência #2). A data de aquisição também não pode ser alterada para
  depois de uma manutenção já registrada.
- **Próxima preventiva** = última preventiva + periodicidade. Antes da primeira preventiva,
  conta da data de aquisição; sem nenhuma das duas, não há previsão. A preventiva "vence em
  breve" nos 7 dias anteriores à data prevista.
- O custo da manutenção (peças + mão de obra) gera uma despesa de categoria Manutenção.
  Equipamento de galpão: vai para o lote em andamento do galpão. Equipamento da fazenda:
  rateado entre os lotes em andamento com aves alojadas, proporcional às aves alojadas
  (inconsistência #4). Sem lote, fica como despesa da fazenda. Contam os lotes alojados até a
  data da manutenção.
- A despesa gerada não é estornada sozinha: estornar a manutenção estorna a despesa junto,
  como na entrega de ração.
- A manutenção é um lançamento: só aceita inserção. A única alteração é registrar, uma vez,
  o retorno à operação de uma parada que ficou aberta. O equipamento não pode ter duas
  paradas abertas ao mesmo tempo.
- **Equipamento crítico** com parada sem retorno abre um alerta **crítico** (UC16), notificado
  por e-mail ao Gestor e ao Produtor (responsável pelos equipamentos, doc 02), e não ao
  Veterinário. O retorno, o estorno da manutenção, a inativação ou desmarcar o "crítico" fecham
  o alerta automaticamente, com a providência preenchida pelo sistema.
- Os custos das manutenções seguem a regra do financeiro: o Operador registra o custo, mas não
  o vê depois na listagem (doc 02, ponto 2).

### Regras da Fase 8 que a equipe precisa confirmar (**Proposta**)

- Visões salvas do painel (UC15) são **pessoais**: cada usuário vê só as suas, em cada fazenda.
  Até 20 por usuário e fazenda; salvar com um nome que já existe substitui a visão. A visão
  guarda os lotes e o período (até hoje, por idade ou por data). Lote que deixou de existir
  ou de ser visível fica de fora ao aplicar, com aviso.
- Uso no celular pelo navegador: em telas estreitas, os formulários ficam em uma coluna, com
  campos e botões de pelo menos 44 px e teclado numérico nos campos de quantidade. A lista de
  lotes ganha atalhos "+ Baixa", "+ Pesagem" e "+ Ração" para quem pode lançar. Na pesagem
  individual, os pesos podem ser separados por vírgula, a tecla que o teclado numérico tem.
- Produção (doc 07): anexos em S3 com criptografia, e-mail por SMTP autenticado, backup diário
  com retenção de 14 dias e restauração testada, API que não sobe com configuração insegura.
- Limite de 10 tentativas por minuto, por IP, nas rotas públicas de conta (login, cadastro,
  confirmação de e-mail, convite); 300 por minuto nas demais.

### Regras da visão geral da fazenda que a equipe precisa confirmar (**Proposta**)

Entraram com o redesenho da interface (17/10/2026, docs/08-design.md).

- **Cor só onde há regra.** Verde, âmbar e vermelho aparecem apenas nos indicadores com limite
  ou meta: mortalidade do dia, peso × curva e uniformidade (limites dos alertas, configuráveis
  em Alertas), meta de peso (faixa de ±5% da curva), alertas abertos e margem prevista
  (negativa é prejuízo). Mortalidade acumulada, conversão alimentar e IEP ficam neutros até a
  equipe definir referências para eles.
- **Os limites configurados valem em todo lugar.** Antes, o nível da mortalidade de hoje (no
  cabeçalho do lote, na página inicial e na resposta da baixa) usava os limites fixos de
  0,3% e 0,5%, mesmo com outro limite configurado na fazenda. Agora usa o mesmo limite dos
  alertas (UC16).
- **Peso × curva:** passar do limite de `desvio_peso` dá atenção ou crítico. Sem passar dele,
  ficar fora da faixa da meta (abaixo ou acima) dá atenção. Antes, "abaixo da meta" era sempre
  crítico.
- **Agregação da fazenda:** mortalidade e conversão alimentar ponderadas pelas aves e pelos
  quilos de cada lote, não a média das porcentagens; IEP como média simples dos lotes que têm
  valor. Lote encerrado entra como estava no encerramento; lote cancelado fica de fora.
- **Período padrão** da visão geral e do relatório: últimos 90 dias. Entram os lotes cuja
  vida cruza o período (alojados até o fim dele e ainda em andamento ou encerrados depois do
  início).
- **Mortalidade diária da fazenda:** soma das baixas sobre a soma do saldo no início do dia dos
  lotes que lançaram baixa naquele dia; o nível do dia é o pior entre os lotes, cada um pelo
  limite da sua idade.
- **Pontos de atenção:** alertas abertos, mais o que já passou do limite e ainda não virou
  alerta (a fila avalia depois do lançamento), dias do período acima do limite, carência
  vigente, lotes encerrados com pendências e equipamentos parados.

## Fora do MVP

Central de biosseguridade, compliance e rastreabilidade para exportação, benchmark de custo,
postura, venda de cama, produtor integrado, app de campo offline e IoT com SMS (Fases 3 e 7,
adiadas).

## Destino das 11 inconsistências do documento do projeto

| #   | Tema                                 | Resolução                                                                                                                                              | Onde   |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | Idade ignora `idade_inicial_dias`    | **Decidido**: somar em todas as fórmulas de idade                                                                                                      | doc 03 |
| 2   | `data_aquisicao` opcional            | **Decidido**: a regra só vale quando a data existir                                                                                                    | Fase 6 |
| 3   | Capacidade: trava × alerta           | **Proposta**: alerta com confirmação do Gestor, no UC05 e no UC06                                                                                      | doc 03 |
| 4   | Equipamento sem galpão               | **Proposta**: `id_galpao` opcional; a despesa de equipamento da fazenda é rateada entre os lotes ativos, e sem lote ativo fica como despesa da fazenda | doc 04 |
| 5   | Carência não bloqueia o encerramento | **Proposta**: bloquear o registro de carga com carência vigente                                                                                        | doc 03 |
| 6   | Dois "custo por ave"                 | **Decidido**: um indicador só, `custo_por_ave_alojada`                                                                                                 | doc 03 |
| 7   | Rateio × um único `id_lote`          | **Decidido**: tabela `despesa_rateio`, uma linha por lote                                                                                              | doc 04 |
| 8   | Enums do UC16 incompletos            | **Decidido**: ampliar na Fase 5 (energia, umidade, amônia, equipamento parado, falta de sinal, SMS)                                                    | doc 04 |
| 9   | Sem consumo físico de ração          | **Decidido**: `movimento_racao` em kg                                                                                                                  | doc 04 |
| 10  | Nome do ator                         | **Decidido**: "Produtor Avícola"                                                                                                                       | doc 02 |
| 11  | RF06.2 duplica RF08                  | **Decidido**: unir em RF06.2 (baixa diária: mortes e descartes)                                                                                        | —      |
