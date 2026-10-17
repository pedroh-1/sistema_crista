#!/usr/bin/env bash
# Backup do CRISTA: banco (pg_dump, formato custom) e, com ARMAZENAMENTO=disco,
# a pasta de anexos. Com S3, os anexos ficam no bucket (ative o versionamento).
#
# Uso: scripts/backup.sh            (lê o .env da raiz, se existir)
# Variáveis: DATABASE_URL, ARMAZENAMENTO, ARMAZENAMENTO_DIR,
#            BACKUP_DIR (padrão ./backups), BACKUP_RETER_DIAS (padrão 14).
# Agende no cron do servidor, por exemplo às 3h:
#   0 3 * * * cd /srv/crista && scripts/backup.sh >> /var/log/crista-backup.log 2>&1
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
# Lê o .env sem executá-lo (os valores podem ter <, espaço etc.). O que já
# estiver no ambiente tem precedência, como na API.
if [[ -f "$raiz/.env" ]]; then
  while IFS='=' read -r chave valor; do
    [[ "$chave" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    [[ -n "${!chave:-}" ]] || export "$chave=$valor"
  done < "$raiz/.env"
fi

: "${DATABASE_URL:?DATABASE_URL não definida}"
destino="${BACKUP_DIR:-$raiz/backups}"
reter_dias="${BACKUP_RETER_DIAS:-14}"
carimbo="$(date +%Y%m%d-%H%M%S)"
umask 077
mkdir -p "$destino"
chmod 700 "$destino"

banco="$destino/crista-$carimbo.dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$banco"
# Um backup que não se lê não é backup: confere o índice do arquivo.
pg_restore --list "$banco" > /dev/null
echo "Banco: $banco ($(du -h "$banco" | cut -f1))"

if [[ "${ARMAZENAMENTO:-disco}" == "disco" ]]; then
  pasta="${ARMAZENAMENTO_DIR:-./armazenamento}"
  [[ "$pasta" = /* ]] || pasta="$raiz/$pasta"
  if [[ -d "$pasta" ]]; then
    anexos="$destino/anexos-$carimbo.tar.gz"
    tar -czf "$anexos" -C "$pasta" .
    echo "Anexos: $anexos ($(du -h "$anexos" | cut -f1))"
  fi
fi

# Retenção: apaga os backups mais antigos que BACKUP_RETER_DIAS.
find "$destino" -maxdepth 1 -type f \
  \( -name 'crista-*.dump' -o -name 'anexos-*.tar.gz' \) \
  -mtime +"$reter_dias" -delete
