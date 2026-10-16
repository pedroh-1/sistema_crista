-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "custos";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "referencia";

-- CreateEnum
CREATE TYPE "custos"."CategoriaDespesa" AS ENUM ('racao', 'medicamentos', 'energia', 'gas', 'mao_de_obra', 'cama', 'manutencao', 'transporte', 'outros');

-- CreateEnum
CREATE TYPE "custos"."CriterioRateio" AS ENUM ('aves_alojadas', 'consumo_racao', 'percentual');

-- CreateEnum
CREATE TYPE "custos"."OrigemDespesa" AS ENUM ('manual', 'racao', 'manutencao');

-- AlterTable
ALTER TABLE "producao"."lote" ADD COLUMN     "preco_referencia_kg" DECIMAL(10,4);

-- AlterTable
ALTER TABLE "producao"."movimento_racao" ADD COLUMN     "id_despesa" UUID;

-- CreateTable
CREATE TABLE "custos"."despesa" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "data" DATE NOT NULL,
    "categoria" "custos"."CategoriaDespesa" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "fornecedor" TEXT,
    "numero_nota" TEXT,
    "criterio_rateio" "custos"."CriterioRateio",
    "origem" "custos"."OrigemDespesa" NOT NULL DEFAULT 'manual',
    "duplicidade_confirmada" BOOLEAN NOT NULL DEFAULT false,
    "status" "producao"."StatusEvento" NOT NULL DEFAULT 'valido',
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID NOT NULL,

    CONSTRAINT "despesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custos"."despesa_rateio" (
    "id" UUID NOT NULL,
    "id_despesa" UUID NOT NULL,
    "id_lote" UUID NOT NULL,
    "percentual" DECIMAL(7,4) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "despesa_rateio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referencia"."curva_referencia" (
    "id" UUID NOT NULL,
    "linhagem" "producao"."Linhagem" NOT NULL,
    "sexo" "producao"."Sexagem" NOT NULL,
    "idade_dias" INTEGER NOT NULL,
    "peso_g" DECIMAL(8,2) NOT NULL,
    "consumo_acum_g" DECIMAL(10,2),
    "mortalidade_dia_pct" DECIMAL(6,4),
    "fonte" TEXT NOT NULL,
    "versao" TEXT NOT NULL,

    CONSTRAINT "curva_referencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "despesa_id_fazenda_data_idx" ON "custos"."despesa"("id_fazenda", "data");

-- CreateIndex
CREATE INDEX "despesa_id_fazenda_numero_nota_idx" ON "custos"."despesa"("id_fazenda", "numero_nota");

-- CreateIndex
CREATE INDEX "despesa_rateio_id_lote_idx" ON "custos"."despesa_rateio"("id_lote");

-- CreateIndex
CREATE INDEX "despesa_rateio_id_despesa_idx" ON "custos"."despesa_rateio"("id_despesa");

-- CreateIndex
CREATE UNIQUE INDEX "curva_referencia_linhagem_sexo_idade_dias_versao_key" ON "referencia"."curva_referencia"("linhagem", "sexo", "idade_dias", "versao");

-- AddForeignKey
ALTER TABLE "custos"."despesa_rateio" ADD CONSTRAINT "despesa_rateio_id_despesa_fkey" FOREIGN KEY ("id_despesa") REFERENCES "custos"."despesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos"."despesa_rateio" ADD CONSTRAINT "despesa_rateio_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "producao"."lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras que o Prisma não expressa (escritas à mão)

-- Despesas são eventos: só aceitam inserção; a correção é um estorno
CREATE TRIGGER "despesa_somente_insercao" BEFORE UPDATE OR DELETE ON "custos"."despesa"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();
CREATE TRIGGER "despesa_rateio_somente_insercao" BEFORE UPDATE OR DELETE ON "custos"."despesa_rateio"
  FOR EACH ROW EXECUTE FUNCTION "producao"."somente_insercao"();

-- Curva SINTÉTICA para desenvolvimento (doc 06). Não são valores dos manuais das linhagens:
-- substituir pelas tabelas oficiais (nova versão) antes de usar com produtores.
INSERT INTO "referencia"."curva_referencia"
  ("id", "linhagem", "sexo", "idade_dias", "peso_g", "consumo_acum_g", "mortalidade_dia_pct", "fonte", "versao")
VALUES
  (gen_random_uuid(), 'cobb500', 'misto', 0, 42.00, 0.00, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 1, 61.71, 8.38, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 2, 81.43, 22.10, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 3, 101.14, 41.18, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 4, 120.86, 65.61, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 5, 140.57, 95.39, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 6, 160.29, 130.52, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 7, 180.00, 171.00, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 8, 220.00, 215.29, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 9, 260.00, 261.86, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 10, 300.00, 310.71, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 11, 340.00, 361.86, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 12, 380.00, 415.29, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 13, 420.00, 471.00, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 14, 460.00, 529.00, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 15, 522.86, 612.49, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 16, 585.71, 698.67, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 17, 648.57, 787.55, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 18, 711.43, 879.12, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 19, 774.29, 973.39, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 20, 837.14, 1070.35, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 21, 900.00, 1170.00, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 22, 978.57, 1288.92, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 23, 1057.14, 1410.53, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 24, 1135.71, 1534.84, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 25, 1214.29, 1661.84, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 26, 1292.86, 1791.53, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 27, 1371.43, 1923.92, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 28, 1450.00, 2059.00, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 29, 1535.71, 2204.85, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 30, 1621.43, 2353.39, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 31, 1707.14, 2504.62, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 32, 1792.86, 2658.55, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 33, 1878.57, 2815.17, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 34, 1964.29, 2974.49, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 35, 2050.00, 3136.50, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 36, 2135.71, 3304.26, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 37, 2221.43, 3474.95, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 38, 2307.14, 3648.58, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 39, 2392.86, 3825.15, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 40, 2478.57, 4004.66, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 41, 2564.29, 4187.11, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 42, 2650.00, 4372.50, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 43, 2728.57, 4552.82, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 44, 2807.14, 4736.05, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 45, 2885.71, 4922.20, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 46, 2964.29, 5111.28, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 47, 3042.86, 5303.27, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 48, 3121.43, 5498.17, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 49, 3200.00, 5696.00, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 50, 3271.43, 5879.22, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 51, 3342.86, 6064.90, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 52, 3414.29, 6253.02, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 53, 3485.71, 6443.59, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 54, 3557.14, 6636.61, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 55, 3628.57, 6832.08, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'cobb500', 'misto', 56, 3700.00, 7030.00, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 0, 42.00, 0.00, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 1, 62.33, 8.46, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 2, 82.24, 22.32, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 3, 102.15, 41.59, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 4, 122.07, 66.26, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 5, 141.98, 96.34, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 6, 161.89, 131.82, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 7, 181.80, 172.71, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 8, 222.20, 217.44, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 9, 262.60, 264.48, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 10, 303.00, 313.82, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 11, 343.40, 365.48, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 12, 383.80, 419.44, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 13, 424.20, 475.71, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 14, 464.60, 534.29, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 15, 528.09, 618.61, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 16, 591.57, 705.66, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 17, 655.06, 795.43, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 18, 718.54, 887.91, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 19, 782.03, 983.12, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 20, 845.51, 1081.05, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 21, 909.00, 1181.70, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 22, 988.36, 1301.81, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 23, 1067.71, 1424.64, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 24, 1147.07, 1550.19, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 25, 1226.43, 1678.46, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 26, 1305.79, 1809.45, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 27, 1385.14, 1943.16, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 28, 1464.50, 2079.59, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 29, 1551.07, 2226.90, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 30, 1637.64, 2376.92, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 31, 1724.21, 2529.67, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 32, 1810.79, 2685.14, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 33, 1897.36, 2843.33, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 34, 1983.93, 3004.23, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 35, 2070.50, 3167.87, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 36, 2157.07, 3337.30, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 37, 2243.64, 3509.70, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 38, 2330.21, 3685.07, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 39, 2416.79, 3863.40, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 40, 2503.36, 4044.71, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 41, 2589.93, 4228.98, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 42, 2676.50, 4416.22, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 43, 2755.86, 4598.34, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 44, 2835.21, 4783.41, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 45, 2914.57, 4971.43, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 46, 2993.93, 5162.39, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 47, 3073.29, 5356.30, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 48, 3152.64, 5553.16, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 49, 3232.00, 5752.96, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 50, 3304.14, 5938.02, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 51, 3376.29, 6125.55, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 52, 3448.43, 6315.55, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 53, 3520.57, 6508.03, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 54, 3592.71, 6702.98, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 55, 3664.86, 6900.40, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'ross308', 'misto', 56, 3737.00, 7100.30, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 0, 42.00, 0.00, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 1, 59.86, 8.12, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 2, 78.99, 21.44, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 3, 98.11, 39.94, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 4, 117.23, 63.64, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 5, 136.35, 92.53, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 6, 155.48, 126.60, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 7, 174.60, 165.87, 0.1500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 8, 213.40, 208.83, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 9, 252.20, 254.00, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 10, 291.00, 301.39, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 11, 329.80, 351.00, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 12, 368.60, 402.83, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 13, 407.40, 456.87, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 14, 446.20, 513.13, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 15, 507.17, 594.12, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 16, 568.14, 677.71, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 17, 629.11, 763.92, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 18, 690.09, 852.75, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 19, 751.06, 944.19, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 20, 812.03, 1038.24, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 21, 873.00, 1134.90, 0.0600, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 22, 949.21, 1250.25, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 23, 1025.43, 1368.21, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 24, 1101.64, 1488.79, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 25, 1177.86, 1611.98, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 26, 1254.07, 1737.78, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 27, 1330.29, 1866.20, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 28, 1406.50, 1997.23, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 29, 1489.64, 2138.70, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 30, 1572.79, 2282.79, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 31, 1655.93, 2429.48, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 32, 1739.07, 2578.79, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 33, 1822.21, 2730.72, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 34, 1905.36, 2885.26, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 35, 1988.50, 3042.41, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 36, 2071.64, 3205.13, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 37, 2154.79, 3370.70, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 38, 2237.93, 3539.12, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 39, 2321.07, 3710.40, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 40, 2404.21, 3884.52, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 41, 2487.36, 4061.50, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 42, 2570.50, 4241.32, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 43, 2646.71, 4416.23, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 44, 2722.93, 4593.97, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 45, 2799.14, 4774.54, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 46, 2875.36, 4957.94, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 47, 2951.57, 5144.17, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 48, 3027.79, 5333.23, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 49, 3104.00, 5525.12, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 50, 3173.29, 5702.85, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 51, 3242.57, 5882.95, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 52, 3311.86, 6065.43, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 53, 3381.14, 6250.28, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 54, 3450.43, 6437.51, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 55, 3519.71, 6627.12, 0.0500, 'sintetico', 'teste-1'),
  (gen_random_uuid(), 'hubbard', 'misto', 56, 3589.00, 6819.10, 0.0500, 'sintetico', 'teste-1');
