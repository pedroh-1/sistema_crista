# ADR 0001: stack e estrutura do repositório

- Situação: **Decidido** (16/10/2026)
- Substitui as alternativas em aberto na seção "Arquitetura" do documento do projeto.

## Contexto

A equipe tem 4 pessoas, o domínio é relacional (fazenda → galpão → lote) e o app de campo
precisa funcionar sem internet. O documento deixava em aberto Flutter × React Native,
NestJS × FastAPI/Django, PostgreSQL × MySQL e React × Vue.

## Decisão

Usar TypeScript em todas as camadas, num monorepo Nx:

| Camada                | Escolha                                              | Observação                                                                                  |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Monorepo              | Nx + npm                                             | Gera e orquestra Angular, NestJS e React Native                                             |
| API                   | NestJS (REST)                                        | Um módulo NestJS por domínio: conta, fazenda, lote, sanidade, custos, alertas, equipamentos |
| Banco                 | PostgreSQL 16+                                       | Um schema por módulo, para manter as fronteiras do monólito modular                         |
| ORM e migrations      | Prisma                                               | Schema declarativo e migrations versionadas                                                 |
| Web                   | Angular                                              | Gráficos com Chart.js (ng2-charts)                                                          |
| Mobile (Fase 3)       | React Native + Expo + WatermelonDB                   | Banco local e fila de sincronização                                                         |
| Regras compartilhadas | `libs/domain`                                        | Fórmulas dos indicadores, enums e schemas zod usados pela API, pelo web e pelo mobile       |
| Fila de eventos       | pg-boss (sobre o PostgreSQL)                         | Atende o RNF07 sem RabbitMQ nem Redis no MVP                                                |
| Arquivos              | S3 (MinIO no ambiente local)                         | Anexos de até 10 MB (RNF08)                                                                 |
| E-mail                | SMTP (Mailpit no local; SES ou SendGrid em produção) | Verificação de conta e convites                                                             |
| Ambiente local        | Docker Compose                                       | postgres, minio e mailpit                                                                   |

## Por quê

- Com uma linguagem só, as fórmulas de `libs/domain` são escritas e testadas uma vez e rodam
  igual no servidor e no app offline. Isso evita que o indicador mostrado no galpão seja
  diferente do mostrado no painel.
- pg-boss usa o mesmo banco. Isso resolve a fila separada do RNF07 sem mais um serviço para operar.
  Se o volume dos sensores (Fase 7) exigir, a troca por RabbitMQ fica isolada no módulo de alertas.
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
