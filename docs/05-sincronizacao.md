# Sincronização offline e correção de registros

Situação: **Decidido**. A regra vale desde a Fase 2 (web), para que o app offline da Fase 3
entre sem mudar o modelo.

## O problema no documento do projeto

"Último registro aditivo vence" mistura duas estratégias opostas: o último que grava apaga
os anteriores, ou os registros se somam. Além disso, o UC07 exige "uma baixa por data".
Com dois operadores sem internet registrando mortes no mesmo galpão e no mesmo dia, um dos
dois registros se perderia ou ficaria em conflito.

## A regra

1. **Os registros do ciclo são eventos que só se acumulam (append-only).** Baixa, pesagem,
   entrada de ração, ocorrência sanitária, despesa e carga nunca são alterados nem apagados.
2. **A baixa diária vira uma soma.** Cada operador lança quantas baixas quiser no dia. A
   "baixa do dia" que o UC07 mostra é a soma desses eventos. A regra "uma baixa por data"
   deixa de existir; no lugar dela, o app avisa quando já existe lançamento no dia
   ("já há 35 mortes registradas hoje por Fulano; deseja somar mais?").
3. **Correção é um estorno.** Para corrigir um lançamento errado, registra-se um estorno
   (tabela `producao.estorno`) que aponta para o original, com motivo obrigatório, e depois
   lança-se o valor certo. O original continua no histórico, marcado como estornado, e sai
   dos indicadores. O banco recusa `UPDATE` e `DELETE` nas tabelas de eventos.
4. **O cliente gera o ID (UUID v7).** Reenviar o mesmo evento não o duplica: o servidor
   responde "já recebido".
5. **O servidor valida de novo.** Se um evento offline quebrar uma regra (por exemplo, as
   baixas passam do saldo, ou o lote foi encerrado enquanto o operador estava sem sinal), o
   evento é **aceito com o status `pendente_revisao`** e vira um alerta para o Gestor. Ele não
   é rejeitado, porque a morte das aves aconteceu de fato e o registro não pode se perder.
   Enquanto pendente, o evento não entra nos indicadores.
6. **Duas horas são guardadas:** a do aparelho (`registrado_em`) e a do servidor
   (`recebido_em`). A data do fato é a informada pelo operador. Diferença grande entre as duas
   horas fica registrada na auditoria.

## Exceções: registros que não são eventos

Cadastros (fazenda, galpão, lote, equipamento, vínculo) são editáveis, só pela web e com
conexão. Cada edição grava o antes e o depois em `evento_auditoria`.

## Teste de aceitação (Fase 3)

Dois aparelhos offline lançam 20 e 15 mortes no mesmo lote e no mesmo dia. Ao reconectar,
nos dois sentidos de envio, o saldo cai 35, existem dois eventos com autores diferentes, e
reenviar qualquer um deles não muda nada.
