-- AlterTable
ALTER TABLE "negocio" ALTER COLUMN "logo_url" DROP NOT NULL,
ALTER COLUMN "portada_url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sello" ADD COLUMN     "anulado_turno_id" UUID;

-- CreateTable
CREATE TABLE "vinculacion_pendiente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "local_id" UUID NOT NULL,
    "creado_por_usuario_id" UUID NOT NULL,
    "expira_el" TIMESTAMPTZ(3) NOT NULL,
    "usado_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vinculacion_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vinculacion_pendiente_codigo_key" ON "vinculacion_pendiente"("codigo");

-- CreateIndex
CREATE INDEX "vinculacion_pendiente_local_id_creado_el_idx" ON "vinculacion_pendiente"("local_id", "creado_el");

-- CreateIndex
CREATE INDEX "sello_anulado_turno_id_idx" ON "sello"("anulado_turno_id");

-- AddForeignKey
ALTER TABLE "vinculacion_pendiente" ADD CONSTRAINT "vinculacion_pendiente_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "local"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vinculacion_pendiente" ADD CONSTRAINT "vinculacion_pendiente_creado_por_usuario_id_fkey" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuario_negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sello" ADD CONSTRAINT "sello_anulado_turno_id_fkey" FOREIGN KEY ("anulado_turno_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Restricciones que Prisma no sabe expresar en schema.prisma.
-- Inventario espejo al final de prisma/schema.prisma.
-- ===========================================================================

-- INV-17: la anulacion queda completa o no existe. anulado, anulado_el y
-- anulado_turno_id van los tres juntos. Reemplaza a sello_anulado_con_fecha_chk,
-- que solo ataba la bandera con la fecha.
ALTER TABLE "sello" DROP CONSTRAINT "sello_anulado_con_fecha_chk";
ALTER TABLE "sello" ADD CONSTRAINT "sello_anulacion_completa_chk"
  CHECK (
    ("anulado" AND "anulado_el" IS NOT NULL AND "anulado_turno_id" IS NOT NULL)
    OR (NOT "anulado" AND "anulado_el" IS NULL AND "anulado_turno_id" IS NULL)
  );

-- Codigo de vinculacion: vence en minutos y no se puede usar despues de vencido.
ALTER TABLE "vinculacion_pendiente" ADD CONSTRAINT "vinculacion_pendiente_expira_posterior_chk"
  CHECK ("expira_el" > "creado_el");
ALTER TABLE "vinculacion_pendiente" ADD CONSTRAINT "vinculacion_pendiente_uso_antes_de_expirar_chk"
  CHECK ("usado_el" IS NULL OR ("usado_el" >= "creado_el" AND "usado_el" <= "expira_el"));
