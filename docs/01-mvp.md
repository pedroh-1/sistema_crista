# Corte do MVP

## Premissas decididas

- Público do MVP: **produtor independente de frango de corte**. Ele compra pintinho, ração e
  medicamento e vende as aves. O produtor integrado fica para depois.
- `tipo_criacao` aceita só `corte` no MVP. O módulo de postura e a venda de cama de frango
  saem do escopo até ganharem caso de uso próprio.
- Primeiro marco: núcleo web (Fases 0 a 2). App offline e IoT vêm depois.

## Fases

| Fase | Entrega                                                                                         | UCs              | Marco |
| ---- | ----------------------------------------------------------------------------------------------- | ---------------- | ----- |
| 0    | Documentos desta pasta e esqueleto do repositório                                               | —                | 1     |
| 1    | Conta, fazenda, galpão, vínculo e convite, permissões, auditoria (**entregue**)                 | UC01–UC04        | 1     |
| 2    | Lote, alojamento, baixas, pesagem, sanidade e carência, entrada de ração, anexos (**entregue**) | UC05–UC10        | 1     |
| 4    | Curva de peso, indicadores, despesas com rateio, painel e filtros (**entregue**)                | UC11–UC15        | 2     |
| 5    | Alertas com fila e notificação; encerramento com cargas e carência (**entregue**)               | UC16, UC17       | 2     |
| 3    | App de campo offline (começa por um spike descartável do UC07)                                  | UC06, UC07, UC10 | 3     |
| 6    | Equipamentos e manutenção                                                                       | UC18, UC19       | 3     |
| 7    | IoT: energia e temperatura, alerta por falta de sinal, SMS                                      | UC16 estendido   | 4     |

A Fase 3 vem depois das Fases 4 e 5 porque indicadores e alertas mostram o valor do produto
mais cedo, e a regra de sincronização (doc 05) já foi pensada para que o app entre depois
sem mudar o modelo.

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

## Fora do MVP

Central de biosseguridade, compliance e rastreabilidade para exportação, benchmark de custo,
postura, venda de cama, produtor integrado, SMS (até a Fase 7) e visões salvas do UC15
(proposta: entram na Fase 4 só se sobrar tempo).

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
