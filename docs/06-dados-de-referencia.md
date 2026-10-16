# Dados de referência por linhagem

Situação: **Decidido** (estrutura). **Pendente**: os valores reais.

## Para que servem

| Uso                                                            | UC         |
| -------------------------------------------------------------- | ---------- |
| Curva padrão de peso, para o desvio da curva                   | UC11, UC13 |
| Consumo acumulado de ração esperado, para a CA de referência   | UC13       |
| Mortalidade diária esperada, para o alerta de mortalidade      | UC07, UC16 |
| Limites padrão de alerta quando o Gestor não configurou nenhum | UC16       |

Sem esses dados, o UC11 e os alertas de desvio não funcionam. Hoje o documento do projeto
não tem a fonte.

## Estrutura

Tabela `referencia.curva_referencia`: uma linha por linhagem, sexo e idade em dias,
de 0 a 56 dias.

| Coluna              | Exemplo                                                             |
| ------------------- | ------------------------------------------------------------------- |
| linhagem            | `cobb500`, `ross308`, `hubbard`                                     |
| sexo                | `misto`, `macho`, `femea`                                           |
| idade_dias          | 0 a 56                                                              |
| peso_g              | peso vivo esperado                                                  |
| consumo_acum_g      | ração acumulada esperada por ave                                    |
| mortalidade_dia_pct | mortalidade esperada no dia                                         |
| fonte               | ex.: "Cobb500 Broiler Performance & Nutrition Supplement, 2022"     |
| versao              | permite atualizar a tabela sem perder o histórico dos lotes antigos |

Lotes da linhagem "outra" não têm curva. Os indicadores que dependem dela ficam indisponíveis,
até a fazenda cadastrar uma curva própria (**proposta**, depois do MVP).

## Tarefa pendente (dono a definir)

1. Baixar os manuais públicos de desempenho: Cobb500 Broiler Performance & Nutrition
   Supplement, Ross 308 Broiler Performance Objectives e o equivalente da Hubbard.
2. Transcrever as tabelas para `apps/api/prisma/seed/curvas/*.csv`.
3. Mortalidade diária esperada: os manuais trazem pouco. Proposta de partida: usar o
   histórico da própria fazenda depois de 3 lotes. Até lá, alertar quando a mortalidade do dia
   passar de 0,3% (atenção) ou 0,5% (crítico) a partir da 2ª semana. Na 1ª semana, usar o dobro.
   **Esses números são suposições** para a equipe validar com o veterinário e com produtores.

Até a transcrição ficar pronta, a migration `fase4_custos_curva` carrega uma curva
**sintética** (versão `teste-1`, `fonte = 'sintetico'`) para Cobb 500, Ross 308 e Hubbard,
lote misto, de 0 a 56 dias. Ela não vem dos manuais. A interface mostra o aviso
"curva de teste" sempre que ela é usada.

Para trocar pelas curvas oficiais, crie uma nova migration que insira as linhas com outra
`versao` (por exemplo `cobb500-2022`). O sistema usa sempre a versão mais recente de cada
linhagem e sexagem; sem curva do sexo do lote, usa a de lote misto.
