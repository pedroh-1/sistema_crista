# Modelo de dados v2

Evolução das 14 entidades do diagrama de classes. Cada tabela marca se entra **(MVP)**,
quando entra na Fase 1 ou 2, ou a fase em que entra depois.

## Convenções

- Chave primária `id uuid` (v7), gerada no cliente quando o registro nasce no app.
- Toda tabela de dados de fazenda tem `id_fazenda`, mesmo quando dá para chegar a ela pelo
  lote. Isso simplifica o filtro de acesso e permite ligar o Row Level Security do
  PostgreSQL no futuro.
- Colunas comuns: `criado_em`, `criado_por`. Os eventos têm também `registrado_em`
  (hora do aparelho), `recebido_em` (hora do servidor), `status`
  (`valido` | `pendente_revisao`). A correção é um registro em `producao.estorno` (doc 05).
- Valores em dinheiro: `numeric(14,2)`. Pesos: gramas como inteiro, ou kg como `numeric(12,3)`.
- Campos derivados (os que têm "/" no diagrama) **não** são gravados: são calculados por
  `libs/domain`. A exceção é o resultado consolidado do encerramento, que é congelado.
- Um schema PostgreSQL por módulo: `conta`, `fazenda`, `producao`, `sanidade`, `custos`,
  `alertas`, `equipamentos`, `auditoria`, `referencia`.

## conta

| Tabela                    | Campos principais                                                                                | Observação                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `usuario` (MVP)           | nome, email (único), telefone, cpf, senha_hash, status (`pendente`/`ativo`), email_verificado_em | Senha só como hash (argon2id)                     |
| `aceite_termos` (MVP)     | id_usuario, versao_termos, aceito_em, ip                                                         | **Nova**: LGPD exige saber qual versão foi aceita |
| `token_verificacao` (MVP) | id_usuario, tipo (`email`/`senha`), hash_token, expira_em, usado_em                              | —                                                 |

## fazenda

| Tabela                          | Campos principais                                                                                                              | Observação                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `fazenda` (MVP)                 | nome, documento (CPF/CNPJ, único), endereço, latitude, longitude, tipo_criacao (`corte`), integradora                          | Localização é dado pessoal (LGPD)                                  |
| `galpao` (MVP)                  | id_fazenda, identificacao (única na fazenda), area_util_m2, capacidade_aves, tipo, situacao (`disponivel`/`ocupado`/`inativo`) | —                                                                  |
| `vinculo_usuario_fazenda` (MVP) | id_fazenda, id_usuario, perfil, crmv, valido_ate, status, hash_token_convite, convite_expira_em                                | —                                                                  |
| `vinculo_galpao` (MVP)          | id_vinculo, id_galpao                                                                                                          | **Nova**: tira a lista de galpões permitidos de dentro de um campo |

## producao

| Tabela                       | Campos principais                                                                                                                                                                               | Observação                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `lote` (MVP)                 | id_fazenda, id_galpao, codigo, linhagem, sexagem, origem, data_alojamento, idade_inicial_dias (padrão 0), peso_pinto_g, custo_pinto, quantidade_prevista, situacao (`em_andamento`/`encerrado`) | Índice único parcial: um lote `em_andamento` por galpão |
| `alojamento` (MVP)           | id_lote, data, aves_recebidas, mortas_transporte, justificativa_divergencia, confirmou_densidade_por                                                                                            | Um por lote                                             |
| `evento_baixa` (MVP)         | id_lote, data, mortes, descartes, causa_provavel, + colunas de evento                                                                                                                           | **Substitui** `baixa_diaria` (doc 05)                   |
| `pesagem` (MVP)              | id_lote, data, aves_pesadas, peso_total_g, ponto_coleta, + colunas de evento                                                                                                                    | —                                                       |
| `pesagem_individual` (MVP)   | id_pesagem, peso_g                                                                                                                                                                              | **Nova**: necessária para a uniformidade                |
| `movimento_racao` (MVP)      | id_fazenda, id_lote, data, tipo (`entrada`/`estoque_restante`/`transferencia`), quantidade_kg, id_despesa, + colunas de evento                                                                  | **Nova** (inconsistência #9)                            |
| `saida_carga` (Fase 5)       | id_lote, data_saida, aves, peso_total_kg, preco_kg, destino, + colunas de evento                                                                                                                | **Nova**: várias cargas por lote                        |
| `encerramento_lote` (Fase 5) | id_lote, encerrado_em, encerrado_por, parcial, pendencias, resultado (jsonb congelado)                                                                                                          | O resultado vem das fórmulas na data do encerramento    |

## sanidade

| Tabela                       | Campos principais                                                                                                    | Observação                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `ocorrencia_sanitaria` (MVP) | id_lote, data, tipo, descricao, produto, dose, via, lote_produto, carencia_dias, id_veterinario, + colunas de evento | `data_fim_carencia` é calculada |

## custos

| Tabela                    | Campos principais                                                                                                                                | Observação                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `despesa` (Fase 4)        | id_fazenda, categoria, valor, data, fornecedor, numero_nota, criterio_rateio, origem (`manual`/`manutencao`), id_manutencao, + colunas de evento | Sem `id_lote`                                                      |
| `despesa_rateio` (Fase 4) | id_despesa, id_lote, percentual, valor                                                                                                           | **Nova** (inconsistência #7). Sem linha alguma: despesa da fazenda |

## alertas

| Tabela                    | Campos principais                                                                                                                                           | Observação                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `regra_alerta` (Fase 5)   | id_fazenda, id_galpao, indicador, limite_atencao, limite_critico, origem (`padrao_linhagem`/`configurado`)                                                  | **Nova**                                                   |
| `alerta` (Fase 5)         | id_fazenda, id_lote, id_galpao, id_equipamento (Fase 6), indicador, valor, criticidade, status (`aberto`/`reconhecido`/`fechado`), providencia, fechado_por | Era `alerta_desvio`; enums ampliados (inconsistência #8)   |
| `notificacao` (Fase 5)    | id_alerta, id_usuario, canal (`email`/`push`/`sms`), status_envio, tentativas                                                                               | **Nova**: separa o alerta da sua entrega                   |
| `dispositivo` (Fase 7)    | id_fazenda, id_galpao, tipo, identificador, ultimo_sinal_em                                                                                                 | **Nova**; o alerta de falta de sinal usa `ultimo_sinal_em` |
| `leitura_sensor` (Fase 7) | id_dispositivo, medido_em, grandeza, valor                                                                                                                  | **Nova**; avaliar particionamento por mês                  |

## equipamentos (Fase 6)

| Tabela                   | Campos principais                                                                                                                                                            | Observação                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `equipamento`            | id_fazenda, id_galpao (opcional), nome, tipo, numero_serie (único na fazenda), fabricante, modelo, critico, periodicidade_dias, data_aquisicao, situacao (`ativo`/`inativo`) | Inconsistência #4. Cadastro editável, com auditoria                                             |
| `manutencao_equipamento` | id_equipamento, tipo (`preventiva`/`corretiva`), data, descricao, custo_pecas, custo_mao_obra, fornecedor, ordem_servico, parada_inicio, retorno_operacao, retorno_por       | O custo gera uma `despesa` com `origem = manutencao`. Só inserção, exceto o registro do retorno |

## Transversais

| Tabela                   | Campos principais                                                                                                                              | Observação                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `anexo` (MVP)            | id_fazenda, entidade, id_entidade, chave_s3, nome, mime (jpg/png/pdf), tamanho (≤ 10 MB), sha256                                               | **Nova**: substitui os campos de anexo espalhados; serve de evidência para o relatório do UC17 |
| `evento_auditoria` (MVP) | id_fazenda, id_usuario, acao, entidade, id_entidade, antes (jsonb), depois (jsonb), registrado_em, recebido_em, origem (`web`/`app`/`sistema`) | **Nova**; só aceita inserção                                                                   |
| `curva_referencia` (MVP) | linhagem, sexo, idade_dias, peso_g, consumo_acum_g, mortalidade_dia_pct, fonte, versao                                                         | **Nova** (doc 06)                                                                              |
| `visao_salva` (Fase 8)   | id_usuario, id_fazenda, nome, filtros (jsonb)                                                                                                  | UC15. Fica no schema `custos`, junto do painel; preferência pessoal, sem auditoria             |
