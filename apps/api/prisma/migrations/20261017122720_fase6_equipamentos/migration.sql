-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "equipamentos";

-- CreateEnum
CREATE TYPE "equipamentos"."TipoEquipamento" AS ENUM ('comedouro', 'bebedouro', 'ventilacao', 'aquecimento', 'nebulizacao', 'iluminacao', 'gerador', 'outro');

-- CreateEnum
CREATE TYPE "equipamentos"."SituacaoEquipamento" AS ENUM ('ativo', 'inativo');

-- CreateEnum
CREATE TYPE "equipamentos"."TipoManutencao" AS ENUM ('preventiva', 'corretiva');

-- AlterTable
ALTER TABLE "alertas"."alerta" ADD COLUMN     "id_equipamento" UUID;

-- AlterTable
ALTER TABLE "custos"."despesa" ADD COLUMN     "id_manutencao" UUID;

-- CreateTable
CREATE TABLE "equipamentos"."equipamento" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_galpao" UUID,
    "nome" TEXT NOT NULL,
    "tipo" "equipamentos"."TipoEquipamento" NOT NULL,
    "numero_serie" TEXT,
    "fabricante" TEXT,
    "modelo" TEXT,
    "critico" BOOLEAN NOT NULL DEFAULT false,
    "periodicidade_dias" INTEGER,
    "data_aquisicao" DATE,
    "situacao" "equipamentos"."SituacaoEquipamento" NOT NULL DEFAULT 'ativo',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipamentos"."manutencao_equipamento" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_equipamento" UUID NOT NULL,
    "tipo" "equipamentos"."TipoManutencao" NOT NULL,
    "data" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "custo_pecas" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "custo_mao_obra" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fornecedor" TEXT,
    "ordem_servico" TEXT,
    "parada_inicio" TIMESTAMP(3),
    "retorno_operacao" TIMESTAMP(3),
    "retorno_por" UUID,
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID NOT NULL,

    CONSTRAINT "manutencao_equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipamento_id_fazenda_idx" ON "equipamentos"."equipamento"("id_fazenda");

-- CreateIndex
CREATE UNIQUE INDEX "equipamento_id_fazenda_numero_serie_key" ON "equipamentos"."equipamento"("id_fazenda", "numero_serie");

-- CreateIndex
CREATE INDEX "manutencao_equipamento_id_equipamento_data_idx" ON "equipamentos"."manutencao_equipamento"("id_equipamento", "data");

-- CreateIndex
CREATE INDEX "despesa_id_manutencao_idx" ON "custos"."despesa"("id_manutencao");

-- AddForeignKey
ALTER TABLE "equipamentos"."equipamento" ADD CONSTRAINT "equipamento_id_galpao_fkey" FOREIGN KEY ("id_galpao") REFERENCES "fazenda"."galpao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos"."manutencao_equipamento" ADD CONSTRAINT "manutencao_equipamento_id_equipamento_fkey" FOREIGN KEY ("id_equipamento") REFERENCES "equipamentos"."equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (escritas à mão)

-- Um alerta aberto por equipamento e indicador (equipamento parado)
CREATE UNIQUE INDEX "alerta_equipamento_indicador_aberto_key"
  ON "alertas"."alerta" ("id_equipamento", "indicador")
  WHERE "status" = 'aberto';

-- Manutenção é evento: a única alteração aceita é registrar, uma vez, o retorno
-- à operação de uma parada aberta. O resto se corrige por estorno.
CREATE FUNCTION "equipamentos"."manutencao_so_retorno"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."retorno_operacao" IS NULL
     AND OLD."parada_inicio" IS NOT NULL
     AND NEW."retorno_operacao" IS NOT NULL
     AND (to_jsonb(NEW) - 'retorno_operacao' - 'retorno_por')
         = (to_jsonb(OLD) - 'retorno_operacao' - 'retorno_por') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% só aceita inserção e o registro do retorno; use um estorno para corrigir', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "manutencao_somente_insercao" BEFORE UPDATE OR DELETE ON "equipamentos"."manutencao_equipamento"
  FOR EACH ROW EXECUTE FUNCTION "equipamentos"."manutencao_so_retorno"();
