# Corte do MVP

## Premissas decididas

- Público do MVP: **produtor independente de frango de corte**. Ele compra pintinho, ração e
  medicamento e vende as aves. O produtor integrado fica para depois.
- `tipo_criacao` aceita só `corte` no MVP. O módulo de postura e a venda de cama de frango
  saem do escopo até ganharem caso de uso próprio.
- Primeiro marco: núcleo web (Fases 0 a 2). App offline e IoT vêm depois.

## Fases

| Fase | Entrega                                                                                | UCs              | Marco |
| ---- | -------------------------------------------------------------------------------------- | ---------------- | ----- |
| 0    | Documentos desta pasta e esqueleto do repositório                                      | —                | 1     |
| 1    | Conta, fazenda, galpão, vínculo e convite, permissões, auditoria (**entregue**)        | UC01–UC04        | 1     |
| 2    | Lote, alojamento, baixas, pesagem, sanidade e carência, entrada de ração, anexos (web) | UC05–UC10        | 1     |
| 4    | Curva de peso, indicadores, despesas com rateio, painel e filtros                      | UC11–UC15        | 2     |
| 5    | Alertas com fila e notificação; encerramento com cargas e carência                     | UC16, UC17       | 2     |
| 3    | App de campo offline (começa por um spike descartável do UC07)                         | UC06, UC07, UC10 | 3     |
| 6    | Equipamentos e manutenção                                                              | UC18, UC19       | 3     |
| 7    | IoT: energia e temperatura, alerta por falta de sinal, SMS                             | UC16 estendido   | 4     |

A Fase 3 vem depois das Fases 4 e 5 porque indicadores e alertas mostram o valor do produto
mais cedo, e a regra de sincronização (doc 05) já foi pensada para que o app entre depois
sem mudar o modelo.

Os anexos (S3) passaram da Fase 1 para a Fase 2, porque o primeiro caso de uso que os usa é a
ocorrência sanitária (UC08).

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
