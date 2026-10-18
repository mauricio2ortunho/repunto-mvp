-- CreateTable
CREATE TABLE "tope_peticion" (
    "clave" TEXT NOT NULL,
    "ventana" TIMESTAMPTZ(3) NOT NULL,
    "cuenta" INTEGER NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tope_peticion_pkey" PRIMARY KEY ("clave","ventana")
);

-- CreateIndex
CREATE INDEX "tope_peticion_ventana_idx" ON "tope_peticion"("ventana");

-- ===========================================================================
-- Restricciones que Prisma no sabe expresar.
-- Inventario: docs/garantias-de-la-base.md.
-- ===========================================================================

-- Una fila existe porque alguien pidio algo: cero o menos no es una cuenta.
ALTER TABLE "tope_peticion" ADD CONSTRAINT "tope_peticion_cuenta_positiva_chk"
  CHECK ("cuenta" > 0);
