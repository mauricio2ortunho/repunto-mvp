-- Solicitud de negocio: alguien pide sumar su negocio desde la app del
-- cliente y el admin la resuelve (decision del usuario del 2026-11-11). No
-- crea nada solo: aprobar es dar de alta el negocio, que queda en
-- negocio_id; rechazar la guarda con su motivo. Nunca se borra.
--
-- Para revertir: DROP TABLE "solicitud_negocio"; DROP TYPE "estado_solicitud";

-- CreateEnum
CREATE TYPE "estado_solicitud" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- CreateTable
CREATE TABLE "solicitud_negocio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre_negocio" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "mensaje" TEXT,
    "estado" "estado_solicitud" NOT NULL DEFAULT 'pendiente',
    "motivo_rechazo" TEXT,
    "negocio_id" UUID,
    "resuelta_por_admin_id" UUID,
    "resuelta_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_negocio_negocio_id_key" ON "solicitud_negocio"("negocio_id");

-- CreateIndex
CREATE INDEX "solicitud_negocio_estado_creado_el_idx" ON "solicitud_negocio"("estado", "creado_el");

-- AddForeignKey
ALTER TABLE "solicitud_negocio" ADD CONSTRAINT "solicitud_negocio_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "solicitud_negocio" ADD CONSTRAINT "solicitud_negocio_resuelta_por_admin_id_fkey" FOREIGN KEY ("resuelta_por_admin_id") REFERENCES "admin_plataforma"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Una sola pendiente por telefono: el doble toque y el reenvio no crean dos,
-- y POST /solicitudes devuelve lo mismo sin decir si ya habia una.
CREATE UNIQUE INDEX "solicitud_negocio_una_pendiente_por_telefono"
  ON "solicitud_negocio" ("telefono") WHERE "estado" = 'pendiente';

-- Pendiente es sin resolver; resuelta es con quien y cuando.
ALTER TABLE "solicitud_negocio" ADD CONSTRAINT "solicitud_negocio_resolucion_chk"
  CHECK (("estado" = 'pendiente') =
         ("resuelta_el" IS NULL AND "resuelta_por_admin_id" IS NULL));

-- Aprobada es que se dio de alta un negocio, y solo entonces hay negocio.
ALTER TABLE "solicitud_negocio" ADD CONSTRAINT "solicitud_negocio_aprobada_con_negocio_chk"
  CHECK (("estado" = 'aprobada') = ("negocio_id" IS NOT NULL));

-- El motivo es de un rechazo.
ALTER TABLE "solicitud_negocio" ADD CONSTRAINT "solicitud_negocio_motivo_solo_rechazada_chk"
  CHECK ("motivo_rechazo" IS NULL OR "estado" = 'rechazada');
