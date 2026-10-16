-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "arquivo";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "producao";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sanidade";

-- CreateEnum
CREATE TYPE "producao"."Linhagem" AS ENUM ('cobb500', 'ross308', 'hubbard', 'outra');

-- CreateEnum
CREATE TYPE "producao"."Sexagem" AS ENUM ('misto', 'macho', 'femea');

-- CreateEnum
CREATE TYPE "producao"."SituacaoLote" AS ENUM ('em_andamento', 'encerrado', 'cancelado');

-- CreateEnum
CREATE TYPE "producao"."StatusEvento" AS ENUM ('valido', 'pendente_revisao');

-- CreateEnum
CREATE TYPE "producao"."TipoMovimentoRacao" AS ENUM ('entrada', 'estoque_restante');

-- CreateEnum
CREATE TYPE "sanidade"."TipoOcorrencia" AS ENUM ('doenca', 'vacinacao', 'medicacao', 'anomalia', 'inspecao');

-- CreateEnum
CREATE TYPE "sanidade"."ViaAplicacao" AS ENUM ('agua', 'racao', 'spray', 'ocular', 'injetavel', 'outra');

-- CreateTable
CREATE TABLE "producao"."lote" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_galpao" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "linhagem" "producao"."Linhagem" NOT NULL,
    "sexagem" "producao"."Sexagem" NOT NULL DEFAULT 'misto',
    "origem" TEXT,
    "data_alojamento" DATE NOT NULL,
    "idade_inicial_dias" INTEGER NOT NULL DEFAULT 0,
    "peso_pinto_g" DECIMAL(6,2),
    "custo_pinto" DECIMAL(10,4),
    "quantidade_prevista" INTEGER NOT NULL,
    "situacao" "producao"."SituacaoLote" NOT NULL DEFAULT 'em_andamento',
    "confirmou_densidade_por" UUID,
    "criado_por" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producao"."alojamento" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_lote" UUID NOT NULL,
    "data" DATE NOT NULL,
    "aves_recebidas" INTEGER NOT NULL,
    "mortas_transporte" INTEGER NOT NULL DEFAULT 0,
    "justificativa_divergencia" TEXT,
    "confirmou_densidade_por" UUID,
    "criado_por" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alojamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producao"."evento_baixa" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_lote" UUID NOT NULL,
    "data" DATE NOT NULL,
    "mortes" INTEGER NOT NULL,
    "descartes" INTEGER NOT NULL DEFAULT 0,
    "causa_provavel" TEXT,
    "status" "producao"."StatusEvento" NOT NULL DEFAULT 'valido',
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID NOT NULL,

    CONSTRAINT "evento_baixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producao"."pesagem" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_lote" UUID NOT NULL,
    "data" DATE NOT NULL,
    "aves_pesadas" INTEGER NOT NULL,
    "peso_total_g" DECIMAL(12,2) NOT NULL,
    "ponto_coleta" TEXT,
    "revisao_confirmada" BOOLEAN NOT NULL DEFAULT false,
    "status" "producao"."StatusEvento" NOT NULL DEFAULT 'valido',
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID NOT NULL,

    CONSTRAINT "pesagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producao"."pesagem_individual" (
    "id" UUID NOT NULL,
    "id_pesagem" UUID NOT NULL,
    "peso_g" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "pesagem_individual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producao"."movimento_racao" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_lote" UUID NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "producao"."TipoMovimentoRacao" NOT NULL,
    "quantidade_kg" DECIMAL(12,3) NOT NULL,
    "fornecedor" TEXT,
    "nota_fiscal" TEXT,
    "status" "producao"."StatusEvento" NOT NULL DEFAULT 'valido',
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID NOT NULL,

    CONSTRAINT "movimento_racao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producao"."estorno" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "entidade" TEXT NOT NULL,
    "id_evento" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "criado_por" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estorno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanidade"."ocorrencia_sanitaria" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_lote" UUID NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "sanidade"."TipoOcorrencia" NOT NULL,
    "descricao" TEXT NOT NULL,
    "produto" TEXT,
    "dose" TEXT,
    "via" "sanidade"."ViaAplicacao",
    "lote_produto" TEXT,
    "carencia_dias" INTEGER,
    "status" "producao"."StatusEvento" NOT NULL DEFAULT 'valido',
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID NOT NULL,

    CONSTRAINT "ocorrencia_sanitaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo"."anexo" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "entidade" TEXT NOT NULL,
    "id_entidade" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "criado_por" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lote_id_galpao_idx" ON "producao"."lote"("id_galpao");

-- CreateIndex
CREATE UNIQUE INDEX "lote_id_fazenda_codigo_key" ON "producao"."lote"("id_fazenda", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "alojamento_id_lote_key" ON "producao"."alojamento"("id_lote");

-- CreateIndex
CREATE INDEX "evento_baixa_id_lote_data_idx" ON "producao"."evento_baixa"("id_lote", "data");

-- CreateIndex
CREATE INDEX "pesagem_id_lote_data_idx" ON "producao"."pesagem"("id_lote", "data");

-- CreateIndex
CREATE INDEX "pesagem_individual_id_pesagem_idx" ON "producao"."pesagem_individual"("id_pesagem");

-- CreateIndex
CREATE INDEX "movimento_racao_id_lote_data_idx" ON "producao"."movimento_racao"("id_lote", "data");

-- CreateIndex
CREATE UNIQUE INDEX "estorno_id_evento_key" ON "producao"."estorno"("id_evento");

-- CreateIndex
CREATE INDEX "ocorrencia_sanitaria_id_lote_data_idx" ON "sanidade"."ocorrencia_sanitaria"("id_lote", "data");

-- CreateIndex
CREATE UNIQUE INDEX "anexo_chave_key" ON "arquivo"."anexo"("chave");

-- CreateIndex
CREATE INDEX "anexo_entidade_id_entidade_idx" ON "arquivo"."anexo"("entidade", "id_entidade");

-- AddForeignKey
ALTER TABLE "producao"."lote" ADD CONSTRAINT "lote_id_fazenda_fkey" FOREIGN KEY ("id_fazenda") REFERENCES "fazenda"."fazenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producao"."lote" ADD CONSTRAINT "lote_id_galpao_fkey" FOREIGN KEY ("id_galpao") REFERENCES "fazenda"."galpao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producao"."alojamento" ADD CONSTRAINT "alojamento_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "producao"."lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producao"."evento_baixa" ADD CONSTRAINT "evento_baixa_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "producao"."lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producao"."pesagem" ADD CONSTRAINT "pesagem_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "producao"."lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producao"."pesagem_individual" ADD CONSTRAINT "pesagem_individual_id_pesagem_fkey" FOREIGN KEY ("id_pesagem") REFERENCES "producao"."pesagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producao"."movimento_racao" ADD CONSTRAINT "movimento_racao_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "producao"."lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanidade"."ocorrencia_sanitaria" ADD CONSTRAINT "ocorrencia_sanitaria_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "producao"."lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (escritas à mão)

-- Um lote em andamento por galpão (UC05)
CREATE UNIQUE INDEX "lote_galpao_em_andamento_key"
  ON "producao"."lote" ("id_galpao")
  WHERE "situacao" = 'em_andamento';

-- Eventos do ciclo só aceitam inserção; a correção é um estorno (docs/05-sincronizacao.md)
CREATE FUNCTION "producao"."somente_insercao"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% só aceita inserção; use um estorno para corrigir', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evento_baixa_somente_insercao" BEFORE UPDATE OR DELETE ON "producao"."evento_baixa"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
CREATE TRIGGER "pesagem_somente_insercao" BEFORE UPDATE OR DELETE ON "producao"."pesagem"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
CREATE TRIGGER "pesagem_individual_somente_insercao" BEFORE UPDATE OR DELETE ON "producao"."pesagem_individual"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
CREATE TRIGGER "movimento_racao_somente_insercao" BEFORE UPDATE OR DELETE ON "producao"."movimento_racao"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
CREATE TRIGGER "estorno_somente_insercao" BEFORE UPDATE OR DELETE ON "producao"."estorno"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
CREATE TRIGGER "ocorrencia_sanitaria_somente_insercao" BEFORE UPDATE OR DELETE ON "sanidade"."ocorrencia_sanitaria"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
