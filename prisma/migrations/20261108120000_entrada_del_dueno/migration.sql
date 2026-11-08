-- Entrar al panel del dueno: un codigo de un solo uso (entrada_dueno) que se
-- canjea por una sesion de su celular (sesion_dueno). El mismo mecanismo que
-- el panel de administracion, con dos diferencias: el codigo lo genera el
-- admin desde la ficha (hasta que haya WhatsApp) y la sesion vence a los 30
-- dias sin usarse (DIAS_DE_SESION_DE_DUENO).
--
-- Solo el dueno recibe un codigo: entrada_dueno lleva el rol y apunta con
-- (usuario_id, rol) a usuario_negocio(id, rol), y un CHECK fija el rol en
-- 'dueno' (CLAUDE.md, seccion 14).
--
-- Para revertir: DROP TABLE "sesion_dueno"; DROP TABLE "entrada_dueno";
-- DROP INDEX "usuario_negocio_id_rol_key";

-- CreateTable
CREATE TABLE "entrada_dueno" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "rol" "rol_usuario" NOT NULL DEFAULT 'dueno',
    "codigo" TEXT NOT NULL,
    "expira_el" TIMESTAMPTZ(3) NOT NULL,
    "usado_el" TIMESTAMPTZ(3),
    "creado_por_admin_id" UUID NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrada_dueno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion_dueno" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "entrada_id" UUID NOT NULL,
    "ultimo_acceso" TIMESTAMPTZ(3) NOT NULL,
    "revocada_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_dueno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entrada_dueno_codigo_key" ON "entrada_dueno"("codigo");

-- CreateIndex
CREATE INDEX "entrada_dueno_usuario_id_creado_el_idx" ON "entrada_dueno"("usuario_id", "creado_el");

-- CreateIndex
CREATE UNIQUE INDEX "entrada_dueno_id_usuario_id_key" ON "entrada_dueno"("id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_dueno_token_hash_key" ON "sesion_dueno"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_dueno_entrada_id_key" ON "sesion_dueno"("entrada_id");

-- CreateIndex
CREATE INDEX "sesion_dueno_usuario_id_creado_el_idx" ON "sesion_dueno"("usuario_id", "creado_el");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_dueno_entrada_id_usuario_id_key" ON "sesion_dueno"("entrada_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_negocio_id_rol_key" ON "usuario_negocio"("id", "rol");

-- AddForeignKey
ALTER TABLE "entrada_dueno" ADD CONSTRAINT "entrada_dueno_usuario_es_dueno_fkey" FOREIGN KEY ("usuario_id", "rol") REFERENCES "usuario_negocio"("id", "rol") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "entrada_dueno" ADD CONSTRAINT "entrada_dueno_creado_por_admin_id_fkey" FOREIGN KEY ("creado_por_admin_id") REFERENCES "admin_plataforma"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sesion_dueno" ADD CONSTRAINT "sesion_dueno_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario_negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sesion_dueno" ADD CONSTRAINT "sesion_dueno_entrada_mismo_usuario_fkey" FOREIGN KEY ("entrada_id", "usuario_id") REFERENCES "entrada_dueno"("id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------
-- Lo que Prisma no expresa (docs/garantias-de-la-base.md)
-- ---------------------------------------------------------------------------

ALTER TABLE "entrada_dueno" ADD CONSTRAINT "entrada_dueno_solo_dueno_chk"
  CHECK ("rol" = 'dueno');
ALTER TABLE "entrada_dueno" ADD CONSTRAINT "entrada_dueno_expira_posterior_chk"
  CHECK ("expira_el" > "creado_el");
ALTER TABLE "entrada_dueno" ADD CONSTRAINT "entrada_dueno_uso_antes_de_expirar_chk"
  CHECK ("usado_el" IS NULL OR ("usado_el" >= "creado_el" AND "usado_el" <= "expira_el"));
ALTER TABLE "sesion_dueno" ADD CONSTRAINT "sesion_dueno_revocada_posterior_chk"
  CHECK ("revocada_el" IS NULL OR "revocada_el" >= "creado_el");
