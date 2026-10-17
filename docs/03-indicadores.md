# Dicionário de indicadores v2

Substitui a seção "Indicadores e regras de negócio" do documento do projeto. Cada fórmula
deste documento é implementada uma vez, em `libs/domain`, e ganha testes com o exemplo do final.

Se faltar um dado de entrada, o indicador volta como **indisponível**, com o motivo. Ele não
vira zero (UC13).

## Grandezas base

| Grandeza            | Definição                                                          | Mudança em relação ao documento                                       |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `aves_recebidas`    | Quantidade recebida no alojamento (UC06)                           | —                                                                     |
| `aves_alojadas`     | `aves_recebidas − mortas_transporte`                               | **Nova.** É o denominador de mortalidade, viabilidade e custo por ave |
| `baixas_acumuladas` | Soma das baixas (mortes + descartes) até a data, já com os ajustes | Passa a ser soma de eventos (doc 05)                                  |
| `aves_saidas`       | Soma das aves das cargas de saída (UC17)                           | **Nova**: um lote pode sair em várias cargas                          |
| `saldo_aves`        | `aves_alojadas − baixas_acumuladas − aves_saidas`                  | Inclui as saídas                                                      |
| `idade_dias(d)`     | `(d − data_alojamento) + idade_inicial_dias`                       | Inconsistência #1                                                     |

**Proposta**: `idade_inicial_dias` passa a ter padrão **0**, e não 1. O pinto de um dia
corresponde ao dia 0 das curvas Cobb e Ross. Assim, um lote alojado em 01/03 tem 42 dias em 12/04.

## Zootécnicos (UC07, UC10, UC11, UC13)

| Indicador                 | Fórmula                                                       | Observação                                                                                                              |
| ------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Mortalidade acumulada (%) | `baixas_acumuladas ÷ aves_alojadas × 100`                     | Antes dividia pelas aves recebidas                                                                                      |
| Viabilidade (%)           | `100 − mortalidade acumulada`                                 | —                                                                                                                       |
| Mortalidade do dia (%)    | `baixas do dia ÷ saldo no início do dia × 100`                | Compara com a referência da idade (doc 06)                                                                              |
| Peso médio da amostra (g) | `soma dos pesos ÷ aves pesadas`                               | —                                                                                                                       |
| Uniformidade (%)          | `aves dentro de ±10% da média ÷ aves pesadas × 100`           | Só com pesos individuais; sem eles, indisponível                                                                        |
| Amostra mínima            | `min(ceil(1% do saldo), 50)`                                  | Abaixo disso: aviso de baixa representatividade. **Proposta**: "o que for menor", porque 50 aves já bastam para a média |
| Desvio da curva (%)       | `(peso real − peso padrão da idade) ÷ peso padrão × 100`      | Faixa "dentro da meta": ±5% (**proposta**)                                                                              |
| GPD médio (g/dia)         | `(peso médio atual − peso_pinto_g) ÷ idade_dias`              | Desconta o peso do pinto                                                                                                |
| GPD do período (g/dia)    | `(peso atual − peso anterior) ÷ dias entre as pesagens`       | Novo, para o UC11                                                                                                       |
| Peso vivo em estoque (kg) | `saldo_aves × peso médio atual (g) ÷ 1000`                    | —                                                                                                                       |
| Peso vivo produzido (kg)  | `peso vivo em estoque + peso entregue nas cargas`             | —                                                                                                                       |
| Ração consumida (kg)      | `entradas de ração − estoque restante informado`              | Vem de `movimento_racao` (doc 04)                                                                                       |
| Conversão alimentar (CA)  | `ração consumida (kg) ÷ peso vivo produzido (kg)`             | Indisponível sem entrada de ração ou pesagem                                                                            |
| IEP                       | `viabilidade (%) × peso médio (kg) ÷ (idade_dias × CA) × 100` | —                                                                                                                       |
| Densidade (aves/m²)       | `aves_alojadas ÷ área útil`                                   | —                                                                                                                       |
| Densidade (kg/m²)         | `peso vivo em estoque ÷ área útil`                            | Nova; é o indicador usado em bem-estar animal                                                                           |

## Econômico-financeiros (UC12, UC14)

| Indicador                      | Fórmula                                                            | Observação                                                                  |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Custo dos pintos               | `aves_recebidas × custo_pinto`                                     | Entra no custo total automaticamente                                        |
| Custo total                    | `custo dos pintos + soma das parcelas de despesa rateadas ao lote` | —                                                                           |
| Custo por ave alojada          | `custo total ÷ aves_alojadas`                                      | **Indicador único**; `custo_por_ave` deixa de existir (inconsistência #6)   |
| Custo por kg                   | `custo total ÷ peso vivo produzido`                                | Usa o peso estimado durante o lote e o peso entregue depois do encerramento |
| Participação por categoria (%) | `custo da categoria ÷ custo total × 100`                           | —                                                                           |
| Receita prevista               | `peso vivo em estoque × preço de referência`                       | Indisponível sem preço                                                      |
| Receita realizada              | `soma de (peso da carga × preço da carga)`                         | No encerramento                                                             |
| Margem (R$ e %)                | `receita − custo total`; `÷ receita × 100`                         | —                                                                           |

Rateio de despesa entre lotes: por aves alojadas, por consumo (kg de ração) ou por percentual
manual. A soma das parcelas é sempre igual ao valor da despesa. O centavo que sobrar no
arredondamento vai para a maior parcela.

## Indicadores da fazenda (visão geral e relatório da fazenda)

Fórmulas em `libs/domain/src/lib/visao-geral.ts`, sobre os lotes do filtro, cada um cortado no
fim do período (ou no encerramento). Regras em **Proposta** (docs/01-mvp.md).

| Indicador                | Fórmula                                                         | Observação                                 |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------ |
| Aves alojadas            | soma das `aves_alojadas` dos lotes alojados                     | —                                          |
| Plantel atual            | soma do saldo de aves dos lotes em andamento                    | —                                          |
| Mortalidade (%)          | `soma das baixas ÷ soma das aves alojadas × 100`                | Ponderada; não é a média das porcentagens  |
| Viabilidade (%)          | `100 − mortalidade da fazenda`                                  | —                                          |
| Conversão alimentar      | `soma da ração consumida ÷ soma do peso vivo produzido`         | Só lotes com ração e pesagem               |
| IEP médio                | média simples do IEP dos lotes que têm valor                    | —                                          |
| Mortalidade diária (%)   | `soma das baixas do dia ÷ soma do saldo no início do dia × 100` | Só os lotes que lançaram baixa naquele dia |
| Custo e margem dos lotes | soma do custo total e da margem prevista de cada lote           | Só para quem tem `financeiro.ver`          |

## Regras de integridade

| Regra                                                                                            | Situação                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------ |
| Um lote em andamento por galpão; o encerramento libera o galpão                                  | Decidido                       |
| Lote encerrado aceita apenas consulta                                                            | Decidido                       |
| A soma das baixas e saídas nunca passa das aves alojadas                                         | Decidido; validado no servidor |
| Alojar acima da capacidade: alerta de densidade, com confirmação do Gestor, no UC05 e no UC06    | Proposta (inconsistência #3)   |
| Carga de saída com carência vigente (`data_saida < maior data_fim_carencia do lote`) é bloqueada | Proposta (inconsistência #5)   |
| `data_fim_carencia = data da ocorrência + dias de carência`                                      | Decidido                       |
| Datas de lançamento não podem estar no futuro nem antes do alojamento                            | Decidido                       |

## Exemplo de referência (vira teste unitário)

Entradas: 20.000 aves recebidas, 100 mortas no transporte, 796 baixas acumuladas, idade de
42 dias, peso médio de 2.900 g, peso do pinto de 42 g, 94.182,72 kg de ração consumida,
nenhuma carga ainda. Custos: pinto a R$ 3,00, ração a R$ 1,80/kg, outras despesas de
R$ 30.000,00. Preço de referência: R$ 6,00/kg.

| Indicador             | Resultado esperado |
| --------------------- | ------------------ |
| Aves alojadas         | 19.900             |
| Mortalidade acumulada | 4,00%              |
| Viabilidade           | 96,00%             |
| Saldo                 | 19.104             |
| Peso vivo em estoque  | 55.401,60 kg       |
| CA                    | 1,700              |
| IEP                   | 389,92             |
| GPD médio             | 68,05 g/dia        |
| Custo total           | R$ 259.528,90      |
| Custo por ave alojada | R$ 13,04           |
| Custo por kg          | R$ 4,68            |
| Receita prevista      | R$ 332.409,60      |
| Margem                | R$ 72.880,70       |
