# Matriz de permissões

Situação: **Proposta**. Confirmar com a equipe antes da Fase 1.

## Regras gerais

- Toda permissão vale dentro de uma fazenda, pelo vínculo do usuário com ela (UC04).
  Um usuário pode ter vínculos com várias fazendas e um perfil diferente em cada uma.
- Se o vínculo lista galpões permitidos, o usuário só vê e lança dados desses galpões.
  Sem lista, vale para a fazenda inteira.
- Vínculo `pendente`, `expirado` ou `revogado` não dá acesso a nada.
- Ninguém apaga registros do ciclo produtivo. Para corrigir, lança um ajuste ou estorno
  (doc 05). O ajuste exige o mesmo perfil do lançamento original.
- Lote encerrado aceita apenas consulta, para todos os perfis.

## Perfis

| Perfil      | Para quem                                                         |
| ----------- | ----------------------------------------------------------------- |
| Gestor      | Dono ou administrador da fazenda. Quem cria a fazenda vira Gestor |
| Produtor    | Sócio ou responsável pelo financeiro e pelos equipamentos         |
| Veterinário | Responsável técnico; CRMV obrigatório                             |
| Operador    | Funcionário do galpão; lança os dados do dia a dia                |
| Consulta    | Só leitura (contador, sócio, integradora)                         |

O documento do projeto usa "Produtor", "ProdutorAvícola" e "Avicultor". Na interface, o
nome fica "Produtor"; o ator UML continua sendo "Produtor Avícola".

## Matriz

Legenda: **E** = cria e edita (ajusta); **L** = só lê; **—** = sem acesso.

| Ação                                 | UC   | Gestor | Produtor | Veterinário | Operador | Consulta |
| ------------------------------------ | ---- | ------ | -------- | ----------- | -------- | -------- |
| Editar dados da fazenda              | UC02 | E      | L        | L           | L        | L        |
| Cadastrar e editar galpão            | UC03 | E      | L        | L           | L        | L        |
| Convidar, alterar e revogar vínculos | UC04 | E      | —        | —           | —        | —        |
| Cadastrar lote                       | UC05 | E      | —        | —           | —        | L        |
| Registrar alojamento                 | UC06 | E      | —        | —           | E        | L        |
| Registrar baixa diária               | UC07 | E      | —        | E           | E        | L        |
| Registrar ocorrência sanitária       | UC08 | L      | L        | E           | L        | L        |
| Consultar histórico sanitário        | UC09 | L      | L        | L           | L        | L        |
| Registrar pesagem                    | UC10 | E      | —        | E           | E        | L        |
| Registrar entrada de ração           | —    | E      | E        | —           | E        | L        |
| Acompanhar curva de peso             | UC11 | L      | L        | L           | L        | L        |
| Registrar despesa                    | UC12 | E      | E        | —           | —        | L        |
| Indicadores zootécnicos              | UC13 | L      | L        | L           | L        | L        |
| Indicadores financeiros              | UC14 | L      | L        | —           | —        | L        |
| Filtrar painel                       | UC15 | L      | L        | L           | —        | L        |
| Ver e fechar alertas                 | UC16 | E      | L        | E           | L        | L        |
| Configurar limites de alerta         | UC16 | E      | —        | E           | —        | —        |
| Registrar carga e encerrar lote      | UC17 | E      | —        | —           | —        | L        |
| Cadastrar equipamento                | UC18 | E      | E        | —           | —        | L        |
| Registrar manutenção                 | UC19 | E      | E        | —           | E        | L        |

## Pontos para a equipe confirmar

1. O Operador vê indicadores zootécnicos (UC13)? Aqui ficou que sim.
2. Indicadores financeiros ficaram fora do alcance de Veterinário e Operador. O perfil
   Consulta vê tudo; se for para a integradora, talvez não deva ver custos.
3. O Operador registrar manutenção (UC19) não está no documento; foi incluído porque quem está
   no galpão costuma ser quem registra o conserto.
