-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "alertas";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "fila";

-- CreateEnum
CREATE TYPE "alertas"."IndicadorAlerta" AS ENUM ('mortalidade_dia', 'desvio_peso', 'uniformidade', 'temperatura', 'umidade', 'amonia', 'energia', 'equipamento_parado', 'falta_sinal');

-- CreateEnum
CREATE TYPE "alertas"."Criticidade" AS ENUM ('atencao', 'critico');

-- CreateEnum
CREATE TYPE "alertas"."StatusAlerta" AS ENUM ('aberto', 'fechado');

-- CreateEnum
CREATE TYPE "alertas"."CanalNotificacao" AS ENUM ('email', 'push', 'sms');

-- CreateEnum
CREATE TYPE "alertas"."StatusEnvio" AS ENUM ('pendente', 'enviada', 'falhou');

-- CreateEnum
CREATE TYPE "fila"."StatusTarefa" AS ENUM ('pendente', 'processando', 'concluida', 'falhou');

-- CreateTable
CREATE TABLE "producao"."saida_carga" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_lote" UUID NOT NULL,
    "data" DATE NOT NULL,
    "aves" INTEGER NOT NULL,
    "peso_total_kg" DECIMAL(12,3) NOT NULL,
    "preco_kg" DECIMAL(10,4),
    "destino" TEXT,
    "numero_gta" TEXT,
    "status" "producao"."StatusEvento" NOT NULL DEFAULT 'valido',
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID NOT NULL,

    CONSTRAINT "saida_carga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producao"."encerramento_lote" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_lote" UUID NOT NULL,
    "data_encerramento" DATE NOT NULL,
    "parcial" BOOLEAN NOT NULL,
    "pendencias" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "encerrado_por" UUID NOT NULL,
    "encerrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encerramento_lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas"."regra_alerta" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "indicador" "alertas"."IndicadorAlerta" NOT NULL,
    "limite_atencao" DECIMAL(10,4) NOT NULL,
    "limite_critico" DECIMAL(10,4) NOT NULL,
    "atualizado_por" UUID NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regra_alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas"."alerta" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_lote" UUID,
    "id_galpao" UUID,
    "indicador" "alertas"."IndicadorAlerta" NOT NULL,
    "criticidade" "alertas"."Criticidade" NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "limite" DECIMAL(12,4) NOT NULL,
    "limite_padrao" BOOLEAN NOT NULL,
    "data_referencia" DATE NOT NULL,
    "mensagem" TEXT NOT NULL,
    "status" "alertas"."StatusAlerta" NOT NULL DEFAULT 'aberto',
    "aberto_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechado_em" TIMESTAMP(3),
    "fechado_por" UUID,
    "providencia" TEXT,

    CONSTRAINT "alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas"."notificacao" (
    "id" UUID NOT NULL,
    "id_alerta" UUID NOT NULL,
    "id_usuario" UUID NOT NULL,
    "canal" "alertas"."CanalNotificacao" NOT NULL,
    "status" "alertas"."StatusEnvio" NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "enviado_em" TIMESTAMP(3),
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fila"."tarefa" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "fila"."StatusTarefa" NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "disponivel_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida_em" TIMESTAMP(3),

    CONSTRAINT "tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saida_carga_id_lote_data_idx" ON "producao"."saida_carga"("id_lote", "data");

-- CreateIndex
CREATE UNIQUE INDEX "encerramento_lote_id_lote_key" ON "producao"."encerramento_lote"("id_lote");

-- CreateIndex
CREATE UNIQUE INDEX "regra_alerta_id_fazenda_indicador_key" ON "alertas"."regra_alerta"("id_fazenda", "indicador");

-- CreateIndex
CREATE INDEX "alerta_id_fazenda_status_idx" ON "alertas"."alerta"("id_fazenda", "status");

-- CreateIndex
CREATE INDEX "notificacao_id_alerta_idx" ON "alertas"."notificacao"("id_alerta");

-- CreateIndex
CREATE INDEX "tarefa_status_disponivel_em_idx" ON "fila"."tarefa"("status", "disponivel_em");

-- AddForeignKey
ALTER TABLE "producao"."saida_carga" ADD CONSTRAINT "saida_carga_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "producao"."lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producao"."encerramento_lote" ADD CONSTRAINT "encerramento_lote_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "producao"."lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas"."notificacao" ADD CONSTRAINT "notificacao_id_alerta_fkey" FOREIGN KEY ("id_alerta") REFERENCES "alertas"."alerta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (escritas à mão)

-- Um alerta aberto por lote e indicador (UC16): um novo desvio atualiza o aberto
CREATE UNIQUE INDEX "alerta_lote_indicador_aberto_key"
  ON "alertas"."alerta" ("id_lote", "indicador")
  WHERE "status" = 'aberto';

-- Cargas são eventos; o encerramento é definitivo
CREATE TRIGGER "saida_carga_somente_insercao" BEFORE UPDATE OR DELETE ON "producao"."saida_carga"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
CREATE TRIGGER "encerramento_lote_somente_insercao" BEFORE UPDATE OR DELETE ON "producao"."encerramento_lote"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
