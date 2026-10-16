-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auditoria";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "conta";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "fazenda";

-- CreateEnum
CREATE TYPE "conta"."StatusUsuario" AS ENUM ('pendente', 'ativo');

-- CreateEnum
CREATE TYPE "conta"."TipoToken" AS ENUM ('email', 'senha');

-- CreateEnum
CREATE TYPE "fazenda"."TipoCriacao" AS ENUM ('corte');

-- CreateEnum
CREATE TYPE "fazenda"."TipoGalpao" AS ENUM ('convencional', 'climatizado', 'dark_house');

-- CreateEnum
CREATE TYPE "fazenda"."SituacaoGalpao" AS ENUM ('disponivel', 'ocupado', 'inativo');

-- CreateEnum
CREATE TYPE "fazenda"."Perfil" AS ENUM ('gestor', 'produtor', 'veterinario', 'operador', 'consulta');

-- CreateEnum
CREATE TYPE "fazenda"."StatusVinculo" AS ENUM ('pendente', 'ativo', 'expirado', 'revogado');

-- CreateEnum
CREATE TYPE "auditoria"."OrigemEvento" AS ENUM ('web', 'app', 'sistema');

-- CreateTable
CREATE TABLE "conta"."usuario" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "cpf" TEXT,
    "senha_hash" TEXT NOT NULL,
    "status" "conta"."StatusUsuario" NOT NULL DEFAULT 'pendente',
    "email_verificado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conta"."aceite_termos" (
    "id" UUID NOT NULL,
    "id_usuario" UUID NOT NULL,
    "versao_termos" TEXT NOT NULL,
    "aceito_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "aceite_termos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conta"."token_verificacao" (
    "id" UUID NOT NULL,
    "id_usuario" UUID NOT NULL,
    "tipo" "conta"."TipoToken" NOT NULL,
    "hash_token" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),

    CONSTRAINT "token_verificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fazenda"."fazenda" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "logradouro" TEXT,
    "municipio" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "integradora" TEXT,
    "tipo_criacao" "fazenda"."TipoCriacao" NOT NULL DEFAULT 'corte',
    "criado_por" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fazenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fazenda"."galpao" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "identificacao" TEXT NOT NULL,
    "area_util_m2" DECIMAL(10,2) NOT NULL,
    "capacidade_aves" INTEGER NOT NULL,
    "tipo" "fazenda"."TipoGalpao" NOT NULL,
    "situacao" "fazenda"."SituacaoGalpao" NOT NULL DEFAULT 'disponivel',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "galpao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fazenda"."vinculo_usuario_fazenda" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID NOT NULL,
    "id_usuario" UUID,
    "email_convidado" TEXT NOT NULL,
    "perfil" "fazenda"."Perfil" NOT NULL,
    "crmv" TEXT,
    "valido_ate" DATE,
    "status" "fazenda"."StatusVinculo" NOT NULL DEFAULT 'pendente',
    "hash_token_convite" TEXT,
    "convite_expira_em" TIMESTAMP(3),
    "convidado_por" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aceito_em" TIMESTAMP(3),
    "revogado_em" TIMESTAMP(3),

    CONSTRAINT "vinculo_usuario_fazenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fazenda"."vinculo_galpao" (
    "id_vinculo" UUID NOT NULL,
    "id_galpao" UUID NOT NULL,

    CONSTRAINT "vinculo_galpao_pkey" PRIMARY KEY ("id_vinculo","id_galpao")
);

-- CreateTable
CREATE TABLE "auditoria"."evento_auditoria" (
    "id" UUID NOT NULL,
    "id_fazenda" UUID,
    "id_usuario" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "id_entidade" UUID NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "origem" "auditoria"."OrigemEvento" NOT NULL DEFAULT 'web',
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "conta"."usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_cpf_key" ON "conta"."usuario"("cpf");

-- CreateIndex
CREATE INDEX "aceite_termos_id_usuario_idx" ON "conta"."aceite_termos"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "token_verificacao_hash_token_key" ON "conta"."token_verificacao"("hash_token");

-- CreateIndex
CREATE INDEX "token_verificacao_id_usuario_idx" ON "conta"."token_verificacao"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "fazenda_documento_key" ON "fazenda"."fazenda"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "galpao_id_fazenda_identificacao_key" ON "fazenda"."galpao"("id_fazenda", "identificacao");

-- CreateIndex
CREATE UNIQUE INDEX "vinculo_usuario_fazenda_hash_token_convite_key" ON "fazenda"."vinculo_usuario_fazenda"("hash_token_convite");

-- CreateIndex
CREATE INDEX "vinculo_usuario_fazenda_id_fazenda_idx" ON "fazenda"."vinculo_usuario_fazenda"("id_fazenda");

-- CreateIndex
CREATE INDEX "vinculo_usuario_fazenda_id_usuario_idx" ON "fazenda"."vinculo_usuario_fazenda"("id_usuario");

-- CreateIndex
CREATE INDEX "evento_auditoria_id_fazenda_registrado_em_idx" ON "auditoria"."evento_auditoria"("id_fazenda", "registrado_em");

-- CreateIndex
CREATE INDEX "evento_auditoria_entidade_id_entidade_idx" ON "auditoria"."evento_auditoria"("entidade", "id_entidade");

-- AddForeignKey
ALTER TABLE "conta"."aceite_termos" ADD CONSTRAINT "aceite_termos_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "conta"."usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta"."token_verificacao" ADD CONSTRAINT "token_verificacao_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "conta"."usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazenda"."galpao" ADD CONSTRAINT "galpao_id_fazenda_fkey" FOREIGN KEY ("id_fazenda") REFERENCES "fazenda"."fazenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazenda"."vinculo_usuario_fazenda" ADD CONSTRAINT "vinculo_usuario_fazenda_id_fazenda_fkey" FOREIGN KEY ("id_fazenda") REFERENCES "fazenda"."fazenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazenda"."vinculo_usuario_fazenda" ADD CONSTRAINT "vinculo_usuario_fazenda_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "conta"."usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazenda"."vinculo_galpao" ADD CONSTRAINT "vinculo_galpao_id_vinculo_fkey" FOREIGN KEY ("id_vinculo") REFERENCES "fazenda"."vinculo_usuario_fazenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazenda"."vinculo_galpao" ADD CONSTRAINT "vinculo_galpao_id_galpao_fkey" FOREIGN KEY ("id_galpao") REFERENCES "fazenda"."galpao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (escritas à mão)

-- Um vínculo pendente ou ativo por e-mail em cada fazenda (UC04)
CREATE UNIQUE INDEX "vinculo_fazenda_email_aberto_key"
  ON "fazenda"."vinculo_usuario_fazenda" ("id_fazenda", "email_convidado")
  WHERE "status" IN ('pendente', 'ativo');

-- A auditoria só aceita inserção (docs/05-sincronizacao.md)
CREATE FUNCTION "auditoria"."bloquear_alteracao"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'evento_auditoria só aceita inserção';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evento_auditoria_somente_insercao"
  BEFORE UPDATE OR DELETE ON "auditoria"."evento_auditoria"
  FOR EACH ROW EXECUTE FUNCTION "auditoria"."bloquear_alteracao"();
