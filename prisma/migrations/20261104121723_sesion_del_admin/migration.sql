-- Entrar al panel de administracion: un codigo de un solo uso
-- (entrada_admin) que se canjea por una sesion del equipo (sesion_admin).
-- Mismo mecanismo que la vinculacion de tablets, con una diferencia: la
-- sesion del admin vence a los 7 dias sin usarse (DIAS_DE_SESION_DE_ADMIN).
--
-- Para revertir: DROP TABLE "sesion_admin"; DROP TABLE "entrada_admin";

-- CreateTable
CREATE TABLE "entrada_admin" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "expira_el" TIMESTAMPTZ(3) NOT NULL,
    "usado_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrada_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion_admin" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "entrada_id" UUID NOT NULL,
    "ultimo_acceso" TIMESTAMPTZ(3) NOT NULL,
    "revocada_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entrada_admin_codigo_key" ON "entrada_admin"("codigo");

-- CreateIndex
CREATE INDEX "entrada_admin_admin_id_creado_el_idx" ON "entrada_admin"("admin_id", "creado_el");

-- CreateIndex
CREATE UNIQUE INDEX "entrada_admin_id_admin_id_key" ON "entrada_admin"("id", "admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_admin_token_hash_key" ON "sesion_admin"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_admin_entrada_id_key" ON "sesion_admin"("entrada_id");

-- CreateIndex
CREATE INDEX "sesion_admin_admin_id_creado_el_idx" ON "sesion_admin"("admin_id", "creado_el");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_admin_entrada_id_admin_id_key" ON "sesion_admin"("entrada_id", "admin_id");

-- AddForeignKey
ALTER TABLE "entrada_admin" ADD CONSTRAINT "entrada_admin_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_plataforma"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sesion_admin" ADD CONSTRAINT "sesion_admin_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_plataforma"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sesion_admin" ADD CONSTRAINT "sesion_admin_entrada_mismo_admin_fkey" FOREIGN KEY ("entrada_id", "admin_id") REFERENCES "entrada_admin"("id", "admin_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Lo que Prisma no expresa (docs/garantias-de-la-base.md)
-- ---------------------------------------------------------------------------

ALTER TABLE "entrada_admin" ADD CONSTRAINT "entrada_admin_expira_posterior_chk"
  CHECK ("expira_el" > "creado_el");
ALTER TABLE "entrada_admin" ADD CONSTRAINT "entrada_admin_uso_antes_de_expirar_chk"
  CHECK ("usado_el" IS NULL OR ("usado_el" >= "creado_el" AND "usado_el" <= "expira_el"));
ALTER TABLE "sesion_admin" ADD CONSTRAINT "sesion_admin_revocada_posterior_chk"
  CHECK ("revocada_el" IS NULL OR "revocada_el" >= "creado_el");
