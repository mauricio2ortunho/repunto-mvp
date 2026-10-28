-- La bitacora de la caja (CLAUDE.md, seccion 8): cada intento de sellar,
-- canjear, anular, confirmar o descartar, tambien los rechazados.

-- CreateEnum
CREATE TYPE "accion_de_caja" AS ENUM ('sello', 'canje', 'anulacion', 'confirmacion', 'descarte');

-- CreateTable
CREATE TABLE "intento_caja" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "accion" "accion_de_caja" NOT NULL,
    "resultado" TEXT NOT NULL,
    "dispositivo_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "turno_id" UUID,
    "cliente_id" UUID,
    "tarjeta_id" UUID,
    "sello_id" UUID,
    "registro_id" UUID,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intento_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intento_caja_cliente_id_creado_el_idx" ON "intento_caja"("cliente_id", "creado_el");

-- CreateIndex
CREATE INDEX "intento_caja_local_id_creado_el_idx" ON "intento_caja"("local_id", "creado_el");

-- CreateIndex
CREATE INDEX "intento_caja_creado_el_idx" ON "intento_caja"("creado_el");


-- Cordura: `ok` o un codigo de error, nunca vacio ni un texto libre.
ALTER TABLE "intento_caja" ADD CONSTRAINT "intento_caja_resultado_razonable_chk"
  CHECK (char_length("resultado") BETWEEN 2 AND 40);
