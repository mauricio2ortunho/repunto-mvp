-- CreateTable
CREATE TABLE "peticion_idempotente" (
    "dispositivo_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "huella_peticion" TEXT NOT NULL,
    "respuesta" JSONB,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peticion_idempotente_pkey" PRIMARY KEY ("dispositivo_id","endpoint","clave")
);

-- CreateIndex
CREATE INDEX "peticion_idempotente_creado_el_idx" ON "peticion_idempotente"("creado_el");

-- AddForeignKey
ALTER TABLE "peticion_idempotente" ADD CONSTRAINT "peticion_idempotente_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivo_caja"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Restricciones que Prisma no sabe expresar.
-- Inventario: docs/garantias-de-la-base.md.
-- ===========================================================================

-- Una tablet tiene un solo turno abierto a la vez. Es lo que ya asumia el
-- flujo de caja sin estar escrito: el turno de un sello no viaja en el
-- request, sale del dispositivo (INV-2), y "el turno abierto de esta tablet"
-- solo es una frase con sentido si hay uno solo. Los turnos cerrados no
-- chocan: el indice es parcial.
CREATE UNIQUE INDEX "turno_caja_uno_abierto_por_dispositivo"
  ON "turno_caja" ("dispositivo_id")
  WHERE "cerrado_el" IS NULL;

-- La clave de idempotencia la genera la tablet. Un largo minimo evita que un
-- panel mal escrito mande "1" y le devuelva a un cajero la respuesta del
-- sello de otro.
ALTER TABLE "peticion_idempotente" ADD CONSTRAINT "peticion_idempotente_clave_razonable_chk"
  CHECK (char_length("clave") BETWEEN 8 AND 200);
