-- CreateTable
CREATE TABLE "custos"."visao_salva" (
    "id" UUID NOT NULL,
    "id_usuario" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "filtros" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visao_salva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visao_salva_id_usuario_id_fazenda_nome_key" ON "custos"."visao_salva"("id_usuario", "id_fazenda", "nome");
