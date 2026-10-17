# CRISTA Avicultura: contexto para o Claude

Plataforma web de gestão de lotes de frango de corte para o **produtor independente**. As regras
de negócio estão em [docs/](docs/README.md), e o plano de fases em [docs/01-mvp.md](docs/01-mvp.md).
Escreva código, comentários, mensagens de erro e docs em **português**, no mesmo estilo dos
arquivos vizinhos.

## Situação atual (17/10/2026)

- **Entregues:** Fases 0, 1, 2, 4, 5 e 6 (UC01 a UC19), todas web + API.
- **Decisão do usuário: foco só na aplicação web.** O app de campo offline (Fase 3) e o IoT
  (Fase 7) estão adiados, sem data. Não proponha retomá-los sem o usuário pedir.
- **Próximo passo: Fase 8**, acabamento do web: visões salvas do UC15, lançamentos usáveis no
  celular pelo navegador, preparo para produção (anexos em S3, e-mail real, backup).

### Como a Fase 6 ficou (referência)

- Módulo `apps/api/src/equipamentos` (schema `equipamentos`). A manutenção com custo gera a
  despesa via `DespesasService.gravar()` com `rateioPeloSistema` (o rateio ignora os galpões do
  vínculo) e `manutencaoId`; estornar a manutenção estorna a despesa junto.
- `manutencao_equipamento` só aceita inserção; o trigger libera apenas o registro do retorno.
- Alerta `equipamento_parado`: tarefa `avaliar-equipamento` na fila, avaliada em
  `alertas/avaliador-equipamento.service.ts`; tem `id_equipamento` e `id_lote` nulo.
- Regras novas registradas como **Proposta** em docs/01-mvp.md.

## Estrutura

Monorepo Nx (preset integrado, porque o Angular não aceita project references do TS):

- `apps/api`: NestJS 11 + Prisma 7.10.1 (`adapter-pg`, client gerado em `apps/api/src/generated/prisma`).
  Um módulo por pasta (`fazendas`, `producao`, `sanidade`, `custos`, `alertas`, `anexos`, `fila`...).
- `apps/web`: Angular 22 zoneless, standalone, signals e rotas lazy. Serviços comuns em `nucleo/`.
- `libs/domain` (`@crista/domain`): schemas zod e fórmulas usados pela API e pelo web. Toda regra
  de validação ou fórmula nova vai aqui, com teste unitário.

## Convenções que o código já segue

- Um schema do Postgres por módulo (`conta`, `fazenda`, `producao`, `custos`, `alertas`, `fila`,
  `auditoria`...). Chaves UUID v7.
- **Lançamentos do ciclo são só de inserção** (trigger no banco). Correção é feita por estorno,
  nunca por update ou delete. Toda escrita relevante grava em `auditoria.evento_auditoria`.
- Autorização: guarda JWT global (`@Publico()` libera), `AcessoFazendaGuard` + `@Permite(acao)`
  usando `pode()`. Usuário sem vínculo com a fazenda recebe 404.
- Confirmação de regra branda: a API responde **409 com `codigo`** (ex.: `DENSIDADE`,
  `PENDENCIAS`); o web pergunta ao usuário e reenvia com a flag de confirmação.
- Tarefas em segundo plano: fila própria em `fila.tarefa` (outbox na mesma transação), via
  `FilaService.enfileirar(tx, tipo, payload)`. Não usar pg-boss.
- Gráficos: componente SVG próprio (`nucleo/grafico-linhas.ts`) com a paleta validada
  `--serie-1..4`.

## Ambiente e comandos

- Node via nvm: rode `source ~/.nvm/nvm.sh` antes de `npm`/`npx`. Não há Docker; o PostgreSQL 18
  é local, com os bancos `crista` e `crista_test` (usuário e senha `crista`).
- A porta da API vem de `API_PORT` (não `PORT`, que colide com o Angular).
- Comandos em [README.md](README.md). Antes de concluir uma fase, rode: `npx prettier --check .`,
  `npm run lint`, `npm test`, `npm run build` e `npm run test:integracao`.
- Use `--parallel=1` no Nx: em paralelo a máquina fica sem memória (exit 137).
- Para parar a API, use `pkill -f '[d]ist/apps/api/main.js'` num comando separado; sem os
  colchetes o pkill mata o próprio shell (exit 144).
- `npm run demo` cria os dados de demonstração. Contas `gestor@`, `operador@`, `veterinaria@`,
  `produtor@` e `consulta@demo.crista`, senha `crista123`.

## Armadilhas já encontradas

- Pacotes que viraram só ESM quebram a API (CommonJS): `@nestjs/config` fica em ^4 e
  `nodemailer` em ^7. Confira antes de adicionar dependência.
- O Prisma grava `timestamp` sem fuso em UTC, e o `now()` do Postgres usa o fuso da sessão
  (São Paulo). Em SQL cru, compare com `now() AT TIME ZONE 'UTC'`.
- Os testes de integração rodam com `FILA_WORKER=desligado`; use `processarFila()` do
  `test/apoio.ts` para executar as tarefas. Tabela nova precisa entrar no `TRUNCATE` desse arquivo.

## Git

Repositório privado `pedroh-1/sistema_crista`, branch `main`. **Só faça commit ou push quando o
usuário pedir.** O usuário costuma fazer os commits por conta própria.
