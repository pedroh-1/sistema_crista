# 07: Preparo para produção

Situação: **Proposta** (Fase 8). Descreve um ambiente de produção simples, um servidor só, que
atende o MVP. Revisar quando houver mais de uma fazenda grande ou exigência de alta
disponibilidade.

## Desenho

```text
navegador ──https──▶ nginx ──▶ arquivos do web (dist/apps/web/browser)
                         └──/api──▶ API Node (porta 3000) ──▶ PostgreSQL 18
                                         ├──▶ S3 (anexos)
                                         └──▶ SMTP (e-mails)
```

- O nginx serve o web e repassa `/api` para a API. Web e API ficam no mesmo domínio, então não
  é preciso CORS.
- A API roda também a fila (`fila.tarefa`): alertas e notificações. Mais de um processo da API
  pode rodar ao mesmo tempo (`FOR UPDATE SKIP LOCKED`).
- O PostgreSQL pode ser gerenciado (RDS, Cloud SQL etc.) ou local no servidor.

## Variáveis de ambiente

A API confere as variáveis ao subir e **não sobe** se algo estiver errado
(`apps/api/src/comum/ambiente.ts`). Com `NODE_ENV=production`, ela exige:

| Variável                     | Regra em produção                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`                 | 32 ou mais caracteres, diferente do exemplo. Gere com `openssl rand -base64 48`                  |
| `WEB_URL`                    | `https://...`; vai nos links dos e-mails                                                         |
| `SMTP_HOST`                  | Obrigatório: sem e-mail, ninguém confirma a conta                                                |
| `SMTP_USUARIO`, `SMTP_SENHA` | Juntos, quando o provedor exige autenticação (quase sempre)                                      |
| `SMTP_PORT`, `SMTP_SEGURO`   | 587 com `SMTP_SEGURO=false` (STARTTLS) ou 465 com `SMTP_SEGURO=true`                             |
| `ARMAZENAMENTO`              | `s3` recomendado. Com `disco`, a pasta `ARMAZENAMENTO_DIR` precisa entrar no backup              |
| `S3_BUCKET`, `S3_REGIAO`     | Bucket dos anexos. `S3_ENDPOINT` só para compatíveis (MinIO); `S3_ACESSO`/`S3_SEGREDO` opcionais |
| `CONFIAR_PROXY`              | Quantos proxies confiar para o IP do cliente. Padrão `loopback` (nginx no mesmo servidor)        |
| `EMAIL_REMETENTE`            | Endereço de um domínio com SPF e DKIM configurados no provedor de e-mail                         |
| `DATABASE_URL`               | Usuário próprio da aplicação, sem superusuário; `?sslmode=require` em banco fora do servidor     |

O modelo completo está no [.env.example](../.env.example).

## Implantação

```bash
git pull
npm ci
npx prisma migrate deploy          # aplica as migrations pendentes (nunca use migrate dev aqui)
npm run build                      # gera dist/apps/api e dist/apps/web
NODE_ENV=production node dist/apps/api/main.js
```

Rode a API com um supervisor que reinicia em caso de falha (systemd, por exemplo). Ela trata o
`SIGTERM`: termina as requisições e a tarefa da fila em andamento antes de sair.

```ini
# /etc/systemd/system/crista-api.service
[Service]
WorkingDirectory=/srv/crista
EnvironmentFile=/srv/crista/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/apps/api/main.js
Restart=always
User=crista
```

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name crista.exemplo.com.br;
  # certificado: certbot --nginx

  root /srv/crista/dist/apps/web/browser;
  client_max_body_size 11m;              # anexos de até 10 MB (RNF08)

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Arquivos com hash no nome podem ficar em cache por muito tempo.
  location ~* \.(js|css)$ { expires 1y; add_header Cache-Control "public, immutable"; }

  # Rotas do Angular: qualquer caminho que não é arquivo abre o index.html.
  location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-cache"; }
}

server { listen 80; server_name crista.exemplo.com.br; return 301 https://$host$request_uri; }
```

## Segurança já embutida na API

- Cabeçalhos de segurança (`helmet`).
- Limite de requisições por IP: 300 por minuto no geral e **10 por minuto** nas rotas públicas
  de conta (login, cadastro, confirmação de e-mail, consulta de convite). Acima disso, a
  resposta é 429.
- Anexos no S3 gravados com criptografia (`AES256`) e sem sobrescrever um anexo existente.

## Anexos no S3

1. Crie o bucket na região `sa-east-1` (São Paulo), com **acesso público bloqueado** e
   **versionamento ativado** (é o backup dos anexos).
2. Crie um usuário ou papel com acesso só a esse bucket:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject"],
         "Resource": "arn:aws:s3:::crista-anexos/*"
       },
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::crista-anexos"
       }
     ]
   }
   ```

3. Use `ARMAZENAMENTO=s3` e `S3_BUCKET=crista-anexos`. A API confere o acesso ao bucket ao subir.

Para levar os anexos que já estão no disco, copie a pasta mantendo os caminhos, que são as
chaves: `aws s3 sync ./armazenamento s3://crista-anexos/`.

## Backup

`npm run backup` (ou `scripts/backup.sh`) gera um `pg_dump` em formato custom, confere se o
arquivo pode ser lido e, com `ARMAZENAMENTO=disco`, compacta a pasta de anexos. Os arquivos
ficam em `BACKUP_DIR` (padrão `./backups`) por `BACKUP_RETER_DIAS` dias (padrão 14).

- Agende diariamente no cron do servidor (exemplo no início do script).
- **Copie os backups para fora do servidor** (outro bucket, outra região). Backup no mesmo disco
  não protege contra a perda do servidor.
- A versão do `pg_dump` precisa ser igual ou maior que a do PostgreSQL (18).

### Restauração (teste uma vez por mês)

```bash
createdb crista_restauro
pg_restore --no-owner --dbname=crista_restauro backups/crista-AAAAMMDD-HHMMSS.dump
```

Os gatilhos de "só inserção" voltam junto com o banco. Para restaurar por cima do banco de
produção, pare a API, renomeie o banco atual (não apague) e restaure num banco novo com o nome
original.

## Lista de conferência antes de abrir para os produtores

- [ ] `NODE_ENV=production` e a API subindo sem erro de variável.
- [ ] HTTPS com renovação automática do certificado.
- [ ] E-mail de confirmação chegando na caixa de entrada (não no spam): SPF e DKIM do remetente.
- [ ] Bucket S3 privado e com versionamento.
- [ ] Backup diário agendado, copiado para fora do servidor e **uma restauração testada**.
- [ ] Curva de referência oficial das linhagens no lugar da sintética (doc 06).
- [ ] Limites de alerta revisados pelo veterinário (doc 06).
- [ ] Termos de uso e política de privacidade publicados (`TERMOS_VERSAO`), LGPD.
