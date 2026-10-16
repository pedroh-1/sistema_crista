# CRISTA Avicultura

Plataforma de gestão e monitoramento de lotes de frango de corte. As decisões e regras de
negócio estão em [docs/](docs/README.md).

## Estrutura

| Pasta         | O que é                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| `apps/api`    | API NestJS + Prisma (PostgreSQL)                                                     |
| `apps/web`    | Painel web em Angular                                                                |
| `libs/domain` | Fórmulas dos indicadores e regras compartilhadas                                     |
| `docs/`       | Documentos de projeto (MVP, permissões, indicadores, modelo de dados, sincronização) |

## Rodar localmente

Pré-requisitos: Node 24 e PostgreSQL (Docker Compose ou instalação local).

```bash
npm install
cp .env.example .env

# Banco: com Docker
docker compose up -d
# ...ou com o PostgreSQL já instalado na máquina
sudo -u postgres psql -c "CREATE ROLE crista LOGIN PASSWORD 'crista' CREATEDB;" -c "CREATE DATABASE crista OWNER crista;"

npm run api   # http://localhost:3000/api/health
npm run web   # http://localhost:4200
```

## Comandos

```bash
npm test                  # todos os testes
npm run lint
npm run build
npx nx test domain        # testes de um projeto
npx nx prisma-migrate api # cria e aplica migrations (a partir da Fase 1)
```
