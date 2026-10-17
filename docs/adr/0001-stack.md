# ADR 0001: stack e estrutura do repositório

- Situação: **Decidido** (16/10/2026)
- Substitui as alternativas em aberto na seção "Arquitetura" do documento do projeto.

## Contexto

A equipe tem 4 pessoas, o domínio é relacional (fazenda → galpão → lote) e o app de campo
precisa funcionar sem internet. O documento deixava em aberto Flutter × React Native,
NestJS × FastAPI/Django, PostgreSQL × MySQL e React × Vue.

## Decisão

Usar TypeScript em todas as camadas, num monorepo Nx:

| Camada                  | Escolha                                              | Observação                                                                                  |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Monorepo                | Nx + npm                                             | Gera e orquestra Angular, NestJS e React Native                                             |
| API                     | NestJS (REST)                                        | Um módulo NestJS por domínio: conta, fazenda, lote, sanidade, custos, alertas, equipamentos |
| Banco                   | PostgreSQL 16+                                       | Um schema por módulo, para manter as fronteiras do monólito modular                         |
| ORM e migrations        | Prisma                                               | Schema declarativo e migrations versionadas                                                 |
| Web                     | Angular                                              | Gráficos com Chart.js (ng2-charts)                                                          |
| Mobile (Fase 3, adiada) | React Native + Expo + WatermelonDB                   | Banco local e fila de sincronização                                                         |
| Regras compartilhadas   | `libs/domain`                                        | Fórmulas dos indicadores, enums e schemas zod usados pela API, pelo web e pelo mobile       |
| Fila de eventos         | Tabela `fila.tarefa` no PostgreSQL (outbox)          | Atende o RNF07 sem RabbitMQ nem Redis no MVP                                                |
| Arquivos                | S3 (MinIO no ambiente local)                         | Anexos de até 10 MB (RNF08)                                                                 |
| E-mail                  | SMTP (Mailpit no local; SES ou SendGrid em produção) | Verificação de conta e convites                                                             |
| Ambiente local          | Docker Compose                                       | postgres, minio e mailpit                                                                   |

## Por quê

- Com uma linguagem só, as fórmulas de `libs/domain` são escritas e testadas uma vez e rodam
  igual no servidor e no app offline. Isso evita que o indicador mostrado no galpão seja
  diferente do mostrado no painel.
- A fila usa o mesmo banco. Isso resolve a fila separada do RNF07 sem mais um serviço para operar.
  Se o volume dos sensores (Fase 7) exigir, a troca por RabbitMQ fica isolada em `FilaService`.

## Revisão (Fase 5): fila própria no lugar do pg-boss

O pg-boss passou a ser distribuído só como ESM (versão 12), e a API é CommonJS. Em vez de
fixar uma versão antiga, a fila virou uma tabela própria, `fila.tarefa`, no padrão _outbox_:

- A tarefa é gravada **na mesma transação** do lançamento que a gerou. Se o lançamento é
  desfeito, a tarefa também é; se é gravado, a tarefa não se perde.
- Um processo dentro da API pega até 20 tarefas por segundo com `FOR UPDATE SKIP LOCKED`.
  Isso permite rodar mais de uma instância da API sem duas pegarem a mesma tarefa.
- Cada tarefa pega fica reservada por 5 minutos. Se o processo cair no meio, ela volta a
  ficar disponível. Falhas são repetidas com espera crescente (10 s, 20 s, 40 s, 80 s), até
  5 tentativas; depois disso a tarefa fica como `falhou`, com o erro gravado.
- Nos testes, a fila não roda sozinha (`FILA_WORKER=desligado`), e o teste a esvazia quando
  precisa.
- Redis e MQTT ficam fora até haver carga ou sensores reais.

## Consequências

- Angular e React Native não compartilham componentes de tela, só `libs/domain`.
- O broker MQTT e o provedor de SMS serão decididos na Fase 7, quando o hardware for escolhido.

## Estrutura

```
apps/
  api/        NestJS
  web/        Angular
  mobile/     React Native (Fase 3)
libs/
  domain/     fórmulas, enums, validações
docs/
docker-compose.yml
```
